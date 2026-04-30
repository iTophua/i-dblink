package api

import (
	"encoding/json"
	"net/http"

	"idblink-backend/models"
)

// SaveSnippet 保存代码片段（新增或更新）
func (h *Handler) SaveSnippet(w http.ResponseWriter, r *http.Request) {
	var req models.SaveSnippetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	snippet := models.Snippet{
		ID:        req.ID,
		Name:      req.Name,
		SQLText:   req.SQLText,
		DBType:    req.DBType,
		Category:  req.Category,
		Tags:      req.Tags,
		IsPrivate: req.IsPrivate,
		UserID:    req.UserID,
	}

	err := h.mgr.SnippetRepo().Save(&snippet)
	resp := models.GenericResponse{}
	if err != nil {
		resp.Error = err.Error()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// GetSnippets 获取代码片段列表
func (h *Handler) GetSnippets(w http.ResponseWriter, r *http.Request) {
	var req models.GetSnippetsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	snippets, err := h.mgr.SnippetRepo().GetByCategory(req.Category, req.DBType, req.UserID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.GetSnippetsResponse{
		Snippets: snippets,
	})
}

// DeleteSnippet 删除代码片段
func (h *Handler) DeleteSnippet(w http.ResponseWriter, r *http.Request) {
	var req models.DeleteSnippetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	err := h.mgr.SnippetRepo().Delete(req.ID)
	resp := models.GenericResponse{}
	if err != nil {
		resp.Error = err.Error()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
