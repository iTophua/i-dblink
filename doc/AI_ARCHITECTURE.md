# AI 子系统架构设计

> 版本：v2.0 | 日期：2026-07-03 | 状态：设计阶段（待 Phase 0 可行性验证）

> **v2.0 变更**（基于 2026-07-03 重新调研）：
> - 砍掉 License/付费层（本地推理对用户免费，无付费墙）
> - 模型从 1.5B 升级到 **Qwen2.5-Coder-3B Q4_K_M**（SQL 能力质变，速度损失极小）
> - 修正动态库体积估算（+20MB → +50-70MB）
> - 补齐 macOS 公证流程、流式传输适配层
> - 承认方言检测/规则转换已实现（§4 标记现状）

---

## 一、总体架构

### 1.1 设计目标

- **本地推理优先**：模型推理集成进应用，离线可用，无外部服务依赖
- **后期支持云端**：Provider 抽象统一本地/云端接口，用户可自行选择（资源够 + 要离线 → 本地；要更强模型 → 云端）
- **多任务扩展**：SQL 转换是第一个 Task，后续扩展 SQL 解释、SQL 优化、SQL 生成、DDL 生成、数据分析
- **Provider 抽象**：本地模型（yzma/llama.cpp）+ 云端 API（OpenAI/Anthropic），统一接口
- **规则引擎兜底**：方言转换的高频简单场景用规则（确定性、100% 正确），AI 处理复杂场景
- **零 CGO**：通过 `hybridgroup/yzma`（purego + ffi）调用 llama.cpp，保持现有 Wails 构建流程不变

### 1.2 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend                                  │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ SqlDialect   │  │ AI Service   │  │ Settings Dialog      │   │
│  │ Banner       │  │ (TS)         │  │ AI Tab               │   │
│  │ (已实现)      │  │              │  │                      │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                 │                      │               │
│  ┌──────┴───────┐  ┌──────┴───────┐              │               │
│  │ Rule Engine  │  │ Wails        │              │               │
│  │ (已实现,Free)│  │ Bindings     │              │               │
│  └──────────────┘  └──────┬───────┘              │               │
│         │                 │ (EventsEmit 流式)     │               │
└─────────┼─────────────────┼──────────────────────┼───────────────┘
          │                 │                      │
┌─────────┼─────────────────┼──────────────────────┼───────────────┐
│         │     Backend (Go)│                      │               │
│         │                 │                      │               │
│  ┌──────┴─────────────────┴──────────────────────┴────────────┐  │
│  │                    App (Wails)                              │  │
│  │  ┌─────────────┐  ┌───────────────────┐                     │  │
│  │  │ AI Manager  │  │ Storage           │                     │  │
│  │  │ (Provider   │  │ (ai_config)       │                     │  │
│  │  │  调度)      │  │ 复用 security.go  │                     │  │
│  │  └──────┬──────┘  └───────────────────┘                     │  │
│  │         │                                                   │  │
│  │  ┌──────┴──────────────────────────────┐                    │  │
│  │  │          Provider 接口              │                    │  │
│  │  ├────────────────┬────────────────────┤                    │  │
│  │  │ LocalProvider  │ CloudProvider      │                    │  │
│  │  │ (yzma, 3B 模型)│ (OpenAI/Anthropic) │                    │  │
│  │  │ ~1.9 GB GGUF   │ API Key (加密存储) │                    │  │
│  │  │ 默认，离线可用  │ 后期支持           │                    │  │
│  │  └────────────────┴────────────────────┘                    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                  Task 注册表                                 │  │
│  │  sql-convert │ sql-explain │ sql-optimize │ sql-generate     │  │
│  └─────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### 1.3 功能分层

| Provider | 功能 | 说明 |
|----------|------|------|
| **本地模型**（默认，yzma/llama.cpp）| SQL 转换（AI 增强）、SQL 解释、SQL 优化、SQL 生成、DDL 生成、数据分析 | 离线可用，模型运行时下载（~1.9GB），Metal GPU 加速 |
| **云端 API**（后期支持，OpenAI/Anthropic）| 同上，更强模型 | 需联网 + API Key（加密存储），用户自选 |
| **规则引擎**（已实现，兜底）| SQL 方言转换（17 条规则覆盖高频差异）| 模型未下载/不可用时自动降级到规则引擎 |

> **说明**：不做付费层。本地推理和规则引擎对所有用户可用；云端 Provider 由用户自行配置 API Key。

---

## 二、后端架构（`backend/ai/`）

### 2.1 目录结构

```
backend/ai/
├── provider.go       # Provider 接口 + 类型定义
├── manager.go        # ProviderManager（对标 db/Manager）
├── local.go          # 本地模型 Provider（yzma/llama.cpp）
├── stream.go         # 流式适配层（channel → runtime.EventsEmit）
├── openai.go         # OpenAI 兼容 Provider（后期支持）
├── anthropic.go      # Anthropic Provider（后期支持）
├── prompt.go         # Prompt 模板注册表
├── task.go           # Task 注册表 + TaskFunc 类型
└── model.go          # 模型生命周期管理（下载/加载/卸载）
```

> **注意**：相比 v1.0 砍掉了 `license.go`（不做付费层）。流式传输从 provider.go 拆出独立 `stream.go`。

### 2.2 Provider 接口

```go
package ai

import "context"

// ProviderType AI 提供者类型
type ProviderType string

const (
    ProviderLocal     ProviderType = "local"      // yzma 本地推理 (llama.cpp)
    ProviderOpenAI    ProviderType = "openai"     // OpenAI 兼容 API（后期）
    ProviderAnthropic ProviderType = "anthropic"  // Anthropic API（后期）
)

// ChatMessage 对话消息
type ChatMessage struct {
    Role    string `json:"role"`    // "system" | "user" | "assistant"
    Content string `json:"content"`
}

// ChatRequest 对话请求
type ChatRequest struct {
    Messages    []ChatMessage `json:"messages"`
    MaxTokens   int           `json:"maxTokens,omitempty"`
    Temperature float64       `json:"temperature,omitempty"`
    Stream      bool          `json:"stream,omitempty"`
}

// ChatChunk 流式响应块
type ChatChunk struct {
    Content string `json:"content"`
    Done    bool   `json:"done"`
}

// ChatResponse 对话响应
type ChatResponse struct {
    Content          string `json:"content"`
    PromptTokens     int    `json:"promptTokens"`
    CompletionTokens int    `json:"completionTokens"`
}

// Provider 统一接口 — 所有 AI 提供者必须实现
type Provider interface {
    // Name 提供者名称
    Name() string

    // Type 提供者类型
    Type() ProviderType

    // IsReady 是否就绪（本地模型：已加载；云端：API Key 已配置）
    IsReady() bool

    // Chat 同步对话
    Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error)

    // ChatStream 流式对话 — 返回 token channel
    // 注意：Wails 绑定不能直接把 channel 序列化给前端，
    // 需通过 stream.go 的适配层转为 runtime.EventsEmit 事件推送（见 §2.3）
    ChatStream(ctx context.Context, req *ChatRequest) (<-chan ChatChunk, error)

    // Close 释放资源
    Close() error
}
```

### 2.3 流式适配层（stream.go）— Wails 集成关键

**问题**：Wails v2 绑定方法是同步 RPC，不能直接把 Go 的 `<-chan ChatChunk` 序列化给前端。

**方案**：用 `runtime.EventsEmit` 事件推送（项目菜单事件已用此模式），写一个适配层：

```go
package ai

import (
    "context"
    "github.com/wailsapp/wails/v2/pkg/runtime"
)

// StreamToEvent 将 Provider 的 channel 流式输出转为 Wails 事件推送。
// 前端通过 EventsOn("ai-stream-<requestID>", ...) 接收 token。
// requestID 由调用方生成（uuid），用于区分并发请求，避免事件串流。
func StreamToEvent(
    ctx context.Context,
    requestID string,
    stream <-chan ChatChunk,
    onError func(error),
) {
    go func() {
        for chunk := range stream {
            if chunk.Done {
                runtime.EventsEmit(ctx, "ai-stream-"+requestID, map[string]any{
                    "done": true,
                })
                return
            }
            runtime.EventsEmit(ctx, "ai-stream-"+requestID, map[string]any{
                "content": chunk.Content,
                "done":    false,
            })
        }
    }()
}
```

