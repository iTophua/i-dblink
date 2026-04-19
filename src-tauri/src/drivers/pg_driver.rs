use crate::commands::{ColumnInfo, ForeignKeyInfo, IndexInfo, QueryResult, TableInfo, TableStructure, TablesResult};
use crate::db::DbConnection;
use crate::drivers::db_pool::DbPool;
use sqlx::{Column, Row};
use std::time::Duration;
use urlencoding;

pub struct PgDriver;

impl PgDriver {
    pub async fn connect(config: &DbConnection, password: &str) -> Result<DbPool, String> {
        let db_url = format!(
            "postgres://{}:{}@{}:{}/{}?sslmode={}",
            config.username,
            urlencoding::encode(password),
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

        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(10)
            .acquire_timeout(Duration::from_secs(10))
            .connect(&db_url)
            .await
            .map_err(|e| format!("Failed to connect to PostgreSQL: {}", e))?;

        Ok(DbPool::Postgres(pool))
    }

    pub async fn get_tables(
        pool: &DbPool,
        _database: Option<&str>,
    ) -> Result<Vec<TableInfo>, String> {
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
                       COALESCE(d.description, '') AS comment,
                       NULL AS engine,
                       NULL AS data_size,
                       NULL AS index_size,
                       NULL AS create_time,
                       NULL AS update_time,
                       NULL AS collation
                FROM pg_catalog.pg_class c
                JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                LEFT JOIN pg_catalog.pg_description d ON d.objoid = c.oid AND d.objsubid = 0
                WHERE c.relkind IN ('r','v','m','f')
                  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                  AND n.nspname NOT LIKE 'pg_toast%'
                ORDER BY c.relname
            "#;
            let rows = sqlx::query_as::<
                _,
                (
                    String,
                    String,
                    Option<i64>,
                    String,
                    Option<String>,
                    Option<String>,
                    Option<String>,
                    Option<String>,
                    Option<String>,
                    Option<String>,
                ),
            >(query)
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to query tables: {}", e))?;

            let tables = rows
                .into_iter()
                .map(
                    |(
                        table_name,
                        table_type,
                        row_count,
                        comment,
                        engine,
                        data_size,
                        index_size,
                        create_time,
                        update_time,
                        collation,
                    )| TableInfo {
                        table_name,
                        table_type,
                        row_count: row_count.map(|v| v as u64),
                        comment: if comment.is_empty() {
                            None
                        } else {
                            Some(comment)
                        },
                        engine,
                        data_size,
                        index_size,
                        create_time,
                        update_time,
                        collation,
                    },
                )
                .collect();
            Ok(tables)
        } else {
            Err("Pool type mismatch for PostgreSQL".to_string())
        }
    }

