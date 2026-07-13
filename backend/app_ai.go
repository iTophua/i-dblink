package backend

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"idblink/backend/ai"
)

// ==================== AI DTO 类型 ====================

// AICloudConfigInput 前端传入的云端 AI 配置
type AICloudConfigInput struct {
	Enabled  bool   `json:"enabled"`
	Provider string `json:"provider"`
	BaseURL  string `json:"baseUrl"`
	APIKey   string `json:"apiKey"` // 明文（空字符串表示不修改已有 key）
	Model    string `json:"model"`
}

// AICloudConfigResponse 返回给前端的云端 AI 配置（API Key 掩码）
type AICloudConfigResponse struct {
	Enabled    bool   `json:"enabled"`
	Provider   string `json:"provider"`
	BaseURL    string `json:"baseUrl"`
	APIKeyMask string `json:"apiKeyMask"`
	Model      string `json:"model"`
}

// AIConnTestResponse 连接测试结果
type AIConnTestResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// AITaskRequest 前端传入的 AI 任务请求
type AITaskRequest struct {
	TaskID        string            `json:"taskId"`
	RequestID     string            `json:"requestId,omitempty"`
	SourceDialect string            `json:"sourceDialect,omitempty"`
	TargetDialect string            `json:"targetDialect,omitempty"`
	SQL           string            `json:"sql,omitempty"`
	NaturalInput  string            `json:"naturalInput,omitempty"`
	DatabaseType  string            `json:"databaseType,omitempty"`
	TableInfo     string            `json:"tableInfo,omitempty"`
	Context       map[string]string `json:"context,omitempty"`
}

// AITaskResponse AI 任务响应
type AITaskResponse struct {
	TaskID   string `json:"taskId"`
	Result   string `json:"result"`
	Provider string `json:"provider"`
}

// AIStatusResponse AI 子系统状态
type AIStatusResponse struct {
	Enabled bool `json:"enabled"`
	Ready   bool `json:"ready"`
}

// AIPresetProvidersResponse 预置服务商列表
type AIPresetProvidersResponse struct {
	Providers []ai.PresetProvider `json:"providers"`
}

// ==================== Wails 绑定方法 ====================

// GetAIPresetProviders 获取预置服务商列表
func (a *App) GetAIPresetProviders() (AIPresetProvidersResponse, error) {
	return AIPresetProvidersResponse{Providers: ai.PresetProviders}, nil
}

// AIModelsRequest 拉取模型列表的请求参数。
// baseUrl/apiKey 为空时后端回退到已保存的配置——用于设置页
// "先填地址+Key 再拉模型"的临时验证场景。
type AIModelsRequest struct {
	BaseURL string `json:"baseUrl,omitempty"`
	APIKey  string `json:"apiKey,omitempty"` // 明文，空表示用已存的 key
}

// AIModelsResponse 可用模型列表响应
type AIModelsResponse struct {
	Models []ai.ModelInfo `json:"models"`
}

