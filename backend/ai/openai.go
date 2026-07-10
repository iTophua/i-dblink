package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// OpenAIConfig OpenAI 兼容 Provider 配置
type OpenAIConfig struct {
	BaseURL     string  `json:"baseUrl"`     // 如 https://api.deepseek.com/v1
	APIKey      string  `json:"apiKey"`      // 明文（由调用方从加密存储解密后注入）
	Model       string  `json:"model"`       // 如 deepseek-chat
	MaxTokens   int     `json:"maxTokens"`   // 0 表示不限制
	Temperature float64 `json:"temperature"` // 0 表示不设置（使用 API 默认值）
}

// openaiRequest OpenAI Chat Completions API 请求体
type openaiRequest struct {
	Model       string          `json:"model"`
	Messages    []ChatMessage   `json:"messages"`
	MaxTokens   int             `json:"max_tokens,omitempty"`
	Temperature *float64        `json:"temperature,omitempty"`
	Stream      bool            `json:"stream"`
}

// openaiChoice OpenAI 响应中的 choice
type openaiChoice struct {
	Message      ChatMessage `json:"message"`
	Delta        ChatMessage `json:"delta"`
	FinishReason string      `json:"finish_reason"`
}

// openaiResponse OpenAI Chat Completions API 同步响应体
type openaiResponse struct {
	Choices []openaiChoice `json:"choices"`
	Usage   struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
	Error *openaiError `json:"error,omitempty"`
}

// openaiError OpenAI API 错误
type openaiError struct {
	Message string `json:"message"`
	Type    string `json:"type"`
	Code    string `json:"code"`
}

// OpenAIProvider OpenAI 兼容 API Provider
type OpenAIProvider struct {
	config OpenAIConfig
	client *http.Client
}

// NewOpenAIProvider 创建 OpenAI 兼容 Provider
func NewOpenAIProvider(config OpenAIConfig) *OpenAIProvider {
	return &OpenAIProvider{
		config: config,
		client: &http.Client{Timeout: 120 * time.Second},
	}
}

func (p *OpenAIProvider) Name() string     { return string(p.config.Model) }
func (p *OpenAIProvider) Type() ProviderType { return ProviderOpenAI }

func (p *OpenAIProvider) IsReady() bool {
	return p.config.BaseURL != "" && p.config.APIKey != "" && p.config.Model != ""
}

func (p *OpenAIProvider) Close() error { return nil }

// completionsURL 拼接 chat completions 端点（兼容用户填带/不带尾斜杠的 BaseURL）
func (p *OpenAIProvider) completionsURL() string {
	base := strings.TrimRight(p.config.BaseURL, "/")
	return base + "/chat/completions"
}

// buildRequest 构建 HTTP 请求
func (p *OpenAIProvider) buildRequest(ctx context.Context, req *ChatRequest, stream bool) (*http.Request, error) {
	body := openaiRequest{
		Model:    p.config.Model,
		Messages: req.Messages,
		Stream:   stream,
	}
	if req.MaxTokens > 0 {
		body.MaxTokens = req.MaxTokens
	} else if p.config.MaxTokens > 0 {
		body.MaxTokens = p.config.MaxTokens
	}
	temp := req.Temperature
	if temp == 0 {
		temp = p.config.Temperature
	}
	if temp > 0 {
		body.Temperature = &temp
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", p.completionsURL(), bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.config.APIKey)
	return httpReq, nil
}

// Chat 同步对话
func (p *OpenAIProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	if !p.IsReady() {
		return nil, fmt.Errorf("provider not ready: baseUrl/apiKey/model not configured")
	}

	httpReq, err := p.buildRequest(ctx, req, false)
	if err != nil {
		return nil, err
	}

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, parseAPIError(respBody, resp.StatusCode)
	}

	var result openaiResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if len(result.Choices) == 0 {
		return nil, fmt.Errorf("no choices in response")
	}

	return &ChatResponse{
		Content:          result.Choices[0].Message.Content,
		PromptTokens:     result.Usage.PromptTokens,
		CompletionTokens: result.Usage.CompletionTokens,
	}, nil
}

// ChatStream 流式对话——逐 token 推入 channel
func (p *OpenAIProvider) ChatStream(ctx context.Context, req *ChatRequest) (<-chan ChatChunk, error) {
	if !p.IsReady() {
		return nil, fmt.Errorf("provider not ready: baseUrl/apiKey/model not configured")
	}

	httpReq, err := p.buildRequest(ctx, req, true)
	if err != nil {
		return nil, err
	}

	// 流式请求不能用全局 Timeout（会中断长响应），用独立 client
	streamClient := &http.Client{}
	resp, err := streamClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("stream request failed: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, parseAPIError(respBody, resp.StatusCode)
	}

	ch := make(chan ChatChunk, 64)

	go func() {
		defer resp.Body.Close()
		defer close(ch)
		// recover 防止 panic 导致 resp.Body 泄漏 + channel 不关闭
		defer func() {
			if r := recover(); r != nil {
				// channel 已由 close(ch) 关闭，无需额外处理
				_ = r
			}
		}()

		scanner := bufio.NewScanner(resp.Body)
		// 允许较长的行（默认 64KB 可能不够）
		scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024)

		for scanner.Scan() {
			line := scanner.Text()

			// ctx 取消时立即停止
			select {
			case <-ctx.Done():
				return
			default:
			}

			line = strings.TrimSpace(line)
			if line == "" || !strings.HasPrefix(line, "data:") {
				continue
			}

			data := strings.TrimPrefix(line, "data:")
			data = strings.TrimSpace(data)

			// [DONE] 标记流结束
			if data == "[DONE]" {
				ch <- ChatChunk{Done: true}
				return
			}

			var chunk openaiResponse
			if err := json.Unmarshal([]byte(data), &chunk); err != nil {
				continue // 跳过无法解析的行
			}
			if len(chunk.Choices) > 0 {
				delta := chunk.Choices[0].Delta.Content
				if delta != "" {
					select {
					case ch <- ChatChunk{Content: delta}:
					case <-ctx.Done():
						return
					}
				}
			}
		}

		if err := scanner.Err(); err != nil {
			ch <- ChatChunk{Done: true}
			return
		}

		// 流自然结束（未收到 [DONE]）
		ch <- ChatChunk{Done: true}
	}()

	return ch, nil
}

// parseAPIError 从非 200 响应体中解析错误信息
func parseAPIError(body []byte, statusCode int) error {
	var resp openaiResponse
	if err := json.Unmarshal(body, &resp); err == nil && resp.Error != nil && resp.Error.Message != "" {
		return fmt.Errorf("API error (HTTP %d): %s", statusCode, resp.Error.Message)
	}
	// 非 JSON 错误体
	bodyStr := string(body)
	if len(bodyStr) > 300 {
		bodyStr = bodyStr[:300] + "..."
	}
	return fmt.Errorf("API error (HTTP %d): %s", statusCode, bodyStr)
}
