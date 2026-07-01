package backend

import (
	"idblink/backend/localdb"
)

// ==================== 收藏夹 ====================

// SaveFavorite 保存收藏
func (a *App) SaveFavorite(id string, favType string, name string, connectionID *string, database *string, tableName *string, sqlText *string, tags string) (string, error) {
	fav := &localdb.Favorite{
		Type:         favType,
		Name:         name,
		ConnectionID: connectionID,
		Database:     database,
		TableName:    tableName,
		SqlText:      sqlText,
		Tags:         tags,
	}
	if id != "" {
		fav.ID = id
		existing, err := a.storage.GetFavorites()
		if err != nil {
			return "", err
		}
		for _, f := range existing {
			if f.ID == id {
				fav.CreatedAt = f.CreatedAt
				break
			}
		}
	}

	err := a.storage.SaveFavorite(fav)
	if err != nil {
		return "", err
	}
	return fav.ID, nil
}

// GetFavorites 获取所有收藏
func (a *App) GetFavorites() ([]localdb.Favorite, error) {
	favorites, err := a.storage.GetFavorites()
	if err != nil {
		return nil, err
	}

	result := make([]localdb.Favorite, len(favorites))
	for i, f := range favorites {
		result[i] = *f
	}
	return result, nil
}

// DeleteFavorite 删除收藏
func (a *App) DeleteFavorite(id string) error {
	return a.storage.DeleteFavorite(id)
}