**前端消费**：
```typescript
// 前端 aiService.ts
async streamTask(req: TaskRequest, onChunk: (s: string) => void): Promise<string> {
  const requestID = crypto.randomUUID();
  let full = '';

  // 注册事件监听
  const off = EventsOn(`ai-stream-${requestID}`, (payload) => {
    if (payload.done) {
      off(); // 完成后取消监听
      return;
    }
    full += payload.content;
    onChunk(payload.content);
  });

  // 发起后端调用（后端 goroutine 推事件）
  await api.executeAITaskStream({ ...req, requestID });
  return full;
}
```

### 2.4 ProviderManager

```go
package ai

import "sync"

// ProviderInfo 提供者信息（用于列表展示）
type ProviderInfo struct {
    ID      string       `json:"id"`
    Name    string       `json:"name"`
    Type    ProviderType `json:"type"`
    Ready   bool         `json:"ready"`
}

// ProviderManager AI 提供者管理器
// 对标 db/Manager 的设计模式：mutex + map + 注册/调度
type ProviderManager struct {
    mu        sync.RWMutex
    providers map[string]Provider  // providerID -> Provider
    activeID  string               // 当前活跃的 Provider ID（用户选择）
}

func NewProviderManager() *ProviderManager

// Register 注册一个 Provider
func (m *ProviderManager) Register(id string, p Provider) error

// Unregister 注销一个 Provider
func (m *ProviderManager) Unregister(id string) error

// Get 获取指定 Provider
func (m *ProviderManager) Get(id string) (Provider, error)

// GetActive 获取当前活跃 Provider（本地或用户选中的云端）
func (m *ProviderManager) GetActive() (Provider, error)

// SetActive 设置活跃 Provider
func (m *ProviderManager) SetActive(id string) error

// List 列出所有 Provider
func (m *ProviderManager) List() []ProviderInfo

// Close 关闭所有 Provider（Shutdown 时调用）
func (m *ProviderManager) Close() error
```

### 2.5 本地模型 Provider（yzma + Qwen2.5-Coder-3B）

> **模型选型变更**：v1.0 用 1.5B，v2.0 升级到 3B。理由见 §八「模型选型论证」。

```go
package ai

import (
    "context"
    "sync"

    "github.com/hybridgroup/yzma/pkg/llama"
)

// LocalConfig 本地模型配置
type LocalConfig struct {
    ModelFile   string  `json:"modelFile"`   // GGUF 文件名，默认 qwen2.5-coder-3b-instruct-q4_k_m.gguf
    MaxTokens   int     `json:"maxTokens"`   // 默认 2048
    Temperature float64 `json:"temperature"`  // 默认 0.1（SQL 任务要确定性，低温）
    GPU         bool    `json:"gpu"`          // 启用 GPU 加速（macOS Metal）
    GPULayers   int     `json:"gpuLayers"`    // GPU 层数，-1 = 全部
    ContextSize int     `json:"contextSize"`  // 上下文窗口，默认 4096
}

// LocalProvider 本地模型 Provider
// 通过 yzma（purego + ffi）调用 llama.cpp，零 CGO
type LocalProvider struct {
    modelDir  string
    modelPath string
    model     llama.Model
    ctx       llama.Context
    config    LocalConfig
    mu        sync.RWMutex
}

func NewLocalProvider(modelDir string, config LocalConfig) (*LocalProvider, error) {
    // 1. 加载 llama.cpp 动态库: llama.Load(libPath)
    //    libPath 来自 go:embed 释放或 YZMA_LIB 环境变量（见 §九平台支持）
    // 2. 拼接模型路径: modelDir + config.ModelFile
    // 3. 检查模型文件是否存在（不存在则触发下载流程，见 §7.3）
    // 4. 初始化 llama: llama.Init()
    // 5. 加载 GGUF 模型: llama.ModelLoadFromFile(...)
    // 6. 创建推理上下文: llama.InitFromModel(...)，设置 n_gpu_layers
    // 7. 返回就绪的 Provider
}

func (p *LocalProvider) Name() string       { return "本地模型" }
func (p *LocalProvider) Type() ProviderType { return ProviderLocal }
func (p *LocalProvider) IsReady() bool      { /* 模型已加载 */ }

func (p *LocalProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
    // 1. 用 yzma 的 chat template（pkg/template，内置 qwen2.5-instruct.jinja）
    //    拼接 system + user messages
    // 2. 设置推理参数（temperature, max_tokens, context_size）
    // 3. 批量推理 + 采样循环
    // 4. 收集输出 token → 拼接为字符串
    // 5. 返回 ChatResponse
}

func (p *LocalProvider) ChatStream(ctx context.Context, req *ChatRequest) (<-chan ChatChunk, error) {
    // 1. 构造 prompt（同 Chat）
    // 2. 启动 goroutine 逐 token 推理
    // 3. 每个 token 写入 channel
    // 4. 推理结束写入 Done=true 并关闭 channel
    // 注意：调用方（manager）负责把这个 channel 接到 stream.go 的 EventsEmit 适配层
}

func (p *LocalProvider) Close() error {
    // 释放 llama.cpp 资源
}
```

### 2.6 云端 Provider（后期支持，预留）

```go
// openai.go — OpenAI 兼容 API Provider
// 支持 OpenAI / DeepSeek / 通义千问等兼容接口

type OpenAIConfig struct {
    BaseURL     string  `json:"baseUrl"`     // 默认 https://api.openai.com/v1
    APIKey      string  `json:"apiKey"`      // 加密存储，复用 security.go 的 AES-256-GCM
    Model       string  `json:"model"`       // 默认 gpt-4o-mini
    MaxTokens   int     `json:"maxTokens"`
    Temperature float64 `json:"temperature"`
}

type OpenAIProvider struct {
    config OpenAIConfig
    client *http.Client
}
```

> **安全要求**：API Key 必须复用 `backend/security.go` 的 AES-256-GCM 加密后存入 `ai_config` 表，前端不持有明文。与现有连接密码的存储方式一致。

### 2.7 Task 系统

```go
package ai

// TaskID 任务标识
type TaskID string

const (
    TaskSQLConvert   TaskID = "sql-convert"    // SQL 方言转换
    TaskSQLExplain   TaskID = "sql-explain"    // SQL 解释
    TaskSQLOptimize  TaskID = "sql-optimize"   // SQL 优化建议
    TaskSQLGenerate  TaskID = "sql-generate"   // 自然语言 → SQL
    TaskDDLGenerate  TaskID = "ddl-generate"   // DDL 生成
    TaskDataAnalyze  TaskID = "data-analyze"   // 数据分析
)

// TaskCategory 任务分类
type TaskCategory string

const (
    CategorySQL    TaskCategory = "sql"
    CategorySchema TaskCategory = "schema"
    CategoryData   TaskCategory = "data"
)

// Task AI 任务定义
type Task struct {
    ID            TaskID
    Name          string
    Description   string
    Category      TaskCategory
    BuildPrompt   func(req TaskRequest) []ChatMessage                  // 构造 prompt
    ExtractResult func(resp string) interface{}                        // 解析 LLM 输出
}

// TaskRequest AI 任务请求
type TaskRequest struct {
    TaskID        TaskID            `json:"taskId"`
    SourceDialect string            `json:"sourceDialect,omitempty"`
    TargetDialect string            `json:"targetDialect,omitempty"`
    SQL           string            `json:"sql,omitempty"`
    DatabaseType  string            `json:"databaseType,omitempty"`
    TableInfo     string            `json:"tableInfo,omitempty"`     // 表结构信息
    Context       map[string]string `json:"context,omitempty"`       // 附加上下文
    RequestID     string            `json:"requestId,omitempty"`     // 流式调用时由前端生成，用于事件路由
}

// TaskResponse AI 任务响应
type TaskResponse struct {
    TaskID   TaskID      `json:"taskId"`
    Result   interface{} `json:"result"`
    Provider string      `json:"provider"`
    Tokens   int         `json:"tokens"`
}

// 全局任务注册表
var taskRegistry = map[TaskID]*Task{}

func RegisterTask(t *Task)  { taskRegistry[t.ID] = t }
func GetTask(id TaskID) *Task { return taskRegistry[id] }
func ListTasks() []*Task     { /* 返回所有 */ }
```

### 2.8 Prompt 模板

