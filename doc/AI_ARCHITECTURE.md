# AI 子系统架构设计

> 版本：v1.0 | 日期：2026-06-30 | 状态：设计阶段

## 一、总体架构

### 1.1 设计目标

- **多任务扩展**：SQL 转换只是第一个 Task，后续扩展 SQL 解释、SQL 优化、SQL 生成、DDL 生成、数据分析等
- **Provider 抽象**：本地模型（yzma/llama.cpp）+ 云端 API（OpenAI/Anthropic），统一接口
- **付费分层**：Free 仅规则引擎，Pro 解锁全部 AI 能力
- **无外部依赖**：本地模型直接内嵌推理，不依赖 Ollama 等外部服务
- **零 CGO**：通过 `hybridgroup/yzma`（purego + ffi）调用 llama.cpp，保持现有构建流程不变

### 1.2 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend                                  │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ SqlDialect   │  │ AI Service   │  │ Settings Dialog      │   │
│  │ Banner       │  │ (TS)         │  │ AI Tab               │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                 │                      │               │
│  ┌──────┴───────┐  ┌──────┴───────┐              │               │
│  │ Rule Engine  │  │ Wails        │              │               │
│  │ (前端,Free)  │  │ Bindings     │              │               │
│  └──────────────┘  └──────┬───────┘              │               │
│                           │                      │               │
└───────────────────────────┼──────────────────────┼───────────────┘
                            │                      │
┌───────────────────────────┼──────────────────────┼───────────────┐
│                        Backend (Go)               │               │
│                           │                      │               │
│  ┌────────────────────────┴──────────────────────┴────────────┐  │
│  │                    App (Wails)                              │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐  │  │
│  │  │ AI Manager  │  │ License     │  │ Storage           │  │  │
│  │  │ (Provider   │  │ Gate        │  │ (ai_config,       │  │  │
│  │  │  调度)      │  │ (付费校验)   │  │  ai_usage)        │  │  │
│  │  └──────┬──────┘  └─────────────┘  └───────────────────┘  │  │
│  │         │                                                   │  │
│  │  ┌──────┴──────────────────────────────┐                   │  │
│  │  │          Provider 接口              │                   │  │
│  │  ├────────────────┬────────────────────┤                   │  │
│  │  │ LocalProvider  │ CloudProvider      │                   │  │
│  │  │ (yzma)         │ (OpenAI/Anthropic) │                   │  │
│  │  │ ~1GB GGUF 模型 │ API Key            │                   │  │
│  │  └────────────────┴────────────────────┘                   │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                  Task 注册表                                 │  │
│  │  sql-convert │ sql-explain │ sql-optimize │ sql-generate │ ..│  │
│  │  (Free)      │ (Pro)       │ (Pro)        │ (Pro)          │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### 1.3 功能分层

| 层级 | Provider | 功能 | 价格 |
|------|----------|------|------|
| **Free** | 无（纯前端规则引擎） | SQL 方言转换（17 条规则覆盖常见差异） | 免费 |
| **Pro** | 本地模型 (yzma/llama.cpp) | SQL 转换（AI 增强）、SQL 解释、SQL 优化、SQL 生成、DDL 生成、数据分析 | 付费 |
| **Pro** | 云端 API (OpenAI/Anthropic) | 同上，更强模型，需联网 + API Key | 付费 |

---

## 二、后端架构（`backend/ai/`）

### 2.1 目录结构

```
backend/ai/
├── provider.go       # Provider 接口 + 类型定义
├── manager.go        # ProviderManager（对标 db/Manager）
├── local.go          # 本地模型 Provider（yzma/llama.cpp）
├── openai.go         # OpenAI 兼容 Provider（预留）
├── anthropic.go      # Anthropic Provider（预留）
├── prompt.go         # Prompt 模板注册表
├── task.go           # Task 注册表 + TaskFunc 类型
├── model.go          # 模型生命周期管理（下载/加载/卸载）
└── license.go        # 许可证/功能网关检查
```

### 2.2 Provider 接口

```go
package ai

import "context"

// ProviderType AI 提供者类型
type ProviderType string

const (
    ProviderLocal     ProviderType = "local"      // yzma 本地推理 (llama.cpp)
    ProviderOpenAI    ProviderType = "openai"     // OpenAI 兼容 API
    ProviderAnthropic ProviderType = "anthropic"  // Anthropic API
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

    // ChatStream 流式对话
    ChatStream(ctx context.Context, req *ChatRequest) (<-chan ChatChunk, error)

    // Close 释放资源
    Close() error
}
```

### 2.3 ProviderManager

