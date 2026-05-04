#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_machine_id() {
        let id = get_machine_id();
        assert!(!id.is_empty());
        assert!(id.contains("i-dblink"));
    }

    #[test]
    fn test_get_key_deterministic() {
        let key1 = get_key();
        let key2 = get_key();
        assert_eq!(key1, key2);
        assert_eq!(key1.len(), 32);
    }

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let password = "my_secret_password_123";
        let encrypted = encrypt_password(password).unwrap();
        let decrypted = decrypt_password(&encrypted).unwrap();
        assert_eq!(password, decrypted);
    }

    #[test]
    fn test_encrypt_different_results() {
        let password = "same_password";
        let encrypted1 = encrypt_password(password).unwrap();
        let encrypted2 = encrypt_password(password).unwrap();
        // Due to random nonce, encrypted results should be different
        assert_ne!(encrypted1, encrypted2);
        // But both should decrypt to the same password
        assert_eq!(decrypt_password(&encrypted1).unwrap(), password);
        assert_eq!(decrypt_password(&encrypted2).unwrap(), password);
    }

    #[test]
    fn test_decrypt_invalid_base64() {
        let result = decrypt_password("not-valid-base64!!!");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid base64"));
    }

    #[test]
    fn test_decrypt_too_short() {
        // Base64 encode of "short" (less than 12 bytes)
        let result = decrypt_password("c2hvcnQ=");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid encrypted data"));
    }

    #[test]
    fn test_encrypt_empty_password() {
        let password = "";
        let encrypted = encrypt_password(password).unwrap();
        let decrypted = decrypt_password(&encrypted).unwrap();
        assert_eq!(password, decrypted);
    }

    #[test]
    fn test_encrypt_unicode_password() {
        let password = "你好世界🎉🚀";
        let encrypted = encrypt_password(password).unwrap();
        let decrypted = decrypt_password(&encrypted).unwrap();
        assert_eq!(password, decrypted);
    }

    #[test]
    fn test_encrypt_long_password() {
        let password = "a".repeat(1000);
        let encrypted = encrypt_password(&password).unwrap();
        let decrypted = decrypt_password(&encrypted).unwrap();
        assert_eq!(password, decrypted);
    }

    #[test]
    fn test_decrypt_tampered_data() {
        let password = "test_password";
        let encrypted = encrypt_password(password).unwrap();
        
        // Tamper with the encrypted data
        let mut tampered = encrypted.clone();
        let bytes = unsafe { tampered.as_bytes_mut() };
        if bytes.len() > 20 {
            bytes[20] = bytes[20].wrapping_add(1);
        }
        
        let result = decrypt_password(&tampered);
        assert!(result.is_err());
    }
}
