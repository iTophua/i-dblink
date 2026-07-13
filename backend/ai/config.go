package ai

// AI 配置键（存储在 ai_config 表中）
const (
	CfgEnabled   = "ai.enabled"  // "true"/"false"
	CfgProvider  = "ai.provider" // Provider 名称标识（如 "deepseek"）
	CfgBaseURL   = "ai.base_url" // API Base URL
	CfgAPIKey    = "ai.api_key"  // API Key（加密存储）
	CfgModel     = "ai.model"    // 模型名称
	CfgMaxTokens = "ai.max_tokens" // 已废弃：不再由用户配置（保留键以兼容旧数据，不再读写）
	CfgTemp      = "ai.temperature" // 已废弃：同上
)

// PresetProvider 预置服务商配置（前端选择后自动填充 BaseURL + Model）
type PresetProvider struct {
	ID      string `json:"id"`      // "deepseek" / "openai" / "qwen" / "zhipu" / "custom"
	Name    string `json:"name"`    // 显示名称
	BaseURL string `json:"baseUrl"` // 默认 BaseURL
	Model   string `json:"model"`   // 默认模型
}

// PresetProviders 预置服务商列表（覆盖国内主流 + OpenAI）
var PresetProviders = []PresetProvider{
	{ID: "deepseek", Name: "DeepSeek", BaseURL: "https://api.deepseek.com/v1", Model: "deepseek-chat"},
	{ID: "qwen", Name: "通义千问 (Qwen)", BaseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", Model: "qwen-plus"},
	{ID: "zhipu", Name: "智谱 GLM", BaseURL: "https://open.bigmodel.cn/api/paas/v4", Model: "glm-4-flash"},
	{ID: "moonshot", Name: "月之暗面 (Kimi)", BaseURL: "https://api.moonshot.cn/v1", Model: "moonshot-v1-8k"},
	{ID: "openai", Name: "OpenAI", BaseURL: "https://api.openai.com/v1", Model: "gpt-4o-mini"},
	{ID: "custom", Name: "自定义 (OpenAI 兼容)", BaseURL: "", Model: ""},
}

// ConfigStore 配置存储抽象（由 backend.Storage 实现，避免循环依赖）
type ConfigStore interface {
	GetAIConfig(key string) (string, error)
	SetAIConfig(key, value string) error
	GetAIConfigMasked() (map[string]string, error)
}

// CloudConfig 从存储加载的完整云端配置（API Key 已解密）
// 注意：maxTokens/temperature 不再由用户配置，统一使用模型默认值，因此不在此结构中。
type CloudConfig struct {
	Enabled  bool
	Provider string
	BaseURL  string
	APIKey   string
	Model    string
}

// LoadCloudConfig 从存储加载配置
func LoadCloudConfig(store ConfigStore) (*CloudConfig, error) {
	masked, err := store.GetAIConfigMasked()
	if err != nil {
		return nil, err
	}

	// API Key 需要明文（通过 GetAIConfig 解密获取）
	apiKey, err := store.GetAIConfig(CfgAPIKey)
	if err != nil {
		return nil, err
	}

	cfg := &CloudConfig{
		Enabled:  masked[CfgEnabled] == "true",
		Provider: masked[CfgProvider],
		BaseURL:  masked[CfgBaseURL],
		APIKey:   apiKey,
		Model:    masked[CfgModel],
	}
	return cfg, nil
}

// SaveCloudConfigInput 保存配置时的输入（API Key 为明文，由存储层加密）
// 注意：maxTokens/temperature 不再由用户配置，统一使用模型默认值。
type SaveCloudConfigInput struct {
	Enabled  bool   `json:"enabled"`
	Provider string `json:"provider"`
	BaseURL  string `json:"baseUrl"`
	APIKey   string `json:"apiKey"` // 明文，空字符串表示不修改
	Model    string `json:"model"`
}

// SaveCloudConfig 将配置写入存储
func SaveCloudConfig(store ConfigStore, input *SaveCloudConfigInput) error {
	boolStr := func(b bool) string {
		if b {
			return "true"
		}
		return "false"
	}

	if err := store.SetAIConfig(CfgEnabled, boolStr(input.Enabled)); err != nil {
		return err
	}
	if err := store.SetAIConfig(CfgProvider, input.Provider); err != nil {
		return err
	}
	if err := store.SetAIConfig(CfgBaseURL, input.BaseURL); err != nil {
		return err
	}
	if err := store.SetAIConfig(CfgModel, input.Model); err != nil {
		return err
	}
	// API Key：空字符串表示不修改（前端传掩码时跳过）
	if input.APIKey != "" {
		if err := store.SetAIConfig(CfgAPIKey, input.APIKey); err != nil {
			return err
		}
	}
	return nil
}

// MaskedConfig 返回给前端的掩码配置（API Key 掩码化）
type MaskedConfig struct {
	Enabled    bool   `json:"enabled"`
	Provider   string `json:"provider"`
	BaseURL    string `json:"baseUrl"`
	APIKeyMask string `json:"apiKeyMask"`
	Model      string `json:"model"`
}

// GetMaskedConfig 从存储读取掩码配置（供前端展示）
func GetMaskedConfig(store ConfigStore) (*MaskedConfig, error) {
	masked, err := store.GetAIConfigMasked()
	if err != nil {
		return nil, err
	}
	return &MaskedConfig{
		Enabled:    masked[CfgEnabled] == "true",
		Provider:   masked[CfgProvider],
		BaseURL:    masked[CfgBaseURL],
		APIKeyMask: masked[CfgAPIKey],
		Model:      masked[CfgModel],
	}, nil
}