```go
package ai

import "sync"

// ProviderInfo 提供者信息（用于列表展示）
type ProviderInfo struct {
    ID      string       `json:"id"`
    Name    string       `json:"name"`
    Type    ProviderType `json:"type"`
    Ready   bool         `json:"ready"`
    Default bool         `json:"default"`
}

// ProviderManager AI 提供者管理器
// 对标 db/Manager 的设计模式：mutex + map + 注册/调度
type ProviderManager struct {
    mu        sync.RWMutex
    providers map[string]Provider  // providerID -> Provider
    defaultID string               // 默认 provider ID
}

func NewProviderManager() *ProviderManager {
    return &ProviderManager{
        providers: make(map[string]Provider),
    }
}

// Register 注册一个 Provider
func (m *ProviderManager) Register(id string, p Provider) error

// Unregister 注销一个 Provider
func (m *ProviderManager) Unregister(id string) error

// Get 获取指定 Provider
func (m *ProviderManager) Get(id string) (Provider, error)

// GetDefault 获取默认 Provider
func (m *ProviderManager) GetDefault() (Provider, error)

// SetDefault 设置默认 Provider
func (m *ProviderManager) SetDefault(id string) error

// List 列出所有 Provider
func (m *ProviderManager) List() []ProviderInfo

// Close 关闭所有 Provider（Shutdown 时调用）
func (m *ProviderManager) Close() error
```

### 2.4 本地模型 Provider（yzma）

```go
package ai

import (
    "context"
    "sync"

    "github.com/hybridgroup/yzma/pkg/llama"
)

// LocalConfig 本地模型配置
type LocalConfig struct {
    ModelFile   string  `json:"modelFile"`   // GGUF 文件名
    MaxTokens   int     `json:"maxTokens"`   // 默认 2048
    Temperature float64 `json:"temperature"`  // 默认 0.1
    GPU         bool    `json:"gpu"`          // 启用 GPU 加速
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
    // 2. 拼接模型路径: modelDir + config.ModelFile
    // 3. 检查模型文件是否存在
    // 4. 初始化 llama: llama.Init()
    // 5. 加载 GGUF 模型: llama.ModelLoadFromFile(...)
    // 6. 创建推理上下文: llama.InitFromModel(...)
    // 7. 返回就绪的 Provider
}

func (p *LocalProvider) Name() string         { return "本地模型" }
func (p *LocalProvider) Type() ProviderType   { return ProviderLocal }
func (p *LocalProvider) IsReady() bool        { /* 模型已加载 */ }

func (p *LocalProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
    // 1. 构造 llama.cpp prompt（system + user messages）
    // 2. 设置推理参数（temperature, max_tokens, context_size）
    // 3. 执行推理
    // 4. 收集输出 token → 拼接为字符串
    // 5. 返回 ChatResponse
}

func (p *LocalProvider) ChatStream(ctx context.Context, req *ChatRequest) (<-chan ChatChunk, error) {
    // 1. 构造 prompt
    // 2. 启动流式推理
    // 3. goroutine 逐 token 写入 channel
    // 4. 推理结束写入 Done=true
}

func (p *LocalProvider) Close() error {
    // 释放 llama.cpp 资源
}
```

### 2.5 云端 Provider（预留）

```go
// openai.go — OpenAI 兼容 API Provider
// 支持 OpenAI / DeepSeek / 通义千问等兼容接口

type OpenAIConfig struct {
    BaseURL     string  `json:"baseUrl"`     // 默认 https://api.openai.com/v1
    APIKey      string  `json:"apiKey"`      // 加密存储
    Model       string  `json:"model"`       // 默认 gpt-4o-mini
    MaxTokens   int     `json:"maxTokens"`
    Temperature float64 `json:"temperature"`
}

type OpenAIProvider struct {
    config OpenAIConfig
    client *http.Client
}

func NewOpenAIProvider(config OpenAIConfig) (*OpenAIProvider, error)
func (p *OpenAIProvider) Chat(ctx, req) (*ChatResponse, error)
func (p *OpenAIProvider) ChatStream(ctx, req) (<-chan ChatChunk, error)
```

```go
// anthropic.go — Anthropic Claude API Provider

type AnthropicConfig struct {
    APIKey      string  `json:"apiKey"`
    Model       string  `json:"model"`       // 默认 claude-sonnet-4-20250514
    MaxTokens   int     `json:"maxTokens"`
    Temperature float64 `json:"temperature"`
}

type AnthropicProvider struct {
    config AnthropicConfig
    client *http.Client
}
```

### 2.6 Task 系统

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
    Free          bool                                                  // true=Free 可用，false=需 Pro
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

func RegisterTask(t *Task) {
    taskRegistry[t.ID] = t
}

func GetTask(id TaskID) *Task {
    return taskRegistry[id]
}

