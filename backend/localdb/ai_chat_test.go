package localdb

import (
	"path/filepath"
	"testing"
	"time"
)

func openTestChatRepo(t *testing.T) *AIChatRepository {
	t.Helper()
	pool, err := NewPool(filepath.Join(t.TempDir(), "chat.db"))
	if err != nil {
		t.Fatalf("open pool: %v", err)
	}
	t.Cleanup(func() { _ = pool.Close() })
	if err := RunMigrations(pool.DB()); err != nil {
		t.Fatalf("migrations: %v", err)
	}
	// 迁移是幂等的：已有库上再跑一遍不应报错
	if err := RunMigrations(pool.DB()); err != nil {
		t.Fatalf("re-run migrations: %v", err)
	}
	return NewAIChatRepository(pool.DB())
}

func messageIDs(messages []AIChatMessage) []string {
	ids := make([]string, len(messages))
	for i, m := range messages {
		ids[i] = m.ID
	}
	return ids
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestAIChatRepositorySessionLifecycle(t *testing.T) {
	r := openTestChatRepo(t)

	connID := "conn-1"
	s1, err := r.CreateSession("第一个对话", &connID, `{"databases":["a"]}`)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if s1.ID == "" || s1.Title != "第一个对话" || s1.ConnectionID == nil || *s1.ConnectionID != connID {
		t.Fatalf("unexpected session %+v", s1)
	}
	// 没有连接的会话：connection_id 为空
	s2, err := r.CreateSession("第二个", nil, "")
	if err != nil {
		t.Fatalf("create 2: %v", err)
	}

	list, err := r.ListSessions(0)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 2 || list[0].ID != s2.ID || list[1].ID != s1.ID {
		t.Fatalf("expected newest first [s2 s1], got %d sessions", len(list))
	}
	if list[1].ConnectionID == nil || *list[1].ConnectionID != connID || list[0].ConnectionID != nil {
		t.Fatalf("connection_id round-trip failed: %+v / %+v", list[1], list[0])
	}
	if list[1].ContextJSON != `{"databases":["a"]}` {
		t.Fatalf("context not round-tripped: %q", list[1].ContextJSON)
	}
	if time.Since(list[0].UpdatedAt) > time.Minute {
		t.Fatalf("updated_at not parsed as a recent time: %v", list[0].UpdatedAt)
	}

	// 改上下文：同时清掉连接。不动 updated_at，排序保持不变（只有消息才算对话活动）
	newCtx := `{"databases":["b"]}`
	if err := r.UpdateSessionContext(s1.ID, nil, newCtx); err != nil {
		t.Fatalf("update context: %v", err)
	}
	list, _ = r.ListSessions(0)
	if len(list) != 2 || list[0].ID != s2.ID {
		t.Fatalf("context update must not move the session to the front: %+v", list)
	}
	older := list[1]
	if older.ID != s1.ID || older.ConnectionID != nil || older.ContextJSON != newCtx {
		t.Fatalf("context update failed: %+v", older)
	}

	// 改名同样不动 updated_at
	before := older.UpdatedAt
	if err := r.RenameSession(s1.ID, "改名了"); err != nil {
		t.Fatalf("rename: %v", err)
	}
	list, _ = r.ListSessions(0)
	if len(list) != 2 || list[1].ID != s1.ID || list[1].Title != "改名了" || !list[1].UpdatedAt.Equal(before) {
		t.Fatalf("rename must keep the session in place: %+v", list)
	}

	if err := r.RenameSession("missing", "x"); err == nil {
		t.Fatal("renaming a missing session must fail")
	}
	if err := r.UpdateSessionContext("missing", nil, ""); err == nil {
		t.Fatal("updating a missing session must fail")
	}

	if err := r.DeleteSession(s1.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	list, _ = r.ListSessions(0)
	if len(list) != 1 || list[0].ID != s2.ID {
		t.Fatalf("delete did not remove the session: %d left", len(list))
	}
}

func TestAIChatRepositorySaveMessages(t *testing.T) {
	r := openTestChatRepo(t)
	s, err := r.CreateSession("t", nil, "")
	if err != nil {
		t.Fatal(err)
	}

	// 首轮：用户消息 + 流式占位
	if err := r.SaveMessages(s.ID, AIChatMessageBatch{Upserts: []AIChatMessage{
		{ID: "u1", Role: "user", Content: "你好", AttachedSQL: "select 1"},
		{ID: "a1", Role: "assistant", Content: "", Status: "streaming"},
	}}); err != nil {
		t.Fatalf("first save: %v", err)
	}
	got, err := r.GetMessages(s.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if !equalStrings(messageIDs(got), []string{"u1", "a1"}) {
		t.Fatalf("unexpected order %v", messageIDs(got))
	}
	if got[0].AttachedSQL != "select 1" || got[0].Status != "" || got[0].ElapsedMs != nil {
		t.Fatalf("user message round-trip failed: %+v", got[0])
	}
	if got[1].Status != "streaming" || got[1].Content != "" || got[1].AttachedSQL != "" {
		t.Fatalf("placeholder round-trip failed: %+v", got[1])
	}

	// 同一条回复落最终态：按 id 覆盖，不新增行
	if err := r.SaveMessages(s.ID, AIChatMessageBatch{Upserts: []AIChatMessage{
		{ID: "a1", Role: "assistant", Content: "你好！", Status: "done", ElapsedMs: int64Ptr(120)},
	}}); err != nil {
		t.Fatalf("final save: %v", err)
	}
	got, _ = r.GetMessages(s.ID)
	if len(got) != 2 || got[1].Content != "你好！" || got[1].Status != "done" || *got[1].ElapsedMs != 120 {
		t.Fatalf("upsert did not overwrite in place: %+v", got)
	}

	// 第二轮：失败回复带 error 文本
	if err := r.SaveMessages(s.ID, AIChatMessageBatch{Upserts: []AIChatMessage{
		{ID: "u2", Role: "user", Content: "再来"},
		{ID: "a2", Role: "assistant", Content: "", Status: "error", Error: "boom", ElapsedMs: int64Ptr(0)},
	}}); err != nil {
		t.Fatalf("second round: %v", err)
	}
	got, _ = r.GetMessages(s.ID)
	if !equalStrings(messageIDs(got), []string{"u1", "a1", "u2", "a2"}) {
		t.Fatalf("unexpected order %v", messageIDs(got))
	}
	if got[3].Error != "boom" || got[3].Status != "error" {
		t.Fatalf("error state not persisted: %+v", got[3])
	}
	if got[3].ElapsedMs == nil || *got[3].ElapsedMs != 0 {
		t.Fatalf("elapsed 0 must survive as a present value: %+v", got[3].ElapsedMs)
	}

	// 重新生成：删掉失败的回复，新回复接在末尾（同一批里先删后写）
	if err := r.SaveMessages(s.ID, AIChatMessageBatch{
		Deletes: []string{"a2"},
		Upserts: []AIChatMessage{{ID: "a3", Role: "assistant", Content: "好的", Status: "done"}},
	}); err != nil {
		t.Fatalf("regenerate batch: %v", err)
	}
	got, _ = r.GetMessages(s.ID)
	if !equalStrings(messageIDs(got), []string{"u1", "a1", "u2", "a3"}) || got[3].Content != "好的" {
		t.Fatalf("delete+insert batch failed: %v", messageIDs(got))
	}

	// 有新消息的会话排到最前
	other, _ := r.CreateSession("更新的会话", nil, "")
	if err := r.SaveMessages(s.ID, AIChatMessageBatch{Upserts: []AIChatMessage{
		{ID: "u3", Role: "user", Content: "又一条"},
	}}); err != nil {
		t.Fatal(err)
	}
	list, _ := r.ListSessions(0)
	if len(list) != 2 || list[0].ID != s.ID || list[1].ID != other.ID {
		t.Fatalf("saving messages should bump the session to the top: %+v", list)
	}

	// 用别的会话的 id 写入另一个会话：既不改原行，也不落新行
	if err := r.SaveMessages(other.ID, AIChatMessageBatch{Upserts: []AIChatMessage{
		{ID: "u1", Role: "user", Content: "hacked"},
	}}); err != nil {
		t.Fatalf("cross-session upsert: %v", err)
	}
	got, _ = r.GetMessages(s.ID)
	if got[0].Content != "你好" {
		t.Fatalf("cross-session upsert overwrote another session's message: %q", got[0].Content)
	}
	otherMsgs, _ := r.GetMessages(other.ID)
	if len(otherMsgs) != 0 {
		t.Fatalf("cross-session upsert must not insert: %+v", otherMsgs)
	}

	// 会话不存在时拒绝写入
	if err := r.SaveMessages("missing", AIChatMessageBatch{Upserts: []AIChatMessage{{ID: "x", Role: "user"}}}); err == nil {
		t.Fatal("saving into a missing session must fail")
	}
}

func TestAIChatRepositoryDeleteAllAndLimit(t *testing.T) {
	r := openTestChatRepo(t)
	ids := make([]string, 3)
	for i := range ids {
		s, err := r.CreateSession("s", nil, "")
		if err != nil {
			t.Fatal(err)
		}
		ids[i] = s.ID
		if err := r.SaveMessages(s.ID, AIChatMessageBatch{Upserts: []AIChatMessage{
			{ID: "m" + s.ID, Role: "user", Content: "x"},
		}}); err != nil {
			t.Fatal(err)
		}
	}

	list, err := r.ListSessions(2)
	if err != nil || len(list) != 2 || list[0].ID != ids[2] || list[1].ID != ids[1] {
		t.Fatalf("limit not honoured: %v %+v", err, list)
	}

	if err := r.DeleteAllSessions(); err != nil {
		t.Fatalf("delete all: %v", err)
	}
	list, _ = r.ListSessions(0)
	msgs, _ := r.GetMessages(ids[0])
	if len(list) != 0 || len(msgs) != 0 {
		t.Fatalf("delete all left data behind: %d sessions, %d messages", len(list), len(msgs))
	}
	if list == nil || msgs == nil {
		t.Fatal("empty results must be non-nil slices (they are JSON-encoded for the frontend)")
	}
}

func int64Ptr(v int64) *int64 { return &v }
