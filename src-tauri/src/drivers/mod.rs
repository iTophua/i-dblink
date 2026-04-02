pub mod db_pool;
pub mod mysql_driver;
pub mod pg_driver;
pub mod sqlite_driver;

pub use self::mysql_driver::MySqlDriver;
pub use self::pg_driver::PgDriver;
pub use self::sqlite_driver::SqliteDriver;

use crate::commands::{ColumnInfo, QueryResult, TableInfo};
use crate::db::DbConnection;
use crate::drivers::db_pool::DbPool;

/// 根据数据库类型创建唯一的连接入口函数（简单工厂）
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

/// 根据数据库类型从已有Pool获取表信息
pub async fn get_tables_by_type(db_type: &str, pool: &DbPool) -> Result<Vec<TableInfo>, String> {
    match db_type {
        "mysql" => MySqlDriver::get_tables(pool).await,
        "postgresql" => PgDriver::get_tables(pool).await,
        "sqlite" => SqliteDriver::get_tables(pool).await,
        _ => Err(format!("Unsupported database type: {}", db_type)),
    }
}

pub async fn get_columns_by_type(
    db_type: &str,
    pool: &DbPool,
    table_name: &str,
) -> Result<Vec<ColumnInfo>, String> {
    match db_type {
        "mysql" => MySqlDriver::get_columns(pool, table_name).await,
        "postgresql" => PgDriver::get_columns(pool, table_name).await,
        "sqlite" => SqliteDriver::get_columns(pool, table_name).await,
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
