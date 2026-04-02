use keyring::Entry;
use std::sync::LazyLock;

/// 密钥环服务名称
const SERVICE_NAME: &str = "idblink";

/// 密码管理器错误类型
#[derive(Debug, thiserror::Error)]
pub enum PasswordError {
    #[error("Keyring error: {0}")]
    Keyring(#[from] keyring::Error),
    #[error("Not found")]
    NotFound,
}

/// 密码管理器
pub struct PasswordManager;

impl PasswordManager {
    /// 存储密码
    pub fn save_password(connection_id: &str, password: &str) -> Result<(), PasswordError> {
        let entry = Entry::new(SERVICE_NAME, connection_id)?;
        entry.set_password(password)?;
        Ok(())
    }

    /// 获取密码
    pub fn get_password(connection_id: &str) -> Result<Option<String>, PasswordError> {
        let entry = Entry::new(SERVICE_NAME, connection_id)?;
        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(PasswordError::Keyring(e)),
        }
    }

    /// 删除密码 - 通过设置空密码来模拟删除
    pub fn delete_password(connection_id: &str) -> Result<(), PasswordError> {
        let entry = Entry::new(SERVICE_NAME, connection_id)?;
        // keyring 2.3 API 使用 set_password 清空
        entry.set_password("").map_err(PasswordError::Keyring)?;
        Ok(())
    }
}

// 初始化系统密钥环可用性检查
static KEYRING_AVAILABLE: LazyLock<bool> = LazyLock::new(|| {
    let test_entry = Entry::new(SERVICE_NAME, "_test_connection");
    match test_entry {
        Ok(entry) => {
            let result = entry.set_password("test").is_ok();
            let _ = entry.set_password("");
            result
        }
        Err(_) => false,
    }
});

/// 检查密钥环是否可用
pub fn is_keyring_available() -> bool {
    *KEYRING_AVAILABLE
}
