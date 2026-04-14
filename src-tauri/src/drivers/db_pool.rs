use sqlx;

#[derive(Debug, Clone)]
pub enum DbPool {
    MySql(sqlx::Pool<sqlx::MySql>),
    Postgres(sqlx::Pool<sqlx::Postgres>),
    Sqlite(sqlx::Pool<sqlx::Sqlite>),
}

impl DbPool {
    pub fn clone_ref(&self) -> Self {
        self.clone()
    }
}
