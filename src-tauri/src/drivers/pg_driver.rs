use crate::commands::{ColumnInfo, QueryResult, TableInfo};
use crate::db::DbConnection;
use crate::drivers::db_pool::DbPool;
use crate::security::PasswordManager;
use sqlx::{Column, Row};
use std::time::Duration;
use urlencoding;

pub struct PgDriver;

impl PgDriver {
    pub async fn connect(config: &DbConnection, password: &str) -> Result<DbPool, String> {
        let pwd = PasswordManager::get_password(&config.id)
            .unwrap_or_default()
            .unwrap_or_else(|| password.to_string());
        let password = pwd;

        let db_url = format!(
            "postgres://{}:{}@{}:{}/{}?sslmode={}",
            config.username,
            urlencoding::encode(&password),
            config.host,
            config.port,
            config
                .database
                .clone()
                .unwrap_or_else(|| "postgres".to_string()),
            if config.host == "localhost" || config.host == "127.0.0.1" {
                "disable"
            } else {
                "prefer"
            }
        );

        // 简化处理；使用同一超时设置
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(Duration::from_secs(10))
            .connect(&db_url)
            .await
            .map_err(|e| format!("Failed to connect to PostgreSQL: {}", e))?;

        Ok(DbPool::Postgres(pool))
    }

    pub async fn get_tables(pool: &DbPool) -> Result<Vec<TableInfo>, String> {
        if let DbPool::Postgres(pool) = pool {
            let query = r#"
                SELECT c.relname AS table_name,
                       CASE c.relkind
                           WHEN 'r' THEN 'BASE TABLE'
                           WHEN 'v' THEN 'VIEW'
                           WHEN 'm' THEN 'MATERIALIZED VIEW'
                           ELSE 'OTHER'
                       END AS table_type,
                       NULL::bigint AS row_count,
                       COALESCE(d.description, '') AS comment
                FROM pg_catalog.pg_class c
                JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                LEFT JOIN pg_catalog.pg_description d ON d.objoid = c.oid AND d.objsubid = 0
                WHERE c.relkind IN ('r','v','m','f')
                  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                  AND n.nspname NOT LIKE 'pg_toast%'
                ORDER BY c.relname
            "#;
            let rows = sqlx::query_as::<_, (String, String, Option<i64>, String)>(query)
                .fetch_all(pool)
                .await
                .map_err(|e| format!("Failed to query tables: {}", e))?;

            let tables = rows
                .into_iter()
                .map(|(table_name, table_type, row_count, comment)| TableInfo {
                    table_name,
                    table_type,
                    row_count,
                    comment: if comment.is_empty() {
                        None
                    } else {
                        Some(comment)
                    },
                })
                .collect();
            Ok(tables)
        } else {
            Err("Pool type mismatch for PostgreSQL".to_string())
        }
    }

    pub async fn get_columns(pool: &DbPool, table_name: &str) -> Result<Vec<ColumnInfo>, String> {
        if let DbPool::Postgres(pool) = pool {
            let query = r#"
                SELECT a.attname AS column_name,
                       pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
                       NOT a.attnotnull AS is_nullable,
                       CASE 
                           WHEN i.indisprimary THEN 'PRI'
                           WHEN i.indisunique THEN 'UNI'
                           ELSE ''
                       END AS column_key,
                       pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS column_default,
                       '' AS extra,
                       COALESCE(col_description(c.oid, a.attnum), '') AS comment
                FROM pg_catalog.pg_attribute a
                JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
                JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                LEFT JOIN pg_catalog.pg_index i ON i.indrelid = a.attrelid AND a.attnum = ANY(i.indkey)
                WHERE a.attnum > 0 
                  AND NOT a.attisdropped
                  AND c.relname = $1
                  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                  AND n.nspname NOT LIKE 'pg_toast%'
                ORDER BY a.attnum
            "#;
            let rows = sqlx::query_as::<
                _,
                (String, String, bool, String, Option<String>, String, String),
            >(query)
            .bind(table_name)
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to query columns: {}", e))?;

            let columns = rows
                .into_iter()
                .map(
                    |(
                        column_name,
                        data_type,
                        is_nullable,
                        column_key,
                        column_default,
                        _extra,
                        comment,
                    )| ColumnInfo {
                        column_name,
                        data_type,
                        is_nullable,
                        column_key: if column_key.is_empty() {
                            None
                        } else {
                            Some(column_key)
                        },
                        column_default,
                        extra: None,
                        comment: if comment.is_empty() {
                            None
                        } else {
                            Some(comment)
                        },
                    },
                )
                .collect();
            Ok(columns)
        } else {
            Err("Pool type mismatch for PostgreSQL".to_string())
        }
    }

    pub async fn execute_query(pool: &DbPool, sql: &str) -> Result<QueryResult, String> {
        if let DbPool::Postgres(pool) = pool {
            let mut query_result = QueryResult {
                columns: Vec::new(),
                rows: Vec::new(),
                rows_affected: None,
                error: None,
            };

            let result = sqlx::query(sql).fetch_all(pool).await;
            match result {
                Ok(rows) => {
                    if let Some(first_row) = rows.first() {
                        query_result.columns = first_row
                            .columns()
                            .iter()
                            .map(|col| col.name().to_string())
                            .collect();
                        for row in rows {
                            let mut row_data = Vec::with_capacity(query_result.columns.len());
                            for i in 0..query_result.columns.len() {
                                let value = Self::pg_value_to_json(&row, i);
                                row_data.push(value);
                            }
                            query_result.rows.push(row_data);
                        }
                    } else {
                        query_result.rows_affected = Some(0);
                    }
                }
                Err(e) => {
                    return Ok(QueryResult {
                        columns: Vec::new(),
                        rows: Vec::new(),
                        rows_affected: None,
                        error: Some(format!("Query error: {}", e)),
                    });
                }
            }
            Ok(query_result)
        } else {
            Err("Pool type mismatch for PostgreSQL".to_string())
        }
    }

    fn pg_value_to_json(row: &sqlx::postgres::PgRow, idx: usize) -> serde_json::Value {
        use sqlx::Row;
        let column = row.columns().get(idx).unwrap();
        let type_name = column.type_info().to_string().to_lowercase();
        if type_name.contains("int") || type_name.contains("serial") {
            match row.get::<Option<i64>, _>(idx) {
                Some(v) => serde_json::Value::Number(v.into()),
                None => serde_json::Value::Null,
            }
        } else if type_name.contains("float")
            || type_name.contains("double")
            || type_name.contains("numeric")
        {
            match row.get::<Option<f64>, _>(idx) {
                Some(v) => serde_json::Number::from_f64(v)
                    .map(serde_json::Value::Number)
                    .unwrap_or(serde_json::Value::Null),
                None => serde_json::Value::Null,
            }
        } else if type_name.contains("bool") {
            match row.get::<Option<bool>, _>(idx) {
                Some(v) => serde_json::Value::Bool(v),
                None => serde_json::Value::Null,
            }
        } else {
            match row.get::<Option<String>, _>(idx) {
                Some(v) => serde_json::Value::String(v),
                None => serde_json::Value::Null,
            }
        }
    }
}
