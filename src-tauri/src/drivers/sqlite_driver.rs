use crate::commands::{ColumnInfo, ForeignKeyInfo, IndexInfo, QueryResult, TableInfo, TableStructure, TablesResult};
use crate::db::DbConnection;
use crate::drivers::db_pool::DbPool;
use sqlx::{Column, Row};
use std::time::Duration;

pub struct SqliteDriver;

impl SqliteDriver {
    pub async fn connect(config: &DbConnection, _password: &str) -> Result<DbPool, String> {
        // SQLite 使用文件路径或内存数据库
        let db_path = config
            .database
            .as_ref()
            .filter(|d| !d.is_empty())
            .map(|d| d.clone())
            .unwrap_or_else(|| ":memory:".to_string());

        let uri = if db_path == ":memory:" {
            ":memory:".to_string()
        } else {
            format!("file:{}?mode=rw", db_path)
        };

        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(10))
            .connect(&uri)
            .await
            .map_err(|e| format!("Failed to connect to SQLite: {}", e))?;

        Ok(DbPool::Sqlite(pool))
    }

    pub async fn get_tables(
        pool: &DbPool,
        _database: Option<&str>,
    ) -> Result<Vec<TableInfo>, String> {
        if let DbPool::Sqlite(pool) = pool {
            let query = r#"
                SELECT name AS table_name,
                       'BASE TABLE' AS table_type,
                       NULL AS row_count,
                       NULL AS comment,
                       NULL AS engine,
                       NULL AS data_size,
                       NULL AS index_size,
                       NULL AS create_time,
                       NULL AS update_time,
                       NULL AS collation
                FROM sqlite_master
                WHERE type = 'table'
                  AND name NOT LIKE 'sqlite_%'
                ORDER BY name
            "#;
            let rows = sqlx::query_as::<
                _,
                (
                    String,
                    String,
                    Option<i64>,
                    Option<String>,
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
                        comment,
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
            Err("Pool type mismatch for SQLite".to_string())
        }
    }

    pub async fn get_databases(_pool: &DbPool) -> Result<Vec<String>, String> {
        Ok(vec!["main".to_string()])
    }

    pub async fn get_columns(
        pool: &DbPool,
        table_name: &str,
        _database: Option<&str>,
    ) -> Result<Vec<ColumnInfo>, String> {
        if let DbPool::Sqlite(pool) = pool {
            let safe_table = table_name.replace('"', "\"\"");
            let query = format!("PRAGMA table_info(\"{}\")", safe_table);
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

    pub async fn get_indexes(pool: &DbPool, table_name: &str) -> Result<Vec<IndexInfo>, String> {
        if let DbPool::Sqlite(pool) = pool {
            let safe_table = table_name.replace('"', "\"\"");
            let query = format!("PRAGMA index_list(\"{}\")", safe_table);
            let indexes = sqlx::query_as::<_, (String, bool, String, String)>(&query)
                .fetch_all(pool)
                .await
                .map_err(|e| format!("Failed to query index list: {}", e))?;

            let mut result = Vec::new();
            for (index_name, is_unique, _origin, _partial) in indexes {
                let safe_index = index_name.replace('"', "\"\"");
                let detail_query = format!("PRAGMA index_info(\"{}\")", safe_index);
                let details = sqlx::query_as::<_, (i64, i64, String)>(&detail_query)
                    .fetch_all(pool)
                    .await
                    .map_err(|e| format!("Failed to query index info: {}", e))?;

                for (seq, _cid, col_name) in details {
                    result.push(IndexInfo {
                        index_name: index_name.clone(),
                        column_name: col_name,
                        is_unique,
                        is_primary: index_name.starts_with("sqlite_autoindex"),
                        seq_in_index: seq + 1,
                    });
                }
            }

            Ok(result)
        } else {
            Err("Pool type mismatch for SQLite".to_string())
        }
    }

    pub async fn get_foreign_keys(
        pool: &DbPool,
        table_name: &str,
    ) -> Result<Vec<ForeignKeyInfo>, String> {
        if let DbPool::Sqlite(pool) = pool {
            let safe_table = table_name.replace('"', "\"\"");
            let query = format!("PRAGMA foreign_key_list(\"{}\")", safe_table);
            let rows = sqlx::query_as::<
                _,
                (i64, i64, String, String, String, String, String, String),
            >(&query)
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to query foreign keys: {}", e))?;

            Ok(rows
                .into_iter()
                .map(
                    |(_id, seq, ref_table, from, to, _on_update, _on_delete, _match)| {
                        ForeignKeyInfo {
                            constraint_name: format!("fk_{}_{}", table_name, seq),
                            column_name: from,
                            referenced_table: ref_table,
                            referenced_column: to,
                        }
                    },
                )
                .collect())
        } else {
            Err("Pool type mismatch for SQLite".to_string())
        }
    }

    /// 获取分类的表和视图（SQLite 视图也作为 BASE TABLE 返回）
    pub async fn get_tables_categorized(
        pool: &DbPool,
        _database: Option<&str>,
        search: Option<&str>,
    ) -> Result<TablesResult, String> {
        if let DbPool::Sqlite(pool) = pool {
            let (query, has_search) = if let Some(_s) = search.filter(|s| !s.is_empty()) {
                (
                    r#"
                    SELECT name AS table_name,
                           'BASE TABLE' AS table_type,
                           NULL AS row_count,
                           NULL AS comment,
                           NULL AS engine,
                           NULL AS data_size,
                           NULL AS index_size,
                           NULL AS create_time,
                           NULL AS update_time,
                           NULL AS collation
                    FROM sqlite_master
                    WHERE type = 'table'
                      AND name NOT LIKE 'sqlite_%'
                      AND name LIKE ?1
                    ORDER BY name
                "#,
                    true,
                )
            } else {
                (
                    r#"
                    SELECT name AS table_name,
                           'BASE TABLE' AS table_type,
                           NULL AS row_count,
                           NULL AS comment,
                           NULL AS engine,
                           NULL AS data_size,
                           NULL AS index_size,
                           NULL AS create_time,
                           NULL AS update_time,
                           NULL AS collation
                    FROM sqlite_master
                    WHERE type = 'table'
                      AND name NOT LIKE 'sqlite_%'
                    ORDER BY name
                "#,
                    false,
                )
            };

            let q = sqlx::query_as::<
                _,
                (
                    String,
                    String,
                    Option<i64>,
                    Option<String>,
                    Option<String>,
                    Option<String>,
                    Option<String>,
                    Option<String>,
                    Option<String>,
                    Option<String>,
                ),
            >(query);

            let rows = if let Some(s) = search.filter(|_| has_search) {
                q.bind(format!("%{}%", s)).fetch_all(pool).await.map_err(|e| format!("Failed to query tables: {}", e))?
            } else {
                q.fetch_all(pool).await.map_err(|e| format!("Failed to query tables: {}", e))?
            };

            let tables: Vec<TableInfo> = rows
                .into_iter()
                .map(
                    |(table_name, table_type, row_count, comment, engine, data_size, index_size, create_time, update_time, collation)| TableInfo {
                        table_name,
                        table_type,
                        row_count: row_count.map(|v| v as u64),
                        comment,
                        engine,
                        data_size,
                        index_size,
                        create_time,
                        update_time,
                        collation,
                    },
                )
                .collect();

            // SQLite 没有真正的视图分类，所有表都返回为 tables
            Ok(TablesResult {
                tables,
                views: vec![],
            })
        } else {
            Err("Pool type mismatch for SQLite".to_string())
        }
    }

    /// 获取完整的表结构（列、索引、外键）
    pub async fn get_table_structure(
        pool: &DbPool,
        table_name: &str,
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
