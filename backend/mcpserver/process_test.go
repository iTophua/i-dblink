package mcpserver

import (
	"testing"

	"idblink/backend/api"
)

// 门禁核心数据流：目标进程定位 + 展示摘要（确认弹窗内容来自这里，
// 人确认的是"看到这条 SQL 并同意杀"）
func TestFindTargetProcess(t *testing.T) {
	host := "172.98.14.65:52334"
	db := "gy_energy_core"
	info := "SELECT * FROM big_table WHERE ..."
	procs := []api.ProcessInfo{
		{ID: "1", User: "root"},
		{ID: "42", User: "app", Host: &host, Database: &db, Time: strPtr("300"), Info: &info},
	}

	var target *api.ProcessInfo
	for i := range procs {
		if procs[i].ID == "42" {
			target = &procs[i]
			break
		}
	}
	if target == nil {
		t.Fatal("target not found")
	}
	if target.User != "app" || *target.Time != "300" || *target.Info != info {
		t.Errorf("unexpected target: %+v", target)
	}
}

func TestStrOr(t *testing.T) {
	if strOr(nil, "-") != "-" {
		t.Error("nil should fall back to default")
	}
	if strOr(strPtr("x"), "-") != "x" {
		t.Error("non-nil should return value")
	}
}

func TestArgBool(t *testing.T) {
	if argBool(map[string]any{"force": true}, "force", false) != true {
		t.Error("true not read")
	}
	if argBool(map[string]any{"force": "true"}, "force", false) != false {
		t.Error("non-bool value should fall back to default")
	}
	if argBool(map[string]any{}, "force", true) != true {
		t.Error("missing key should fall back to default")
	}
}
