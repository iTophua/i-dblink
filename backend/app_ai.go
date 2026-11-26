package backend

import (
	"context"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"idblink/backend/ai"
	"idblink/backend/api"
	"idblink/backend/models"
)

// ==================== AI DTO 类型 ====================

// AICloudConfigInput 前端传入的云端 AI 配置
type AICloudConfigInput struct {
	Enabled  bool   `json:"enabled"`
	Provider string `json:"provider"`
	BaseURL  string `json:"baseUrl"`
	APIKey   string `json:"apiKey"` // 明文（空字符串表示不修改已有 key）
	Model    string `json:"model"`
}

// AICloudConfigResponse 返回给前端的云端 AI 配置（API Key 掩码）
type AICloudConfigResponse struct {
	Enabled    bool   `json:"enabled"`
	Provider   string `json:"provider"`
	BaseURL    string `json:"baseUrl"`
	APIKeyMask string `json:"apiKeyMask"`
	Model      string `json:"model"`
}

// AIConnTestResponse 连接测试结果
type AIConnTestResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// AITaskRequest 前端传入的 AI 任务请求
type AITaskRequest struct {
	TaskID        string            `json:"taskId"`
	RequestID     string            `json:"requestId,omitempty"`
	SourceDialect string            `json:"sourceDialect,omitempty"`
	TargetDialect string            `json:"targetDialect,omitempty"`
	SQL           string            `json:"sql,omitempty"`
	NaturalInput  string            `json:"naturalInput,omitempty"`
	DatabaseType  string            `json:"databaseType,omitempty"`
	TableInfo     string            `json:"tableInfo,omitempty"`
	Context       map[string]string `json:"context,omitempty"`
	// Messages 通用聊天任务（taskId="chat"）直接透传到 Provider，绕过 BuildPrompt
	Messages []AIChatMessage `json:"messages,omitempty"`
}

// AIChatMessage 聊天消息（前端透传到 Provider，支持多轮对话）
type AIChatMessage struct {
	Role    string `json:"role"` // "system" | "user" | "assistant"
	Content string `json:"content"`
}

// AITaskResponse AI 任务响应
type AITaskResponse struct {
	TaskID   string `json:"taskId"`
	Result   string `json:"result"`
	Provider string `json:"provider"`
}

// AIStatusResponse AI 子系统状态
type AIStatusResponse struct {
	Enabled bool `json:"enabled"`
	Ready   bool `json:"ready"`
}

// AIPresetProvidersResponse 预置服务商列表
type AIPresetProvidersResponse struct {
	Providers []ai.PresetProvider `json:"providers"`
}

// ==================== Wails 绑定方法 ====================

// GetAIPresetProviders 获取预置服务商列表
func (a *App) GetAIPresetProviders() (AIPresetProvidersResponse, error) {
	return AIPresetProvidersResponse{Providers: ai.PresetProviders}, nil
}

// AIModelsRequest 拉取模型列表的请求参数。
// baseUrl/apiKey 为空时后端回退到已保存的配置——用于设置页
// "先填地址+Key 再拉模型"的临时验证场景。
type AIModelsRequest struct {
	BaseURL string `json:"baseUrl,omitempty"`
	APIKey  string `json:"apiKey,omitempty"` // 明文，空表示用已存的 key
}

// AIModelsResponse 可用模型列表响应
type AIModelsResponse struct {
	Models []ai.ModelInfo `json:"models"`
}

