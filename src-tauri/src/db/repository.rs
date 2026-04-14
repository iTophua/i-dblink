use super::models::*;
use super::pool::DbPool;

use sqlx::Row;

/// 连接配置仓库
#[derive(Clone)]
pub struct ConnectionRepository {
    pool: DbPool,
}

impl ConnectionRepository {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// 获取所有连接
    pub async fn get_all(&self) -> Result<Vec<DbConnection>, sqlx::Error> {
        let connections =
            sqlx::query_as::<_, DbConnection>("SELECT * FROM connections ORDER BY name")
                .fetch_all(self.pool.inner())
                .await?;

        Ok(connections)
    }

    /// 根据 ID 获取连接
    pub async fn get_by_id(&self, id: &str) -> Result<Option<DbConnection>, sqlx::Error> {
        let connection =
            sqlx::query_as::<_, DbConnection>("SELECT * FROM connections WHERE id = ?")
                .bind(id)
                .fetch_optional(self.pool.inner())
                .await?;

        Ok(connection)
    }

    /// 根据分组 ID 获取连接
    pub async fn get_by_group(&self, group_id: &str) -> Result<Vec<DbConnection>, sqlx::Error> {
        let connections = sqlx::query_as::<_, DbConnection>(
            "SELECT * FROM connections WHERE group_id = ? ORDER BY name",
        )
        .bind(group_id)
        .fetch_all(self.pool.inner())
        .await?;

        Ok(connections)
    }

    /// 保存连接（新增或更新）
    pub async fn save(&self, conn: &DbConnection) -> Result<(), sqlx::Error> {
        let exists = sqlx::query("SELECT 1 FROM connections WHERE id = ?")
            .bind(&conn.id)
            .fetch_optional(self.pool.inner())
            .await?
            .is_some();

        if exists {
            // 更新
            sqlx::query(
                r#"
                UPDATE connections 
                SET name = ?, db_type = ?, host = ?, port = ?, 
                    username = ?, database = ?, group_id = ?, 
                    updated_at = datetime('now')
                WHERE id = ?
                "#,
            )
            .bind(&conn.name)
            .bind(&conn.db_type)
            .bind(&conn.host)
            .bind(conn.port)
            .bind(&conn.username)
            .bind(&conn.database)
            .bind(&conn.group_id)
            .bind(&conn.id)
            .execute(self.pool.inner())
            .await?;
        } else {
            // 新增
            sqlx::query(
                r#"
                INSERT INTO connections (id, name, db_type, host, port, username, database, group_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(&conn.id)
            .bind(&conn.name)
            .bind(&conn.db_type)
            .bind(&conn.host)
            .bind(conn.port)
            .bind(&conn.username)
            .bind(&conn.database)
            .bind(&conn.group_id)
            .bind(&conn.created_at.to_rfc3339())
            .bind(&conn.updated_at.to_rfc3339())
            .execute(self.pool.inner())
            .await?;
        }

        Ok(())
    }

    /// 删除连接
    pub async fn delete(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM connections WHERE id = ?")
            .bind(id)
            .execute(self.pool.inner())
            .await?;

        Ok(())
    }

    /// 记录连接历史
    pub async fn log_history(
        &self,
        connection_id: &str,
        action: &str,
        success: bool,
        error_message: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO connection_history (id, connection_id, action, success, error_message, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            "#,
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(connection_id)
        .bind(action)
        .bind(success)
        .bind(error_message)
        .execute(self.pool.inner())
        .await?;

        Ok(())
    }
}

/// 分组仓库
#[derive(Clone)]
pub struct GroupRepository {
    pool: DbPool,
}

impl GroupRepository {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// 获取所有分组
    pub async fn get_all(&self) -> Result<Vec<ConnectionGroup>, sqlx::Error> {
        let groups = sqlx::query_as::<_, ConnectionGroup>(
            "SELECT * FROM connection_groups ORDER BY sort_order, name",
        )
        .fetch_all(self.pool.inner())
        .await?;

        Ok(groups)
    }

    /// 根据 ID 获取分组
    pub async fn get_by_id(&self, id: &str) -> Result<Option<ConnectionGroup>, sqlx::Error> {
        let group =
            sqlx::query_as::<_, ConnectionGroup>("SELECT * FROM connection_groups WHERE id = ?")
                .bind(id)
                .fetch_optional(self.pool.inner())
                .await?;

        Ok(group)
    }

    /// 保存分组
    pub async fn save(&self, group: &ConnectionGroup) -> Result<(), sqlx::Error> {
        let exists = sqlx::query("SELECT 1 FROM connection_groups WHERE id = ?")
            .bind(&group.id)
            .fetch_optional(self.pool.inner())
            .await?
            .is_some();

        if exists {
            sqlx::query(
                r#"
                UPDATE connection_groups 
                SET name = ?, icon = ?, color = ?, parent_id = ?, 
                    sort_order = ?, updated_at = datetime('now')
                WHERE id = ?
                "#,
            )
            .bind(&group.name)
            .bind(&group.icon)
            .bind(&group.color)
            .bind(&group.parent_id)
            .bind(group.sort_order)
            .bind(&group.id)
            .execute(self.pool.inner())
            .await?;
        } else {
            sqlx::query(
                r#"
                INSERT INTO connection_groups (id, name, icon, color, parent_id, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(&group.id)
            .bind(&group.name)
            .bind(&group.icon)
            .bind(&group.color)
            .bind(&group.parent_id)
            .bind(group.sort_order)
            .bind(&group.created_at.to_rfc3339())
            .bind(&group.updated_at.to_rfc3339())
            .execute(self.pool.inner())
            .await?;
        }

        Ok(())
    }

    /// 删除分组
    pub async fn delete(&self, id: &str) -> Result<(), sqlx::Error> {
        // 不能删除默认分组
        if id == "default" {
            return Err(sqlx::Error::RowNotFound);
        }

        // 将属于该分组的连接移到默认分组
        sqlx::query("UPDATE connections SET group_id = 'default' WHERE group_id = ?")
            .bind(id)
            .execute(self.pool.inner())
            .await?;

        // 删除分组
        sqlx::query("DELETE FROM connection_groups WHERE id = ?")
            .bind(id)
            .execute(self.pool.inner())
            .await?;

        Ok(())
    }
}

/// 应用配置仓库
#[derive(Clone)]
pub struct ConfigRepository {
    pool: DbPool,
}

impl ConfigRepository {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// 获取配置值
    pub async fn get(&self, key: &str) -> Result<Option<String>, sqlx::Error> {
        let row = sqlx::query("SELECT value FROM app_config WHERE key = ?")
            .bind(key)
            .fetch_optional(self.pool.inner())
            .await?;

        Ok(row.map(|r| r.get::<String, _>(0)))
    }

    /// 设置配置值
    pub async fn set(&self, key: &str, value: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO app_config (key, value, updated_at)
            VALUES (?, ?, datetime('now'))
            "#,
        )
        .bind(key)
        .bind(value)
        .execute(self.pool.inner())
        .await?;

        Ok(())
    }
}