```go
package ai

import (
    "bytes"
    "text/template"
)

// PromptTemplate Prompt 模板
type PromptTemplate struct {
    System string             // 系统 prompt
    User   string             // 用户 prompt（支持 Go 模板语法）
    tpl    *template.Template // 编译后的模板
}

// Render 渲染模板
func (pt *PromptTemplate) Render(data map[string]string) (string, error) {
    var buf bytes.Buffer
    if err := pt.tpl.Execute(&buf, data); err != nil {
        return "", err
    }
    return buf.String(), nil
}

// 各任务 Prompt 模板
var promptTemplates = map[TaskID]*PromptTemplate{
    TaskSQLConvert: {
        System: `你是一个 SQL 方言转换专家。将用户提供的 SQL 从源数据库方言转换为目标数据库方言。
规则：
- 保持业务逻辑完全等价
- 使用目标方言的标准语法、标识符引号、内置函数
- 分页、类型转换、字符串操作等使用目标方言的等价写法
- 只输出转换后的 SQL，不要解释`,
        User: `将以下 {{.SourceDialect}} SQL 转换为 {{.TargetDialect}} SQL：

{{.SQL}}`,
    },
    TaskSQLExplain: {
        System: `你是一个 SQL 专家。用简洁的中文解释 SQL 语句的含义和执行逻辑。
按以下结构输出：
1. 这条 SQL 做了什么（一句话概括）
2. 涉及哪些表和字段
3. 关键逻辑说明（JOIN、子查询、聚合等）
4. 性能注意事项（如有）`,
        User: `解释以下 {{.DatabaseType}} SQL：

{{.SQL}}`,
    },
    TaskSQLOptimize: {
        System: `你是一个 SQL 性能优化专家。分析 SQL 语句并给出优化建议。
输出格式：
1. 问题分析（发现的性能问题）
2. 优化建议（具体的改写方案）
3. 优化后的 SQL
4. 建议添加的索引`,
        User: `优化以下 {{.DatabaseType}} SQL：
{{if .TableInfo}}表结构信息：
{{.TableInfo}}
{{end}}
原始 SQL：
{{.SQL}}`,
    },
    TaskSQLGenerate: {
        System: `你是一个 SQL 专家。根据用户的自然语言描述生成 SQL 语句。
规则：
- 使用 {{.DatabaseType}} 方言
- 生成可直接执行的 SQL
- 如果表结构信息可用，基于实际表结构生成
- 只输出 SQL，不要解释`,
        User: `{{if .TableInfo}}表结构信息：
{{.TableInfo}}
{{end}}
需求：{{.SQL}}`,
    },
}
```

### 2.9 模型管理

```go
package ai

// ModelInfo 预置模型信息
type ModelInfo struct {
    ID          string   `json:"id"`
    Name        string   `json:"name"`
    Size        string   `json:"size"`        // 文件大小（显示用）
    SizeBytes   int64    `json:"-"`           // 实际字节数
    Mirrors     []Mirror `json:"mirrors"`     // 多镜像源（国内优先 ModelScope）
    SHA256      string   `json:"sha256"`      // 校验值
    Tasks       []string `json:"tasks"`       // 支持的任务列表
    MinRAM      int      `json:"minRam"`      // 最低内存要求(MB)
    Description string   `json:"description"`
}

// Mirror 单个下载镜像源
type Mirror struct {
    URL    string `json:"url"`
    Region string `json:"region"`  // "cn" / "global"，用于自动选最快的源
    Name   string `json:"name"`    // 显示名："魔搭社区" / "HuggingFace"
}

// 预置模型列表 — v2.0 升级到 3B（见 §八论证）
var BuiltinModels = []ModelInfo{
    {
        ID:        "qwen2.5-coder-3b-instruct",
        Name:      "Qwen2.5 Coder 3B",
        Size:      "1.96 GB",
        SizeBytes: 2007 * 1024 * 1024,  // 实测 2007.4 MB (Q4_K_M)，官方仓库核实
        // 镜像源顺序 = 优先级。国内用户 ModelScope 速度快 10-50 倍（无需翻墙）。
        // 下载逻辑（见 ModelManager.DownloadModel）：按顺序尝试，首个成功即用。
        Mirrors: []Mirror{
            {
                // 魔搭社区（阿里官方）— Qwen 是阿里模型，首发且同步最新
                URL:    "https://modelscope.cn/models/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/master/qwen2.5-coder-3b-instruct-q4_k_m.gguf",
                Region: "cn",
                Name:   "魔搭社区",
            },
            {
                // HuggingFace 备用（国际用户，或 ModelScope 不可用时）
                URL:    "https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf",
                Region: "global",
                Name:   "HuggingFace",
            },
        },
        SHA256:    "",  // TODO: 发布前用 sha256sum 算出并填入（两边镜像文件应一致）
        Tasks:     []string{"sql-convert", "sql-explain", "sql-generate", "sql-optimize"},
        MinRAM:    4096,  // 3B 模型 + 推理开销，建议 4GB 可用内存
        Description: "通义千问代码模型，3B 参数，SQL 转换/生成能力强，中文友好。Metal GPU 加速下 M2/M3 约 37-42 tokens/s",
    },
}

// ModelManager 模型生命周期管理
type ModelManager struct {
    modelDir string          // 模型存储目录
    models   []ModelInfo     // 预置模型列表
}

func NewModelManager(modelDir string) *ModelManager

func (mm *ModelManager) ListBuiltin() []ModelInfo
func (mm *ModelManager) ListDownloaded() []ModelInfo
func (mm *ModelManager) GetModelPath(modelID string) (string, error)
func (mm *ModelManager) IsDownloaded(modelID string) bool

// DownloadModel 下载模型（多源 + 进度 + 校验）
//
// 下载策略（按 ModelInfo.Mirrors 顺序）：
//  1. 按镜像源优先级顺序尝试（ModelScope 优先，国内速度快 10-50 倍）
//  2. 单个源失败（超时/404/网络中断）自动切下一个源
//  3. 支持断点续传（Range header），切源时复用已下载部分（要求两源同 SHA256）
//  4. 下载完成后 SHA256 校验，失败则删除重下
//
// 进度通过 runtime.EventsEmit("ai-download-progress", {modelId, downloaded, total, source}) 推给前端
func (mm *ModelManager) DownloadModel(ctx context.Context, modelID string) error

// SelectFastestMirror 测速选最快的镜像源（可选优化）
// 启动下载前对每个 mirror 发 HEAD 请求测 RTT，选最快的；默认直接用第一个（ModelScope）
func (mm *ModelManager) SelectFastestMirror(modelID string) (Mirror, error)

func (mm *ModelManager) DeleteModel(modelID string) error
func (mm *ModelManager) VerifyModel(modelID string) error  // SHA256 校验
```

### 2.10 数据库存储

`localdb/migrations.go` 新增：

```sql
-- AI 配置（键值对）
-- 注意：敏感值（如云端 API Key）必须经 security.go AES-256-GCM 加密后存储
CREATE TABLE IF NOT EXISTS ai_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL  -- 敏感值为密文
);
```

> **v2.0 变更**：砍掉了 `ai_usage` 表（v1.0 用于计费统计，不做付费层后不需要）。

`localdb/repository.go` 新增：

```go
// AIConfigRepository AI 配置仓库
type AIConfigRepository struct { db *sql.DB }
func (r *AIConfigRepository) Get(key string) (string, error)
func (r *AIConfigRepository) Set(key, value string) error
func (r *AIConfigRepository) Delete(key string) error
func (r *AIConfigRepository) GetAll() (map[string]string, error)
```

> **加密规范**：`api_key`、`license_key` 等敏感 key 的 value 必须先经 `security.Encrypt()` 加密。非敏感配置（如 `active_provider`、`model_id`、`temperature`）可明文。

---

## 三、前端架构

### 3.1 AI Store

**文件**: `frontend/src/stores/aiStore.ts`

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface LocalModelState {
  modelId: string           // 当前选中的模型 ID
  downloading: boolean      // 是否正在下载
  downloadProgress: number  // 下载进度 0-100
  ready: boolean            // 模型是否已加载就绪
}

interface CloudConfig {
  provider: 'openai' | 'anthropic'
  endpoint: string
  model: string
  // 注意：apiKey 不存 localStorage，走后端加密存储
}