// GetAIModels 拉取可用模型列表（通过前端临时传入的配置，或已保存的配置）。
// 用于设置页模型字段的动态下拉选择。
func (a *App) GetAIModels(req AIModelsRequest) (AIModelsResponse, error) {
	baseURL := req.BaseURL
	apiKey := req.APIKey

	// 前端未传时回退到已保存配置
	if baseURL == "" {
		cfg, err := ai.LoadCloudConfig(a.storage)
		if err != nil {
			return AIModelsResponse{}, fmt.Errorf("failed to load config: %w", err)
		}
		baseURL = cfg.BaseURL
	}
	if apiKey == "" {
		stored, err := a.storage.GetAIConfig(ai.CfgAPIKey)
		if err != nil {
			return AIModelsResponse{}, fmt.Errorf("failed to read stored API key: %w", err)
		}
		apiKey = stored
	}

	if baseURL == "" || apiKey == "" {
		return AIModelsResponse{}, fmt.Errorf("请先配置 API 地址和 API Key")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	models, err := ai.ListModels(ctx, baseURL, apiKey)
	if err != nil {
		return AIModelsResponse{}, err
	}

	return AIModelsResponse{Models: models}, nil
}

// GetAICloudConfig 获取云端 AI 配置（API Key 以掩码返回）
func (a *App) GetAICloudConfig() (AICloudConfigResponse, error) {
	masked, err := ai.GetMaskedConfig(a.storage)
	if err != nil {
		return AICloudConfigResponse{}, fmt.Errorf("failed to get AI config: %w", err)
	}
	return AICloudConfigResponse{
		Enabled:    masked.Enabled,
		Provider:   masked.Provider,
		BaseURL:    masked.BaseURL,
		APIKeyMask: masked.APIKeyMask,
		Model:      masked.Model,
	}, nil
}

// SaveAICloudConfig 保存云端 AI 配置（API Key 加密存储）
func (a *App) SaveAICloudConfig(config AICloudConfigInput) error {
	input := &ai.SaveCloudConfigInput{
		Enabled:  config.Enabled,
		Provider: config.Provider,
		BaseURL:  config.BaseURL,
		APIKey:   config.APIKey,
		Model:    config.Model,
	}

	if err := ai.SaveCloudConfig(a.storage, input); err != nil {
		return fmt.Errorf("failed to save AI config: %w", err)
	}

	// 配置变更后重建 Provider
	if err := a.aiManager.ReloadFromConfig(a.storage); err != nil {
		return fmt.Errorf("failed to reload AI provider: %w", err)
	}

	return nil
}

// TestAIConnection 测试云端 Provider 连接（用传入的配置，不依赖已保存的配置）
func (a *App) TestAIConnection(config AICloudConfigInput) (AIConnTestResponse, error) {
	// 如果前端没传 API Key（掩码场景），从存储读取已存的明文
	apiKey := config.APIKey
	if apiKey == "" {
		stored, err := a.storage.GetAIConfig(ai.CfgAPIKey)
		if err != nil {
			return AIConnTestResponse{}, fmt.Errorf("failed to read stored API key: %w", err)
		}
		apiKey = stored
	}

	if apiKey == "" {
		return AIConnTestResponse{Success: false, Message: "API Key 未配置"}, nil
	}
	if config.BaseURL == "" {
		return AIConnTestResponse{Success: false, Message: "BaseURL 未配置"}, nil
	}
	if config.Model == "" {
		return AIConnTestResponse{Success: false, Message: "模型未配置"}, nil
	}

	// 用临时 Provider 发一条简短消息测试
	provider := ai.NewOpenAIProvider(ai.OpenAIConfig{
		BaseURL: config.BaseURL,
		APIKey:  apiKey,
		Model:   config.Model,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := provider.Chat(ctx, &ai.ChatRequest{
		Messages: []ai.ChatMessage{
			{Role: "user", Content: "Hi"},
		},
		MaxTokens: 5,
	})
	if err != nil {
		return AIConnTestResponse{Success: false, Message: err.Error()}, nil
	}

	return AIConnTestResponse{
		Success: true,
		Message: fmt.Sprintf("连接成功，模型: %s, 响应: %s", config.Model, truncate(resp.Content, 50)),
	}, nil
}

// ExecuteAITask 执行 AI 任务（同步）
func (a *App) ExecuteAITask(req AITaskRequest) (AITaskResponse, error) {
	provider, err := a.aiManager.GetActive()
	if err != nil {
		return AITaskResponse{}, err
	}

	task, err := ai.GetTask(ai.TaskID(req.TaskID))
	if err != nil {
		return AITaskResponse{}, err
	}

	messages := buildAIMessages(req, task)

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	resp, err := provider.Chat(ctx, &ai.ChatRequest{Messages: messages})
	if err != nil {
		return AITaskResponse{}, err
	}

	return AITaskResponse{
		TaskID:   req.TaskID,
		Result:   resp.Content,
		Provider: provider.Name(),
	}, nil
}

// aiStreamChunk "ai-chat" 流协议帧：content 增量 / done 结束 / error 失败原因
type aiStreamChunk struct {
	Content string `json:"content,omitempty"`
	Done    bool   `json:"done,omitempty"`
	Error   string `json:"error,omitempty"`
}

// HandleAIChatStream "ai-chat" 流处理器（wails v3 HandleStream 注册）。
// 前端每轮请求建立一条流连接，发送一条 AITaskRequest 后按帧接收输出。
// 相比 v2 时代的事件广播（ai-stream-<requestID>）：无 requestID 串流风险、
// 前端 close 即取消（ctx 继承自连接，select ctx.Done 终止 Provider 请求）。
func (a *App) HandleAIChatStream(c *application.StreamConn) {
	defer c.Close()

	var req AITaskRequest
	if err := c.ReceiveJSON(&req); err != nil {
		return // 前端连接即关（组件卸载/页面刷新）
	}

	provider, err := a.aiManager.GetActive()
	if err != nil {
		slog.Warn("ai chat stream rejected: no active provider", "task_id", req.TaskID, "error", err)
		_ = c.SendJSON(aiStreamChunk{Done: true, Error: err.Error()})
		return
	}
	task, err := ai.GetTask(ai.TaskID(req.TaskID))
	if err != nil {
		slog.Warn("ai chat stream rejected: unknown task", "task_id", req.TaskID, "error", err)
		_ = c.SendJSON(aiStreamChunk{Done: true, Error: err.Error()})
		return
	}
	messages := buildAIMessages(req, task)

	// 流式 context：超时 5 分钟（LLM 长响应）；父 ctx 来自流连接，对端关闭即取消
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Minute)
	defer cancel()

	// 诊断日志只记任务号/轮数/耗时/输出长度，不记对话内容
	start := time.Now()
	outputChars := 0
	finishLog := func(errMsg string) {
		attrs := []any{"task_id", req.TaskID, "messages", len(messages),
			"duration_ms", time.Since(start).Milliseconds(), "output_chars", outputChars}
		if errMsg != "" {
			slog.Warn("ai chat stream failed", append(attrs, "error", truncate(errMsg, 500))...)
			return
		}
		slog.Info("ai chat stream finished", attrs...)
	}

	stream, err := provider.ChatStream(ctx, &ai.ChatRequest{Messages: messages})
	if err != nil {
		finishLog(err.Error())
		_ = c.SendJSON(aiStreamChunk{Done: true, Error: err.Error()})
		return
	}
	for {
		select {
		case chunk, ok := <-stream:
			if !ok {
				finishLog("")
				_ = c.SendJSON(aiStreamChunk{Done: true})
				return
			}
			if chunk.Done {
				finishLog("")
				_ = c.SendJSON(aiStreamChunk{Done: true})
				return
			}
			if err := c.SendJSON(aiStreamChunk{Content: chunk.Content}); err != nil {
				cancel() // 前端已断开，立即终止 Provider 的 HTTP 请求
				slog.Info("ai chat stream cancelled by frontend", "task_id", req.TaskID,
					"duration_ms", time.Since(start).Milliseconds(), "output_chars", outputChars)
				return
			}
			outputChars += len(chunk.Content)
		case <-ctx.Done():
			finishLog("请求超时或已取消")
			_ = c.SendJSON(aiStreamChunk{Done: true, Error: "请求超时或已取消"})
			return
		}
	}
}

// GetAIStatus 获取 AI 子系统状态
func (a *App) GetAIStatus() (AIStatusResponse, error) {
	return AIStatusResponse{
		Enabled: a.aiManager.IsEnabled(),
		Ready:   a.aiManager.IsReady(),
	}, nil
}

// ==================== SQL 优化上下文收集 ====================

// SQLOptimizeContext SQL 优化的真实上下文（喂给 AI 的证据材料）。
// ExplainPlan/TableDDL 任一缺失时携带 Warnings，AI prompt 会如实说明。
type SQLOptimizeContext struct {
	DbType      string   `json:"dbType"`
	ExplainPlan string   `json:"explainPlan,omitempty"`
	TableDDL    string   `json:"tableDdl,omitempty"`
	Warnings    []string `json:"warnings,omitempty"`
}

// 优化上下文的体量上限：防止长 EXPLAIN / 宽表 DDL 撑爆 LLM 上下文
const (
	optimizeExplainLimit = 8 * 1024
	optimizeDDLLimit     = 16 * 1024
	optimizeDDLPerTable  = 4 * 1024
	optimizeMaxTables    = 5
)

// PrepareSQLOptimize 为 AI SQL 优化收集真实上下文：执行计划 + 涉及表 DDL。
// 前端拿到后连同待优化 SQL 一起发起 sql-optimize 流式任务。
// 所有收集步骤 best-effort：失败记入 warnings 并继续（AI 仍可基于 SQL 分析）。
func (a *App) PrepareSQLOptimize(connectionID string, sql string, database string) (SQLOptimizeContext, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return SQLOptimizeContext{}, err
	}
	dbType, err := a.handler.GetDBTypeFor(connectionID)
	if err != nil {
		return SQLOptimizeContext{}, err
	}
	ctx := SQLOptimizeContext{DbType: dbType}

	// 多语句只优化第一句（与编辑器"执行选中/当前语句"语义一致）
	stmt := firstSQLStatement(sql)
	if stmt == "" {
		return SQLOptimizeContext{}, fmt.Errorf("empty SQL statement")
	}

	// 1) 执行计划：失败降级（TDengine 等无 EXPLAIN 的库照样可用）
	if explainSQL, err := api.BuildExplainSQL(dbType, stmt); err != nil {
		ctx.Warnings = append(ctx.Warnings, err.Error())
	} else {
		qCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		useTx := false
		result, err := a.executeQueryCore(qCtx, connectionID, explainSQL, &database, &useTx, "", nil)
		cancel()
		if err != nil || result.Error != "" {
			reason := err.Error()
			if result.Error != "" {
				reason = result.Error
			}
			ctx.Warnings = append(ctx.Warnings, "EXPLAIN failed: "+reason)
		} else {
			ctx.ExplainPlan = truncate(resultToText(&result), optimizeExplainLimit)
		}
	}

	// 2) 涉及表 DDL：正则提取 FROM/JOIN/UPDATE/INTO 后的表名（含 db 前缀），
	//    逐表取建表语句（含索引定义）。识别不到或取失败都不阻断。
	var ddlBuilder strings.Builder
	for i, tn := range extractTableNames(stmt) {
		if i >= optimizeMaxTables {
			ctx.Warnings = append(ctx.Warnings, fmt.Sprintf("too many tables referenced, only first %d analyzed", optimizeMaxTables))
			break
		}
		table, schema, db := splitTableName(tn)
		if db == "" {
			db = database
		}
		dbPtr, schemaPtr := &db, &schema
		if schema == "" {
			schemaPtr = nil
		}
		stmtDDL, err := a.GetTableDDLWithSchema(connectionID, table, dbPtr, schemaPtr)
		if err != nil {
			ctx.Warnings = append(ctx.Warnings, fmt.Sprintf("DDL for %s: %v", tn, err))
			continue
		}
		ddl := strings.Join(stmtDDL, "\n")
		if ddlBuilder.Len() > 0 {
			ddlBuilder.WriteString("\n\n")
		}
		ddlBuilder.WriteString(truncate(ddl, optimizeDDLPerTable))
		if ddlBuilder.Len() >= optimizeDDLLimit {
			break
		}
	}
	ctx.TableDDL = ddlBuilder.String()

	return ctx, nil
}

// firstSQLStatement 截取第一条语句：首个不在引号内的分号前的内容。
func firstSQLStatement(sql string) string {
	var quote byte
	for i := 0; i < len(sql); i++ {
		c := sql[i]
		switch {
		case quote != 0:
			if c == '\\' && (quote == '\'' || quote == '"') {
				i++ // 跳过转义字符
			} else if c == quote {
				quote = 0
			}
		case c == '\'' || c == '"' || c == '`':
			quote = c
		case c == ';':
			return strings.TrimSpace(sql[:i])
		}
	}
	return strings.TrimSpace(sql)
}

// resultToText 把查询结果拼成 LLM 可读的竖线分隔文本。
func resultToText(r *models.QueryResult) string {
	if len(r.Columns) == 0 && len(r.Rows) == 0 {
		return "(no output)"
	}
	var b strings.Builder
	b.WriteString(strings.Join(r.Columns, " | "))
	for _, row := range r.Rows {
		b.WriteString("\n")
		for i, v := range row {
			if i > 0 {
				b.WriteString(" | ")
			}
			fmt.Fprintf(&b, "%v", v)
		}
	}
	return b.String()
}

// tableNameRe 提取 FROM/JOIN/UPDATE/INSERT INTO/DELETE FROM 后的表引用
// （支持 schema.table / db.table 限定，反引号/双引号包裹）。
var tableNameRe = regexp.MustCompile(
	`(?i)(?:from|join|update|into)\s+((?:[\x60"\[]?[\w$]+[\x60"\]]?\.)?[\x60"\[]?[\w$]+[\x60"\]]?)`)

// extractTableNames 提取 SQL 中引用的表名（去重、排除子查询关键字）。
func extractTableNames(sql string) []string {
	skip := map[string]bool{
		"select": true, "values": true, "dual": true, "set": true,
		"lateral": true, "unnest": true, "final": true,
	}
	// `db`.`t` / [db].[t] 形式逐段去引号再拼回
	strip := func(part string) string {
		return strings.Trim(strings.Trim(strings.Trim(strings.Trim(part, "`"), `"`), "["), "]")
	}
	var names []string
	seen := make(map[string]bool)
	for _, m := range tableNameRe.FindAllStringSubmatch(sql, -1) {
		parts := strings.Split(m[1], ".")
		for i, p := range parts {
			parts[i] = strip(p)
		}
		raw := strings.Join(parts, ".")
		lower := strings.ToLower(raw)
		if lower == "" || skip[lower] || seen[lower] {
			continue
		}
		seen[lower] = true
		names = append(names, raw)
	}
	return names
}

// splitTableName 拆开 a.b.c 形式的表引用：返回 (table, schema, database)。
// 两段式按 PG 语义视为 schema.table；三段式为 db.schema.table。
func splitTableName(ref string) (table, schema, database string) {
	parts := strings.Split(ref, ".")
	switch len(parts) {
	case 1:
		return parts[0], "", ""
	case 2:
		return parts[1], parts[0], ""
	default:
		return parts[len(parts)-1], parts[len(parts)-2], parts[0]
	}
}

// ==================== 辅助函数 ====================

// buildAIMessages 根据请求类型构建发往 Provider 的消息列表。
// - chat 任务：直接透传前端传入的 Messages（支持多轮对话），绕过 task.BuildPrompt
// - 其他任务：走 task.BuildPrompt 构建单轮 system+user 消息
func buildAIMessages(req AITaskRequest, task *ai.Task) []ai.ChatMessage {
	if ai.TaskID(req.TaskID) == ai.TaskChat {
		msgs := make([]ai.ChatMessage, 0, len(req.Messages))
		for _, m := range req.Messages {
			msgs = append(msgs, ai.ChatMessage{Role: m.Role, Content: m.Content})
		}
		return msgs
	}
	return task.BuildPrompt(&ai.TaskRequest{
		TaskID:        ai.TaskID(req.TaskID),
		SourceDialect: req.SourceDialect,
		TargetDialect: req.TargetDialect,
		SQL:           req.SQL,
		NaturalInput:  req.NaturalInput,
		DatabaseType:  req.DatabaseType,
		TableInfo:     req.TableInfo,
		Context:       req.Context,
	})
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
