package backend

import (
	"log"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// logFiles 返回日志目录里的文件名（小写 .log）
func logFiles(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read log dir: %v", err)
	}
	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}
	return names
}

// 接口报错进日志时不能带出用户的数据：违反约束的值、出错的 SQL 片段都在引号或 DETAIL 行里
func TestLogSafeErrorKeepsOnlyTheGenericDescription(t *testing.T) {
	cases := map[string][2]string{
		"MySQL 重复键错误带着违反约束的值": {
			"Error 1062 (23000): Duplicate entry 'someone@example.com' for key 'users.email'",
			"Error 1062 (23000): Duplicate entry",
		},
		"MySQL 语法错误带着出错的 SQL 片段": {
			"Error 1064 (42000): You have an error in your SQL syntax; check the manual near 'IDENTIFIED BY 'pw''' at line 1",
			"Error 1064 (42000): You have an error in your SQL syntax; check the manual near",
		},
		"PG 的值在双引号里": {
			`ERROR: invalid input syntax for type integer: "abc" (SQLSTATE 22P02)`,
			"ERROR: invalid input syntax for type integer:",
		},
		"PG 的 DETAIL 行带着值，整行去掉": {
			"ERROR: duplicate key value violates unique constraint \"users_email_key\" (SQLSTATE 23505)\nDETAIL: Key (email)=(someone@example.com) already exists.",
			"ERROR: duplicate key value violates unique constraint",
		},
		"不含引号的报错原样保留": {
			"dial tcp 10.0.0.1:5432: connect: connection refused",
			"dial tcp 10.0.0.1:5432: connect: connection refused",
		},
	}
	for name, c := range cases {
		if got := logSafeError(c[0]); got != c[1] {
			t.Errorf("%s:\n got %q\nwant %q", name, got, c[1])
		}
	}
	if got := logSafeError(""); got != "" {
		t.Errorf("empty error should stay empty, got %q", got)
	}
}

func TestRollingWriterRotatesBySize(t *testing.T) {
	dir := t.TempDir()
	w, err := newRollingWriter(dir, 100, 3, 30)
	if err != nil {
		t.Fatalf("newRollingWriter: %v", err)
	}
	defer w.Close()

	// 每条 40 字节：单文件最多容纳 2 条 → 写 7 条后只剩最新 3 个文件
	for i := 0; i < 7; i++ {
		if _, err := w.Write([]byte(strings.Repeat("x", 39) + "\n")); err != nil {
			t.Fatalf("write %d: %v", i, err)
		}
	}
	files := logFiles(t, dir)
	if len(files) != 3 {
		t.Fatalf("expected 3 log files, got %d: %v", len(files), files)
	}
	for _, name := range files {
		if !strings.HasPrefix(name, "idblink-") || !strings.HasSuffix(name, ".log") {
			t.Fatalf("unexpected file name %q", name)
		}
	}
	// 最后一条一定落在当前打开的文件里
	data, err := os.ReadFile(filepath.Join(dir, filepath.Base(w.f.Name())))
	if err != nil {
		t.Fatalf("read current log: %v", err)
	}
	if n := strings.Count(string(data), "\n"); n != 1 {
		t.Fatalf("expected the 7th line alone in the newest file, got %d lines", n)
	}
}

// 序号封顶后还装不下：必须覆盖当前文件收下这条，不能在顺延里原地打转（那会一直占着锁）
func TestRollingWriterOverwritesWhenSequenceCapped(t *testing.T) {
	dir := t.TempDir()
	w, err := newRollingWriter(dir, 100, 3, 30)
	if err != nil {
		t.Fatalf("newRollingWriter: %v", err)
	}
	defer w.Close()
	w.maxSeq = 1

	done := make(chan error, 1)
	go func() {
		// 每条 40 字节：第 1、2 条在主文件，第 3、4 条进 .1；第 5 条时 .1 已满而序号到顶
		for i := 0; i < 5; i++ {
			if _, err := w.Write([]byte(strings.Repeat("x", 39) + "\n")); err != nil {
				done <- err
				return
			}
		}
		done <- nil
	}()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("write: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Write did not return: the sequence rollover must have spun")
	}

	if w.seq != 1 {
		t.Fatalf("sequence should stay at the cap 1, got %d", w.seq)
	}
	// 覆盖而不是追加：当前文件里只剩最后一条
	data, err := os.ReadFile(filepath.Join(dir, filepath.Base(w.f.Name())))
	if err != nil {
		t.Fatalf("read current log: %v", err)
	}
	if n := strings.Count(string(data), "\n"); n != 1 {
		t.Fatalf("expected the capped file to be overwritten with a single line, got %d lines", n)
	}
}

func TestRollingWriterAppendsWithSameDayRestart(t *testing.T) {
	dir := t.TempDir()
	w1, _ := newRollingWriter(dir, 1<<20, 5, 30)
	_, _ = w1.Write([]byte("first\n"))
	_ = w1.Close()

	// 同一天再打开：追加到同一文件
	w2, _ := newRollingWriter(dir, 1<<20, 5, 30)
	defer w2.Close()
	_, _ = w2.Write([]byte("second\n"))

	files := logFiles(t, dir)
	if len(files) != 1 {
		t.Fatalf("expected 1 log file, got %v", files)
	}
	data, _ := os.ReadFile(filepath.Join(dir, files[0]))
	if string(data) != "first\nsecond\n" {
		t.Fatalf("unexpected content %q", data)
	}
}

