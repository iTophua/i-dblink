package mcpserver

import (
	"os"
	"testing"
	"time"
)

func TestExeChangedPure(t *testing.T) {
	a := exeSnapshot{modTimeUnix: 100, size: 10}
	if exeChanged(a, a) {
		t.Fatal("identical snapshots must not report change")
	}
	if !exeChanged(a, exeSnapshot{modTimeUnix: 100, size: 11}) {
		t.Fatal("size change should report change")
	}
	if !exeChanged(a, exeSnapshot{modTimeUnix: 101, size: 10}) {
		t.Fatal("newer mtime should report change")
	}
	// mtime 变旧（异常情形）不触发，避免误杀
	if exeChanged(a, exeSnapshot{modTimeUnix: 99, size: 10}) {
		t.Fatal("older mtime must not report change")
	}
}

// TestBinaryWatcherDetectsReplace 用 Chtimes 模拟应用重装（mtime 前移），
// 验证 watcher 真实检测路径：快照 → 磁盘状态变化 → check() 返回 true。
func TestBinaryWatcherDetectsReplace(t *testing.T) {
	w := newBinaryWatcher()
	if !w.valid {
		t.Skip("executable stat unavailable")
	}
	if w.check() {
		t.Fatal("fresh watcher must not report change")
	}

	exe, err := os.Executable()
	if err != nil {
		t.Skip("no executable path")
	}
	fi, err := os.Stat(exe)
	if err != nil {
		t.Skipf("stat exe: %v", err)
	}
	future := fi.ModTime().Add(2 * time.Second)
	if err := os.Chtimes(exe, future, future); err != nil {
		t.Skipf("chtimes not permitted: %v", err)
	}

	if !w.check() {
		t.Fatal("replaced binary (newer mtime) should be detected")
	}
}
