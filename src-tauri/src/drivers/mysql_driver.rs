use crate::commands::{ColumnInfo, QueryResult, TableInfo};
use crate::db::DbConnection;
use crate::drivers::db_pool::DbPool;
use crate::security::PasswordManager;
use sqlx::{Column, Row};
use std::time::Duration;
use urlencoding;

pub struct MySqlDriver;

impl MySqlDriver {
    pub async fn connect(config: &DbConnection, password: &str) -> Result<DbPool, String> {
        // 参考原有实现，读取密码并构造连接字符串
        let pwd = PasswordManager::get_password(&config.id)
            .unwrap_or_default()
            .unwrap_or_else(|| password.to_string());
        let password = pwd;

        let db_url = if !password.is_empty() {
            format!(
                "mysql://{}:{}@{}:{}/{}",
                config.username,
                urlencoding::encode(&password),
                config.host,
                config.port,
                config.database.clone().unwrap_or_default()
            )
        } else {
            format!(
                "mysql://{}@{}:{}/{}",
                config.username,
                config.host,
                config.port,
                config.database.clone().unwrap_or_default()
            )
        };

        let pool = sqlx::mysql::MySqlPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(Duration::from_secs(10))
            .connect(&db_url)
            .await
            .map_err(|e| format!("Failed to connect to MySQL: {}", e))?;

        Ok(DbPool::MySql(pool))
    }

    pub async fn get_tables(pool: &DbPool) -> Result<Vec<TableInfo>, String> {
        if let DbPool::MySql(pool) = pool {
            let query = r#"
                SELECT 
                    TABLE_NAME,
                    TABLE_TYPE,
                    TABLE_ROWS,
                    TABLE_COMMENT
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE()
                ORDER BY TABLE_NAME
            "#;

            let rows = sqlx::query_as::<_, (String, String, Option<i64>, Option<String>)>(query)
                .fetch_all(pool)
                .await
                .map_err(|e| format!("Failed to query tables: {}", e))?;

            let tables = rows
                .into_iter()
                .map(|(table_name, table_type, row_count, comment)| TableInfo {
                    table_name,
                    table_type,
                    row_count,
                    comment,
                })
                .collect();

            Ok(tables)
        } else {
            Err("Pool type mismatch for MySqlDriver".to_string())
        }
    }

    pub async fn get_columns(pool: &DbPool, table_name: &str) -> Result<Vec<ColumnInfo>, String> {
        if let DbPool::MySql(pool) = pool {
            let query = format!("SHOW FULL COLUMNS FROM `{}`", table_name);
            let rows = sqlx::query_as::<
                _,
                (
                    String,
                    String,
                    String,
                    String,
                    Option<String>,
                    String,
                    Option<String>,
                ),
            >(&query)
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to query columns: {}", e))?;

            let columns = rows
                .into_iter()
                .map(
                    |(field, type_str, null, key, default, extra, comment)| ColumnInfo {
                        column_name: field,
                        data_type: type_str,
                        is_nullable: null == "YES",
                        column_key: if key.is_empty() { None } else { Some(key) },
                        column_default: default,
                        extra: if extra.is_empty() { None } else { Some(extra) },
                        comment: comment.filter(|c| !c.is_empty()),
                    },
                )
                .collect();

            Ok(columns)
        } else {
            Err("Pool type mismatch for MySqlDriver".to_string())
        }
    }

    pub async fn execute_query(pool: &DbPool, sql: &str) -> Result<QueryResult, String> {
        if let DbPool::MySql(pool) = pool {
            // 执行并转换结果
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
                                let value = Self::mysql_value_to_json(&row, i);
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
            Err("Pool type mismatch for MySqlDriver".to_string())
        }
    }

    // 将 MySQL 值转换为 JSON 值
    fn mysql_value_to_json(row: &sqlx::mysql::MySqlRow, idx: usize) -> serde_json::Value {
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
            || type_name.contains("decimal")
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
