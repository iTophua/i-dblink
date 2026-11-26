package localdb

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// AIChatSession AI 对话会话（面板里的一次对话）。首条用户消息发出时创建，
// 消息内容存在 ai_chat_messages；这里只放标题、发问时的上下文与时间。
type AIChatSession struct {
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	ConnectionID *string `json:"connection_id,omitempty"`
	// 发问时的表结构上下文（JSON：connection_id / databases / tables），恢复会话时原样带回
	ContextJSON string    `json:"context_json"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// AIChatMessage 持久化的对话消息（字段与前端 ChatMessage 一一对应）
type AIChatMessage struct {
	ID          string `json:"id"`
	Role        string `json:"role"`
	Content     string `json:"content"`
	Status      string `json:"status,omitempty"`
	Error       string `json:"error,omitempty"`
	ElapsedMs   *int64 `json:"elapsed_ms,omitempty"`
	AttachedSQL string `json:"attached_sql,omitempty"`
}

// AIChatMessageBatch 一次批量写入：Upserts 按 id 插入或覆盖，Deletes 按 id 删除
type AIChatMessageBatch struct {
	Upserts []AIChatMessage `json:"upserts"`
	Deletes []string        `json:"deletes"`
}

// chatTimeLayout 定宽时间串（纳秒）：字典序即时间序，ORDER BY updated_at 才可靠。
// RFC3339Nano 会裁掉小数尾零，同秒内的先后在字符串比较下可能颠倒。
const chatTimeLayout = "2006-01-02T15:04:05.000000000Z07:00"

func formatChatTime(t time.Time) string { return t.UTC().Format(chatTimeLayout) }

func parseChatTime(value string) (time.Time, error) {
	return time.Parse(time.RFC3339Nano, value) // 解析时小数位可省略，兼容手写数据
}

// AIChatRepository AI 对话历史的本地存储
type AIChatRepository struct {
	db *sql.DB
}

func NewAIChatRepository(db *sql.DB) *AIChatRepository {
	return &AIChatRepository{db: db}
}

// ListSessions 按最近更新排序返回会话
func (r *AIChatRepository) ListSessions(limit int) ([]*AIChatSession, error) {
	if limit <= 0 {
		limit = 200
	}
	rows, err := r.db.Query(`
		SELECT id, title, COALESCE(connection_id, ''), context_json, created_at, updated_at
		FROM ai_chat_sessions
		ORDER BY updated_at DESC, rowid DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query ai chat sessions: %w", err)
	}
	defer rows.Close()

	sessions := make([]*AIChatSession, 0, 16)
	for rows.Next() {
		var s AIChatSession
		var connID, createdAt, updatedAt string
		if err := rows.Scan(&s.ID, &s.Title, &connID, &s.ContextJSON, &createdAt, &updatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan ai chat session: %w", err)
		}
		if connID != "" {
			id := connID
			s.ConnectionID = &id
		}
		if s.CreatedAt, err = parseChatTime(createdAt); err != nil {
			return nil, fmt.Errorf("failed to parse session created_at: %w", err)
		}
		if s.UpdatedAt, err = parseChatTime(updatedAt); err != nil {
			return nil, fmt.Errorf("failed to parse session updated_at: %w", err)
		}
		sessions = append(sessions, &s)
	}
	return sessions, rows.Err()
}

