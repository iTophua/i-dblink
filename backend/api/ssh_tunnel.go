package api

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// SSHTunnel SSH 隧道
type SSHTunnel struct {
	localListener net.Listener
	sshClient     *ssh.Client
	remoteHost    string
	remotePort    int
	localPort     int
	mu            sync.RWMutex
}

// TunnelManager 管理所有 SSH 隧道
type TunnelManager struct {
	mu      sync.RWMutex
	tunnels map[string]*SSHTunnel
}

// NewTunnelManager 创建隧道管理器
func NewTunnelManager() *TunnelManager {
	return &TunnelManager{
		tunnels: make(map[string]*SSHTunnel),
	}
}

// knownHostsEntry 持久化的 host key 记录（TOFU：首次记录，后续比对）
type knownHostsEntry struct {
	Host string `json:"host"`
	Key  string `json:"key"` // base64(ssh.PublicKey.Marshal())
}

// knownHostsPath 返回持久化 known_hosts 文件路径（用户配置目录下）
func knownHostsPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil || dir == "" {
		// 回退到 home 目录
		home, err2 := os.UserHomeDir()
		if err2 != nil {
			return "", fmt.Errorf("cannot determine config dir: %w", err)
		}
		dir = filepath.Join(home, ".config")
	}
	appDir := filepath.Join(dir, "iDBLink")
	if err := os.MkdirAll(appDir, 0o700); err != nil {
		return "", fmt.Errorf("cannot create config dir: %w", err)
	}
	return filepath.Join(appDir, "ssh_known_hosts.json"), nil
}

// loadKnownHosts 从文件加载已记录的 host keys
func loadKnownHosts() ([]knownHostsEntry, error) {
	p, err := knownHostsPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var entries []knownHostsEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return nil, err
	}
	return entries, nil
}

// saveKnownHost 追加一条 host key 记录
func saveKnownHost(entry knownHostsEntry) error {
	p, err := knownHostsPath()
	if err != nil {
		return err
	}
	entries, _ := loadKnownHosts()
	entries = append(entries, entry)
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0o600)
}

// tofuHostKeyCallback 实现 Trust-On-First-Use 校验：
// - 主机首次连接：记录其 host key 并接受
// - 后续连接：必须与已记录的 key 一致，否则拒绝（防 MITM）
func tofuHostKeyCallback() ssh.HostKeyCallback {
	return func(hostname string, _ net.Addr, key ssh.PublicKey) error {
		entries, err := loadKnownHosts()
		if err != nil {
			return fmt.Errorf("failed to load known_hosts: %w", err)
		}
		keyStr := base64.StdEncoding.EncodeToString(key.Marshal())
		for _, e := range entries {
			if e.Host == hostname {
				if e.Key == keyStr {
					return nil // 匹配
				}
				return fmt.Errorf("SSH host key mismatch for %q — possible man-in-the-middle attack; remove the old entry if the server key was legitimately changed", hostname)
			}
		}
		// 首次见到该主机：记录并接受
		if err := saveKnownHost(knownHostsEntry{Host: hostname, Key: keyStr}); err != nil {
			return fmt.Errorf("failed to record host key: %w", err)
		}
		return nil
	}
}

// StartTunnel 创建并启动 SSH 隧道
func (tm *TunnelManager) StartTunnel(
	connectionID string,
	sshHost string,
	sshPort int,
	sshUsername string,
	authMethod string,
	sshPassword string,
	privateKeyPath string,
	passphrase string,
	remoteHost string,
	remotePort int,
) (*SSHTunnel, error) {
	// 如果该 connectionID 已有隧道，先关闭旧的，避免泄漏 sshClient/listener/goroutine
	tm.mu.Lock()
	if old, exists := tm.tunnels[connectionID]; exists {
		delete(tm.tunnels, connectionID)
		tm.mu.Unlock()
		_ = old.Close()
		tm.mu.Lock()
	}
	tm.mu.Unlock()

	// 建立 SSH 连接
	config := &ssh.ClientConfig{
		User:            sshUsername,
		Auth:            []ssh.AuthMethod{},
		HostKeyCallback: tofuHostKeyCallback(),
		Timeout:         10 * time.Second,
	}

	if authMethod == "key" && privateKeyPath != "" {
		key, err := os.ReadFile(privateKeyPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read private key: %w", err)
		}

		var signer ssh.Signer
		if passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(key, []byte(passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey(key)
		}
		if err != nil {
			return nil, fmt.Errorf("failed to parse private key: %w", err)
		}
		config.Auth = append(config.Auth, ssh.PublicKeys(signer))
	} else {
		config.Auth = append(config.Auth, ssh.Password(sshPassword))
	}

	sshAddr := fmt.Sprintf("%s:%d", sshHost, sshPort)
	sshClient, err := ssh.Dial("tcp", sshAddr, config)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to SSH server: %w", err)
	}

	// 创建本地监听器（随机端口）
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		sshClient.Close()
		return nil, fmt.Errorf("failed to create local listener: %w", err)
	}

	localPort := listener.Addr().(*net.TCPAddr).Port

	tunnel := &SSHTunnel{
		localListener: listener,
		sshClient:     sshClient,
		remoteHost:    remoteHost,
		remotePort:    remotePort,
		localPort:     localPort,
	}

	// 启动转发 goroutine
	go tunnel.forward()

	tm.mu.Lock()
	tm.tunnels[connectionID] = tunnel
	tm.mu.Unlock()

	return tunnel, nil
}

// StopTunnel 停止并移除 SSH 隧道
func (tm *TunnelManager) StopTunnel(connectionID string) error {
	tm.mu.Lock()
	tunnel, ok := tm.tunnels[connectionID]
	if ok {
		delete(tm.tunnels, connectionID)
	}
	tm.mu.Unlock()

	if !ok {
		return fmt.Errorf("tunnel not found for connection %s", connectionID)
	}

	return tunnel.Close()
}

// GetTunnel 获取指定连接的隧道
func (tm *TunnelManager) GetTunnel(connectionID string) *SSHTunnel {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	return tm.tunnels[connectionID]
}

// CloseAll 关闭所有隧道（用于 Shutdown）
func (tm *TunnelManager) CloseAll() {
	tm.mu.Lock()
	tunnels := tm.tunnels
	tm.tunnels = make(map[string]*SSHTunnel)
	tm.mu.Unlock()
	for _, t := range tunnels {
		_ = t.Close()
	}
}

// LocalPort 获取本地监听端口
func (t *SSHTunnel) LocalPort() int {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.localPort
}

// Close 关闭隧道
func (t *SSHTunnel) Close() error {
	if t.localListener != nil {
		t.localListener.Close()
	}
	if t.sshClient != nil {
		t.sshClient.Close()
	}
	return nil
}

// forward 处理端口转发
func (t *SSHTunnel) forward() {
	for {
		localConn, err := t.localListener.Accept()
		if err != nil {
			// 监听器已关闭
			return
		}

		go func(local net.Conn) {
			defer local.Close()

			remoteAddr := fmt.Sprintf("%s:%d", t.remoteHost, t.remotePort)
			remoteConn, err := t.sshClient.Dial("tcp", remoteAddr)
			if err != nil {
				return
			}
			defer remoteConn.Close()

			// 双向复制
			done := make(chan struct{}, 2)
			go func() {
				io.Copy(remoteConn, local)
				done <- struct{}{}
			}()
			go func() {
				io.Copy(local, remoteConn)
				done <- struct{}{}
			}()
			<-done
		}(localConn)
	}
}