interface AIState {
  // 全局
  enabled: boolean
  activeProvider: 'local' | 'cloud'  // 用户选择的活跃 Provider

  // 本地模型
  localModel: LocalModelState

  // 云端配置（仅非敏感字段，apiKey 在后端）
  cloudConfig: CloudConfig

  // Actions
  checkStatus: () => Promise<void>
  setEnabled: (enabled: boolean) => void
  downloadModel: (modelId: string) => Promise<void>
  deleteModel: (modelId: string) => Promise<void>
  selectModel: (modelId: string) => void
  setActiveProvider: (provider: 'local' | 'cloud') => void
  updateCloudConfig: (config: Partial<CloudConfig>) => void
  testCloudConnection: () => Promise<boolean>
}

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      enabled: false,
      activeProvider: 'local',
      localModel: {
        modelId: 'qwen2.5-coder-3b-instruct',
        downloading: false,
        downloadProgress: 0,
        ready: false,
      },
      cloudConfig: {
        provider: 'openai',
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      },

      checkStatus: async () => { /* 调用后端 GetAIStatus */ },
      setEnabled: (enabled) => set({ enabled }),
      downloadModel: async (modelId) => { /* 调用后端，监听 ai-download-progress 事件 */ },
      deleteModel: async (modelId) => { /* 调用后端 DeleteAIModel */ },
      selectModel: (modelId) => set((s) => ({ localModel: { ...s.localModel, modelId } })),
      setActiveProvider: (provider) => set({ activeProvider: provider }),
      updateCloudConfig: (config) => set((s) => ({ cloudConfig: { ...s.cloudConfig, ...config } })),
      testCloudConnection: async () => { /* 调用后端 TestAIConnection */ },
    }),
    { name: 'idblink-ai' }
  )
)
```

> **v2.0 安全变更**：
> - 砍掉 `tier`、`licenseKey`（不做付费层）
> - **`cloudConfig.apiKey` 不进 localStorage**——前端不持有明文密钥。apiKey 通过独立的后端加密接口管理，使用时由后端解密注入 Provider。与现有连接密码的存储方式一致。
> - 砍掉 `providerReady`/`providerType`，合并为 `activeProvider` + `localModel.ready`

### 3.2 AI Service

**文件**: `frontend/src/services/aiService.ts`

```typescript
import { EventsOn } from '../../wailsjs/runtime/runtime'

export interface TaskRequest {
  taskId: string
  sourceDialect?: string
  targetDialect?: string
  sql?: string
  databaseType?: string
  tableInfo?: string
  context?: Record<string, string>
}

export interface TaskResponse {
  taskId: string
  result: any
  provider: string
  tokens: number
}

class AIService {
  async executeTask(request: TaskRequest): Promise<TaskResponse> {
    // 1. 检查 AI 是否启用 + Provider 是否就绪
    // 2. 调用后端 ExecuteAITask（同步）
    // 3. 返回结果
  }

  // 流式执行 — 通过 Wails 事件接收 token
  async executeTaskStream(
    request: TaskRequest,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const requestID = crypto.randomUUID()
    let full = ''

    // 注册事件监听（事件名带 requestID 区分并发请求）
    const off = EventsOn(`ai-stream-${requestID}`, (payload: { content?: string; done: boolean }) => {
      if (payload.done) {
        off()
        return
      }
      if (payload.content) {
        full += payload.content
        onChunk(payload.content)
      }
    })

    // 发起后端流式调用
    await api.executeAITaskStream({ ...request, requestID })
    return full
  }

  async getStatus(): Promise<{
    enabled: boolean
    activeProvider: string
    localModelReady: boolean
  }>
}

