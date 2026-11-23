package backend

import (
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// sqlFileMaxBytes 拖放/双击打开的 SQL 文件大小上限（5MB）。
// 编辑器载入超大文件会卡死 WebView，超限时提示用户改用数据库端导入。
const sqlFileMaxBytes = 5 << 20

// setPendingOpenFile / TakePendingOpenFile 冷启动待打开文件：
// 双击 .sql 冷启动应用时（首个实例），路径由 main 记录、前端启动后主动拉取，
// 避免事件早于前端监听器就绪而丢失。已运行实例收到二次启动时走事件直推，不经过这里。
var pendingOpenFile struct {
	mu   sync.Mutex
	path string
}

func SetPendingOpenFile(path string) {
	pendingOpenFile.mu.Lock()
	defer pendingOpenFile.mu.Unlock()
	pendingOpenFile.path = path
}

// TakePendingOpenFile 返回并清除待打开的文件路径（无则返回空串）。
func (a *App) TakePendingOpenFile() string {
	pendingOpenFile.mu.Lock()
	defer pendingOpenFile.mu.Unlock()
	p := pendingOpenFile.path
	pendingOpenFile.path = ""
	return p
}

// ReadSqlFile 读取本地 SQL 脚本文件内容，供前端「双击打开 / 拖放载入」使用。
// 仅放行 .sql/.txt 文本且限制 5MB——此绑定可从 WebView 调用，不提供任意文件读取。
func (a *App) ReadSqlFile(path string) (string, error) {
	if path == "" {
		return "", fmt.Errorf("文件路径为空")
	}
	ext := strings.ToLower(filepath.Ext(path))
	if ext != ".sql" && ext != ".txt" {
		return "", fmt.Errorf("仅支持 .sql / .txt 文件（当前：%s）", ext)
	}
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("无法访问文件：%w", err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("路径是目录而非文件")
	}
	if info.Size() > sqlFileMaxBytes {
		return "", fmt.Errorf("文件过大（%.1fMB），上限 5MB，请改用数据库端导入", float64(info.Size())/(1<<20))
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("读取文件失败：%w", err)
	}
	return string(data), nil
}

// SaveSqlFileDialog 原生「保存 SQL」对话框，返回所选路径（取消返回空串）。
func (a *App) SaveSqlFileDialog(defaultName string) (string, error) {
	app := application.Get()
	if app == nil {
		return "", fmt.Errorf("应用未运行")
	}
	return app.Dialog.SaveFile().
		SetFilename(defaultName).
		AddFilter("SQL 脚本", "*.sql;*.txt").
		CanCreateDirectories(true).
		PromptForSingleSelection()
}

// exportFileFilter 按导出格式给出原生保存对话框的过滤器（显示名;分号分隔模式）
func exportFileFilter(format string) (string, string) {
	switch format {
	case "csv":
		return "CSV 文件", "*.csv"
	case "xlsx":
		return "Excel 工作簿", "*.xlsx"
	case "json":
		return "JSON 文件", "*.json"
	case "txt":
		return "文本文件", "*.txt"
	case "xml":
		return "XML 文件", "*.xml"
	case "md":
		return "Markdown 文件", "*.md"
	default:
		return "所有文件", "*.*"
	}
}

// SaveExportFileDialog 查询结果导出的原生保存对话框，返回所选路径（取消返回空串）。
func (a *App) SaveExportFileDialog(defaultName string, format string) (string, error) {
	app := application.Get()
	if app == nil {
		return "", fmt.Errorf("应用未运行")
	}
	name, patterns := exportFileFilter(format)
	return app.Dialog.SaveFile().
		SetFilename(defaultName).
		AddFilter(name, patterns).
		CanCreateDirectories(true).
		PromptForSingleSelection()
}

// WriteExportFile 把导出内容（文本或二进制，base64 编码）写入用户选择的路径。
// 文本编码（含 BOM）由前端拼好后再传，这里只负责解码落盘。
// 用 base64 是因为 Wails v3 绑定把 []byte 生成为 TS string，base64 是双方
// 都明确无歧义的字符串契约（解出后上限 200MB）。
func (a *App) WriteExportFile(path string, contentBase64 string) error {
	if path == "" {
		return fmt.Errorf("文件路径为空")
	}
	data, err := base64.StdEncoding.DecodeString(contentBase64)
	if err != nil {
		return fmt.Errorf("invalid base64 content: %w", err)
	}
	if len(data) > 200<<20 {
		return fmt.Errorf("内容过大（%dMB），上限 200MB", len(data)/(1<<20))
	}
	dir := filepath.Dir(path)
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		return fmt.Errorf("目录不存在：%s", dir)
	}
	return os.WriteFile(path, data, 0o644)
}

// WriteSqlFile 把编辑器 SQL 内容写入用户经原生对话框选择的路径。
func (a *App) WriteSqlFile(path string, content string) error {
	if path == "" {
		return fmt.Errorf("文件路径为空")
	}
	if len(content) > 20<<20 {
		return fmt.Errorf("内容过大（%dMB），上限 20MB", len(content)/(1<<20))
	}
	dir := filepath.Dir(path)
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		return fmt.Errorf("目录不存在：%s", dir)
	}
	return os.WriteFile(path, []byte(content), 0o644)
}

// importFileMaxBytes 拖放导入文件大小上限（20MB，与向导批量写入能力匹配）
const importFileMaxBytes = 20 << 20

// ImportFileContent 拖放导入文件内容（base64，前端还原为 File 走向导解析管线）
type ImportFileContent struct {
	Name string `json:"name"`
	Data string `json:"data"` // base64
}

// ReadImportFile 读取拖放进窗口的导入文件（csv/xlsx/json/xml/txt/sql），
// 供 TableImportWizard 预填。白名单 + 20MB 上限，不提供任意文件读取。
func (a *App) ReadImportFile(path string) (ImportFileContent, error) {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".csv", ".txt", ".json", ".xml", ".xlsx", ".xls", ".sql":
	default:
		return ImportFileContent{}, fmt.Errorf("不支持的导入文件类型：%s", ext)
	}
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return ImportFileContent{}, fmt.Errorf("无法访问文件：%s", path)
	}
	if info.Size() > importFileMaxBytes {
		return ImportFileContent{}, fmt.Errorf("文件过大（%.1fMB），上限 20MB", float64(info.Size())/(1<<20))
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return ImportFileContent{}, fmt.Errorf("读取文件失败：%w", err)
	}
	return ImportFileContent{
		Name: filepath.Base(path),
		Data: base64.StdEncoding.EncodeToString(data),
	}, nil
}

// OpenInFolder 在系统文件管理器中定位并选中该文件。
func (a *App) OpenInFolder(path string) error {
	if path == "" {
		return fmt.Errorf("文件路径为空")
	}
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", "-R", path).Start()
	case "windows":
		return exec.Command("explorer", "/select,", path).Start()
	default:
		return exec.Command("xdg-open", filepath.Dir(path)).Start()
	}
}
