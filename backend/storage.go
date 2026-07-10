package backend

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"idblink/backend/localdb"
)

// Storage 统一存储服务
type Storage struct {
	pool           *localdb.Pool
	connectionRepo *localdb.ConnectionRepository
	groupRepo      *localdb.GroupRepository
	snippetRepo    *localdb.SnippetRepository
	historyRepo    *localdb.HistoryRepository
	favoriteRepo   *localdb.FavoriteRepository
	aiConfigRepo   *localdb.AIConfigRepository
}

// NewStorage 创建存储服务
func NewStorage(dataDir string) (*Storage, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data dir: %w", err)
	}

	dbPath := filepath.Join(dataDir, "connections.db")
	pool, err := localdb.NewPool(dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create pool: %w", err)
	}

	if err := localdb.RunMigrations(pool.DB()); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	return &Storage{
		pool:           pool,
		connectionRepo: localdb.NewConnectionRepository(pool.DB()),
		groupRepo:      localdb.NewGroupRepository(pool.DB()),
		snippetRepo:    localdb.NewSnippetRepository(pool.DB()),
		historyRepo:    localdb.NewHistoryRepository(pool.DB()),
		favoriteRepo:   localdb.NewFavoriteRepository(pool.DB()),
		aiConfigRepo:   localdb.NewAIConfigRepository(pool.DB()),
	}, nil
}

// Close 关闭存储
func (s *Storage) Close() error {
	return s.pool.Close()
}

// GetConnections 获取所有连接（不包含密码）
func (s *Storage) GetConnections() ([]*localdb.DbConnection, error) {
	return s.connectionRepo.GetAll()
}

// GetConnectionWithPassword 获取连接详情（包含密码）
func (s *Storage) GetConnectionWithPassword(id string) (*localdb.DbConnection, *string, error) {
	conn, err := s.connectionRepo.GetByID(id)
	if err != nil {
		return nil, nil, err
	}
	if conn == nil {
		return nil, nil, nil
	}

	encrypted, err := s.connectionRepo.GetPassword(id)
	if err != nil {
		return nil, nil, err
	}

	var password *string
	if encrypted != "" {
		decrypted, err := DecryptPassword(encrypted)
		if err == nil {
			password = &decrypted
		}
	}

	return conn, password, nil
}

// GetSSHCredentials 获取连接的 SSH 密码和口令（解密后返回明文）
// 任一未设置则返回空字符串。
func (s *Storage) GetSSHCredentials(id string) (sshPassword, sshPassphrase string, err error) {
	encPass, encPhrase, err := s.connectionRepo.GetSSHCredentials(id)
	if err != nil {
		return "", "", err
	}
	if encPass != "" {
		if dec, e := DecryptPassword(encPass); e == nil {
			sshPassword = dec
		}
	}
	if encPhrase != "" {
		if dec, e := DecryptPassword(encPhrase); e == nil {
			sshPassphrase = dec
		}
	}
	return sshPassword, sshPassphrase, nil
}

// SaveSSHCredentials 保存连接的 SSH 密码和口令（空字符串清除已有值）
func (s *Storage) SaveSSHCredentials(id, sshPassword, sshPassphrase string) error {
	encPass, encPhrase := "", ""
	if sshPassword != "" {
		enc, err := EncryptPassword(sshPassword)
		if err != nil {
			return fmt.Errorf("encryption error: %w", err)
		}
		encPass = enc
	}
	if sshPassphrase != "" {
		enc, err := EncryptPassword(sshPassphrase)
		if err != nil {
			return fmt.Errorf("encryption error: %w", err)
		}
		encPhrase = enc
	}
	return s.connectionRepo.SaveSSHCredentials(id, encPass, encPhrase)
}

// SaveConnection 保存连接
func (s *Storage) SaveConnection(conn *localdb.DbConnection, password *string) error {
	if err := s.connectionRepo.Save(conn); err != nil {
		return err
	}

	if password != nil && *password != "" {
		encrypted, err := EncryptPassword(*password)
		if err != nil {
			return fmt.Errorf("encryption error: %w", err)
		}
		if err := s.connectionRepo.SavePassword(conn.ID, encrypted); err != nil {
			return err
		}
	}

	return nil
}

// UpdateConnection 更新连接
func (s *Storage) UpdateConnection(id string, conn *localdb.DbConnection, newPassword *string) error {
	conn.ID = id
	if err := s.connectionRepo.Save(conn); err != nil {
		return err
	}

	if newPassword != nil && *newPassword != "" {
		encrypted, err := EncryptPassword(*newPassword)
		if err != nil {
			return fmt.Errorf("encryption error: %w", err)
		}
		if err := s.connectionRepo.SavePassword(id, encrypted); err != nil {
			return err
		}
	}

	return nil
}

// DeleteConnection 删除连接
func (s *Storage) DeleteConnection(id string) error {
	if err := s.connectionRepo.DeletePassword(id); err != nil {
		return err
	}
	return s.connectionRepo.Delete(id)
}

