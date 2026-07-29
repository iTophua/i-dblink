package ai

import (
	"fmt"
	"regexp"
	"strings"
)

// TaskID 任务标识
type TaskID string

const (
	TaskSQLConvert  TaskID = "sql-convert"  // SQL 方言转换
	TaskSQLExplain  TaskID = "sql-explain"  // SQL 解释 + 优化建议
	TaskSQLGenerate TaskID = "sql-generate" // 自然语言 → SQL
	TaskChat        TaskID = "chat"         // 通用 AI 聊天（前端透传 messages）
)

// TaskRequest AI 任务请求
type TaskRequest struct {
	TaskID        TaskID            `json:"taskId"`
	RequestID     string            `json:"requestId,omitempty"` // 流式调用时前端生成，用于事件路由
	SourceDialect string            `json:"sourceDialect,omitempty"`
	TargetDialect string            `json:"targetDialect,omitempty"`
	SQL           string            `json:"sql,omitempty"`
	NaturalInput  string            `json:"naturalInput,omitempty"` // NL→SQL 的自然语言输入
	DatabaseType  string            `json:"databaseType,omitempty"`
	TableInfo     string            `json:"tableInfo,omitempty"` // 表结构信息（DDL 或描述）
	Context       map[string]string `json:"context,omitempty"`
}

// TaskResponse AI 任务响应
type TaskResponse struct {
	TaskID   TaskID `json:"taskId"`
	Result   string `json:"result"`
	Provider string `json:"provider"`
}

// Task AI 任务定义
type Task struct {
	ID          TaskID
	Name        string
	Description string
	BuildPrompt func(req *TaskRequest) []ChatMessage
}

// codeFence 是 Markdown SQL 代码块的定界符，用变量避免 raw string 中出现反引号。
const codeFence = "```sql"

// 全局任务注册表
var taskRegistry = map[TaskID]*Task{
	TaskSQLConvert:  taskSQLConvert,
	TaskSQLExplain:  taskSQLExplain,
	TaskSQLGenerate: taskSQLGenerate,
	TaskChat:        taskChat,
}

// taskChat 通用聊天任务占位定义。
// 实际消息由前端透传（app_ai.go 的 buildAIMessages 特判 chat task），
// BuildPrompt 不会被调用，这里仅满足 Task 结构体要求。
var taskChat = &Task{
	ID:          TaskChat,
	Name:        "通用聊天",
	Description: "多轮对话，前端透传 messages",
	BuildPrompt: func(req *TaskRequest) []ChatMessage { return nil },
}

// GetTask 获取任务定义
func GetTask(id TaskID) (*Task, error) {
	t, ok := taskRegistry[id]
	if !ok {
		return nil, fmt.Errorf("unknown task: %s", id)
	}
	return t, nil
}

// ==================== SQL 方言转换 ====================

var taskSQLConvert = &Task{
	ID:          TaskSQLConvert,
	Name:        "SQL 方言转换",
	Description: "将 SQL 从源数据库方言转换为目标数据库方言",
	BuildPrompt: func(req *TaskRequest) []ChatMessage {
		system := "你是一个 SQL 方言转换专家。将用户提供的 SQL 从源数据库方言转换为目标数据库方言。\n\n" +
			"严格要求：\n" +
			"- 保持业务逻辑完全等价（结果集、副作用一致）\n" +
			"- 使用目标方言的标准语法、标识符引号、内置函数\n" +
			"- 分页语法（LIMIT/OFFSET、ROWNUM、FETCH NEXT 等）使用目标方言写法\n" +
			"- 类型转换、字符串拼接、日期函数使用目标方言等价写法\n" +
			"- 只输出转换后的 SQL，放在单个 " + codeFence + " 代码块中\n" +
			"- 不添加任何解释说明"

		user := fmt.Sprintf("请将以下 SQL 从 %s 转换为 %s 方言：\n\n%s\n%s\n%s",
			req.SourceDialect, req.TargetDialect, codeFence, req.SQL, "```")

		return []ChatMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		}
	},
}

// ==================== SQL 解释 / 优化 ====================

var taskSQLExplain = &Task{
	ID:          TaskSQLExplain,
	Name:        "SQL 解释与优化",
	Description: "解释 SQL 逻辑并给出优化建议",
	BuildPrompt: func(req *TaskRequest) []ChatMessage {
		dbType := req.DatabaseType
		if dbType == "" {
			dbType = "未知"
		}

		system := "你是一个数据库性能优化专家。分析用户提供的 SQL 并给出专业建议。\n\n" +
			"输出格式（Markdown）：\n" +
			"## 逻辑说明\n" +
			"用简洁的语言说明这段 SQL 做了什么。\n\n" +
			"## 潜在问题\n" +
			"指出性能问题、全表扫描风险、索引未命中等。\n\n" +
			"## 优化建议\n" +
			"给出具体的优化方案（改写 SQL、添加索引、调整结构等），并提供优化后的 SQL 代码块。\n\n" +
			"保持专业、简洁、有可操作性。"

		user := fmt.Sprintf("数据库类型：%s\n\n请分析以下 SQL：\n\n%s\n%s\n%s",
			dbType, codeFence, req.SQL, "```")

		return []ChatMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		}
	},
}

// ==================== 自然语言 → SQL ====================

var taskSQLGenerate = &Task{
	ID:          TaskSQLGenerate,
	Name:        "自然语言生成 SQL",
	Description: "根据自然语言描述生成 SQL",
	BuildPrompt: func(req *TaskRequest) []ChatMessage {
		dbType := req.DatabaseType
		if dbType == "" {
			dbType = "MySQL"
		}

		system := fmt.Sprintf("你是一个 %s SQL 专家。根据用户的自然语言描述生成对应的 SQL。\n\n", dbType) +
			"严格要求：\n" +
			fmt.Sprintf("- 生成的 SQL 必须符合 %s 方言语法\n", dbType) +
			"- 只输出一条 SQL，放在单个 " + codeFence + " 代码块中\n" +
			"- 如果用户提供了表结构信息，必须基于该表结构生成\n" +
			"- 不添加任何解释说明"

		var user string
		if req.TableInfo != "" {
			user = fmt.Sprintf("表结构信息：\n%s\n\n需求：%s", req.TableInfo, req.NaturalInput)
		} else {
			user = req.NaturalInput
		}

		return []ChatMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		}
	},
}

// ==================== 结果提取工具 ====================

var sqlCodeBlockRe = regexp.MustCompile("(?s)```(?:sql)?\\s*\n(.*?)\n```")

// ExtractSQL 从 LLM 输出中提取第一个 SQL 代码块的内容。
// 如果没有代码块，返回去除首尾空白的原文。
func ExtractSQL(text string) string {
	m := sqlCodeBlockRe.FindStringSubmatch(text)
	if len(m) >= 2 {
		return strings.TrimSpace(m[1])
	}
	return strings.TrimSpace(text)
}
