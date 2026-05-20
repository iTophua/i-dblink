package api

import "idblink/backend/db"

// NewHandler 创建新的 HTTP Handler（供 Wails 绑定使用）
func NewHandler(mgr *db.Manager, tunnel *TunnelManager) *Handler {
	return &Handler{
		mgr:    mgr,
		tunnel: tunnel,
	}
}
