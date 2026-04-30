use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::Rng;
use sha2::{Digest, Sha256};
use std::sync::OnceLock;

static ENCRYPTION_KEY: OnceLock<[u8; 32]> = OnceLock::new();

fn get_machine_id() -> String {
    let mut id = String::new();

    // 主机名
    id.push_str(
        &hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "default-host".to_string()),
    );

    // 用户名
    id.push_str(&std::env::var("USER").unwrap_or_else(|_| {
        std::env::var("USERNAME").unwrap_or_else(|_| "default-user".to_string())
    }));

    // 应用标识（避免多应用密钥冲突）
    id.push_str("i-dblink");

    id
}

fn get_key() -> &'static [u8; 32] {
    ENCRYPTION_KEY.get_or_init(|| {
        let machine_id = get_machine_id();
        let mut hasher = Sha256::new();
        hasher.update(machine_id.as_bytes());
        let result = hasher.finalize();
        let mut key = [0u8; 32];
        key.copy_from_slice(&result);
        key
    })
}

pub fn encrypt_password(password: &str) -> Result<String, String> {
    let key = get_key();
    let cipher = Aes256Gcm::new(key.into());

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, password.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    let mut result = nonce_bytes.to_vec();
    result.extend(ciphertext);
    Ok(BASE64.encode(&result))
}

pub fn decrypt_password(encrypted: &str) -> Result<String, String> {
    let data = BASE64
        .decode(encrypted)
        .map_err(|e| format!("Invalid base64: {}", e))?;

    if data.len() < 12 {
        return Err("Invalid encrypted data".to_string());
    }

    let (nonce_bytes, ciphertext) = data.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let key = get_key();
    let cipher = Aes256Gcm::new(key.into());

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))?;

    String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        let password = "my_secret_password";
        let encrypted = encrypt_password(password).unwrap();
        let decrypted = decrypt_password(&encrypted).unwrap();
        assert_eq!(password, decrypted);
    }

    #[test]
    fn test_same_machine_same_key() {
        let key1 = get_key();
        let key2 = get_key();
        assert_eq!(key1, key2);
    }
}
