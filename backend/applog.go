package backend

import (
	"context"
	"fmt"
	"io"
	"log"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// ==================== 诊断日志 ====================
//
// 打包版没有终端，slog / 标准库 log 的输出原本全部丢失，出问题只能靠截图猜。
// 这里把两路输出同时写到 stderr 和数据目录下的滚动文件：
//
//	<数据目录>/logs/idblink-2006-01-02.log   当天日志；单文件超过 maxLogBytes 切到 .1/.2…
//
// 约定：不记录连接密码、API Key、对话内容；请求体一律不落盘。
// 保留 maxLogFiles 个文件、keepLogDays 天，先到者为准。
// IDBLINK_LOG_LEVEL=debug 可打开 debug 级别（逐次接口调用、事务操作）。

const (
	logBaseName  = "idblink"
	maxLogBytes  = 8 << 20 // 单文件 8MB
	maxLogFiles  = 10
	maxLogSeq    = 1000 // 当天文件序号的上限，到顶后覆盖最后一个文件
	keepLogDays  = 14
	slowAPIMilli = 3000 // 超过 3 秒的接口调用单独记一条 Info
	// 只为取 error 字段而整体解析响应时的体积上限：失败的响应都很小，
	// 全库列清单这类大响应（都是成功的）不必再解析一遍
	maxLoggedErrorBody = 64 << 10

	maxAppLogBatch   = 200  // 前端单次上报条数上限
	maxAppLogMessage = 4000 // 单条前端消息字符上限
	maxAppLogStack   = 8000 // 单条前端堆栈字符上限
)

// rollingWriter 按天 + 按大小滚动的日志文件写入器。
type rollingWriter struct {
	dir      string
	maxBytes int64
	maxFiles int
	keepDays int
	// 当天文件序号的上限（测试会调小）
	maxSeq int

	mu   sync.Mutex
	f    *os.File
	day  string
	seq  int
	size int64
}

func newRollingWriter(dir string, maxBytes int64, maxFiles, keepDays int) (*rollingWriter, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create log dir: %w", err)
	}
	return &rollingWriter{dir: dir, maxBytes: maxBytes, maxFiles: maxFiles, keepDays: keepDays, maxSeq: maxLogSeq}, nil
}

func (w *rollingWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	day := time.Now().Format("2006-01-02")
	if w.f == nil || w.day != day || w.size+int64(len(p)) > w.maxBytes {
		if err := w.openLocked(day, len(p)); err != nil {
			return 0, err
		}
	}
	n, err := w.f.Write(p)
	w.size += int64(n)
	return n, err
}

func (w *rollingWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.f == nil {
		return nil
	}
	err := w.f.Close()
	w.f = nil
	return err
}

// openLocked 打开当天第 seq 个文件。同一天内重启时沿用已有文件（追加）；
// 候选文件已存在且装不下本次写入时顺延到下一个序号。
func (w *rollingWriter) openLocked(day string, next int) error {
	if day != w.day {
		w.day = day
		w.seq = 0
	}
	if w.f != nil {
		_ = w.f.Close()
		w.f = nil
	}
	for {
		name := filepath.Join(w.dir, fmt.Sprintf("%s-%s.log", logBaseName, day))
		if w.seq > 0 {
			name = filepath.Join(w.dir, fmt.Sprintf("%s-%s.%d.log", logBaseName, day, w.seq))
		}
		size := int64(0)
		if info, err := os.Stat(name); err == nil {
			size = info.Size()
		}
		flags := os.O_CREATE | os.O_WRONLY | os.O_APPEND
		switch {
		case size == 0, size+int64(next) <= w.maxBytes:
			// 装得下（空文件总是先收下第一条，哪怕这一条比上限还大）
		case w.seq >= w.maxSeq:
			// 序号已经封顶还装不下：覆盖这个文件。不能再顺延——那样会在这里原地打转，
			// 还一直占着锁，之后所有写日志的调用都会卡住
			flags = os.O_CREATE | os.O_WRONLY | os.O_TRUNC
			size = 0
		default:
			w.seq++
			continue
		}
		f, err := os.OpenFile(name, flags, 0o644)
		if err != nil {
			return fmt.Errorf("open log file: %w", err)
		}
		w.f = f
		w.size = size
		w.cleanupLocked()
		return nil
	}
}

// cleanupLocked 清理过期/超量的旧日志（当前打开的文件除外）。
func (w *rollingWriter) cleanupLocked() {
	entries, err := os.ReadDir(w.dir)
	if err != nil {
		return
	}
	type oldFile struct {
		path    string
		modTime time.Time
	}
	var olds []oldFile
	for _, e := range entries {
		if e.IsDir() || !strings.HasPrefix(e.Name(), logBaseName+"-") || !strings.HasSuffix(e.Name(), ".log") {
			continue
		}
		if w.f != nil && e.Name() == filepath.Base(w.f.Name()) {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		olds = append(olds, oldFile{filepath.Join(w.dir, e.Name()), info.ModTime()})
	}
	// 新的在前
	sort.SliceStable(olds, func(i, j int) bool { return olds[i].modTime.After(olds[j].modTime) })
	cutoff := time.Now().AddDate(0, 0, -w.keepDays)
	// 当前文件占 1 个名额
	keep := w.maxFiles - 1
	for i, o := range olds {
		if o.modTime.Before(cutoff) || i >= keep {
			_ = os.Remove(o.path)
		}
	}
}

// InitAppLogging 在创建 Wails 应用之前调用一次（GUI 模式）。
// 初始化诊断日志并返回应交给 application.Options.Logger 的 logger。
// 任何失败都只降级为「仅 stderr」，绝不阻塞启动。
func InitAppLogging(dataDir string) *slog.Logger {
	level := slog.LevelInfo
	if strings.EqualFold(os.Getenv("IDBLINK_LOG_LEVEL"), "debug") {
		level = slog.LevelDebug
	}
	out := io.Writer(os.Stderr)
	logDir := LogDirFor(dataDir)
	sink, err := newRollingWriter(logDir, maxLogBytes, maxLogFiles, keepLogDays)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[log] 诊断日志未启用（%v），仅输出到标准错误\n", err)
	} else {
		out = io.MultiWriter(os.Stderr, sink)
	}
	logger := slog.New(slog.NewTextHandler(out, &slog.HandlerOptions{Level: level}))
	slog.SetDefault(logger)
	// 标准库 log（net/http 等运行时组件的错误走这里）同样落盘，保持原始行格式
	log.SetOutput(out)
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
	appLogSink = sink

	mode := "prod"
	if isDevMode() {
		mode = "dev"
	}
	slog.Info("iDBLink starting",
		"version", AppVersion, "mode", mode, "os", runtime.GOOS, "arch", runtime.GOARCH,
		"go", runtime.Version(), "pid", os.Getpid(), "data_dir", dataDir, "log_dir", logDir)
	return logger
}