export const aiService = new AIService()
```

### 3.3 SettingsDialog AI Tab

```
┌─────────────────────────────────────────────────────────┐
│  AI 助手设置                                              │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ◉ 启用 AI 功能                                           │
│                                                           │
│  ┌─ Provider 选择 ────────────────────────────────────┐  │
│  │  ◉ 本地模型（离线可用）                              │  │
│  │  ○ 云端 API（后期支持，需联网）                      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─ 本地模型 ─────────────────────────────────────────┐  │
│  │  模型: [Qwen2.5 Coder 3B ▾]                        │  │
│  │  说明: 通义千问代码模型，3B，SQL 转换/生成能力强     │  │
│  │  大小: 1.96 GB | 状态: ● 已就绪 / ○ 未下载          │  │
│  │  GPU 加速: [✓] Metal（检测到 Apple Silicon）        │  │
│  │  [下载模型]  [删除模型]                              │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─ 云端配置（后期） ─────────────────────────────────┐  │
│  │  提供者: [OpenAI ▾]                                 │  │
│  │  API Key: [••••••••••••] [显示] [保存到加密存储]     │  │
│  │  端点: [https://api.openai.com/v1       ]           │  │
│  │  模型: [gpt-4o-mini                     ]           │  │
│  │  [测试连接]                                          │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 四、SQL 方言转换功能（部分已实现）

> **现状核实**（2026-07-03）：以下功能**已经实现**且有测试覆盖，不再是设计阶段：
> - ✅ `frontend/src/utils/sqlDialects/detectDialect.ts` — 方言检测引擎（已实现）
> - ✅ `frontend/src/utils/sqlDialects/convertRules.ts` — 17 条转换规则（已实现）
> - ✅ `frontend/src/components/SqlDialectBanner.tsx` — Banner 组件（已实现）
> - ✅ `frontend/src/__tests__/unit/detectDialect.test.ts` — 检测测试（16 个）
> - ✅ `frontend/src/__tests__/unit/convertRules.test.ts` — 规则测试（23 个）
>
> 本节保留作为设计参考和后续 AI 集成的接口规范。

### 4.1 方言检测引擎（已实现）

**文件**: `frontend/src/utils/sqlDialects/detectDialect.ts`（已存在）

#### 检测策略（多特征加权打分）

| 特征 | 指向方言 | 权重 |
|------|----------|------|
| `` `table` `` 反引号 | MySQL/MariaDB | high(3) |
| `LIMIT x OFFSET y` (无 FETCH) | MySQL/PG/SQLite | high(3) |
| `TOP n` in SELECT | SQL Server | high(3) |
| `ROWNUM` | Oracle/达梦 | high(3) |
| `IFNULL()` | MySQL/SQLite | medium(2) |
| `NVL()` | Oracle/达梦 | medium(2) |
| `ISNULL()` | SQL Server | medium(2) |
| `AUTO_INCREMENT` | MySQL | high(3) |
| `SERIAL` / `BIGSERIAL` | PostgreSQL | high(3) |
| `IDENTITY(1,1)` | SQL Server | high(3) |
| `GENERATED ALWAYS AS IDENTITY` | Oracle/PG | medium(2) |
| `ENGINE=InnoDB` | MySQL | high(3) |
| `NVARCHAR` / `NVARCHAR2` | SQL Server/Oracle | medium(2) |
| `::type` 类型转换 | PostgreSQL | high(3) |
| `GETDATE()` | SQL Server | high(3) |
| `SYSDATE` | Oracle/达梦 | high(3) |
| `NOW()` | MySQL/PG | medium(2) |
| `\|\|` 字符串连接 | PG/Oracle/SQLite | medium(2) |
| `CONCAT()` | MySQL/SQL Server | medium(2) |
| `GO` 语句分隔符 | SQL Server | high(3) |
| `$$` 函数体 | PostgreSQL | high(3) |
| `USING` 子句 (DELETE) | PostgreSQL | medium(2) |

#### 返回类型（已实现）

```typescript
interface DialectDetection {
  dialect: DatabaseType       // 识别出的源方言
  confidence: number          // 0-1 归一化置信度
  matchedFeatures: string[]   // 匹配到的特征列表
}

function detectSqlDialect(sql: string): DialectDetection | null
// 置信度 >= 0.6 时返回结果，否则返回 null（已实现）
```

### 4.2 规则转换引擎（已实现，17 条）

**文件**: `frontend/src/utils/sqlDialects/convertRules.ts`（已存在，17 条规则全部实现）

| # | ID | 规则名 | 源 → 目标 | 转换逻辑 |
|---|----|--------|-----------|----------|
| 1 | `backtick-to-dquote` | 反引号→双引号 | MySQL/Maria → PG/Oracle/达梦/人大金仓/瀚高/VastBase | `` `col` `` → `"col"` |
| 2 | `dquote-to-backtick` | 双引号→反引号 | PG/Oracle/达梦 → MySQL/MariaDB | `"col"` → `` `col` `` |
| 3 | `bracket-to-backtick` | 方括号→反引号 | SQL Server → MySQL/MariaDB | `[col]` → `` `col` `` |
| 4 | `bracket-to-dquote` | 方括号→双引号 | SQL Server → PG/Oracle/达梦 | `[col]` → `"col"` |
| 5 | `limit-to-fetch` | LIMIT→FETCH | MySQL/PG/SQLite → Oracle/达梦/SQL Server | `LIMIT n OFFSET m` → `OFFSET m ROWS FETCH NEXT n ROWS ONLY` |
| 6 | `rownum-to-limit` | ROWNUM→LIMIT | Oracle/达梦 → MySQL/PG/SQLite | `WHERE ROWNUM <= n` → `LIMIT n` |
| 7 | `fetch-to-limit` | FETCH→LIMIT | Oracle/SQL Server → MySQL/PG/SQLite | `OFFSET m ROWS FETCH NEXT n ROWS ONLY` → `LIMIT n OFFSET m` |
| 8 | `concat-to-pipe` | CONCAT→\|\| | MySQL/SQL Server → PG/Oracle/SQLite | `CONCAT(a, b)` → `a \|\| b` |
| 9 | `pipe-to-concat` | \|\|→CONCAT | PG/Oracle/SQLite → MySQL/SQL Server | `a \|\| b` → `CONCAT(a, b)` |
| 10 | `ifnull-to-coalesce` | IFNULL→COALESCE | MySQL/SQLite → 其他 | `IFNULL(x, y)` → `COALESCE(x, y)` |
| 11 | `isnull-to-coalesce` | ISNULL→COALESCE | SQL Server → 其他 | `ISNULL(x, y)` → `COALESCE(x, y)` |
| 12 | `nvl-to-coalesce` | NVL→COALESCE | Oracle/达梦 → 其他 | `NVL(x, y)` → `COALESCE(x, y)` |
| 13 | `auto-inc-to-identity` | AUTO_INCREMENT→IDENTITY | MySQL → PG | `AUTO_INCREMENT` → `GENERATED ALWAYS AS IDENTITY` |
| 14 | `hash-to-line-comment` | #注释→--注释 | MySQL → 其他 | `# comment` → `-- comment` |
| 15 | `getdate-to-now` | GETDATE→NOW() | SQL Server → MySQL/PG | `GETDATE()` → `NOW()` |
| 16 | `sysdate-to-now` | SYSDATE→NOW() | Oracle/达梦 → MySQL/PG | `SYSDATE` → `NOW()` |
| 17 | `now-to-target` | NOW()→目标函数 | MySQL/PG → Oracle/达梦/SQL Server | `NOW()` → `SYSDATE`(Oracle/达梦) / `GETDATE()`(SQL Server) |

#### 待补充规则（P1，后续迭代）

| # | 规则名 | 说明 |
|---|--------|------|
| 18 | 数据类型映射 | `TINYINT`→`SMALLINT`, `DATETIME`→`TIMESTAMP`, `TEXT`→`CLOB` 等 |
| 19 | IF→CASE | MySQL `IF(cond, a, b)` → `CASE WHEN cond THEN a ELSE b END` |
| 20 | GROUP_CONCAT→STRING_AGG | MySQL → PG |
| 21 | INSERT IGNORE→ON CONFLICT | MySQL → PG |
| 22 | REPLACE INTO→ON CONFLICT | MySQL → PG |
| 23 | SHOW TABLES→信息模式 | MySQL → PG/Oracle |
| 24 | DESCRIBE→信息模式 | MySQL → PG/Oracle |

### 4.3 Banner 组件（已实现）

**文件**: `frontend/src/components/SqlDialectBanner.tsx`（已存在，4227 字节）

当前 Banner 提供「快速转换」（规则引擎）按钮。**AI 集成待做**：在 Banner 增加「AI 转换」按钮，调用 `aiService.executeTaskStream`。

**改造点**：

```tsx
// 现有 props（已实现）
interface SqlDialectBannerProps {
  sourceDialect: DatabaseType
  targetDialect: DatabaseType
  confidence: number
  matchedFeatures: string[]
  onQuickConvert: () => void    // 规则引擎（已实现）
  onAIConvert: () => void       // AI 增强（待实现）
  onDismiss: () => void
}
```

**UI 效果**（现有基础上增加 AI 按钮）：

```
┌──────────────────────────────────────────────────────────────────┐
│  ⚠ 检测到 MySQL 语法（反引号、LIMIT、AUTO_INCREMENT），             │
│    当前连接为达梦数据库                                             │
│                                                                   │
│  [快速转换(规则)]  [AI 转换(更智能)]  [忽略]                       │
│                                                                   │
│  快速转换覆盖常见语法差异（即时）；AI 转换可处理复杂 SQL（流式输出）  │
└──────────────────────────────────────────────────────────────────┘
```

**AI 转换逻辑**（待实现）：
1. 检查 `aiStore.enabled` + `localModel.ready`，否则提示下载模型
2. 调用 `aiService.executeTaskStream({ taskId: 'sql-convert', sql, sourceDialect, targetDialect }, onChunk)`
3. 流式替换编辑器内容（打字机效果）
4. 完成后提示用户 review（AI 结果不保证 100% 正确）

### 4.4 集成到 SQLEditor

**文件**: `frontend/src/components/SQLEditor.tsx`

Banner 已集成。AI 按钮的 handler 待实现：

```typescript
const handleAIConvert = useCallback(async () => {
  if (!aiStore.enabled || !aiStore.localModel.ready) {
    message.warning('请先在设置中下载 AI 模型');
    return;
  }
  setAiConverting(true);
  try {
    const converted = await aiService.executeTaskStream(
      {
        taskId: 'sql-convert',
        sql,
        sourceDialect: dialectMismatch.dialect,
        targetDialect: dbType,
      },
      (chunk) => {
        // 流式更新编辑器内容（打字机效果）
        setSql(prev => prev + chunk);
      }
    );
    setSql(converted);
    message.success(`SQL 已用 AI 转换为 ${dbType} 语法，请检查`);
  } finally {
    setAiConverting(false);
  }
}, [sql, dbType, dialectMismatch, aiStore.enabled, aiStore.localModel.ready]);
```

---

## 五、Wails 绑定方法

在 `backend/app_ai.go`（新建，按现有 `app_*.go` 拆分模式）新增方法：

```go
package backend

// --- AI 管理 ---

// GetAIStatus 获取 AI 子系统状态
func (a *App) GetAIStatus() (AIStatusResponse, error)

// SetAIEnabled 启用/禁用 AI
func (a *App) SetAIEnabled(enabled bool) error

// --- 模型管理 ---

// ListAIModels 列出可用模型（预置 + 已下载）
func (a *App) ListAIModels() (AIModelsResponse, error)

// DownloadAIModel 下载模型（进度通过 EventsEmit 推送）
func (a *App) DownloadAIModel(modelID string) error

// DeleteAIModel 删除模型
func (a *App) DeleteAIModel(modelID string) error

// --- 任务执行 ---

// ExecuteAITask 执行 AI 任务（同步）
func (a *App) ExecuteAITask(req AITaskRequest) (AITaskResponse, error)

// ExecuteAITaskStream 执行 AI 任务（流式）
// 启动 goroutine 推 ai-stream-<requestID> 事件，立即返回
func (a *App) ExecuteAITaskStream(req AITaskRequest) error

// --- 云端配置（后期） ---

// TestAIConnection 测试云端 Provider 连接
func (a *App) TestAIConnection(config AICloudConfigRequest) (AIConnectionTestResponse, error)

// SaveAICloudConfig 保存云端 Provider 配置（API Key 加密存储）
func (a *App) SaveAICloudConfig(config AICloudConfigRequest) error

// GetAICloudConfig 获取云端 Provider 配置（API Key 以掩码返回）
func (a *App) GetAICloudConfig() (AICloudConfigResponse, error)
```

---

## 六、文件清单

### 新建文件

| 文件 | 用途 | 状态 |
|------|------|------|
| `backend/ai/provider.go` | Provider 接口 + ChatRequest/Response 类型 | 待实现 |
| `backend/ai/manager.go` | ProviderManager | 待实现 |
| `backend/ai/local.go` | LocalProvider（yzma/llama.cpp） | 待实现 |
| `backend/ai/stream.go` | 流式适配层（channel → EventsEmit） | 待实现 |
| `backend/ai/model.go` | ModelManager + 模型信息 | 待实现 |
| `backend/ai/task.go` | Task 注册表 | 待实现 |
| `backend/ai/prompt.go` | Prompt 模板管理 | 待实现 |
| `backend/ai/openai.go` | OpenAI Provider（后期支持） | 预留 |
| `backend/ai/anthropic.go` | Anthropic Provider（后期支持） | 预留 |
| `backend/app_ai.go` | App 的 AI 绑定方法（按 app_*.go 模式） | 待实现 |
| `frontend/src/stores/aiStore.ts` | AI 状态管理 | 待实现 |
| `frontend/src/services/aiService.ts` | AI 任务调用服务 | 待实现 |

### 已存在文件（无需新建）

| 文件 | 说明 |
|------|------|
| `frontend/src/utils/sqlDialects/detectDialect.ts` | 方言检测（已实现） |
| `frontend/src/utils/sqlDialects/convertRules.ts` | 17 条规则转换（已实现） |
| `frontend/src/components/SqlDialectBanner.tsx` | Banner 组件（已实现，待加 AI 按钮） |

### 修改文件

| 文件 | 改动 |
|------|------|
| `backend/app.go` | App 结构体新增 `aiManager *ai.ProviderManager`、`modelManager *ai.ModelManager` 字段（参考 dbManager/tunnel 的延迟初始化模式） |
| `backend/localdb/migrations.go` | 新增 `ai_config` 表 |
| `backend/localdb/repository.go` | 新增 AIConfigRepository |
| `frontend/src/components/SQLEditor.tsx` | Banner 增加 AI 转换按钮 + handler |
| `frontend/src/components/SettingsDialog.tsx` | 新增 AI Tab |
| `frontend/src/api/index.ts` | AI API 封装 |
| `go.mod` | 添加 yzma 依赖 |

---

## 七、实现顺序

| Phase | 内容 | 依赖 | 交付物 | 状态 |
|-------|------|------|--------|------|
| **0** | **可行性验证 demo** | 无 | `backend/ai/poc/main.go`（50 行），实测速度/质量/集成 | 🔜 **下一步（关键）** |
| **1** | 方言检测引擎 | 无 | detectDialect.ts + 测试 | ✅ 已完成 |
| **2** | 规则转换引擎 | Phase 1 | convertRules.ts + 测试 | ✅ 已完成 |
| **3** | Banner 组件 | Phase 1, 2 | SqlDialectBanner.tsx | ✅ 已完成 |
| **4** | AI 后端骨架 | Phase 0 ✅ | provider.go / manager.go / task.go / prompt.go / stream.go | 待 Phase 0 通过 |
| **5** | 本地模型 Provider | Phase 4 | local.go / model.go + yzma 集成 | 待 |
| **6** | AI 数据库存储 | Phase 4 | migrations + repository | 待 |
| **7** | 前端 AI Store | Phase 4 | aiStore.ts | 待 |
| **8** | SettingsDialog AI Tab | Phase 7 | SettingsDialog 修改 | 待 |
| **9** | 前端 AI Service | Phase 4, 7 | aiService.ts + api/index.ts | 待 |
| **10** | SQLEditor AI 集成 | Phase 3, 9 | Banner "AI 转换" → 流式 → 编辑器 | 待 |
| **11** | SQL 转换 Task | Phase 5, 9 | task.go 注册 TaskSQLConvert | 待 |
| **12** | 云端 Provider | Phase 4 | openai.go / anthropic.go | 后期 |

> **Phase 0 是硬门槛**：demo 跑不通就不进 Phase 4。详见 §十一。

---

## 八、模型选型论证

### v1.0 → v2.0 变更：1.5B → 3B

| 维度 | 1.5B (v1.0) | **3B (v2.0)** | 论证 |
|------|------------|--------------|------|
| Q4_K_M 体积 | ~1.0 GB | **~1.96 GB** | +0.9GB 可接受（运行时下载，非安装包内置）|
| M2/M3 解码速度 | ~40 tok/s | **~37-42 tok/s** | 几乎不降（Metal GPU 加速）|
| 生成一条 SQL（~100 tok）| ~2.5s | **~2.5-3s** | 仍可接受 |
| 内存占用 | ~2 GB | **~3 GB** | 8GB 机器可用 |
| **SQL 能力** | 一般（简单 CRUD 可以，复杂 JOIN 易错）| **强**（专门训练，能处理 JOIN/窗口函数） | **3B 是「可用下限」的社区共识** |

**数据来源**：
- [WillItRunAI benchmark](https://willitrunai.com) — M2 Max 42 tok/s, M3 37 tok/s
- [HuggingFace Qwen2.5-Coder-3B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF) — Q4_K_M 1.96GB（实测 2007.4 MB）
- [ModelScope Qwen2.5-Coder-3B-Instruct-GGUF](https://modelscope.cn/models/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF) — 阿里魔搭社区（国内首选，Qwen 是阿里模型）
- [SLM-SQL 论文](https://arxiv.org/html/2507.22478v1) — 小模型 SQL 能力研究，3B 是性价比拐点
- [Tinybird 19 LLM SQL benchmark](https://www.tinybird.co/blog/which-llm-writes-the-best-sql) — SQL 质量对比

### 为什么不上 7B？

7B 模型 SQL 能力更强，但：
- 体积 ~4-5 GB（下载时间长）
- 内存 ~6-8 GB（低端机器吃力）
- CPU 推理速度掉到 ~10-15 tok/s（无 GPU 时体验差）
- **策略**：先上 3B 作为默认，后续支持用户自选更大模型（模型管理器已设计为可扩展）

### 模型能力天花板（诚实告知）

即使是 3B + 专门训练，本地模型对以下场景力不从心：

| 场景 | 3B 能力 | 备注 |
|------|--------|------|
| 简单 CRUD SQL 转换 | ✅ 好 | 反引号、LIMIT、类型映射等 |
| 方言函数替换 | ✅ 好 | IFNULL→COALESCE 等 |
| 复杂多表 JOIN 转换 | ⚠️ 一般 | 可能丢条件或改错语义 |
| 存储过程转换 | ❌ 差 | 3B 记不住 PL/SQL ↔ T-SQL 的复杂映射 |
| 自然语言→复杂 SQL | ⚠️ 一般 | 简单查询可以，复杂分析查询容易错 |

**这就是规则引擎的价值**：高频简单转换用规则（确定性、100% 正确），复杂场景才调 AI，且 AI 结果要让用户 review。

---

## 九、安装包体积与平台支持

### 9.1 体积分析

> **v2.0 修正**：v1.0 说「+20MB」是错的。实际每个平台只内置 1 个动态库变体（策略 B，见 §9.3.4），体积按平台不同：macOS arm64 内置 Metal 版 ~25MB，Windows/Linux 内置 CPU 版 ~8-15MB。详细分平台数据见 §9.3.5。

当前安装包基线：**DMG 12 MB**。

| 策略 | 安装包增量 | 总大小 | 用户体验 | 推荐 |
|------|-----------|--------|----------|------|
| **A. 库 + 模型全内置** | +1.95 GB | ~2 GB | 开箱即用 | ❌ 安装包过大 |
| **B. 单变体库内置 + 模型运行时下载** | +8-25 MB | **~20-37 MB** | 首次使用 AI 时下载 1.96GB 模型；GPU 用户可选下载加速库变体 | ✅ **推荐** |
| **C. 全部运行时下载** | +0 MB | ~12 MB | 首次使用时下载库 + 模型 | ❌ 首次体验差 |

> **注意**：GGUF 模型文件（1.96 GB）跨平台通用，**所有平台下载同一个文件**（国内走魔搭社区，国际走 HuggingFace，见 §2.9 镜像源）。不同平台/硬件的差异完全体现在动态库变体上，详见 §9.3。

### 9.2 平台支持矩阵

| 平台 | 架构 | CPU 推理 | GPU 加速 | 动态库格式 | 状态 |
|------|------|----------|----------|-----------|------|
| macOS | arm64 (Apple Silicon) | ✅ | ✅ Metal（零额外体积）| `.dylib` | **最佳**（目标平台） |
| macOS | x86_64 (Intel) | ✅ | ❌ | `.dylib` | 支持，性能一般 |
| Windows | x64 | ✅ | ✅ CUDA 13 / Vulkan | `.dll` | 支持 |
| Windows | arm64 | ✅ | ❌ | `.dll` | 支持（仅 CPU） |
| Linux | x64 / arm64 | ✅ | ✅ CUDA / Vulkan / ROCm | `.so` | 支持 |

**yzma 跨平台核心优势**：
- **零 CGO**：通过 `purego` + `ffi` 加载动态库，不需要用户安装 C 编译器
- **预编译分发**：[llama-cpp-builder](https://github.com/hybridgroup/llama-cpp-builder) 提供各平台 × 处理器预编译动态库
- **跨编译友好**：与现有 Wails 构建流程完全兼容
- **活跃维护**：v1.18.0（2026-06-24），紧跟 llama.cpp 上游

### 9.3 动态库按硬件能力分发（关键设计）

> **核心原则**：GGUF 模型文件跨平台通用（一个文件走天下），但 **llama.cpp 动态库必须按"平台 + 架构 + GPU 后端"分发不同的预编译变体**——这是推理速度优化的主战场。不同变体内嵌了针对特定硬件的内核（Metal/CUDA/AVX2/NEON），运行时无法切换。

#### 9.3.1 为什么需要多个动态库变体

llama.cpp 在**编译动态库时**针对硬件绑定专用内核，性能差异由此产生（而非来自模型文件）：

| 硬件后端 | 优化机制 | 在哪个动态库变体里 |
|---------|---------|------------------|
| Apple Metal | Metal GPU + ARM NEON 指令 | `macos-arm64`（Metal 编译时链接）|
| NVIDIA CUDA | CUDA 后端 | `win-cuda-x64` / `ubuntu-cuda-x64` |
| Vulkan | 跨平台 GPU（AMD/Intel） | `vulkan-x64` |
| AMD ROCm | ROCm 后端 | `ubuntu-rocm-x64` |
| Intel/AMD CPU | AVX2 / AVX-512 指令集 | 各平台 CPU 变体 |
| ARM CPU | ARM NEON 指令 | `arm64` CPU 变体 |

**结论**：用户拿到匹配硬件的动态库变体，速度可能差 2-5 倍（GPU vs 纯 CPU）。分发流程必须做硬件能力检测。

#### 9.3.2 经核实的预编译变体清单

> 数据来源：[yzma `pkg/download/download.go` 源码](https://github.com/hybridgroup/yzma/blob/main/pkg/download/download.go) + [llama-cpp-builder releases](https://github.com/hybridgroup/llama-cpp-builder/releases)（2026-07-02 核实）

| 平台 | 架构 | 后端 | 文件名模式 | 体积 |
|------|------|------|-----------|------|
| macOS | arm64 | **Metal**（默认，含 CPU 回退） | `llama-{ver}-bin-macos-arm64.tar.gz` | ~25 MB |
| macOS | x64 | CPU | `llama-{ver}-bin-macos-x64.tar.gz` | ~15 MB |
| Windows | x64 | CPU | `llama-{ver}-bin-win-cpu-x64.zip` | ~15 MB |
| Windows | arm64 | CPU | `llama-{ver}-bin-win-cpu-arm64.zip` | ~12 MB |
| Windows | x64 | **CUDA 13.1**（需额外 cudart 包） | `llama-{ver}-bin-win-cuda-13.1-x64.zip` + `cudart-llama-bin-win-cuda-13.1-x64.zip` | ~25 MB + ~70 MB |
| Windows | x64 | Vulkan | `llama-{ver}-bin-win-vulkan-x64.zip` | ~22 MB |
| Linux | x64/arm64 | CPU | `llama-{ver}-bin-ubuntu-cpu-{arch}.tar.gz` | ~8 MB |
| Linux | x64/arm64 | CUDA 12/13 | `llama-{ver}-bin-ubuntu-cuda[-13]-{arch}.tar.gz` | ~48-89 MB |
| Linux | x64/arm64 | Vulkan | `llama-{ver}-bin-ubuntu-vulkan-{arch}.tar.gz` | ~22 MB |
| Linux | x64 | ROCm 7.2 | `llama-{ver}-bin-ubuntu-rocm-7.2-x64.tar.gz` | ~40 MB |

**重要约束**（源码核实）：
- macOS Metal **仅 arm64 可用**（x64 Mac 无 Metal 版，只能 CPU）
- Windows CUDA **仅 x64 可用**（arm64 Windows 无 CUDA/Vulkan 版）
- Windows CUDA 需**额外下载 cudart 包**（~70MB，随主包一起）

#### 9.3.3 运行时硬件检测逻辑

iDBLink 的模型管理器（`model.go`）在首次启动 AI 时执行硬件检测，选择最优动态库变体。检测逻辑参考 yzma `install` 命令的实现（已核实）：

```go
// backend/ai/model.go

// DetectLibVariant 检测当前硬件，返回应下载的动态库变体标识。
// 选择优先级：CUDA > Metal > ROCm > Vulkan > CPU
func DetectLibVariant() (osName, arch, backend string) {
    osName = runtime.GOOS       // darwin / windows / linux
    arch = runtime.GOARCH       // arm64 / amd64

    switch osName {
    case "darwin":
        // macOS: arm64 用 Metal（性能最佳），x64 只能 CPU
        if arch == "arm64" {
            backend = "metal"   // 下载 macos-arm64 包（含 Metal）
        } else {
            backend = "cpu"     // 下载 macos-x64 包
        }

    case "windows":
        // Windows: 优先检测 NVIDIA GPU
        if hasNvidiaGPU() {     // 检测 nvcuda.dll 或 nvidia-smi
            backend = "cuda"    // 下载 win-cuda-x64 + cudart 包
        } else if hasVulkanSupport() {  // 检测 Vulkan 驱动
            backend = "vulkan"
        } else {
            backend = "cpu"
        }

    case "linux":
        // Linux: 优先 CUDA/ROCm（NVIDIA/AMD），其次 Vulkan，最后 CPU
        if hasCUDA() {
            backend = "cuda"
        } else if hasROCm() {
            backend = "rocm"
        } else if hasVulkanSupport() {
            backend = "vulkan"
        } else {
            backend = "cpu"
        }
    }
    return
}

// hasNvidiaGPU 检测 NVIDIA GPU（Windows/Linux）
// 实现：尝试加载 nvcuda.dll（Win）或检查 /dev/nvidia*（Linux）或调用 nvidia-smi
func hasNvidiaGPU() bool { /* ... */ }
```

> **yzma 的检测机制**（参考 `cmd/install.go`）：`download.HasCUDA()` 检测 CUDA 运行时，`download.HasROCm()` 检测 ROCm。iDBLink 应直接复用这两个函数，而非自己重写检测逻辑。

#### 9.3.4 分发策略：go:embed 多变体内嵌 vs 运行时下载

两种策略，**推荐 B**：

| 策略 | 描述 | 安装包增量 | 优缺点 |
|------|------|-----------|--------|
| **A. 全变体内嵌** | 把所有平台的动态库都 go:embed 进安装包 | +250 MB（全部变体）| ❌ 体积爆炸，且用户只需其中 1 个 |
| **B. 运行时按需下载（推荐）** | 安装包只内置 1 个变体（构建目标平台的默认 CPU 版），首次启用 AI 时按硬件检测结果下载最优变体 | +8-15 MB（仅当前平台 CPU 版） | ✅ 体积可控；用户硬件升级后可重新下载 |
| C. 完全运行时下载 | 安装包不含任何动态库 | +0 MB | ❌ 首次体验差 |

**采用策略 B 的流程**：

```
构建时（CI/打包）:
├─ macOS arm64 构建 → 内嵌 macos-arm64（Metal）dylib
├─ Windows x64 构建 → 内嵌 win-cpu-x64 dll
└─ Linux x64 构建 → 内嵌 ubuntu-cpu-x64 so

用户首次启用 AI:
├─ 1. DetectLibVariant() 检测硬件
├─ 2. 若内嵌变体 == 最优变体 → 直接用内嵌的（零下载）
├─ 3. 若内嵌变体 ≠ 最优（如 Windows 用户有 NVIDIA，但内置是 CPU 版）
│    → 提示用户：「检测到 NVIDIA GPU，下载 CUDA 加速版可提升 3-5 倍速度」
│    → 用户确认后下载 cuda 变体（~25MB）+ cudart 包（~70MB）
└─ 4. 下载模型 GGUF（1.96GB，国内走魔搭社区优先，见 §2.9）
```

> **为什么 Windows CUDA 不内置**：CUDA 版 + cudart 包共 ~95MB，对无 NVIDIA 的 Windows 用户是纯浪费。且 CUDA 版依赖用户已装的 NVIDIA 驱动，并非所有 Windows 用户能用。所以 Windows 内置 CPU 版，有 NVIDIA 的用户按需升级。

#### 9.3.5 体积估算修正（基于核实数据）

| 平台 | 内置动态库 | 模型（运行时下载） | CUDA 升级包（可选） |
|------|-----------|------------------|------------------|
| macOS arm64 | ~25 MB（Metal 版） | 1.96 GB | — |
| Windows x64 | ~15 MB（CPU 版） | 1.96 GB | +95 MB（CUDA + cudart，可选） |
| Linux x64 | ~8 MB（CPU 版） | 1.96 GB | +48-89 MB（CUDA，可选） |

### 9.4 macOS 公证与签名

> 内嵌的未签名 dylib 会导致公证失败，必须显式处理。

**正确流程**（必须写进 `scripts/package.sh` / `.github/workflows/release.yml`）：

```bash
# 1. 把 dylib 放到 .app/Contents/Frameworks/
cp libllama.dylib build/bin/iDBLink.app/Contents/Frameworks/

# 2. 对 dylib 单独签名（hardened runtime，由内向外签）
codesign --force --options runtime --sign "Developer ID Application: XXX" \
  build/bin/iDBLink.app/Contents/Frameworks/libllama.dylib

# 3. 对主可执行文件签名
codesign --force --options runtime --sign "Developer ID Application: XXX" \
  build/bin/iDBLink.app/Contents/MacOS/iDBLink

# 4. 最后对整个 bundle 签名（--deep 不够，要显式层级）
codesign --force --options runtime --sign "Developer ID Application: XXX" \
  build/bin/iDBLink.app

# 5. 公证（dylib 随 bundle 一起提交）
xcrun notarytool submit build/bin/iDBLink.app.zip \
  --apple-id xxx --team-id xxx --wait
```

**关键点**：
- 签名顺序：**由内向外**（dylib → 可执行文件 → bundle）
- 必须启用 hardened runtime（`--options runtime`），否则公证被拒
- llama.cpp 的 dylib 不是 Apple 签名的，必须用自己的 Developer ID 重签

### 9.5 Windows 注意事项

| 项目 | 处理方式 |
|------|----------|
| `.dll` 内嵌到 Go 二进制 | 通过 `go:embed` 嵌入，运行时释放到临时目录加载 |
| 杀毒误报 | `.dll` + Go + purego 模式可能触发误报，需要代码签名证书 |
| CUDA 升级 | 检测到 NVIDIA GPU 时，引导用户下载 CUDA 变体（§9.3.4） |
| CUDA 依赖 | 用户需自装 NVIDIA 驱动；cudart 包随应用下载分发，不要求用户装 CUDA Toolkit |

### 9.6 风险评估（修正版）

| 风险 | 等级 | 应对措施 |
|------|------|----------|
| macOS 公证失败（dylib 未签名） | **高** | §9.4 显式签名流程；**Phase 0 demo 必须验证打包后能加载 dylib** |
| Windows 杀毒误报 | 中 | 代码签名证书 + 提交白名单 |
| 硬件检测误判（选错动态库变体） | 中 | 复用 yzma `download.HasCUDA/HasROCm`；失败时回退 CPU 版并提示用户手动选择 |
| CUDA 变体运行失败（驱动版本不匹配） | 中 | 加载失败时自动回退 CPU 版；记录错误日志供诊断 |
| yzma 社区规模（510 stars） | 低 | hybridgroup 是 Go 生态知名组织，底层 llama.cpp 极成熟 |
| 模型下载失败 | 中 | 多镜像源（魔搭社区优先 + HuggingFace 备用）+ 断点续传 + SHA256 校验 + 切源重试 |
| 推理内存不足 | 中 | 检测系统内存，不足时提示；模型可卸载释放内存 |
| 3B 模型 SQL 质量不达预期 | **中** | **Phase 0 用真实 SQL 测试**；不达标则考虑 7B 或限定任务范围 |
| 低端设备 CPU 推理慢 | 低 | Metal 加速是默认；CPU-only 设备提示性能预期 |

---

## 十、技术依赖

| 依赖 | 用途 | 引入时机 | 核实状态 |
|------|------|----------|----------|
| `github.com/hybridgroup/yzma` v1.18.0 | 本地 LLM 推理（purego + ffi，零 CGO） | Phase 0 | ✅ 核实：510★，活跃，Metal 支持，流式支持 |
| llama.cpp 预编译动态库 | 各平台推理引擎（mac ~25MB Metal / win ~15MB CPU / linux ~8MB CPU，按硬件选变体，见 §9.3） | Phase 0 | ✅ [llama-cpp-builder](https://github.com/hybridgroup/llama-cpp-builder) 提供 |
| GGUF 模型 (Qwen2.5-Coder-3B Q4_K_M, ~1.96GB) | 默认推理模型 | Phase 5（运行时下载） | ✅ [魔搭社区](https://modelscope.cn/models/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF)（国内优先）+ [HuggingFace](https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF)（国际备用）可下载 |

---

## 十一、Phase 0 可行性验证（关键，必须先做）

**在动完整架构前，先写最小 demo 验证三个核心假设**。这是硬门槛——demo 跑不通就不进 Phase 4。

### 目标

```
backend/ai/poc/
└── main.go  (~50 行)
```

验证三个问题：

| # | 假设 | 验证方式 | 通过标准 |
|---|------|---------|---------|
| 1 | **速度**：3B 模型在目标硬件上够快 | yzma 加载 qwen2.5-coder-3b Q4_K_M，实测 tok/s | M2/M3 ≥ 25 tok/s（Metal 加速）|
| 2 | **质量**：3B 模型 SQL 转换够准 | 跑 5 条真实 SQL（MySQL→达梦），人工评估 | ≥ 4/5 正确，无语义错误 |
| 3 | **集成**：Wails 打包后能加载 dylib | demo 打成 .app，签名后能运行 | 能加载 dylib 并推理 |

### 为什么必须先做

- 如果 M2 上 3B 实测 < 20 tok/s → 整个方案重新评估（考虑 1.5B 或放弃本地）
- 如果 SQL 转换质量不够 → 考虑 7B（体积+速度代价大）或限定任务范围
- 如果 Wails 打包后签名/加载有问题 → 阻断性风险，方案要改

**50 行代码的 demo 比修订 1200 行文档更有说服力。**

---

## 附：调研来源

- [hybridgroup/yzma](https://github.com/hybridgroup/yzma) — 首选推理库（510★，v1.18.0，零 CGO，活跃）
- [hybridgroup/llama-cpp-builder](https://github.com/hybridgroup/llama-cpp-builder) — 预编译动态库（含 Metal 版）
- [Qwen2.5-Coder-3B-Instruct-GGUF（魔搭社区）](https://modelscope.cn/models/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF) — 推荐下载源（国内，1.96GB）
- [Qwen2.5-Coder-3B-Instruct-GGUF（HuggingFace）](https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF) — 备用下载源（国际，1.96GB）
- [WillItRunAI benchmark](https://willitrunai.com) — M2/M3 速度实测（42/37 tok/s）
- [SLM-SQL 论文 (arXiv)](https://arxiv.org/html/2507.22478v1) — 小模型 SQL 能力研究
- [Tinybird: 19 LLM SQL benchmark](https://www.tinybird.co/blog/which-llm-writes-the-best-sql) — SQL 质量对比
- [dianlight/gollama.cpp](https://github.com/dianlight/gollama.cpp) — 备选库（go:embed 设计好，但 API 偏底层、33★）
- [go-skynet/go-llama.cpp](https://github.com/go-skynet/go-llama.cpp) — **已死亡**（2024-03 冻结），不用
- [macOS dylib 公证](https://stackoverflow.com/questions/69510405/) — 签名顺序参考
