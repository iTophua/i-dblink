package backend

import (
	"idblink/backend/localdb"
)

// ==================== 代码片段 ====================

// SaveSnippet 保存代码片段
func (a *App) SaveSnippet(id *string, name string, sqlText string, dbType *string, category *string, tags *string, isPrivate bool) (string, error) {
	snippet := &localdb.Snippet{
		Name:      name,
		SQLText:   sqlText,
		IsPrivate: isPrivate,
	}
	if dbType != nil {
		snippet.DbType = dbType
	}
	if category != nil {
		snippet.Category = category
	}
	if tags != nil {
		snippet.Tags = tags
	}

	if id != nil && *id != "" {
		snippet.ID = *id
		existing, err := a.storage.GetSnippets()
		if err != nil {
			return "", err
		}
		for _, s := range existing {
			if s.ID == *id {
				snippet.CreatedAt = s.CreatedAt
				break
			}
		}
	}

	err := a.storage.SaveSnippet(snippet)
	if err != nil {
		return "", err
	}
	return snippet.ID, nil
}

// GetSnippets 获取所有代码片段
func (a *App) GetSnippets() ([]localdb.Snippet, error) {
	snippets, err := a.storage.GetSnippets()
	if err != nil {
		return nil, err
	}

	result := make([]localdb.Snippet, len(snippets))
	for i, s := range snippets {
		result[i] = *s
	}
	return result, nil
}

// DeleteSnippet 删除代码片段
func (a *App) DeleteSnippet(id string) error {
	return a.storage.DeleteSnippet(id)
}