// GetAIModels 拉取可用模型列表（通过前端临时传入的配置，或已保存的配置）。
// 用于设置页模型字段的动态下拉选择。
func (a *App) GetAIModels(req AIModelsRequest) (AIModelsResponse, error) {
	baseURL := req.BaseURL
	apiKey := req.APIKey

	// 前端未传时回退到已保存配置
	if baseURL == "" {
		cfg, err := ai.LoadCloudConfig(a.storage)
		if err != nil {
			return AIModelsResponse{}, fmt.Errorf("failed to load config: %w", err)
		}
		baseURL = cfg.BaseURL
	}
	if apiKey == "" {
		stored, err := a.storage.GetAIConfig(ai.CfgAPIKey)
		if err != nil {
			return AIModelsResponse{}, fmt.Errorf("failed to read stored API key: %w", err)
		}
		apiKey = stored
	}

	if baseURL == "" || apiKey == "" {
		return AIModelsResponse{}, fmt.Errorf("请先配置 API 地址和 API Key")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	models, err := ai.ListModels(ctx, baseURL, apiKey)
	if err != nil {
		return AIModelsResponse{}, err
	}

	return AIModelsResponse{Models: models}, nil
}

// GetAICloudConfig 获取云端 AI 配置（API Key 以掩码返回）
func (a *App) GetAICloudConfig() (AICloudConfigResponse, error) {
	masked, err := ai.GetMaskedConfig(a.storage)
	if err != nil {
		return AICloudConfigResponse{}, fmt.Errorf("failed to get AI config: %w", err)
	}
	return AICloudConfigResponse{
		Enabled:    masked.Enabled,
		Provider:   masked.Provider,
		BaseURL:    masked.BaseURL,
		APIKeyMask: masked.APIKeyMask,
		Model:      masked.Model,
	}, nil
}

// SaveAICloudConfig 保存云端 AI 配置（API Key 加密存储）
func (a *App) SaveAICloudConfig(config AICloudConfigInput) error {
	input := &ai.SaveCloudConfigInput{
		Enabled:  config.Enabled,
		Provider: config.Provider,
		BaseURL:  config.BaseURL,
		APIKey:   config.APIKey,
		Model:    config.Model,
	}

	if err := ai.SaveCloudConfig(a.storage, input); err != nil {
		return fmt.Errorf("failed to save AI config: %w", err)
	}

	// 配置变更后重建 Provider
	if err := a.aiManager.ReloadFromConfig(a.storage); err != nil {
		return fmt.Errorf("failed to reload AI provider: %w", err)
	}

	return nil
}

// TestAIConnection 测试云端 Provider 连接（用传入的配置，不依赖已保存的配置）
func (a *App) TestAIConnection(config AICloudConfigInput) (AIConnTestResponse, error) {
	// 如果前端没传 API Key（掩码场景），从存储读取已存的明文
	apiKey := config.APIKey
	if apiKey == "" {
		stored, err := a.storage.GetAIConfig(ai.CfgAPIKey)
		if err != nil {
			return AIConnTestResponse{}, fmt.Errorf("failed to read stored API key: %w", err)
		}
		apiKey = stored
	}

	if apiKey == "" {
		return AIConnTestResponse{Success: false, Message: "API Key 未配置"}, nil
	}
	if config.BaseURL == "" {
		return AIConnTestResponse{Success: false, Message: "BaseURL 未配置"}, nil
	}
	if config.Model == "" {
		return AIConnTestResponse{Success: false, Message: "模型未配置"}, nil
	}

	// 用临时 Provider 发一条简短消息测试
	provider := ai.NewOpenAIProvider(ai.OpenAIConfig{
		BaseURL: config.BaseURL,
		APIKey:  apiKey,
		Model:   config.Model,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := provider.Chat(ctx, &ai.ChatRequest{
		Messages: []ai.ChatMessage{
			{Role: "user", Content: "Hi"},
		},
		MaxTokens: 5,
	})
	if err != nil {
		return AIConnTestResponse{Success: false, Message: err.Error()}, nil
	}

	return AIConnTestResponse{
		Success: true,
		Message: fmt.Sprintf("连接成功，模型: %s, 响应: %s", config.Model, truncate(resp.Content, 50)),
	}, nil
}

// ExecuteAITask 执行 AI 任务（同步）
func (a *App) ExecuteAITask(req AITaskRequest) (AITaskResponse, error) {
	provider, err := a.aiManager.GetActive()
	if err != nil {
		return AITaskResponse{}, err
	}

	task, err := ai.GetTask(ai.TaskID(req.TaskID))
	if err != nil {
		return AITaskResponse{}, err
	}

	messages := task.BuildPrompt(&ai.TaskRequest{
		TaskID:        ai.TaskID(req.TaskID),
		SourceDialect: req.SourceDialect,
		TargetDialect: req.TargetDialect,
		SQL:           req.SQL,
		NaturalInput:  req.NaturalInput,
		DatabaseType:  req.DatabaseType,
		TableInfo:     req.TableInfo,
		Context:       req.Context,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	resp, err := provider.Chat(ctx, &ai.ChatRequest{Messages: messages})
	if err != nil {
		return AITaskResponse{}, err
	}

	return AITaskResponse{
		TaskID:   req.TaskID,
		Result:   resp.Content,
		Provider: provider.Name(),
	}, nil
}

// ExecuteAITaskStream 执行 AI 任务（流式）。
// 在后端起 goroutine 调 Provider.ChatStream + StreamToEvent，立即返回 nil。
// 前端通过 EventsOn("ai-stream-<requestID>") 消费 token。
func (a *App) ExecuteAITaskStream(req AITaskRequest) error {
	provider, err := a.aiManager.GetActive()
	if err != nil {
		return err
	}

	task, err := ai.GetTask(ai.TaskID(req.TaskID))
	if err != nil {
		return err
	}

	// 确保有 requestID（前端生成或后端补一个）
	requestID := req.RequestID
	if requestID == "" {
		requestID = uuid.New().String()
		req.RequestID = requestID
	}

	messages := task.BuildPrompt(&ai.TaskRequest{
		TaskID:        ai.TaskID(req.TaskID),
		SourceDialect: req.SourceDialect,
		TargetDialect: req.TargetDialect,
		SQL:           req.SQL,
		NaturalInput:  req.NaturalInput,
		DatabaseType:  req.DatabaseType,
		TableInfo:     req.TableInfo,
		Context:       req.Context,
	})

	// 流式 context：超时 5 分钟（LLM 长响应）。
	// 注意：不能用 defer cancel()——本方法立即返回（Wails 绑定是同步 RPC），
	// defer 会在返回时取消 ctx，导致 Provider 的流式 goroutine 被终止。
	// cancel 交给 StreamToEventWithError 的 goroutine 在流结束后通过 channel close 间接释放。
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)

	stream, err := provider.ChatStream(ctx, &ai.ChatRequest{Messages: messages})
	if err != nil {
		cancel()
		return err
	}

	// 用 app ctx 推事件（Wails EventsEmit 需要 Wails ctx）
	// goroutine 消费完 stream 后调用 cancel 释放 ctx 资源
	ai.StreamToEventWithError(a.ctx, requestID, stream, nil, cancel)

	return nil
}

// GetAIStatus 获取 AI 子系统状态
func (a *App) GetAIStatus() (AIStatusResponse, error) {
	return AIStatusResponse{
		Enabled: a.aiManager.IsEnabled(),
		Ready:   a.aiManager.IsReady(),
	}, nil
}

// ==================== 辅助函数 ====================

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
