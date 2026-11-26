package backend

import (
	"context"
	"time"

	"idblink/backend/models"
)

// GetERDiagram 取齐画 ER 图所需的数据：表、列（带主键标记）、外键。
// database 为空时取连接的默认库。
func (a *App) GetERDiagram(connectionID string, database *string) (models.ERDiagram, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return models.ERDiagram{}, err
	}
	start := time.Now()
	result, err := a.handler.GetERDiagram(context.Background(), connectionID, database)
	errMsg := ""
	if err != nil {
		errMsg = err.Error()
	}
	logAPICall("GetERDiagram", time.Since(start), errMsg)
	return result, err
}
