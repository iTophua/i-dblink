package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ModelInfo OpenAI 兼容 /v1/models 返回的单个模型条目
type ModelInfo struct {
	ID      string `json:"id"`
	OwnedBy string `json:"owned_by,omitempty"`
}

// modelsResponse OpenAI 兼容 /v1/models 响应体
type modelsResponse struct {
	Data []ModelInfo `json:"data"`
}

// ListModels 调用 OpenAI 兼容 /v1/models 端点拉取可用模型列表。
// 大多数 OpenAI 兼容服务商（DeepSeek、通义千问、智谱、Kimi、OpenAI）都支持此端点。
func ListModels(ctx context.Context, baseURL, apiKey string) ([]ModelInfo, error) {
	if baseURL == "" || apiKey == "" {
		return nil, fmt.Errorf("baseURL 和 apiKey 不能为空")
	}

	endpoint := strings.TrimRight(baseURL, "/") + "/models"

	httpReq, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	httpReq.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("API error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 限制 1MB
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var result modelsResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if len(result.Data) == 0 {
		return nil, fmt.Errorf("未返回任何模型，请检查 API 地址")
	}

	return result.Data, nil
}
