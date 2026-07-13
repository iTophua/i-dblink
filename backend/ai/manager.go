package ai

import (
	"fmt"
	"sync"
)

// ProviderManager 管理活跃的 AI Provider。
// 当前仅支持 OpenAI 兼容 Provider；配置变更时调用 ReloadFromConfig 重建。
type ProviderManager struct {
	mu       sync.RWMutex
	provider Provider // 当前活跃 Provider（nil 表示未配置）
	enabled  bool     // AI 功能是否启用
}

// NewProviderManager 创建 Provider 管理器
func NewProviderManager() *ProviderManager {
	return &ProviderManager{}
}

// ReloadFromConfig 从存储加载配置并重建 Provider
func (m *ProviderManager) ReloadFromConfig(store ConfigStore) error {
	cfg, err := LoadCloudConfig(store)
	if err != nil {
		return fmt.Errorf("failed to load AI config: %w", err)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	m.enabled = cfg.Enabled

	// 关闭旧 Provider
	if m.provider != nil {
		_ = m.provider.Close()
		m.provider = nil
	}

	// 仅在配置完整时创建 Provider
	if cfg.BaseURL != "" && cfg.APIKey != "" && cfg.Model != "" {
		m.provider = NewOpenAIProvider(OpenAIConfig{
			BaseURL: cfg.BaseURL,
			APIKey:  cfg.APIKey,
			Model:   cfg.Model,
			// MaxTokens/Temperature 不再从用户配置读取，统一使用模型默认值
		})
	}

	return nil
}

// GetActive 获取当前活跃 Provider（未配置或未启用时返回 error）
func (m *ProviderManager) GetActive() (Provider, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if !m.enabled {
		return nil, fmt.Errorf("AI 功能未启用，请在设置中开启")
	}
	if m.provider == nil {
		return nil, fmt.Errorf("AI Provider 未配置，请在设置中配置云端 API")
	}
	if !m.provider.IsReady() {
		return nil, fmt.Errorf("AI Provider 未就绪，请检查配置")
	}
	return m.provider, nil
}

// IsReady 是否就绪（启用 + Provider 已配置）
func (m *ProviderManager) IsReady() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.enabled && m.provider != nil && m.provider.IsReady()
}

// IsEnabled AI 功能是否启用
func (m *ProviderManager) IsEnabled() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.enabled
}
