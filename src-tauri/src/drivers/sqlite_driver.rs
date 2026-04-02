use crate::commands::{ColumnInfo, QueryResult, TableInfo};
use crate::db::DbConnection;
use crate::drivers::db_pool::DbPool;
use sqlx::{Column, Row};
use std::time::Duration;

pub struct SqliteDriver;

impl SqliteDriver {
    pub async fn connect(config: &DbConnection, _password: &str) -> Result<DbPool, String> {
        // SQLite 使用文件路径或内存数据库
        let db_path = if config
            .database
            .as_ref()
            .map(|d| d.as_str())
            .unwrap_or("")
            .is_empty()
        {
            ":memory:".to_string()
        } else {
            config.database.clone().unwrap()
        };

        let uri = if db_path == ":memory:" {
            ":memory:".to_string()
        } else {
            format!("file:{}?mode=rw", db_path)
        };

        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .acquire_timeout(Duration::from_secs(10))
            .connect(&uri)
            .await
            .map_err(|e| format!("Failed to connect to SQLite: {}", e))?;

        Ok(DbPool::Sqlite(pool))
    }

    pub async fn get_tables(pool: &DbPool) -> Result<Vec<TableInfo>, String> {
        if let DbPool::Sqlite(pool) = pool {
            let query = r#"
                SELECT name AS table_name,
                       'BASE TABLE' AS table_type,
                       NULL AS row_count,
                       NULL AS comment
                FROM sqlite_master
                WHERE type = 'table'
                  AND name NOT LIKE 'sqlite_%'
                ORDER BY name
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
            Err("Pool type mismatch for SQLite".to_string())
        }
    }

    pub async fn get_columns(pool: &DbPool, table_name: &str) -> Result<Vec<ColumnInfo>, String> {
        if let DbPool::Sqlite(pool) = pool {
            let query = format!("PRAGMA table_info(\"{}\")", table_name);
            let rows =
                sqlx::query_as::<_, (i32, String, String, bool, Option<String>, bool)>(&query)
                    .fetch_all(pool)
                    .await
                    .map_err(|e| format!("Failed to query columns: {}", e))?;

            let columns = rows
                .into_iter()
                .map(|(_cid, name, type_str, notnull, default, _pk)| ColumnInfo {
                    column_name: name,
                    data_type: type_str,
                    is_nullable: !notnull,
                    column_key: if _pk { Some("PRI".to_string()) } else { None },
                    column_default: default,
                    extra: None,
                    comment: None,
                })
                .collect();
            Ok(columns)
        } else {
            Err("Pool type mismatch for SQLite".to_string())
        }
    }

    pub async fn execute_query(pool: &DbPool, sql: &str) -> Result<QueryResult, String> {
        if let DbPool::Sqlite(pool) = pool {
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
                                let value = Self::sqlite_value_to_json(&row, i);
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
            Err("Pool type mismatch for SQLite".to_string())
        }
    }

    fn sqlite_value_to_json(row: &sqlx::sqlite::SqliteRow, idx: usize) -> serde_json::Value {
        use sqlx::Row;
        if let Ok(Some(v)) = row.try_get::<Option<i64>, _>(idx) {
            return serde_json::Value::Number(v.into());
        }
        if let Ok(Some(v)) = row.try_get::<Option<f64>, _>(idx) {
            return serde_json::Number::from_f64(v)
                .map(serde_json::Value::Number)
                .unwrap_or(serde_json::Value::Null);
        }
        if let Ok(Some(v)) = row.try_get::<Option<bool>, _>(idx) {
            return serde_json::Value::Bool(v);
        }
        if let Ok(Some(v)) = row.try_get::<Option<String>, _>(idx) {
            return serde_json::Value::String(v);
        }
        serde_json::Value::Null
    }
}
