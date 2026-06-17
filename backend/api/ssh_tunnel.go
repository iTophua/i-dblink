package api

import (
	"fmt"
	"io"
	"net"
	"os"
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
	// 建立 SSH 连接
	config := &ssh.ClientConfig{
		User: sshUsername,
		Auth: []ssh.AuthMethod{},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
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
