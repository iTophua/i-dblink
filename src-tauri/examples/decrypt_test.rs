use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use sha2::{Digest, Sha256};

fn get_machine_id() -> String {
    let mut id = String::new();
    id.push_str(
        &hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "default-host".to_string()),
    );
    id.push_str(&std::env::var("USER").unwrap_or_else(|_| {
        std::env::var("USERNAME").unwrap_or_else(|_| "default-user".to_string())
    }));
    id.push_str("i-dblink");
    id
}

fn get_key() -> [u8; 32] {
    let machine_id = get_machine_id();
    println!("Machine ID: {}", machine_id);
    let mut hasher = Sha256::new();
    hasher.update(machine_id.as_bytes());
    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result);
    key
}

fn decrypt_password(encrypted: &str) -> Result<String, String> {
    let data = BASE64
        .decode(encrypted)
        .map_err(|e| format!("Invalid base64: {}", e))?;

    if data.len() < 12 {
        return Err("Invalid encrypted data".to_string());
    }

    let (nonce_bytes, ciphertext) = data.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let key = get_key();
    let cipher = Aes256Gcm::new((&key).into());

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))?;

    String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8: {}", e))
}

fn main() {
    let encrypted = "tfCM/2KTLNZTrrIfiiL61vD2DSDpEsExnlhxDeVV4/L8OwoT";
    match decrypt_password(encrypted) {
        Ok(password) => println!("Decrypted password: {}", password),
        Err(e) => println!("Failed to decrypt: {}", e),
    }
}
