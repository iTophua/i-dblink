package backend

import (
	"encoding/json"
	"fmt"
	"time"

	"idblink/backend/localdb"
)

// ==================== 连接导入导出 ====================

// ExportConnections 导出所有连接和分组为JSON（不含密码）
func (a *App) ExportConnections() (string, error) {
	conns, err := a.storage.GetConnections()
	if err != nil {
		return "", fmt.Errorf("failed to get connections: %w", err)
	}

	groups, err := a.storage.GetGroups()
	if err != nil {
		return "", fmt.Errorf("failed to get groups: %w", err)
	}

	return marshalExportData(conns, groups)
}

// ExportConnectionsByID 按连接 ID 导出指定连接
func (a *App) ExportConnectionsByID(ids []string) (string, error) {
	allConns, err := a.storage.GetConnections()
	if err != nil {
		return "", fmt.Errorf("failed to get connections: %w", err)
	}

	idSet := make(map[string]bool, len(ids))
	for _, id := range ids {
		idSet[id] = true
	}

	conns := make([]*localdb.DbConnection, 0, len(ids))
	for _, c := range allConns {
		if idSet[c.ID] {
			conns = append(conns, c)
		}
	}

	groups, err := a.storage.GetGroups()
	if err != nil {
		return "", fmt.Errorf("failed to get groups: %w", err)
	}

	return marshalExportData(conns, groups)
}

func marshalExportData(conns []*localdb.DbConnection, groups []*localdb.ConnectionGroup) (string, error) {
	type ExportData struct {
		Version     string                     `json:"version"`
		ExportedAt  string                     `json:"exported_at"`
		Connections []*localdb.DbConnection    `json:"connections"`
		Groups      []*localdb.ConnectionGroup `json:"groups"`
	}

	data := ExportData{
		Version:     "1.0",
		ExportedAt:  time.Now().UTC().Format(time.RFC3339),
		Connections: conns,
		Groups:      groups,
	}

	jsonBytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal export data: %w", err)
	}
	return string(jsonBytes), nil
}

// ImportConnections 从JSON导入连接和分组，返回导入的连接数和分组数
func (a *App) ImportConnections(jsonStr string, overwrite bool) (int, int, error) {
	type ImportData struct {
		Version     string                     `json:"version"`
		Connections []*localdb.DbConnection    `json:"connections"`
		Groups      []*localdb.ConnectionGroup `json:"groups"`
	}

	var data ImportData
	if err := json.Unmarshal([]byte(jsonStr), &data); err != nil {
		return 0, 0, fmt.Errorf("invalid JSON format: %w", err)
	}

	importedConns := 0
	importedGroups := 0

	for _, group := range data.Groups {
		if err := a.storage.SaveGroup(group); err != nil {
			continue
		}
		importedGroups++
	}

	for _, conn := range data.Connections {
		if !overwrite {
			existing, _, err := a.storage.GetConnectionWithPassword(conn.ID)
			if err == nil && existing != nil {
				continue
			}
		}
		if err := a.storage.SaveConnection(conn, nil); err != nil {
			continue
		}
		importedConns++
	}

	return importedConns, importedGroups, nil
}

// ImportNavicatConnections 从 Navicat NCX 文件导入连接
func (a *App) ImportNavicatConnections(ncxContent string, overwrite bool) (int, error) {
	ncx, err := parseNCX(ncxContent)
	if err != nil {
		return 0, err
	}

	imported := 0
	for _, nc := range ncx.Connections {
		conn, password, err := ncxToDbConnection(nc)
		if err != nil {
			continue
		}

		if !overwrite {
			existing, _, err := a.storage.GetConnectionWithPassword(conn.ID)
			if err == nil && existing != nil {
				continue
			}
		}

		if err := a.storage.SaveConnection(conn, password); err != nil {
			continue
		}
		imported++
	}

	return imported, nil
}
