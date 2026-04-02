use sqlx::SqlitePool;

/// 运行数据库迁移
pub async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    // 创建连接配置表
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS connections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            db_type TEXT NOT NULL,
            host TEXT NOT NULL,
            port INTEGER NOT NULL,
            username TEXT NOT NULL,
            database TEXT,
            group_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    // 创建分组表
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS connection_groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            icon TEXT NOT NULL,
            color TEXT NOT NULL,
            parent_id TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    // 创建连接历史表
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS connection_history (
            id TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL,
            action TEXT NOT NULL,
            success BOOLEAN NOT NULL,
            error_message TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    // 创建应用配置表
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS app_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    // 创建索引
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_connections_group_id ON connections(group_id)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_history_connection_id ON connection_history(connection_id)")
        .execute(pool)
        .await?;

    // 插入默认分组（如果不存在）
    sqlx::query(
        r#"
        INSERT OR IGNORE INTO connection_groups (id, name, icon, color, parent_id, sort_order, created_at, updated_at)
        VALUES ('default', '未分组', '📁', '#6d6d6d', NULL, 0, datetime('now'), datetime('now'))
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}
