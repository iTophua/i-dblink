package localdb

import (
	"path/filepath"
	"testing"
)

func openTestConnectionDB(t *testing.T) (*ConnectionRepository, *GroupRepository) {
	t.Helper()
	pool, err := NewPool(filepath.Join(t.TempDir(), "connections.db"))
	if err != nil {
		t.Fatalf("open pool: %v", err)
	}
	t.Cleanup(func() { _ = pool.Close() })
	if err := RunMigrations(pool.DB()); err != nil {
		t.Fatalf("migrations: %v", err)
	}
	return NewConnectionRepository(pool.DB()), NewGroupRepository(pool.DB())
}

func strPtr(s string) *string { return &s }

func newTestConnection(id, name string, groupID *string) *DbConnection {
	return &DbConnection{
		ID:       id,
		Name:     name,
		DbType:   "mysql",
		Host:     "127.0.0.1",
		Port:     3306,
		Username: "root",
		GroupID:  groupID,
	}
}

func newTestGroup(id, name string) *ConnectionGroup {
	return &ConnectionGroup{ID: id, Name: name, Icon: "📁", Color: "#6d6d6d"}
}

// 删除分组后，组内连接要变成未分组（NULL）——连接树只认 NULL / 空值为「不分组」
func TestGroupDeleteMovesConnectionsToUngrouped(t *testing.T) {
	conns, groups := openTestConnectionDB(t)

	if err := groups.Save(newTestGroup("prod", "生产环境")); err != nil {
		t.Fatalf("save group: %v", err)
	}
	if err := conns.Save(newTestConnection("c1", "订单库", strPtr("prod"))); err != nil {
		t.Fatalf("save connection: %v", err)
	}

	if err := groups.Delete("prod"); err != nil {
		t.Fatalf("delete group: %v", err)
	}

	got, err := conns.GetByID("c1")
	if err != nil {
		t.Fatalf("get connection: %v", err)
	}
	if got == nil || got.GroupID != nil {
		t.Fatalf("connection should be ungrouped after its group is deleted, got %v", got)
	}
}

// 分组已经不在了（比如上次删除中途失败）：删除不报错，指向它的连接照样归为未分组
func TestGroupDeleteOfMissingGroupUngroupsItsConnections(t *testing.T) {
	conns, groups := openTestConnectionDB(t)

	if err := conns.Save(newTestConnection("c1", "订单库", strPtr("ghost"))); err != nil {
		t.Fatalf("save connection: %v", err)
	}
	if err := groups.Delete("ghost"); err != nil {
		t.Fatalf("delete missing group: %v", err)
	}

	got, err := conns.GetByID("c1")
	if err != nil {
		t.Fatalf("get connection: %v", err)
	}
	if got == nil || got.GroupID != nil {
		t.Fatalf("orphaned connection should become ungrouped, got %v", got)
	}
}

// 「不分组」不论以哪种形式存进来，都统一成 NULL
func TestConnectionSaveNormalizesUngrouped(t *testing.T) {
	conns, _ := openTestConnectionDB(t)

	for _, tc := range []struct {
		name    string
		groupID *string
	}{
		{name: "default 伪分组", groupID: strPtr("default")},
		{name: "空字符串", groupID: strPtr("")},
		{name: "纯空白", groupID: strPtr("  ")},
		{name: "nil", groupID: nil},
	} {
		conn := newTestConnection("c-"+tc.name, tc.name, tc.groupID)
		if err := conns.Save(conn); err != nil {
			t.Fatalf("save (%s): %v", tc.name, err)
		}
		if conn.GroupID != nil {
			t.Errorf("%s: in-memory GroupID should be nil, got %q", tc.name, *conn.GroupID)
		}
		got, err := conns.GetByID(conn.ID)
		if err != nil {
			t.Fatalf("get (%s): %v", tc.name, err)
		}
		if got == nil || got.GroupID != nil {
			t.Errorf("%s: stored GroupID should be NULL, got %v", tc.name, got)
		}
	}

	// 真实分组原样保留
	if err := conns.Save(newTestConnection("c-prod", "订单库", strPtr("prod"))); err != nil {
		t.Fatalf("save: %v", err)
	}
	got, err := conns.GetByID("c-prod")
	if err != nil || got == nil || got.GroupID == nil || *got.GroupID != "prod" {
		t.Fatalf("real group should be kept, got %v (err %v)", got, err)
	}
}

// 已有连接可能带着旧版写入的 'default'：重跑迁移要把它归一，且重复执行无副作用
func TestRunMigrationsNormalizesLegacyUngrouped(t *testing.T) {
	conns, groups := openTestConnectionDB(t)

	if err := groups.Save(newTestGroup("prod", "生产环境")); err != nil {
		t.Fatalf("save group: %v", err)
	}
	if err := conns.Save(newTestConnection("c-prod", "订单库", strPtr("prod"))); err != nil {
		t.Fatalf("save connection: %v", err)
	}
	// 绕过仓库的归一，直接写入旧数据
	db := conns.db
	if _, err := db.Exec(`UPDATE connections SET group_id = 'default' WHERE id = ?`, "c-prod"); err != nil {
		t.Fatalf("seed legacy row: %v", err)
	}

	for i := 0; i < 2; i++ {
		if err := RunMigrations(db); err != nil {
			t.Fatalf("migrations run %d: %v", i+1, err)
		}
	}

	legacy, err := conns.GetByID("c-prod")
	if err != nil || legacy == nil || legacy.GroupID != nil {
		t.Fatalf("legacy 'default' should become NULL, got %v (err %v)", legacy, err)
	}
	// 「未分组」伪分组自身还在（移到分组菜单用它表示不分组）
	all, err := groups.GetAll()
	if err != nil {
		t.Fatalf("get groups: %v", err)
	}
	hasDefault := false
	for _, g := range all {
		if g.ID == ungroupedGroupID {
			hasDefault = true
		}
	}
	if !hasDefault {
		t.Fatal("default group row should still exist")
	}
}
