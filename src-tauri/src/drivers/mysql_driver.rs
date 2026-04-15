use crate::commands::{ColumnInfo, ForeignKeyInfo, IndexInfo, QueryResult, TableInfo};
use crate::db::DbConnection;
use crate::drivers::db_pool::DbPool;
use sqlx::{Column, Row};
use std::time::Duration;
use urlencoding;

pub struct MySqlDriver;

impl MySqlDriver {
    pub async fn connect(config: &DbConnection, password: &str) -> Result<DbPool, String> {
        let db_url = if !password.is_empty() {
            format!(
                "mysql://{}:{}@{}:{}/{}",
                config.username,
                urlencoding::encode(password),
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
            .max_connections(10)
            .acquire_timeout(Duration::from_secs(10))
            .connect(&db_url)
            .await
            .map_err(|e| format!("Failed to connect to MySQL: {}", e))?;

        Ok(DbPool::MySql(pool))
    }

    pub async fn get_tables(
        pool: &DbPool,
        database: Option<&str>,
    ) -> Result<Vec<TableInfo>, String> {
        if let DbPool::MySql(pool) = pool {
            let db_filter = match database {
                Some(db) => format!("AND TABLE_SCHEMA = '{}'", db),
                None => "AND TABLE_SCHEMA = DATABASE()".to_string(),
            };
            let query = format!(
                r#"
                SELECT
                    TABLE_NAME,
                    TABLE_TYPE,
                    TABLE_ROWS,
                    COALESCE(TABLE_COMMENT, '') AS TABLE_COMMENT,
                    COALESCE(ENGINE, '') AS ENGINE,
                    DATA_LENGTH,
                    INDEX_LENGTH,
                    COALESCE(DATE_FORMAT(CREATE_TIME, '%Y-%m-%d %H:%i:%s'), '') AS CREATE_TIME,
                    COALESCE(DATE_FORMAT(UPDATE_TIME, '%Y-%m-%d %H:%i:%s'), '') AS UPDATE_TIME,
                    COALESCE(TABLE_COLLATION, '') AS TABLE_COLLATION
                FROM information_schema.TABLES
                WHERE 1=1 {}
                AND TABLE_TYPE != 'SYSTEM VIEW'
                ORDER BY TABLE_NAME
            "#,
                db_filter
            );

            use sqlx::Row;
            let rows = sqlx::query(&query)
                .fetch_all(pool)
                .await
                .map_err(|e| format!("Failed to query tables: {}", e))?;

            let format_bytes = |bytes: Option<u64>| -> Option<String> {
                bytes.map(|b| {
                    let kb = b as f64 / 1024.0;
                    if kb >= 1024.0 {
                        format!("{:.2} MB", kb / 1024.0)
                    } else {
                        format!("{:.2} KB", kb)
                    }
                })
            };

            let tables = rows
                .into_iter()
                .map(|row| {
                    let try_get = |name: &str| -> Option<String> {
                        row.try_get::<Option<String>, _>(name).ok().flatten()
                    };
                    // MySQL information_schema 中的 TABLE_ROWS、DATA_LENGTH、INDEX_LENGTH 都是 bigint unsigned
                    let try_get_u64 = |name: &str| -> Option<u64> {
                        row.try_get::<Option<u64>, _>(name).ok().flatten()
                    };

                    let comment = try_get("TABLE_COMMENT").filter(|s| !s.is_empty());
                    let engine = try_get("ENGINE").filter(|s| !s.is_empty());
                    let create_time = try_get("CREATE_TIME").filter(|s| !s.is_empty());
                    let update_time = try_get("UPDATE_TIME").filter(|s| !s.is_empty());
                    let collation = try_get("TABLE_COLLATION").filter(|s| !s.is_empty());

                    TableInfo {
                        table_name: row.try_get::<String, _>("TABLE_NAME").unwrap_or_default(),
                        table_type: row.try_get::<String, _>("TABLE_TYPE").unwrap_or_default(),
                        row_count: try_get_u64("TABLE_ROWS"),
                        comment,
                        engine,
                        data_size: format_bytes(try_get_u64("DATA_LENGTH")),
                        index_size: format_bytes(try_get_u64("INDEX_LENGTH")),
                        create_time,
                        update_time,
                        collation,
                    }
                })
                .collect();

            Ok(tables)
        } else {
            Err("Pool type mismatch for MySqlDriver".to_string())
        }
    }

    pub async fn get_databases(pool: &DbPool) -> Result<Vec<String>, String> {
        if let DbPool::MySql(pool) = pool {
            let rows = sqlx::query_as::<_, (String,)>("SHOW DATABASES")
                .fetch_all(pool)
                .await
                .map_err(|e| format!("Failed to query databases: {}", e))?;

            Ok(rows
                .into_iter()
                .map(|(name,)| name)
                .filter(|n| {
                    !["information_schema", "mysql", "performance_schema", "sys"]
                        .contains(&n.as_str())
                })
                .collect())
        } else {
            Err("Pool type mismatch for MySqlDriver".to_string())
        }
    }

    pub async fn get_columns(
        pool: &DbPool,
        table_name: &str,
        database: Option<&str>,
    ) -> Result<Vec<ColumnInfo>, String> {
        if let DbPool::MySql(pool) = pool {
            let db_filter = match database {
                Some(db) => format!("AND TABLE_SCHEMA = '{}'", db),
                None => "AND TABLE_SCHEMA = DATABASE()".to_string(),
            };
            let query = format!(
                r#"
                SELECT
                    COLUMN_NAME,
                    COLUMN_TYPE,
                    IS_NULLABLE,
                    COLUMN_KEY,
                    COLUMN_DEFAULT,
                    EXTRA,
                    COALESCE(COLUMN_COMMENT, '') AS COLUMN_COMMENT
                FROM information_schema.COLUMNS
                WHERE TABLE_NAME = '{}' {}
                ORDER BY ORDINAL_POSITION
            "#,
                table_name, db_filter
            );

            use sqlx::Row;
            let rows = sqlx::query(&query)
                .fetch_all(pool)
                .await
                .map_err(|e| format!("Failed to query columns: {}", e))?;

            let columns = rows
                .into_iter()
                .map(|row| {
                    let try_get = |name: &str| -> String {
                        row.try_get::<Option<String>, _>(name)
                            .ok()
                            .flatten()
                            .unwrap_or_default()
                    };

                    let comment = try_get("COLUMN_COMMENT");
                    let extra = try_get("EXTRA");
                    let key = try_get("COLUMN_KEY");

                    ColumnInfo {
                        column_name: try_get("COLUMN_NAME"),
                        data_type: try_get("COLUMN_TYPE"),
                        is_nullable: try_get("IS_NULLABLE") == "YES",
                        column_key: if key.is_empty() { None } else { Some(key) },
                        column_default: row
                            .try_get::<Option<String>, _>("COLUMN_DEFAULT")
                            .ok()
                            .flatten(),
                        extra: if extra.is_empty() { None } else { Some(extra) },
                        comment: if comment.is_empty() {
                            None
                        } else {
                            Some(comment)
                        },
                    }
                })
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
            // MySQL unsigned 整数需要使用 u64
            if type_name.contains("unsigned") {
                match row.get::<Option<u64>, _>(idx) {
                    Some(v) => serde_json::Value::Number(v.into()),
                    None => serde_json::Value::Null,
                }
            } else {
                match row.get::<Option<i64>, _>(idx) {
                    Some(v) => serde_json::Value::Number(v.into()),
                    None => serde_json::Value::Null,
                }
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
        } else if type_name.contains("datetime")
            || type_name.contains("timestamp")
            || type_name.contains("date")
            || type_name.contains("time")
        {
            // 处理时间类型：先尝试转换为 String
            match row.try_get::<Option<String>, _>(idx) {
                Ok(Some(v)) => serde_json::Value::String(v),
                Ok(None) => serde_json::Value::Null,
                Err(_) => serde_json::Value::Null,
            }
        } else if type_name.contains("json") {
            // 处理 JSON 类型
            match row.try_get::<Option<serde_json::Value>, _>(idx) {
                Ok(Some(v)) => v,
                Ok(None) => serde_json::Value::Null,
                Err(_) => serde_json::Value::Null,
            }
        } else if type_name.contains("blob") || type_name.contains("binary") {
            // 处理 BLOB 类型
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

    pub async fn get_indexes(
        pool: &DbPool,
        table_name: &str,
        database: Option<&str>,
    ) -> Result<Vec<IndexInfo>, String> {
        if let DbPool::MySql(pool) = pool {
            // 使用 database.table_name 格式，避免 "No database selected" 错误
            let qualified_table = match database {
                Some(db) => format!("`{}`.`{}`", db, table_name),
                None => format!("`{}`", table_name),
            };
            let query = format!("SHOW INDEX FROM {}", qualified_table);

            use sqlx::Row;
            let rows = sqlx::query(&query)
                .fetch_all(pool)
                .await
                .map_err(|e| format!("Failed to query indexes: {}", e))?;

            Ok(rows
                .into_iter()
                .map(|row| IndexInfo {
                    index_name: row.try_get::<String, _>("Key_name").unwrap_or_default(),
                    column_name: row.try_get::<String, _>("Column_name").unwrap_or_default(),
                    is_unique: row
                        .try_get::<bool, _>("Non_unique")
                        .map(|v| !v)
                        .unwrap_or(false),
                    is_primary: {
                        let key_name = row.try_get::<String, _>("Key_name").unwrap_or_default();
                        key_name == "PRIMARY"
                    },
                    seq_in_index: row.try_get::<i64, _>("Seq_in_index").unwrap_or(0),
                })
                .collect())
        } else {
            Err("Pool type mismatch for MySqlDriver".to_string())
        }
    }

    pub async fn get_foreign_keys(
        pool: &DbPool,
        table_name: &str,
        database: Option<&str>,
    ) -> Result<Vec<ForeignKeyInfo>, String> {
        if let DbPool::MySql(pool) = pool {
            let db_filter = match database {
                Some(db) => format!("AND TABLE_SCHEMA = '{}'", db),
                None => "AND TABLE_SCHEMA = DATABASE()".to_string(),
            };
            let query = format!(
                r#"
                SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_NAME = '{}' AND REFERENCED_TABLE_NAME IS NOT NULL {}
                ORDER BY ORDINAL_POSITION
            "#,
                table_name, db_filter
            );

            use sqlx::Row;
            let rows = sqlx::query(&query)
                .fetch_all(pool)
                .await
                .map_err(|e| format!("Failed to query foreign keys: {}", e))?;

            Ok(rows
                .into_iter()
                .map(|row| ForeignKeyInfo {
                    constraint_name: row
                        .try_get::<String, _>("CONSTRAINT_NAME")
                        .unwrap_or_default(),
                    column_name: row.try_get::<String, _>("COLUMN_NAME").unwrap_or_default(),
                    referenced_table: row
                        .try_get::<String, _>("REFERENCED_TABLE_NAME")
                        .unwrap_or_default(),
                    referenced_column: row
                        .try_get::<String, _>("REFERENCED_COLUMN_NAME")
                        .unwrap_or_default(),
                })
                .collect())
        } else {
            Err("Pool type mismatch for MySqlDriver".to_string())
        }
    }
}
