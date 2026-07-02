package backend

import (
	"encoding/json"

	"idblink/backend/api"
)

// DocOptions 文档生成选项（类型别名，与 api.DocOptions 保持同步）
type DocOptions = api.DocOptions

// GenerateDatabaseDoc 生成数据库文档（Markdown 格式）
func (a *App) GenerateDatabaseDoc(connectionID string, database string, options DocOptions) (string, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return "", err
	}

	req := api.GenerateDocRequest{
		ConnectionID: connectionID,
		Database:     database,
		Options:      options,
	}

	respBytes, err := callHandler(a.handler.GenerateDoc, req)
	if err != nil {
		return "", err
	}

	var result map[string]string
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return "", err
	}
	return result["content"], nil
}
