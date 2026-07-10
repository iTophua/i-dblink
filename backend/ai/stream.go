package ai

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// StreamToEventWithError 将 Provider 的 channel 流式输出转为 Wails 事件推送。
// 前端通过 EventsOn("ai-stream-<requestID>", ...) 接收 token。
// requestID 由调用方生成（uuid），用于区分并发请求，避免事件串流。
// 流结束后（正常完成、错误、或 channel 关闭）调用 cancel 释放请求 ctx 资源。
// 流结束后（正常完成、错误、或 channel 关闭）调用 cancel 释放请求 ctx 资源。
func StreamToEventWithError(
	ctx context.Context,
	requestID string,
	stream <-chan ChatChunk,
	streamErr error,
	cancel context.CancelFunc,
) {
	go func() {
		defer cancel() // 流结束后释放请求 ctx（取消 Provider 的 HTTP 请求等）
		if streamErr != nil {
			runtime.EventsEmit(ctx, "ai-stream-"+requestID, map[string]any{
				"done":  true,
				"error": streamErr.Error(),
			})
			return
		}
		for chunk := range stream {
			if chunk.Done {
				runtime.EventsEmit(ctx, "ai-stream-"+requestID, map[string]any{
					"done": true,
				})
				return
			}
			runtime.EventsEmit(ctx, "ai-stream-"+requestID, map[string]any{
				"content": chunk.Content,
				"done":    false,
			})
		}
		runtime.EventsEmit(ctx, "ai-stream-"+requestID, map[string]any{
			"done": true,
		})
	}()
}
