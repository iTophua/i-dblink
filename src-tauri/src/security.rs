use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

/// 密码存储映射 (内存缓存)
/// 注意：密码实际存储在 SQLite 数据库中，这里只是缓存
static PASSWORD_CACHE: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// 密码管理器错误类型
#[derive(Debug, thiserror::Error)]
pub enum PasswordError {
    #[error("Storage error")]
    Storage,
}

/// 密码管理器
pub struct PasswordManager;

impl PasswordManager {
    /// 存储密码 (保存到数据库并更新缓存)
    pub async fn save_password(
        pool: &sqlx::SqlitePool,
        connection_id: &str,
        password: &str,
    ) -> Result<(), PasswordError> {
        // 更新缓存
        {
            let mut cache = PASSWORD_CACHE.lock().unwrap();
            cache.insert(connection_id.to_string(), password.to_string());
        }

        // 保存到数据库
        sqlx::query(
            r#"
            INSERT INTO connection_passwords (connection_id, password)
            VALUES (?, ?)
            ON CONFLICT(connection_id) DO UPDATE SET password = excluded.password
            "#,
        )
        .bind(connection_id)
        .bind(password)
        .execute(pool)
        .await
        .map_err(|e| {
            eprintln!("Failed to save password: {}", e);
            PasswordError::Storage
        })?;

        Ok(())
    }

    /// 获取密码 (优先从缓存获取，否则从数据库读取)
    pub async fn get_password(
        pool: &sqlx::SqlitePool,
        connection_id: &str,
    ) -> Result<Option<String>, PasswordError> {
        // 先检查缓存
        {
            let cache = PASSWORD_CACHE.lock().unwrap();
            if let Some(password) = cache.get(connection_id) {
                return Ok(Some(password.clone()));
            }
        }

        // 从数据库读取
        let result: Option<(String,)> =
            sqlx::query_as("SELECT password FROM connection_passwords WHERE connection_id = ?")
                .bind(connection_id)
                .fetch_optional(pool)
                .await
                .map_err(|e| {
                    eprintln!("Failed to get password: {}", e);
                    PasswordError::Storage
                })?;

        let password = result.map(|(p,)| p);

        // 更新缓存
        if let Some(ref pwd) = password {
            let mut cache = PASSWORD_CACHE.lock().unwrap();
            cache.insert(connection_id.to_string(), pwd.clone());
        }

        Ok(password)
    }

    /// 删除密码 (从数据库和缓存中删除)
    pub async fn delete_password(
        pool: &sqlx::SqlitePool,
        connection_id: &str,
    ) -> Result<(), PasswordError> {
        // 从缓存删除
        {
            let mut cache = PASSWORD_CACHE.lock().unwrap();
            cache.remove(connection_id);
        }

        // 从数据库删除
        sqlx::query("DELETE FROM connection_passwords WHERE connection_id = ?")
            .bind(connection_id)
            .execute(pool)
            .await
            .map_err(|e| {
                eprintln!("Failed to delete password: {}", e);
                PasswordError::Storage
            })?;

        Ok(())
    }
}
