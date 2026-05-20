package backend

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
)

var (
	keyOnce sync.Once
	key     []byte
)

// getMachineID 获取机器标识（与 Rust 版本一致）
func getMachineID() string {
	var id strings.Builder

	// macOS: 使用 IOPlatformUUID
	if runtime.GOOS == "darwin" {
		if out, err := exec.Command("ioreg", "-rd1", "-c", "IOPlatformExpertDevice").Output(); err == nil {
			stdout := string(out)
			if idx := strings.Index(stdout, "IOPlatformUUID"); idx != -1 {
				rest := stdout[idx:]
				if start := strings.Index(rest, `"`); start != -1 {
					uuidPart := rest[start+1:]
					if end := strings.Index(uuidPart, `"`); end != -1 {
						id.WriteString(uuidPart[:end])
					}
				}
			}
		}
	}

	// 如果 macOS UUID 没获取到，或其他平台，使用 hostname
	if id.Len() == 0 {
		if hostname, err := os.Hostname(); err == nil {
			id.WriteString(hostname)
		} else {
			id.WriteString("default-host")
		}
	}

	// 用户名
	if user := os.Getenv("USER"); user != "" {
		id.WriteString(user)
	} else if user := os.Getenv("USERNAME"); user != "" {
		id.WriteString(user)
	} else {
		id.WriteString("default-user")
	}

	// 应用标识
	id.WriteString("i-dblink")

	return id.String()
}

// getKey 获取加密密钥（32 字节）
func getKey() []byte {
	keyOnce.Do(func() {
		machineID := getMachineID()
		hash := sha256.Sum256([]byte(machineID))
		key = hash[:]
	})
	return key
}

// EncryptPassword 加密密码
func EncryptPassword(password string) (string, error) {
	block, err := aes.NewCipher(getKey())
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(password), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// DecryptPassword 解密密码
func DecryptPassword(encrypted string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(encrypted)
	if err != nil {
		return "", fmt.Errorf("invalid base64: %w", err)
	}

	block, err := aes.NewCipher(getKey())
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("invalid encrypted data")
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decryption failed: %w", err)
	}

	return string(plaintext), nil
}