// appLogSink 当前滚动文件（nil = 文件日志未启用）
var appLogSink *rollingWriter

// CloseAppLogging 应用退出时刷新并关闭日志文件。
func CloseAppLogging() {
	if sink := appLogSink; sink != nil {
		_ = sink.Close()
	}
}

// LogDirFor 数据目录下的日志子目录。
func LogDirFor(dataDir string) string {
	return filepath.Join(dataDir, "logs")
}

// GetLogFolderPath 返回诊断日志目录（设置页展示用）。
func (a *App) GetLogFolderPath() string {
	return LogDirFor(a.getDataDir())
}

// OpenLogFolder 在系统文件管理器中打开诊断日志目录。
func (a *App) OpenLogFolder() error {
	dir := a.GetLogFolderPath()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("无法创建日志目录：%w", err)
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", dir)
	case "windows":
		cmd = exec.Command("explorer", dir)
	default:
		cmd = exec.Command("xdg-open", dir)
	}
	return cmd.Start()
}

// AppLogEntry 前端上报的一条诊断日志。
type AppLogEntry struct {
	Level   string `json:"level"`           // error | warn | info
	Source  string `json:"source"`          // window / promise / console / react …
	Message string `json:"message"`         // 已限长的消息正文
	Stack   string `json:"stack,omitempty"` // 堆栈（可选）
	Page    string `json:"page,omitempty"`  // location.hash，区分主窗口/结果弹窗/托盘面板
	Count   int    `json:"count"`           // 上报窗口内的重复次数（前端已合并）
	Time    int64  `json:"time"`            // 前端时间戳（毫秒）
}

// WriteAppLog 接收前端上报的异常（未捕获错误、未处理的 Promise 拒绝、console.error、
// React 错误边界），写入诊断日志。前端已按内容合并去重并限长，这里再做一次上限保护。
func (a *App) WriteAppLog(entries []AppLogEntry) error {
	if len(entries) > maxAppLogBatch {
		entries = entries[:maxAppLogBatch]
	}
	for _, e := range entries {
		level := slog.LevelWarn
		switch e.Level {
		case "error":
			level = slog.LevelError
		case "info":
			level = slog.LevelInfo
		}
		attrs := []any{
			"source", "frontend." + e.Source,
			"page", e.Page,
			"count", e.Count,
		}
		if e.Stack != "" {
			attrs = append(attrs, "stack", truncateRunes(e.Stack, maxAppLogStack))
		}
		slog.Log(context.Background(), level, "frontend: "+truncateRunes(e.Message, maxAppLogMessage), attrs...)
	}
	return nil
}

// logAPICall 把一次 handler 调用记入诊断日志：失败记 Warn，慢调用记 Info，
// 其余只在 debug 级别留痕。不记录请求体。
func logAPICall(name string, d time.Duration, errMsg string) {
	ms := d.Milliseconds()
	switch {
	case errMsg != "":
		slog.Warn("api handler failed", "handler", name, "duration_ms", ms,
			"error", logSafeError(errMsg))
	case ms >= slowAPIMilli:
		slog.Info("api handler slow", "handler", name, "duration_ms", ms)
	default:
		slog.Debug("api call", "handler", name, "duration_ms", ms)
	}
}

// logSafeError 错误文本进日志前先去掉可能带着用户数据的部分，只留第一行的错误码和通用描述：
//   - 只留第一行：PG 的 DETAIL / HINT 行会原样带出违反约束的值（Key (email)=(x@y.com) …）；
//   - 截到第一个引号为止：MySQL 的 Duplicate entry '…' 、near '…'，PG 的 … type integer: "abc"，
//     值和出错的 SQL 片段都在引号里（PG 的值有时在双引号里，所以两种引号都截）。
//
// 代价是错误里的标识符（表名、约束名）也一并没了；配合接口名和界面上的完整报错足够定位
func logSafeError(errMsg string) string {
	if i := strings.IndexByte(errMsg, '\n'); i >= 0 {
		errMsg = errMsg[:i]
	}
	if i := strings.IndexAny(errMsg, `'"`); i >= 0 {
		errMsg = errMsg[:i]
	}
	return strings.TrimRight(truncateRunes(errMsg, 300), " ")
}

// truncateRunes 按字符数截断（多字节安全），超长时追加省略标记。
func truncateRunes(s string, max int) string {
	if max <= 0 || utf8.RuneCountInString(s) <= max {
		return s
	}
	return string([]rune(s)[:max]) + "…(truncated)"
}
