package backend

import (
	"fmt"

	"idblink/backend/localdb"
)

// ==================== AI 对话历史（本地持久化） ====================
//
// 面板里的每次对话落成一个会话：首条用户消息发出时创建，消息内容随后台批量写入。
// 存在与连接配置同一个 SQLite 文件里，仅本机可读。

const (
	// aiChatSessionListLimit 历史列表最多返回的会话数
	aiChatSessionListLimit = 200
	// aiChatTitleMaxRunes 标题长度上限（前端已截过一次，这里是兜底）
	aiChatTitleMaxRunes = 200
	// aiChatContextMaxBytes 上下文是「库 → 表名列表」，正常远小于这个数；超了多半是误用，存进去只会把本地库撑大
	aiChatContextMaxBytes = 1 << 20
)

// AIChatListSessions 获取最近的对话会话（按最近更新排序）
func (a *App) AIChatListSessions() ([]localdb.AIChatSession, error) {
	sessions, err := a.storage.ListAIChatSessions(aiChatSessionListLimit)
	if err != nil {
		return nil, err
	}
	result := make([]localdb.AIChatSession, len(sessions))
	for i, s := range sessions {
		result[i] = *s
	}
	return result, nil
}

// AIChatCreateSession 新建对话会话（title 取首条用户消息，context 为发问时的表结构上下文 JSON）
func (a *App) AIChatCreateSession(title string, connectionID *string, contextJSON string) (*localdb.AIChatSession, error) {
	if err := aiChatContextAllowed(contextJSON); err != nil {
		return nil, err
	}
	return a.storage.CreateAIChatSession(truncateRunes(title, aiChatTitleMaxRunes), connectionID, contextJSON)
}

func aiChatContextAllowed(contextJSON string) error {
	if len(contextJSON) > aiChatContextMaxBytes {
		return fmt.Errorf("chat context too large: %d bytes (max %d)", len(contextJSON), aiChatContextMaxBytes)
	}
	return nil
}

// AIChatRenameSession 重命名会话（不改变「最近更新」排序）
func (a *App) AIChatRenameSession(id string, title string) error {
	return a.storage.RenameAIChatSession(id, title)
}

// AIChatUpdateSessionContext 更新会话的表结构上下文（恢复会话时带回）
func (a *App) AIChatUpdateSessionContext(id string, connectionID *string, contextJSON string) error {
	if err := aiChatContextAllowed(contextJSON); err != nil {
		return err
	}
	return a.storage.UpdateAIChatSessionContext(id, connectionID, contextJSON)
}

// AIChatDeleteSession 删除会话及其消息
func (a *App) AIChatDeleteSession(id string) error {
	return a.storage.DeleteAIChatSession(id)
}

// AIChatDeleteAllSessions 清空全部对话历史
func (a *App) AIChatDeleteAllSessions() error {
	return a.storage.DeleteAllAIChatSessions()
}

// AIChatGetMessages 获取会话消息（按发送顺序）
func (a *App) AIChatGetMessages(sessionID string) ([]localdb.AIChatMessage, error) {
	return a.storage.GetAIChatMessages(sessionID)
}

// AIChatSaveMessages 批量写入会话消息（插入或覆盖 + 删除，单事务）
func (a *App) AIChatSaveMessages(sessionID string, batch localdb.AIChatMessageBatch) error {
	return a.storage.SaveAIChatMessages(sessionID, batch)
}
