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

	"golang.org/x/crypto/scrypt"
)

var (
	keyOnce sync.Once
	key     []byte
	keyErr  error
)

// getMachineID 获取机器标识
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

	// 应用标识（作为 salt 的一部分）
	id.WriteString("i-dblink")

	return id.String()
}

// getKey 获取加密密钥（32 字节）。
// 用 scrypt KDF（N=2^16, r=8, p=1）从 machineID 派生密钥，
// 替代之前的单次 SHA256，大幅提高离线暴力破解成本。
// salt = SHA256(machineID)，使每个机器的密钥互不相同。
func getKey() ([]byte, error) {
	keyOnce.Do(func() {
		machineID := getMachineID()
		salt := sha256.Sum256([]byte(machineID + "|salt"))
		// scrypt 不允许在启动时失败；若失败（极端内存限制）记录错误，调用方返回错误
		key, keyErr = scrypt.Key([]byte(machineID), salt[:], 1<<16, 8, 1, 32)
	})
	return key, keyErr
}

// getKeyLegacy 返回旧的密钥派生（单次 SHA256），仅用于解密历史已存的密码。
// 新加密一律走 scrypt 的 getKey。
func getKeyLegacy() []byte {
	machineID := getMachineID()
	hash := sha256.Sum256([]byte(machineID))
	return hash[:]
}

func decryptWith(encrypted string, k []byte) (string, error) {
	data, err := base64.StdEncoding.DecodeString(encrypted)
	if err != nil {
		return "", fmt.Errorf("invalid base64: %w", err)
	}
	block, err := aes.NewCipher(k)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("invalid encrypted data")
	}
	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

// EncryptPassword 加密密码
func EncryptPassword(password string) (string, error) {
	k, err := getKey()
	if err != nil {
		return "", fmt.Errorf("failed to derive key: %w", err)
	}

	block, err := aes.NewCipher(k)
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

// DecryptPassword 解密密码。先用 scrypt 新密钥，失败则回退到旧的 SHA256 密钥
// （向后兼容：用户已有的加密密码仍可解密，解密后由调用方重新加密即可）。
func DecryptPassword(encrypted string) (string, error) {
	k, err := getKey()
	if err == nil {
		if pt, e := decryptWith(encrypted, k); e == nil {
			return pt, nil
		}
	}
	// fallback：旧密钥派生（历史数据）
	pt, err := decryptWith(encrypted, getKeyLegacy())
	if err != nil {
		return "", fmt.Errorf("decryption failed: %w", err)
	}
	return pt, nil
}