// UpdateSortOrders 批量更新连接排序
func (s *Storage) UpdateSortOrders(orders map[string]int) error {
	return s.connectionRepo.UpdateSortOrders(orders)
}

// GetGroups 获取所有分组
func (s *Storage) GetGroups() ([]*localdb.ConnectionGroup, error) {
	return s.groupRepo.GetAll()
}

// SaveGroup 保存分组
func (s *Storage) SaveGroup(group *localdb.ConnectionGroup) error {
	return s.groupRepo.Save(group)
}

// DeleteGroup 删除分组
func (s *Storage) DeleteGroup(id string) error {
	return s.groupRepo.Delete(id)
}

// UpdateConnectionPassword 更新连接密码
func (s *Storage) UpdateConnectionPassword(id string, password string) error {
	encrypted, err := EncryptPassword(password)
	if err != nil {
		return fmt.Errorf("encryption error: %w", err)
	}
	return s.connectionRepo.SavePassword(id, encrypted)
}

// GetSnippets 获取所有代码片段
func (s *Storage) GetSnippets() ([]*localdb.Snippet, error) {
	return s.snippetRepo.GetAll()
}

// SaveSnippet 保存代码片段
func (s *Storage) SaveSnippet(snippet *localdb.Snippet) error {
	return s.snippetRepo.Save(snippet)
}

// DeleteSnippet 删除代码片段
func (s *Storage) DeleteSnippet(id string) error {
	return s.snippetRepo.Delete(id)
}

// RecordHistory 记录操作历史
func (s *Storage) RecordHistory(connID, action string, success bool, errMsg string) error {
	return s.historyRepo.Record(connID, action, success, errMsg)
}

// GetRecentHistory 获取最近的操作历史
func (s *Storage) GetRecentHistory(limit int) ([]map[string]interface{}, error) {
	return s.historyRepo.GetRecent(limit)
}

// ClearHistory 清空操作历史
func (s *Storage) ClearHistory() error {
	return s.historyRepo.Clear()
}

// GetFavorites 获取所有收藏
func (s *Storage) GetFavorites() ([]*localdb.Favorite, error) {
	return s.favoriteRepo.GetAll()
}

// SaveFavorite 保存收藏
func (s *Storage) SaveFavorite(fav *localdb.Favorite) error {
	return s.favoriteRepo.Save(fav)
}

// DeleteFavorite 删除收藏
func (s *Storage) DeleteFavorite(id string) error {
	return s.favoriteRepo.Delete(id)
}

// ==================== AI 配置 ====================

// sensitiveAIKeys 需要加密存储的 AI 配置键
var sensitiveAIKeys = map[string]bool{
	"ai.api_key": true,
}

// GetAIConfig 获取 AI 配置值（敏感键自动解密；不存在返回空字符串）
func (s *Storage) GetAIConfig(key string) (string, error) {
	val, err := s.aiConfigRepo.Get(key)
	if err != nil {
		return "", err
	}
	if val == "" {
		return "", nil
	}
	if sensitiveAIKeys[key] {
		decrypted, err := DecryptPassword(val)
		if err != nil {
			return "", fmt.Errorf("failed to decrypt ai_config[%s]: %w", key, err)
		}
		return decrypted, nil
	}
	return val, nil
}

// SetAIConfig 设置 AI 配置值（敏感键自动加密）
func (s *Storage) SetAIConfig(key, value string) error {
	if value == "" {
		return s.aiConfigRepo.Delete(key)
	}
	if sensitiveAIKeys[key] {
		encrypted, err := EncryptPassword(value)
		if err != nil {
			return fmt.Errorf("failed to encrypt ai_config[%s]: %w", key, err)
		}
		value = encrypted
	}
	return s.aiConfigRepo.Set(key, value)
}

// GetAllAIConfig 获取所有 AI 配置（敏感键返回密文，调用方需自行判断）
func (s *Storage) GetAllAIConfig() (map[string]string, error) {
	return s.aiConfigRepo.GetAll()
}

// GetAIConfigMasked 获取所有 AI 配置，敏感键返回掩码（供前端展示）
func (s *Storage) GetAIConfigMasked() (map[string]string, error) {
	all, err := s.aiConfigRepo.GetAll()
	if err != nil {
		return nil, err
	}
	result := make(map[string]string, len(all))
	for k, v := range all {
		if sensitiveAIKeys[k] {
			result[k] = maskAPIKey(v)
		} else {
			result[k] = v
		}
	}
	return result, nil
}

// maskAPIKey 将 API Key 掩码处理。
// 输入是密文，先解密再掩码；解密失败返回固定占位符（避免泄露密文长度/内容）。
func maskAPIKey(encrypted string) string {
	plain, err := DecryptPassword(encrypted)
	if err != nil {
		// 解密失败不泄露任何信息，统一返回占位符
		return "****（无法读取）"
	}
	if len(plain) <= 8 {
		return strings.Repeat("*", len(plain))
	}
	return plain[:4] + strings.Repeat("*", len(plain)-8) + plain[len(plain)-4:]
}
