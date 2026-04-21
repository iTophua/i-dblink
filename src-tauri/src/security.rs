use keyring::Entry;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

/// 应用服务名（用于 keyring）
const KEYRING_SERVICE: &str = "com.idblink.dev";

/// 密码存储映射 (内存缓存)
static PASSWORD_CACHE: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// 密码管理器错误类型
#[derive(Debug, thiserror::Error)]
pub enum PasswordError {
    #[error("Keyring error: {0}")]
    Keyring(String),
    #[error("Cache lock poisoned")]
    CachePoisoned,
}

impl From<keyring::Error> for PasswordError {
    fn from(err: keyring::Error) -> Self {
        PasswordError::Keyring(err.to_string())
    }
}

/// 密码管理器
pub struct PasswordManager;

impl PasswordManager {
    fn get_entry(connection_id: &str) -> Result<Entry, PasswordError> {
        Ok(Entry::new(KEYRING_SERVICE, connection_id)?)
    }

    pub fn save_password(connection_id: &str, password: &str) -> Result<(), PasswordError> {
        {
            let mut cache = PASSWORD_CACHE.lock().map_err(|_| PasswordError::CachePoisoned)?;
            cache.insert(connection_id.to_string(), password.to_string());
        }

        let entry = Self::get_entry(connection_id)?;
        entry.set_password(password)?;

        Ok(())
    }

    pub fn get_password(connection_id: &str) -> Result<Option<String>, PasswordError> {
        {
            let cache = PASSWORD_CACHE.lock().map_err(|_| PasswordError::CachePoisoned)?;
            if let Some(password) = cache.get(connection_id) {
                return Ok(Some(password.clone()));
            }
        }

        let entry = Self::get_entry(connection_id)?;
        match entry.get_password() {
            Ok(password) => {
                let mut cache = PASSWORD_CACHE.lock().map_err(|_| PasswordError::CachePoisoned)?;
                cache.insert(connection_id.to_string(), password.clone());
                Ok(Some(password))
            }
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(PasswordError::Keyring(e.to_string())),
        }
    }

    pub fn delete_password(connection_id: &str) -> Result<(), PasswordError> {
        {
            let mut cache = PASSWORD_CACHE.lock().map_err(|_| PasswordError::CachePoisoned)?;
            cache.remove(connection_id);
        }

        let entry = Self::get_entry(connection_id)?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(PasswordError::Keyring(e.to_string())),
        }
    }
}