func ListTasks() []*Task {
    tasks := make([]*Task, 0, len(taskRegistry))
    for _, t := range taskRegistry {
        tasks = append(tasks, t)
    }
    return tasks
}
```

### 2.7 Prompt 模板

```go
package ai

import (
    "bytes"
    "text/template"
)

// PromptTemplate Prompt 模板
type PromptTemplate struct {
    System string                    // 系统 prompt
    User   string                    // 用户 prompt（支持 Go 模板语法）
    tpl    *template.Template        // 编译后的模板
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

### 2.8 模型管理

```go
package ai

// ModelInfo 预置模型信息
type ModelInfo struct {
    ID        string   `json:"id"`        // 模型标识
    Name      string   `json:"name"`      // 显示名称
    Size      string   `json:"size"`      // 文件大小（显示用）
    SizeBytes int64    `json:"-"`         // 实际字节数
    URL       string   `json:"url"`       // 下载地址
    SHA256    string   `json:"sha256"`    // 校验值
    Tasks     []string `json:"tasks"`     // 支持的任务列表
    MinRAM    int      `json:"minRam"`    // 最低内存要求(MB)
    Description string `json:"description"`
}

// 预置模型列表
var BuiltinModels = []ModelInfo{
    {
        ID:        "qwen2.5-coder-1.5b",
        Name:      "Qwen2.5 Coder 1.5B",
        Size:      "1.0 GB",
        SizeBytes: 1024 * 1024 * 1024,
        URL:       "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-Q4_K_M.gguf",
        SHA256:    "",
        Tasks:     []string{"sql-convert", "sql-explain", "sql-generate"},
        MinRAM:    2048,
        Description: "通义千问代码模型，1.5B 参数，SQL 转换能力好，中文友好",
    },
    {
        ID:        "deepseek-coder-1.3b",
        Name:      "DeepSeek Coder 1.3B",
        Size:      "0.75 GB",
        SizeBytes: 750 * 1024 * 1024,
        URL:       "https://huggingface.co/TheBloke/deepseek-coder-1.3b-instruct-GGUF/resolve/main/deepseek-coder-1.3b-instruct.Q4_K_M.gguf",
        SHA256:    "",
        Tasks:     []string{"sql-convert", "sql-explain", "sql-generate"},
        MinRAM:    1536,
        Description: "DeepSeek 代码模型，1.3B 参数，轻量高效",
    },
}

// ModelManager 模型生命周期管理
type ModelManager struct {
    modelDir string          // 模型存储目录
    models   []ModelInfo     // 预置模型列表
}

func NewModelManager(modelDir string) *ModelManager

// ListBuiltin 列出所有可下载的预置模型
func (mm *ModelManager) ListBuiltin() []ModelInfo

// ListDownloaded 列出已下载的模型
func (mm *ModelManager) ListDownloaded() []ModelInfo

// GetModelPath 获取模型文件完整路径
func (mm *ModelManager) GetModelPath(modelID string) (string, error)

// IsDownloaded 检查模型是否已下载
func (mm *ModelManager) IsDownloaded(modelID string) bool

// DownloadModel 下载模型（支持进度回调）
func (mm *ModelManager) DownloadModel(ctx context.Context, modelID string, progress func(downloaded, total int64)) error

// DeleteModel 删除已下载的模型
func (mm *ModelManager) DeleteModel(modelID string) error

// VerifyModel 校验模型文件完整性（SHA256）
func (mm *ModelManager) VerifyModel(modelID string) error
```

### 2.9 许可证/功能网关

```go
package ai

// LicenseTier 许可层级
type LicenseTier string

const (
    TierFree LicenseTier = "free"  // 基础版：仅规则引擎
    TierPro  LicenseTier = "pro"   // 专业版：全部 AI 功能
)

// FeatureGate 功能网关
type FeatureGate struct {
    tier      LicenseTier
    licenseKey string
}

func NewFeatureGate() *FeatureGate {
    return &FeatureGate{tier: TierFree}
}

// GetTier 获取当前层级
func (fg *FeatureGate) GetTier() LicenseTier

// CanUseTask 检查是否允许使用指定任务
func (fg *FeatureGate) CanUseTask(taskID TaskID) bool {
    task := GetTask(taskID)
    if task == nil {
        return false
    }
    if task.Free {
        return true  // Free 任务任何人都能用
    }
    return fg.tier == TierPro  // 非 Free 任务需要 Pro
}

// CanUseProvider 检查是否允许使用指定 Provider 类型
func (fg *FeatureGate) CanUseProvider(providerType ProviderType) bool {
    // 本地模型和云端模型都需要 Pro
    return fg.tier == TierPro
}

// Activate 激活许可证
func (fg *FeatureGate) Activate(licenseKey string) error

// Deactivate 停用许可证（降级为 Free）
func (fg *FeatureGate) Deactivate()

// ValidateLicense 验证许可证密钥
// TODO: 接入实际的许可证验证服务
func (fg *FeatureGate) ValidateLicense(key string) (LicenseTier, error)
```

### 2.10 数据库存储

`localdb/migrations.go` 新增：

```sql
-- AI 配置（键值对）
CREATE TABLE IF NOT EXISTS ai_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- AI 使用记录（统计和计费）
CREATE TABLE IF NOT EXISTS ai_usage (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    provider_type TEXT NOT NULL,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);
```

`localdb/repository.go` 新增：

```go
// AIConfigRepository AI 配置仓库
type AIConfigRepository struct { db *sql.DB }
func (r *AIConfigRepository) Get(key string) (string, error)
func (r *AIConfigRepository) Set(key, value string) error
func (r *AIConfigRepository) Delete(key string) error
func (r *AIConfigRepository) GetAll() (map[string]string, error)

// AIUsageRepository AI 使用记录仓库
type AIUsageRepository struct { db *sql.DB }
func (r *AIUsageRepository) Save(usage *AIUsage) error
func (r *AIUsageRepository) GetStats(since string) (*UsageStats, error)
func (r *AIUsageRepository) Cleanup(before string) error
```

---

## 三、前端架构

### 3.1 AI Store

**文件**: `frontend/src/stores/aiStore.ts`

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface LocalModelState {
  modelId: string           // 当前选中的模型 ID
  modelPath: string         // 模型文件路径
  downloaded: boolean       // 是否已下载
  downloading: boolean      // 是否正在下载
  downloadProgress: number  // 下载进度 0-100
}

interface CloudConfig {
  provider: 'openai' | 'anthropic'
  apiKey: string
  endpoint: string
  model: string
}

interface AIState {
  // 全局
  enabled: boolean
  tier: 'free' | 'pro'
  licenseKey: string

  // 本地模型
  localModel: LocalModelState

  // 云端配置
  cloudConfig: CloudConfig

  // Provider 状态
  providerReady: boolean
  providerType: 'local' | 'cloud' | null

  // Actions
  checkStatus: () => Promise<void>
  setEnabled: (enabled: boolean) => void
  downloadModel: (modelId: string) => Promise<void>
  deleteModel: (modelId: string) => Promise<void>
  selectModel: (modelId: string) => void
  updateCloudConfig: (config: Partial<CloudConfig>) => void
  activateLicense: (key: string) => Promise<void>
  deactivateLicense: () => void
}

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      enabled: false,
      tier: 'free',
      licenseKey: '',
      localModel: {
        modelId: 'qwen2.5-coder-1.5b',
        modelPath: '',
        downloaded: false,
        downloading: false,
        downloadProgress: 0,
      },
      cloudConfig: {
        provider: 'openai',
        apiKey: '',
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      },
      providerReady: false,
      providerType: null,

      checkStatus: async () => { /* 调用后端 GetAIStatus */ },
      setEnabled: (enabled) => set({ enabled }),
      downloadModel: async (modelId) => { /* 调用后端 DownloadAIModel */ },
      deleteModel: async (modelId) => { /* 调用后端 DeleteAIModel */ },
      selectModel: (modelId) => { /* 更新 localModel.modelId */ },
      updateCloudConfig: (config) => { /* 更新 cloudConfig */ },
      activateLicense: async (key) => { /* 调用后端 ActivateLicense */ },
      deactivateLicense: () => { set({ tier: 'free', licenseKey: '' }) },
    }),
    { name: 'idblink-ai' }
  )
)
```

### 3.2 AI Service

**文件**: `frontend/src/services/aiService.ts`

```typescript
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
    // 1. 检查 AI 是否启用
    // 2. 检查任务是否可用（Free/Pro）
    // 3. 调用后端 ExecuteAITask
    // 4. 记录使用统计
    // 5. 返回结果
  }

  async executeTaskStream(
    request: TaskRequest,
    onChunk: (chunk: string) => void
  ): Promise<TaskResponse>

  async canUseTask(taskId: string): Promise<boolean>

  async getStatus(): Promise<{
    enabled: boolean
    tier: string
    providerReady: boolean
    providerType: string | null
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
│  ┌─ 许可证 ───────────────────────────────────────────┐  │
│  │  当前层级: [Free]  升级到 Pro 解锁 AI 功能           │  │
│  │  许可证密钥: [________________] [激活]               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─ 本地模型 (Pro) ───────────────────────────────────┐  │
│  │  模型: [qwen2.5-coder-1.5b ▾]                      │  │
│  │  说明: 通义千问代码模型，1.5B，SQL 转换能力好        │  │
│  │  大小: 1.0 GB | 状态: ● 已就绪                      │  │
│  │  GPU 加速: [✓] Metal                                │  │
│  │  [下载模型]  [删除模型]  [切换模型]                   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─ 云端模型 (Pro) ───────────────────────────────────┐  │
│  │  提供者: [OpenAI ▾]                                 │  │
│  │  API Key: [••••••••••••] [显示]                     │  │
│  │  端点: [https://api.openai.com/v1       ]           │  │
│  │  模型: [gpt-4o-mini                     ]           │  │
│  │  [测试连接]                                          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─ 使用统计 ─────────────────────────────────────────┐  │
│  │  本月调用: 128 次                                    │  │
│  │  Token 消耗: 45,230                                 │  │
│  │  最近任务: SQL 转换 (2 分钟前)                       │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 四、SQL 方言转换功能

### 4.1 方言检测引擎

**文件**: `frontend/src/utils/sqlDialects/detectDialect.ts`

#### 检测策略（多特征加权打分）

| 特征 | 指向方言 | 权重 |
|------|----------|------|
| `` `table` `` 反引号 | MySQL/MariaDB | 高(3) |
| `LIMIT x OFFSET y` (无 FETCH) | MySQL/PG/SQLite | 高(3) |
| `TOP n` in SELECT | SQL Server | 高(3) |
| `ROWNUM` | Oracle/达梦 | 高(3) |
| `IFNULL()` | MySQL/SQLite | 中(2) |
| `NVL()` | Oracle/达梦 | 中(2) |
| `ISNULL()` | SQL Server | 中(2) |
| `AUTO_INCREMENT` | MySQL | 高(3) |
| `SERIAL` / `BIGSERIAL` | PostgreSQL | 高(3) |
| `IDENTITY(1,1)` | SQL Server | 高(3) |
| `GENERATED ALWAYS AS IDENTITY` | Oracle/PG | 中(2) |
| `ENGINE=InnoDB` | MySQL | 高(3) |
| `NVARCHAR` / `NVARCHAR2` | SQL Server/Oracle | 中(2) |
| `::type` 类型转换 | PostgreSQL | 高(3) |
| `GETDATE()` | SQL Server | 高(3) |
| `SYSDATE` | Oracle/达梦 | 高(3) |
| `NOW()` | MySQL/PG | 中(2) |
| `\|\|` 字符串连接 | PG/Oracle/SQLite | 中(2) |
| `CONCAT()` | MySQL/SQL Server | 中(2) |
| `GO` 语句分隔符 | SQL Server | 高(3) |
| `$$` 函数体 | PostgreSQL | 高(3) |
| `USING` 子句 (DELETE) | PostgreSQL | 中(2) |

#### 返回类型

```typescript
interface DialectDetection {
  dialect: DatabaseType       // 识别出的源方言
  confidence: number          // 0-1 归一化置信度
  matchedFeatures: string[]   // 匹配到的特征列表
}

function detectSqlDialect(sql: string): DialectDetection | null
// 置信度 >= 0.6 时返回结果，否则返回 null
```

### 4.2 规则转换引擎（Free 功能）

**文件**: `frontend/src/utils/sqlDialects/convertRules.ts`

#### 规则接口

```typescript
interface VersionConstraint {
  min?: string
  max?: string
}

interface ConvertContext {
  sourceDialect: DatabaseType
  targetDialect: DatabaseType
  sourceVersion?: string
  targetVersion?: string
}

interface ConversionRule {
  id: string
  name: string
  description: string
  sourceDialects: DatabaseType[]
  targetDialects: DatabaseType[]
  sourceVersion?: VersionConstraint
  targetVersion?: VersionConstraint
  detect: (sql: string) => boolean
  convert: (sql: string, ctx: ConvertContext) => string
  priority: number
}
```

#### P0 规则（17 条，覆盖高频差异）

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

#### P1 规则（后续补充）

| # | 规则名 | 说明 |
|---|--------|------|
| 18 | 数据类型映射 | `TINYINT`→`SMALLINT`, `DATETIME`→`TIMESTAMP`, `TEXT`→`CLOB` 等 |
| 19 | IF→CASE | MySQL `IF(cond, a, b)` → `CASE WHEN cond THEN a ELSE b END` |
| 20 | GROUP_CONCAT→STRING_AGG | MySQL → PG |
| 21 | INSERT IGNORE→ON CONFLICT | MySQL → PG |
| 22 | REPLACE INTO→ON CONFLICT | MySQL → PG |
| 23 | SHOW TABLES→信息模式 | MySQL → PG/Oracle |
| 24 | DESCRIBE→信息模式 | MySQL → PG/Oracle |

#### 数据库版本映射

```typescript
const DB_VERSIONS: Record<DatabaseType, string[]> = {
  mysql: ['5.7', '8.0', '8.4', '9.0'],
  postgresql: ['12', '13', '14', '15', '16', '17'],
  sqlite: ['3.35', '3.36', '3.37', '3.38', '3.39', '3.40', '3.45', '3.46'],
  sqlserver: ['2016', '2017', '2019', '2022'],
  oracle: ['12c', '19c', '21c', '23c'],
  dameng: ['DM8', 'DM16'],
  mariadb: ['10.5', '10.6', '10.11', '11.0', '11.4'],
  kingbase: ['V8R3', 'V8R6'],
  highgo: ['HG5', 'HG6'],
  vastbase: ['VB3', 'VB5'],
}
```

版本存储在连接配置的 `db_version` 字段中。

### 4.3 Banner 组件

**文件**: `frontend/src/components/SqlDialectBanner.tsx`

```tsx
interface SqlDialectBannerProps {
  sourceDialect: DatabaseType
  targetDialect: DatabaseType
  confidence: number
  matchedFeatures: string[]
  onQuickConvert: () => void    // 规则引擎（Free）
  onAIConvert: () => void       // AI 增强（Pro）
  onDismiss: () => void
}
```

**UI 效果**：

```
┌──────────────────────────────────────────────────────────────────┐
│  ⚠ 检测到 MySQL 语法（反引号、LIMIT、AUTO_INCREMENT），             │
│    当前连接为达梦数据库                                             │
│                                                                   │
│  [快速转换(Free)]  [AI 转换(Pro)]  [忽略]                          │
│                                                                   │
│  快速转换覆盖常见语法差异，AI 转换可处理复杂 SQL 和存储过程           │
└──────────────────────────────────────────────────────────────────┘
```

**显示逻辑**：
- 编辑器内容变化时 debounce 500ms 调用 `detectSqlDialect(sql)`
- 源方言 ≠ 当前数据库 且 confidence >= 0.6 时显示
- 用户点"忽略"后本次编辑会话不再提示（直到切换标签页或清空）
- AI 转换按钮在 Free 模式下显示升级提示

### 4.4 集成到 SQLEditor

**修改**: `frontend/src/components/SQLEditor.tsx`

在 Monaco Editor 上方插入 Banner：

```tsx
{dialectMismatch && (
  <SqlDialectBanner
    sourceDialect={dialectMismatch.dialect}
    targetDialect={dbType}
    confidence={dialectMismatch.confidence}
    matchedFeatures={dialectMismatch.matchedFeatures}
    onQuickConvert={handleQuickConvert}
    onAIConvert={handleAIConvert}
    onDismiss={handleDismissDialectBanner}
  />
)}
```

**handleQuickConvert**（规则引擎）：
1. 调用 `convertByRules(sql, sourceDialect, dbType)`
2. 替换编辑器内容为转换后的 SQL
3. 显示 `message.success('SQL 已转换为 {targetDialect} 语法')`

**handleAIConvert**（AI 引擎）：
1. 检查 `aiStore.tier === 'pro'`，否则弹出升级提示
2. 检查 `providerReady`，否则提示下载模型或配置云端
3. 调用 `aiService.executeTask({ taskId: 'sql-convert', sql, sourceDialect, targetDialect })`
4. 替换编辑器内容
5. 显示成功提示

---

## 五、Wails 绑定方法

在 `backend/app.go` 新增以下方法（前端通过 Wails 绑定调用）：

```go
// --- AI 管理 ---

// GetAIStatus 获取 AI 子系统状态
func (a *App) GetAIStatus() (AIStatusResponse, error)

// SetAIEnabled 启用/禁用 AI
func (a *App) SetAIEnabled(enabled bool) error

// --- 模型管理 ---

// ListAIModels 列出可用模型（预置 + 已下载）
func (a *App) ListAIModels() (AIModelsResponse, error)

// DownloadAIModel 下载模型
func (a *App) DownloadAIModel(modelID string) error

// DeleteAIModel 删除模型
func (a *App) DeleteAIModel(modelID string) error

// --- 任务执行 ---

// ExecuteAITask 执行 AI 任务
func (a *App) ExecuteAITask(req AITaskRequest) (AITaskResponse, error)

// --- 许可证 ---

// ActivateLicense 激活许可证
func (a *App) ActivateLicense(licenseKey string) (LicenseResponse, error)

// GetLicenseInfo 获取许可证信息
func (a *App) GetLicenseInfo() (LicenseInfoResponse, error)

// --- 云端配置 ---

// TestAIConnection 测试云端 Provider 连接
func (a *App) TestAIConnection(config AICloudConfigRequest) (AIConnectionTestResponse, error)

// SaveAICloudConfig 保存云端 Provider 配置
func (a *App) SaveAICloudConfig(config AICloudConfigRequest) error
```

---

## 六、文件清单

### 新建文件

| 文件 | 用途 |
|------|------|
| `backend/ai/provider.go` | Provider 接口 + ChatRequest/Response 类型 |
| `backend/ai/manager.go` | ProviderManager |
| `backend/ai/local.go` | LocalProvider（yzma/llama.cpp） |
| `backend/ai/openai.go` | OpenAI Provider（预留） |
| `backend/ai/anthropic.go` | Anthropic Provider（预留） |
| `backend/ai/model.go` | ModelManager + 模型信息 |
| `backend/ai/task.go` | Task 注册表 + TaskFunc |
| `backend/ai/prompt.go` | Prompt 模板管理 |
| `backend/ai/license.go` | FeatureGate + 许可证校验 |
| `frontend/src/stores/aiStore.ts` | AI 状态管理 |
| `frontend/src/services/aiService.ts` | AI 任务调用服务 |
| `frontend/src/components/SqlDialectBanner.tsx` | SQL 方言转换 Banner |
| `frontend/src/utils/sqlDialects/detectDialect.ts` | 方言检测引擎 |
| `frontend/src/utils/sqlDialects/convertRules.ts` | 规则转换引擎 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `backend/app.go` | 添加 aiManager、modelManager、featureGate 字段 + Startup/Shutdown + AI 方法 |
| `backend/localdb/migrations.go` | 新增 ai_config、ai_usage 表 |
| `backend/localdb/repository.go` | 新增 AIConfigRepository、AIUsageRepository |
| `backend/storage.go` | 新增 AI 存储方法 |
| `frontend/src/components/SQLEditor.tsx` | 集成方言检测 + Banner |
| `frontend/src/components/SettingsDialog.tsx` | 新增 AI Tab |
| `frontend/src/stores/settingsStore.ts` | ai 配置项 |
| `frontend/src/api/index.ts` | AI API 封装 |
| `go.mod` | 添加 yzma 依赖 |

---

## 七、实现顺序

| Phase | 内容 | 依赖 | 交付物 |
|-------|------|------|--------|
| **1** | 方言检测引擎 | 无 | detectDialect.ts + 单元测试 |
| **2** | 规则转换引擎 | Phase 1 | convertRules.ts + 单元测试 |
| **3** | Banner 组件 | Phase 1, 2 | SqlDialectBanner.tsx |
| **4** | SQLEditor 集成 | Phase 3 | SQLEditor.tsx 修改 |
| **5** | AI 后端骨架 | 无 | provider.go / manager.go / task.go / prompt.go |
| **6** | 本地模型 Provider | Phase 5 | local.go / model.go + yzma |
| **7** | 许可证系统 | Phase 5 | license.go |
| **8** | AI 数据库存储 | Phase 5 | migrations + repository |
| **9** | 前端 AI Store | Phase 5 | aiStore.ts |
| **10** | SettingsDialog AI Tab | Phase 7, 9 | SettingsDialog.tsx 修改 |
| **11** | 前端 AI Service | Phase 5, 9 | aiService.ts + api/index.ts |
| **12** | 完整串联 | Phase 4, 6, 11 | Banner "AI 转换" → 后端 → 编辑器 |
| **13** | 连接配置扩展 | Phase 1 | db_version 字段 |
| **14** | SQL 转换 Task | Phase 5, 6 | task.go 中注册 TaskSQLConvert |

---

## 八、安装包体积与平台支持

### 8.1 体积分析

当前安装包基线：**DMG 12 MB**。

| 组件 | macOS (arm64) | Windows (x64) | 说明 |
|------|--------------|---------------|------|
| llama.cpp 动态库 (CPU-only) | ~20 MB | ~25 MB | `.dylib` / `.dll` |
| + Metal GPU 加速 | +0 MB（内嵌） | N/A | macOS 自带 Metal |
| + CUDA GPU 加速 | N/A | +80~150 MB | 需要 CUDA runtime |
| GGUF 模型 (qwen2.5-coder-1.5b Q4_K_M) | ~1 GB | ~1 GB | 运行时下载 |

### 8.2 打包策略对比

| 策略 | 安装包增量 | 总大小 | 用户体验 | 推荐 |
|------|-----------|--------|----------|------|
| **A. 全部内置** | +1.02 GB | ~1.03 GB | 开箱即用，离线可用 | ❌ 安装包过大 |
| **B. 库内置 + 模型运行时下载** | +20 MB | ~32 MB | 首次使用 AI 时下载 1GB 模型 | ✅ **推荐** |
| **C. 全部运行时下载** | +0 MB | ~12 MB | 首次使用时下载库 + 模型 | ❌ 首次体验差 |

**采用策略 B**：动态库通过 `go:embed` 内嵌到 Go 二进制（+20MB 可接受），模型在用户激活 Pro 后首次使用 AI 功能时自动下载，有进度条和 SHA256 校验。

### 8.3 模型下载流程

```
用户点击 [AI 转换] 或 [下载模型]
       │
       ▼
┌─────────────────────┐
│ 检查本地模型文件      │  ~/.idblink/models/qwen2.5-coder-1.5b.gguf
│ 是否已存在且完整       │  SHA256 校验
└─────────┬───────────┘
          │ 不存在 / 不完整
          ▼
┌─────────────────────┐
│ 显示下载对话框        │  模型名称、大小、下载源
│ [开始下载] [取消]     │
└─────────┬───────────┘
          │ 确认下载
          ▼
┌─────────────────────┐
│ HTTP 下载 + 进度条   │  支持断点续传 (Range header)
│ 显示: 450MB / 1GB    │  多源备用 (HuggingFace 镜像)
└─────────┬───────────┘
          │ 下载完成
          ▼
┌─────────────────────┐
│ SHA256 校验          │  校验失败则删除重下
│ 加载模型到内存        │
│ 更新状态为"已就绪"    │
└─────────────────────┘
```

### 8.4 平台支持矩阵

| 平台 | 架构 | CPU 推理 | GPU 加速 | 动态库格式 | 状态 |
|------|------|----------|----------|-----------|------|
| macOS | arm64 (Apple Silicon) | ✅ | ✅ Metal（零额外体积） | `.dylib` | 最佳 |
| macOS | x86_64 (Intel) | ✅ | ❌ | `.dylib` | 支持，性能一般 |
| Windows | x64 | ✅ | ✅ CUDA / Vulkan | `.dll` | 支持 |
| Linux | x64 | ✅ | ✅ CUDA / Vulkan | `.so` | 支持 |
| Linux | arm64 | ✅ | ❌ | `.so` | 支持 |

**yzma 跨平台核心优势**：
- **零 CGO**：通过 `purego` + `ffi` 加载动态库，不需要用户安装 C 编译器
- **预编译分发**：llama.cpp 官方提供各平台预编译产物，`yzma install` 命令自动下载对应平台的动态库
- **跨编译友好**：从 macOS 可直接交叉编译 Windows/Linux 版本，与现有 Wails 构建流程完全兼容
- **社区活跃**：hybridgroup 是 Go 硬件/机器人生态知名组织（gobot），511 ★，持续维护

### 8.5 macOS 公证与签名

| 项目 | 处理方式 |
|------|----------|
| `.dylib` 内嵌到 `.app` | 随 `.app` 一起签名和公证，无额外步骤 |
| `codesign --deep --force --sign` | 签名整个 `.app` bundle，包含内嵌的 dylib |
| Apple 公证 (notarize) | `xcrun notarytool submit`，dylib 随 `.app` 一起公证 |

### 8.6 Windows 注意事项

| 项目 | 处理方式 |
|------|----------|
| `.dll` 内嵌到 Go 二进制 | 通过 `go:embed` 嵌入，运行时释放到临时目录加载 |
| 杀毒误报 | `.dll` 可能触发误报，需要代码签名证书 |
| CUDA runtime | 用户自行安装 NVIDIA 驱动 + CUDA Toolkit，应用不捆绑 |

### 8.7 风险评估

| 风险 | 等级 | 应对措施 |
|------|------|----------|
| yzma 社区规模中等（511 stars） | 低 | hybridgroup 是 Go 硬件生态知名组织，底层 llama.cpp 极成熟 |
| 模型下载失败 | 中 | 多源备用 + 断点续传 + SHA256 校验 + 重试机制 |
| macOS 公证 | 低 | dylib 随 .app 一起公证，现有流程已覆盖 |
| Windows 杀毒误报 | 中 | 代码签名证书 + 提交白名单 |
| 推理内存不足 | 中 | 检测系统内存，不足时提示用户；模型可卸载释放内存 |
| 低端设备性能差 | 低 | 提供更小的模型选项（如 deepseek-coder-1.3b ~750MB） |

---

## 九、技术依赖

| 依赖 | 用途 | 引入时机 |
|------|------|----------|
| `github.com/hybridgroup/yzma` | 本地 LLM 推理（purego + ffi，零 CGO） | Phase 6 |
| llama.cpp 预编译动态库 | 各平台推理引擎（~20MB/平台），通过 `yzma install` 下载 | Phase 6（go:embed 内嵌） |
| GGUF 模型 (~1GB) | qwen2.5-coder-1.5b 或 deepseek-coder-1.3b | Phase 6（运行时下载） |
