package backend

import (
	"encoding/json"

	"idblink/backend/api"
)

// DocOptions 文档生成选项（类型别名，与 api.DocOptions 保持同步）
type DocOptions = api.DocOptions

// GenerateDatabaseDoc 生成数据库文档（Markdown 格式）
// lang 为语言代码（"zh-CN" | "en-US"），决定生成文档的中英文文案
func (a *App) GenerateDatabaseDoc(connectionID string, database string, options DocOptions, lang string) (string, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return "", err
	}

	req := api.GenerateDocRequest{
		ConnectionID: connectionID,
		Database:     database,
		Options:      options,
		Lang:         lang,
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