func TestRollingWriterCleansExpiredAndExcess(t *testing.T) {
	dir := t.TempDir()
	old := time.Now().AddDate(0, 0, -40)
	for _, name := range []string{"idblink-2026-01-01.log", "idblink-2026-01-02.1.log"} {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte("old"), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(p, old, old); err != nil {
			t.Fatal(err)
		}
	}
	// 近期但超量的文件：maxFiles=2 → 当前 1 个 + 保留最新 1 个
	for i, name := range []string{"idblink-2026-01-03.log", "idblink-2026-01-04.log"} {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte("recent"), 0o644); err != nil {
			t.Fatal(err)
		}
		recent := time.Now().Add(-time.Duration(5-i) * time.Hour) // 01-04 更新
		if err := os.Chtimes(p, recent, recent); err != nil {
			t.Fatal(err)
		}
	}
	// 无关文件不动
	if err := os.WriteFile(filepath.Join(dir, "notes.log"), []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}

	w, err := newRollingWriter(dir, 1<<20, 2, 30)
	if err != nil {
		t.Fatal(err)
	}
	defer w.Close()
	if _, err := w.Write([]byte("today\n")); err != nil {
		t.Fatal(err)
	}

	got := logFiles(t, dir)
	// 期望：今天的文件 + 最新的近期文件（01-04）+ notes.log；过期的两个和 01-03 被清掉
	if len(got) != 3 {
		t.Fatalf("expected 3 files after cleanup, got %v", got)
	}
	for _, name := range got {
		if name == "notes.log" || strings.Contains(name, "2026-01-04") ||
			strings.Contains(name, time.Now().Format("2006-01-02")) {
			continue
		}
		t.Fatalf("stale log %q was not removed: %v", name, got)
	}
}

func TestInitAppLoggingWritesStartupLine(t *testing.T) {
	dataDir := t.TempDir()
	prevLogger := slog.Default()
	prevWriter := log.Writer()
	prevFlags := log.Flags()
	t.Setenv("IDBLINK_LOG_LEVEL", "debug")
	logger := InitAppLogging(dataDir)
	t.Cleanup(func() {
		CloseAppLogging()
		appLogSink = nil
		slog.SetDefault(prevLogger)
		log.SetOutput(prevWriter)
		log.SetFlags(prevFlags)
	})

	if !logger.Enabled(nil, slog.LevelDebug) {
		t.Fatal("IDBLINK_LOG_LEVEL=debug should enable debug level")
	}
	logger.Info("hello-from-test", "k", "v") // 未经默认 logger，直接写新 logger
	slog.Warn("via-default", "k", "v")       // 默认 logger 已被接管
	log.Print("via-std-log")
	CloseAppLogging()

	files := logFiles(t, LogDirFor(dataDir))
	if len(files) != 1 {
		t.Fatalf("expected one log file, got %v", files)
	}
	data, err := os.ReadFile(filepath.Join(LogDirFor(dataDir), files[0]))
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	for _, want := range []string{"iDBLink starting", "hello-from-test", "via-default", "via-std-log"} {
		if !strings.Contains(text, want) {
			t.Fatalf("log file missing %q:\n%s", want, text)
		}
	}
}

func TestInitAppLoggingFallsBackToStderr(t *testing.T) {
	// 数据目录被一个同名文件占住：logs 子目录建不出来，只能降级为仅 stderr
	blocker := filepath.Join(t.TempDir(), "blocked")
	if err := os.WriteFile(blocker, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	prevLogger := slog.Default()
	prevWriter := log.Writer()
	prevFlags := log.Flags()
	logger := InitAppLogging(blocker)
	t.Cleanup(func() {
		appLogSink = nil
		slog.SetDefault(prevLogger)
		log.SetOutput(prevWriter)
		log.SetFlags(prevFlags)
	})
	if appLogSink != nil {
		t.Fatal("file sink should stay disabled when the log dir cannot be created")
	}
	if logger == nil {
		t.Fatal("a stderr-only logger must still be returned")
	}
	logger.Info("still works")
}

func TestTruncateRunes(t *testing.T) {
	if got := truncateRunes("中文内容", 2); got != "中文…(truncated)" {
		t.Fatalf("unexpected truncation %q", got)
	}
	if got := truncateRunes("short", 10); got != "short" {
		t.Fatalf("short string must stay intact, got %q", got)
	}
}

func TestWriteAppLogLimitsAndLevels(t *testing.T) {
	buf := &strings.Builder{}
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })

	app := &App{}
	entries := make([]AppLogEntry, maxAppLogBatch+5)
	for i := range entries {
		entries[i] = AppLogEntry{Level: "info", Source: "window", Message: "dup", Count: 1}
	}
	if err := app.WriteAppLog(entries); err != nil {
		t.Fatalf("WriteAppLog: %v", err)
	}
	if n := strings.Count(buf.String(), "frontend: dup"); n != maxAppLogBatch {
		t.Fatalf("expected the batch to be capped at %d entries, got %d", maxAppLogBatch, n)
	}

	buf.Reset()
	if err := app.WriteAppLog([]AppLogEntry{{
		Level:   "error",
		Source:  "console",
		Message: "boom " + strings.Repeat("长", maxAppLogMessage),
		Stack:   "at a\nat b",
		Page:    "#popup/1",
		Count:   3,
	}}); err != nil {
		t.Fatalf("WriteAppLog: %v", err)
	}
	out := buf.String()
	for _, want := range []string{"level=ERROR", "source=frontend.console", "page=#popup/1",
		"count=3", "at a", "…(truncated)"} {
		if !strings.Contains(out, want) {
			t.Fatalf("log line missing %q:\n%s", want, out)
		}
	}
	if got := strings.Count(out, "长"); got > maxAppLogMessage {
		t.Fatalf("message not truncated: %d runes over the limit", got-maxAppLogMessage)
	}
}
