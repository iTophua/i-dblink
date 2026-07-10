// Package ai 提供 AI 子系统的核心抽象——Provider 接口、任务定义、配置管理和流式适配。
// 当前实现远程 Provider（OpenAI 兼容接口），本地推理（yzma/llama.cpp）预留扩展点。
package ai

import "context"

// ProviderType AI 提供者类型
type ProviderType string

const (
	ProviderOpenAI ProviderType = "openai" // OpenAI 兼容 API（DeepSeek/通义千问/智谱/OpenAI 等）
	// ProviderLocal 预留：yzma 本地推理（llama.cpp），Phase 0 验证后实现
)

// ChatMessage 对话消息
type ChatMessage struct {
	Role    string `json:"role"`    // "system" | "user" | "assistant"
	Content string `json:"content"`
}

// ChatRequest 对话请求
type ChatRequest struct {
	Messages    []ChatMessage `json:"messages"`
	MaxTokens   int           `json:"maxTokens,omitempty"`
	Temperature float64       `json:"temperature,omitempty"`
	Stream      bool          `json:"stream,omitempty"`
}

// ChatChunk 流式响应块
type ChatChunk struct {
	Content string `json:"content"`
	Done    bool   `json:"done"`
}

// ChatResponse 对话响应
type ChatResponse struct {
	Content          string `json:"content"`
	PromptTokens     int    `json:"promptTokens"`
	CompletionTokens int    `json:"completionTokens"`
}

// Provider 统一接口——所有 AI 提供者必须实现。
// Wails 绑定层不能直接序列化 Go channel 给前端，
// ChatStream 的结果需经 stream.go 的适配层转为 EventsEmit 事件推送。
type Provider interface {
	// Name 提供者名称（如 "deepseek"、"openai"）
	Name() string

	// Type 提供者类型
	Type() ProviderType

	// IsReady 是否就绪（远程 Provider：API Key 已配置 + BaseURL 非空）
	IsReady() bool

	// Chat 同步对话
	Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error)

	// ChatStream 流式对话——返回 token channel
	ChatStream(ctx context.Context, req *ChatRequest) (<-chan ChatChunk, error)

	// Close 释放资源
	Close() error
}
