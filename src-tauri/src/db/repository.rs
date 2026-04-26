use super::models::*;
use super::pool::DbPool;

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

    /// 获取连接密码
    pub async fn get_password(&self, connection_id: &str) -> Result<Option<String>, sqlx::Error> {
        let row = sqlx::query_as::<_, (String,)>(
            "SELECT password FROM connection_passwords WHERE connection_id = ?",
        )
        .bind(connection_id)
        .fetch_optional(self.pool.inner())
        .await?;

        Ok(row.map(|(pwd,)| pwd))
    }

    /// 保存连接密码
    pub async fn save_password(&self, connection_id: &str, password: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO connection_passwords (connection_id, password)
            VALUES (?, ?)
            ON CONFLICT(connection_id) DO UPDATE SET password = excluded.password
            "#,
        )
        .bind(connection_id)
        .bind(password)
        .execute(self.pool.inner())
        .await?;

        Ok(())
    }

    /// 删除连接密码
    pub async fn delete_password(&self, connection_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM connection_passwords WHERE connection_id = ?")
            .bind(connection_id)
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
