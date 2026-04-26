use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use std::time::Duration;

/// 数据库连接池包装器
#[derive(Clone)]
pub struct DbPool {
    pool: SqlitePool,
}

impl DbPool {
    /// 创建新的数据库连接池
    pub async fn new(db_path: &str) -> Result<Self, sqlx::Error> {
        // 使用 file: URI 格式，并添加 mode=rwc 参数（read-write-create）
        // 这确保 SQLite 可以创建新文件
        let uri = if db_path.starts_with("file:") {
            db_path.to_string()
        } else {
            // ?mode=rwc 允许读取、写入和创建数据库文件
            // ?cache=shared 允许多个连接共享缓存
            format!("file:{}?mode=rwc&cache=shared", db_path)
        };

        tracing::info!("Creating SQLite pool with URI: {}", uri);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .min_connections(1)
            .acquire_timeout(Duration::from_secs(30))
            .idle_timeout(Duration::from_secs(600))
            .connect(&uri)
            .await
            .map_err(|e| {
                tracing::warn!("Failed to connect to SQLite: {}", e);
                e
            })?;

        tracing::info!("SQLite pool created successfully");
        Ok(Self { pool })
    }

    /// 获取底层连接池
    pub fn inner(&self) -> &SqlitePool {
        &self.pool
    }

}
