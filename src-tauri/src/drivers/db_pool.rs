use sqlx;

// 统一的数据库连接池包装，便于不同行为的驱动聚合
#[derive(Debug)]
pub enum DbPool {
    MySql(sqlx::Pool<sqlx::MySql>),
    Postgres(sqlx::Pool<sqlx::Postgres>),
    Sqlite(sqlx::Pool<sqlx::Sqlite>),
}
