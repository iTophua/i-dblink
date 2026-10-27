package backend

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
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