    pub async fn get_columns(
        pool: &DbPool,
        table_name: &str,
        _database: Option<&str>,
    ) -> Result<Vec<ColumnInfo>, String> {
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

    pub async fn get_databases(pool: &DbPool) -> Result<Vec<String>, String> {
        if let DbPool::Postgres(pool) = pool {
            let rows = sqlx::query_as::<_, (String,)>(
                "SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres', 'template0', 'template1') ORDER BY datname"
            )
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to query databases: {}", e))?;

            Ok(rows.into_iter().map(|(name,)| name).collect())
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
        } else if type_name.contains("timestamp")
            || type_name.contains("date")
            || type_name.contains("time")
            || type_name.contains("interval")
        {
            // 处理时间类型
            match row.try_get::<Option<String>, _>(idx) {
                Ok(Some(v)) => serde_json::Value::String(v),
                Ok(None) => serde_json::Value::Null,
                Err(_) => serde_json::Value::Null,
            }
        } else if type_name.contains("json") || type_name.contains("jsonb") {
            // 处理 JSON 类型
            match row.try_get::<Option<serde_json::Value>, _>(idx) {
                Ok(Some(v)) => v,
                Ok(None) => serde_json::Value::Null,
                Err(_) => serde_json::Value::Null,
            }
        } else if type_name.contains("bytea") || type_name.contains("blob") {
            // 处理二进制类型
            match row.try_get::<Option<Vec<u8>>, _>(idx) {
                Ok(Some(v)) => serde_json::Value::String(format!("[BLOB: {} bytes]", v.len())),
                Ok(None) => serde_json::Value::Null,
                Err(_) => serde_json::Value::Null,
            }
        } else {
            // 其他类型尝试作为字符串处理
            match row.try_get::<Option<String>, _>(idx) {
                Ok(Some(v)) => serde_json::Value::String(v),
                Ok(None) => serde_json::Value::Null,
                Err(_) => serde_json::Value::Null,
            }
        }
    }

    pub async fn get_indexes(pool: &DbPool, table_name: &str) -> Result<Vec<IndexInfo>, String> {
        if let DbPool::Postgres(pool) = pool {
            let query = r#"
                SELECT i.relname AS index_name,
                       a.attname AS column_name,
                       ix.indisunique AS is_unique,
                       ix.indisprimary AS is_primary,
                       (information_schema.columns.ordinal_position) AS seq_in_index
                FROM pg_index ix
                JOIN pg_class t ON t.oid = ix.indrelid
                JOIN pg_class i ON i.oid = ix.indexrelid
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
                WHERE t.relname = $1
                ORDER BY i.relname, a.attnum
            "#;
            let rows = sqlx::query_as::<_, (String, String, bool, bool, i64)>(query)
                .bind(table_name)
                .fetch_all(pool)
                .await
                .map_err(|e| format!("Failed to query indexes: {}", e))?;

            Ok(rows
                .into_iter()
                .map(
                    |(index_name, column_name, is_unique, is_primary, seq_in_index)| IndexInfo {
                        index_name,
                        column_name,
                        is_unique,
                        is_primary,
                        seq_in_index,
                    },
                )
                .collect())
        } else {
            Err("Pool type mismatch for PostgreSQL".to_string())
        }
    }

    pub async fn get_foreign_keys(
        pool: &DbPool,
        table_name: &str,
    ) -> Result<Vec<ForeignKeyInfo>, String> {
        if let DbPool::Postgres(pool) = pool {
            let query = r#"
                SELECT tc.constraint_name,
                       kcu.column_name,
                       ccu.table_name AS referenced_table,
                       ccu.column_name AS referenced_column
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage ccu
                    ON tc.constraint_name = ccu.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND tc.table_name = $1
                ORDER BY tc.constraint_name, kcu.ordinal_position
            "#;
            let rows = sqlx::query_as::<_, (String, String, String, String)>(query)
                .bind(table_name)
                .fetch_all(pool)
                .await
                .map_err(|e| format!("Failed to query foreign keys: {}", e))?;

            Ok(rows
                .into_iter()
                .map(
                    |(constraint_name, column_name, referenced_table, referenced_column)| {
                        ForeignKeyInfo {
                            constraint_name,
                            column_name,
                            referenced_table,
                            referenced_column,
                        }
                    },
                )
                .collect())
        } else {
            Err("Pool type mismatch for PostgreSQL".to_string())
        }
    }

    /// 获取分类的表和视图（支持搜索过滤）
    pub async fn get_tables_categorized(
        pool: &DbPool,
        _database: Option<&str>,
        search: Option<&str>,
    ) -> Result<TablesResult, String> {
        if let DbPool::Postgres(pool) = pool {
            let search_filter = match search {
                Some(s) if !s.is_empty() => format!("AND c.relname LIKE '%{}%'", s),
                _ => String::new(),
            };

            let query = format!(
                r#"
                SELECT c.relname AS table_name,
                       CASE c.relkind
                           WHEN 'r' THEN 'BASE TABLE'
                           WHEN 'v' THEN 'VIEW'
                           WHEN 'm' THEN 'MATERIALIZED VIEW'
                           ELSE 'OTHER'
                       END AS table_type,
                       NULL::bigint AS row_count,
                       COALESCE(d.description, '') AS comment,
                       NULL AS engine,
                       NULL AS data_size,
                       NULL AS index_size,
                       NULL AS create_time,
                       NULL AS update_time,
                       NULL AS collation
                FROM pg_catalog.pg_class c
                JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                LEFT JOIN pg_catalog.pg_description d ON d.objoid = c.oid AND d.objsubid = 0
                WHERE c.relkind IN ('r','v','m','f')
                  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                  AND n.nspname NOT LIKE 'pg_toast%'
                  {}
                ORDER BY c.relname
            "#,
                search_filter
            );

            let rows = sqlx::query_as::<
                _,
                (
                    String,
                    String,
                    Option<i64>,
                    String,
                    Option<String>,
                    Option<String>,
                    Option<String>,
                    Option<String>,
                    Option<String>,
                    Option<String>,
                ),
            >(&query)
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to query tables: {}", e))?;

            let mut tables = Vec::new();
            let mut views = Vec::new();

            for (table_name, table_type, row_count, comment, engine, data_size, index_size, create_time, update_time, collation) in rows {
                let comment_val = if comment.is_empty() { None } else { Some(comment) };

                let table_info = TableInfo {
                    table_name: table_name.clone(),
                    table_type: table_type.clone(),
                    row_count: row_count.map(|v| v as u64),
                    comment: comment_val,
                    engine,
                    data_size,
                    index_size,
                    create_time,
                    update_time,
                    collation,
                };

                // 根据 TABLE_TYPE 分类
                match table_type.as_str() {
                    "BASE TABLE" => tables.push(table_info),
                    "VIEW" | "MATERIALIZED VIEW" => views.push(table_info),
                    _ => tables.push(table_info),
                }
            }

            Ok(TablesResult { tables, views })
        } else {
            Err("Pool type mismatch for PostgreSQL".to_string())
        }
    }

    /// 获取完整的表结构（列、索引、外键）
    pub async fn get_table_structure(
        pool: &DbPool,
        table_name: &str,
        _database: Option<&str>,
    ) -> Result<TableStructure, String> {
        // 并行获取列、索引、外键信息
        // 子函数会自己处理 pool 类型匹配
        let (columns, indexes, foreign_keys) = tokio::join!(
            Self::get_columns(pool, table_name, None),
            Self::get_indexes(pool, table_name),
            Self::get_foreign_keys(pool, table_name),
        );

        Ok(TableStructure {
            columns: columns?,
            indexes: indexes?,
            foreign_keys: foreign_keys?,
        })
    }
}
