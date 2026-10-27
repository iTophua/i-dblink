package ai

import (
	"context"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// StreamToEventWithError 将 Provider 的 channel 流式输出转为 Wails 事件推送。
// 前端通过 Events.On("ai-stream-<requestID>", ...) 接收 token。
// requestID 由调用方生成（uuid），用于区分并发请求，避免事件串流。
// 流结束后（正常完成、错误、或 channel 关闭）调用 cancel 释放请求 ctx 资源。
func StreamToEventWithError(
	requestID string,
	stream <-chan ChatChunk,
	streamErr error,
	cancel context.CancelFunc,
) {
	emit := func(data map[string]any) {
		if app := application.Get(); app != nil {
			app.Event.Emit("ai-stream-"+requestID, data)
		}
	}
	go func() {
		defer cancel() // 流结束后释放请求 ctx（取消 Provider 的 HTTP 请求等）
		if streamErr != nil {
			emit(map[string]any{
				"done":  true,
				"error": streamErr.Error(),
			})
			return
		}
		for chunk := range stream {
			if chunk.Done {
				emit(map[string]any{
					"done": true,
				})
				return
			}
			emit(map[string]any{
				"content": chunk.Content,
				"done":    false,
			})
		}
		emit(map[string]any{
			"done": true,
		})
	}()
}
