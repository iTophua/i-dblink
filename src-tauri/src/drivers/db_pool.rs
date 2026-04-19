use sqlx;

#[derive(Debug, Clone)]
pub enum DbPool {
    MySql(sqlx::Pool<sqlx::MySql>),
    Postgres(sqlx::Pool<sqlx::Postgres>),
    Sqlite(sqlx::Pool<sqlx::Sqlite>),
}

impl DbPool {
    /// Validate connection by executing a simple query
    /// Eliminates repeated match patterns across commands.rs
    pub async fn validate(&self) -> Result<(), String> {
        match self {
            DbPool::MySql(pool) => {
                sqlx::query("SELECT 1")
                    .fetch_one(pool)
                    .await
                    .map_err(|e| format!("MySQL connection validation failed: {}", e))?;
            }
            DbPool::Postgres(pool) => {
                sqlx::query("SELECT 1")
                    .fetch_one(pool)
                    .await
                    .map_err(|e| format!("PostgreSQL connection validation failed: {}", e))?;
            }
            DbPool::Sqlite(pool) => {
                sqlx::query("SELECT 1")
                    .fetch_one(pool)
                    .await
                    .map_err(|e| format!("SQLite connection validation failed: {}", e))?;
            }
        }
        Ok(())
    }
}
