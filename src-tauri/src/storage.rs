use crate::db::{ConnectionGroup, ConnectionRepository, DbConnection, DbPool, GroupRepository};
use crate::security::PasswordManager;
use std::path::PathBuf;
use tauri::AppHandle;

/// 获取应用数据目录（区分开发和生产环境）
fn get_data_dir(_app_handle: &AppHandle) -> PathBuf {
    // 检查是否为开发模式（debug 构建）
    #[cfg(debug_assertions)]
    {
        // 开发环境：使用项目根目录的 .dev-data 文件夹
        // 这样开发时的数据不会干扰生产数据
        // 注意：cargo 在 src-tauri 目录下运行，所以需要向上一级
        let dev_data_dir = std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .parent() // 从 src-tauri 回到项目根目录
            .unwrap_or(&PathBuf::from("."))
            .join(".dev-data");

        // 创建目录（如果不存在），使用 unwrap 因为开发环境中几乎不会失败
        let _ = std::fs::create_dir_all(&dev_data_dir);

        println!("Using development data directory: {:?}", dev_data_dir);
        dev_data_dir
    }

    // 生产环境：使用系统标准应用数据目录
    #[cfg(not(debug_assertions))]
    {
        let app_data = app_handle
            .path()
            .app_data_dir()
            .expect("Failed to get app data dir - please ensure app data directory is accessible");

        let data_dir = app_data.join("data");
        // 创建目录（如果不存在）
        let _ = std::fs::create_dir_all(&data_dir)
            .map_err(|e| eprintln!("Warning: Failed to create data directory: {}", e));

        println!("Using production data directory: {:?}", data_dir);
        data_dir
    }
}

/// 获取数据库文件路径
fn get_db_path(app_handle: &AppHandle) -> PathBuf {
    get_data_dir(app_handle).join("connections.db")
}

/// 初始化存储系统
pub async fn init_storage(app_handle: &AppHandle) -> Result<Storage, anyhow::Error> {
    let db_path = get_db_path(app_handle);

    // 确保父目录存在
    if let Some(parent) = db_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }

    let db_path_str = db_path.to_string_lossy().to_string();

    println!("Initializing database at: {}", db_path_str);

    // 创建数据库连接池
    let pool = DbPool::new(&db_path_str).await?;

    // 运行迁移
    crate::db::run_migrations(pool.inner()).await?;

    // 创建仓库
    let connection_repo = ConnectionRepository::new(pool.clone());
    let group_repo = GroupRepository::new(pool.clone());

    Ok(Storage {
        connection_repo,
        group_repo,
        _pool: pool,
    })
}

/// 统一存储服务
#[derive(Clone)]
pub struct Storage {
    connection_repo: ConnectionRepository,
    group_repo: GroupRepository,
    _pool: DbPool,
}

impl Storage {
    /// 获取所有连接（不包含密码）
    pub async fn get_connections(&self) -> Result<Vec<DbConnection>, anyhow::Error> {
        Ok(self.connection_repo.get_all().await?)
    }

    /// 获取连接详情（包含密码）
    pub async fn get_connection_with_password(
        &self,
        id: &str,
    ) -> Result<Option<(DbConnection, Option<String>)>, anyhow::Error> {
        let conn = self.connection_repo.get_by_id(id).await?;
        if let Some(connection) = conn {
            let password = PasswordManager::get_password(self._pool.inner(), id).await?;
            Ok(Some((connection, password)))
        } else {
            Ok(None)
        }
    }

    /// 保存连接
    pub async fn save_connection(
        &self,
        conn: DbConnection,
        password: Option<&str>,
    ) -> Result<(), anyhow::Error> {
        // 保存连接配置
        self.connection_repo.save(&conn).await?;

        // 保存密码到数据库
        if let Some(pwd) = password {
            PasswordManager::save_password(self._pool.inner(), &conn.id, pwd).await?;
        }

        Ok(())
    }

    /// 更新连接
    pub async fn update_connection(
        &self,
        id: &str,
        updated: DbConnection,
        new_password: Option<&str>,
    ) -> Result<(), anyhow::Error> {
        // 如果提供了新密码则更新，否则保留原密码
        if let Some(pwd) = new_password {
            PasswordManager::save_password(self._pool.inner(), id, pwd).await?;
        }

        // 更新连接配置
        self.connection_repo.save(&updated).await?;

        Ok(())
    }

    /// 删除连接
    pub async fn delete_connection(&self, id: &str) -> Result<(), anyhow::Error> {
        // 删除密码
        PasswordManager::delete_password(self._pool.inner(), id).await?;

        // 删除连接配置
        self.connection_repo.delete(id).await?;

        Ok(())
    }

    /// 获取所有分组
    pub async fn get_groups(&self) -> Result<Vec<ConnectionGroup>, anyhow::Error> {
        Ok(self.group_repo.get_all().await?)
    }

    /// 保存分组
    pub async fn save_group(&self, group: ConnectionGroup) -> Result<(), anyhow::Error> {
        Ok(self.group_repo.save(&group).await?)
    }

    /// 删除分组
    pub async fn delete_group(&self, id: &str) -> Result<(), anyhow::Error> {
        Ok(self.group_repo.delete(id).await?)
    }

    /// 记录连接历史
    pub async fn _log_connection_history(
        &self,
        connection_id: &str,
        action: &str,
        success: bool,
        error_message: Option<&str>,
    ) -> Result<(), anyhow::Error> {
        Ok(self
            .connection_repo
            ._log_history(connection_id, action, success, error_message)
            .await?)
    }
}
