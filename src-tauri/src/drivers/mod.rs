pub mod db_pool;
pub mod mysql_driver;
pub mod pg_driver;
pub mod sqlite_driver;

pub use self::mysql_driver::MySqlDriver;
pub use self::pg_driver::PgDriver;
pub use self::sqlite_driver::SqliteDriver;

use crate::commands::{ColumnInfo, ForeignKeyInfo, IndexInfo, QueryResult, TableInfo, TableStructure, TablesResult};
use crate::db::DbConnection;
use crate::drivers::db_pool::DbPool;

pub async fn connect_by_type(
    db_type: &str,
    config: &DbConnection,
    password: &str,
) -> Result<DbPool, String> {
    match db_type {
        "mysql" => MySqlDriver::connect(config, password).await,
        "postgresql" => PgDriver::connect(config, password).await,
        "sqlite" => SqliteDriver::connect(config, password).await,
        _ => Err(format!("Unsupported database type: {}", db_type)),
    }
}

pub async fn get_tables_by_type(
    db_type: &str,
    pool: &DbPool,
    database: Option<&str>,
) -> Result<Vec<TableInfo>, String> {
    match db_type {
        "mysql" => MySqlDriver::get_tables(pool, database).await,
        "postgresql" => PgDriver::get_tables(pool, database).await,
        "sqlite" => SqliteDriver::get_tables(pool, database).await,
        _ => Err(format!("Unsupported database type: {}", db_type)),
    }
}

pub async fn get_columns_by_type(
    db_type: &str,
    pool: &DbPool,
    table_name: &str,
    database: Option<&str>,
) -> Result<Vec<ColumnInfo>, String> {
    match db_type {
        "mysql" => MySqlDriver::get_columns(pool, table_name, database).await,
        "postgresql" => PgDriver::get_columns(pool, table_name, database).await,
        "sqlite" => SqliteDriver::get_columns(pool, table_name, database).await,
        _ => Err(format!("Unsupported database type: {}", db_type)),
    }
}

pub async fn execute_query_by_type(
    db_type: &str,
    pool: &DbPool,
    sql: &str,
) -> Result<QueryResult, String> {
    match db_type {
        "mysql" => MySqlDriver::execute_query(pool, sql).await,
        "postgresql" => PgDriver::execute_query(pool, sql).await,
        "sqlite" => SqliteDriver::execute_query(pool, sql).await,
        _ => Err(format!("Unsupported database type: {}", db_type)),
    }
}

pub async fn get_databases_by_type(db_type: &str, pool: &DbPool) -> Result<Vec<String>, String> {
    match db_type {
        "mysql" => MySqlDriver::get_databases(pool).await,
        "postgresql" => PgDriver::get_databases(pool).await,
        "sqlite" => SqliteDriver::get_databases(pool).await,
        _ => Err(format!("Unsupported database type: {}", db_type)),
    }
}

pub async fn get_indexes_by_type(
    db_type: &str,
    pool: &DbPool,
    table_name: &str,
    database: Option<&str>,
) -> Result<Vec<IndexInfo>, String> {
    match db_type {
        "mysql" => MySqlDriver::get_indexes(pool, table_name, database).await,
        "postgresql" => PgDriver::get_indexes(pool, table_name).await,
        "sqlite" => SqliteDriver::get_indexes(pool, table_name).await,
        _ => Err(format!("Unsupported database type: {}", db_type)),
    }
}

pub async fn get_foreign_keys_by_type(
    db_type: &str,
    pool: &DbPool,
    table_name: &str,
    database: Option<&str>,
) -> Result<Vec<ForeignKeyInfo>, String> {
    match db_type {
        "mysql" => MySqlDriver::get_foreign_keys(pool, table_name, database).await,
        "postgresql" => PgDriver::get_foreign_keys(pool, table_name).await,
        "sqlite" => SqliteDriver::get_foreign_keys(pool, table_name).await,
        _ => Err(format!("Unsupported database type: {}", db_type)),
    }
}

/// 获取分类的表和视图（支持搜索过滤）
pub async fn get_tables_categorized_by_type(
    db_type: &str,
    pool: &DbPool,
    database: Option<&str>,
    search: Option<&str>,
) -> Result<TablesResult, String> {
    match db_type {
        "mysql" => MySqlDriver::get_tables_categorized(pool, database, search).await,
        "postgresql" => PgDriver::get_tables_categorized(pool, database, search).await,
        "sqlite" => SqliteDriver::get_tables_categorized(pool, database, search).await,
        _ => Err(format!("Unsupported database type: {}", db_type)),
    }
}

/// 获取完整的表结构（列、索引、外键）
pub async fn get_table_structure_by_type(
    db_type: &str,
    pool: &DbPool,
    table_name: &str,
    database: Option<&str>,
) -> Result<TableStructure, String> {
    match db_type {
        "mysql" => MySqlDriver::get_table_structure(pool, table_name, database).await,
        "postgresql" => PgDriver::get_table_structure(pool, table_name, database).await,
        "sqlite" => SqliteDriver::get_table_structure(pool, table_name).await,
        _ => Err(format!("Unsupported database type: {}", db_type)),
    }
}
