use sqlx::{Pool, Sqlite};

/// 数据库表信息
#[derive(Debug, Clone)]
pub struct TableInfo {
    pub table_name: String,
    pub table_type: String,
    pub row_count: Option<u64>,
    pub create_time: Option<String>,
}

/// 列信息
#[derive(Debug, Clone)]
pub struct ColumnInfo {
    pub column_name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub column_key: Option<String>,
    pub column_default: Option<String>,
    pub extra: Option<String>,
}

/// 获取表列表（MySQL）
pub async fn get_tables_mysql(pool: &Pool<Sqlite>) -> Result<Vec<TableInfo>, sqlx::Error> {
    // 注意：这里需要根据实际数据库类型动态切换 SQL
    // 现在是 MySQL 的示例
    let tables = sqlx::query_as::<_, (String, String)>(
        "SHOW TABLES"
    )
    .fetch_all(pool)
    .await?;

    Ok(tables
        .into_iter()
        .map(|(name, _)| TableInfo {
            table_name: name,
            table_type: "BASE TABLE".to_string(),
            row_count: None,
            create_time: None,
        })
        .collect())
}

/// 获取列信息（MySQL）
pub async fn get_columns_mysql(
    pool: &Pool<Sqlite>,
    table_name: &str,
) -> Result<Vec<ColumnInfo>, sqlx::Error> {
    let columns = sqlx::query_as::<_, (String, String, String, String, Option<String>, String)>(
        "DESCRIBE ??",
    )
    .bind(table_name)
    .fetch_all(pool)
    .await?;

    Ok(columns
        .into_iter()
        .map(|(field, type_str, null, key, default, extra)| ColumnInfo {
            column_name: field,
            data_type: type_str,
            is_nullable: null == "YES",
            column_key: if key.is_empty() { None } else { Some(key) },
            column_default: default,
            extra: if extra.is_empty() { None } else { Some(extra) },
        })
        .collect())
}