// CreateSession 新建会话，返回带 id 与时间戳的完整记录
func (r *AIChatRepository) CreateSession(title string, connectionID *string, contextJSON string) (*AIChatSession, error) {
	now := time.Now().UTC()
	s := &AIChatSession{
		ID:           uuid.New().String(),
		Title:        title,
		ConnectionID: connectionID,
		ContextJSON:  contextJSON,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	_, err := r.db.Exec(`
		INSERT INTO ai_chat_sessions (id, title, connection_id, context_json, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, s.ID, s.Title, s.ConnectionID, s.ContextJSON, formatChatTime(now), formatChatTime(now))
	if err != nil {
		return nil, fmt.Errorf("failed to insert ai chat session: %w", err)
	}
	return s, nil
}

// RenameSession 只改标题，不动 updated_at（改名不该把对话顶到「最近」）
func (r *AIChatRepository) RenameSession(id string, title string) error {
	res, err := r.db.Exec(`UPDATE ai_chat_sessions SET title = ? WHERE id = ?`, title, id)
	if err != nil {
		return fmt.Errorf("failed to rename ai chat session: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("ai chat session not found: %s", id)
	}
	return nil
}

// UpdateSessionContext 更新会话的表结构上下文（恢复会话时带回）。不动 updated_at：
// 只有消息才算对话活动，否则恢复一个旧会话后只是换一下选中的连接就会把它顶到「最近」
func (r *AIChatRepository) UpdateSessionContext(id string, connectionID *string, contextJSON string) error {
	res, err := r.db.Exec(`
		UPDATE ai_chat_sessions SET connection_id = ?, context_json = ? WHERE id = ?
	`, connectionID, contextJSON, id)
	if err != nil {
		return fmt.Errorf("failed to update ai chat session context: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("ai chat session not found: %s", id)
	}
	return nil
}

// DeleteSession 删除会话及其全部消息
func (r *AIChatRepository) DeleteSession(id string) error {
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin delete session: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM ai_chat_messages WHERE session_id = ?`, id); err != nil {
		return fmt.Errorf("failed to delete ai chat messages: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM ai_chat_sessions WHERE id = ?`, id); err != nil {
		return fmt.Errorf("failed to delete ai chat session: %w", err)
	}
	return tx.Commit()
}

// DeleteAllSessions 清空全部对话历史
func (r *AIChatRepository) DeleteAllSessions() error {
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin delete all sessions: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM ai_chat_messages`); err != nil {
		return fmt.Errorf("failed to delete ai chat messages: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM ai_chat_sessions`); err != nil {
		return fmt.Errorf("failed to delete ai chat sessions: %w", err)
	}
	return tx.Commit()
}

// GetMessages 按发送顺序返回会话消息
func (r *AIChatRepository) GetMessages(sessionID string) ([]AIChatMessage, error) {
	rows, err := r.db.Query(`
		SELECT id, role, content, COALESCE(status, ''), COALESCE(error, ''), elapsed_ms, COALESCE(attached_sql, '')
		FROM ai_chat_messages
		WHERE session_id = ?
		ORDER BY seq
	`, sessionID)
	if err != nil {
		return nil, fmt.Errorf("failed to query ai chat messages: %w", err)
	}
	defer rows.Close()

	messages := make([]AIChatMessage, 0, 8)
	for rows.Next() {
		var m AIChatMessage
		var elapsed sql.NullInt64
		if err := rows.Scan(&m.ID, &m.Role, &m.Content, &m.Status, &m.Error, &elapsed, &m.AttachedSQL); err != nil {
			return nil, fmt.Errorf("failed to scan ai chat message: %w", err)
		}
		if elapsed.Valid {
			v := elapsed.Int64
			m.ElapsedMs = &v
		}
		messages = append(messages, m)
	}
	return messages, rows.Err()
}

// SaveMessages 原子地应用一批消息变更。新消息的 seq 取会话内当前最大值 + 1，
// 已存在的按 id 覆盖内容与状态（流式回复的周期存档 / 最终落盘都走这里）。
// 有写入时顺带把会话 updated_at 刷到最新。
func (r *AIChatRepository) SaveMessages(sessionID string, batch AIChatMessageBatch) error {
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin save ai chat messages: %w", err)
	}
	defer tx.Rollback()

	var exists int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM ai_chat_sessions WHERE id = ?`, sessionID).Scan(&exists); err != nil {
		return fmt.Errorf("failed to check ai chat session: %w", err)
	}
	if exists == 0 {
		return fmt.Errorf("ai chat session not found: %s", sessionID)
	}

	for _, id := range batch.Deletes {
		if _, err := tx.Exec(`DELETE FROM ai_chat_messages WHERE session_id = ? AND id = ?`, sessionID, id); err != nil {
			return fmt.Errorf("failed to delete ai chat message %s: %w", id, err)
		}
	}

	now := formatChatTime(time.Now())
	for _, m := range batch.Upserts {
		var elapsed any
		if m.ElapsedMs != nil {
			elapsed = *m.ElapsedMs
		}
		var attached any
		if m.AttachedSQL != "" {
			attached = m.AttachedSQL
		}
		var status, errMsg any
		if m.Status != "" {
			status = m.Status
		}
		if m.Error != "" {
			errMsg = m.Error
		}
		if _, err := tx.Exec(`
			INSERT INTO ai_chat_messages (id, session_id, seq, role, content, status, error, elapsed_ms, attached_sql, created_at)
			VALUES (?, ?,
				(SELECT COALESCE(MAX(seq), 0) + 1 FROM ai_chat_messages WHERE session_id = ?),
				?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				content = excluded.content,
				status = excluded.status,
				error = excluded.error,
				elapsed_ms = excluded.elapsed_ms,
				attached_sql = excluded.attached_sql
			WHERE ai_chat_messages.session_id = excluded.session_id
		`, m.ID, sessionID, sessionID, m.Role, m.Content, status, errMsg, elapsed, attached, now); err != nil {
			return fmt.Errorf("failed to upsert ai chat message %s: %w", m.ID, err)
		}
	}

	if len(batch.Upserts) > 0 {
		if _, err := tx.Exec(`UPDATE ai_chat_sessions SET updated_at = ? WHERE id = ?`, now, sessionID); err != nil {
			return fmt.Errorf("failed to touch ai chat session: %w", err)
		}
	}
	return tx.Commit()
}
