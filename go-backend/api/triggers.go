package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"idblink-backend/db"
	"idblink-backend/models"
)

// GetTriggersRequest 获取触发器请求
type GetTriggersRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database,omitempty"`
}

// GetTriggers 获取触发器列表
func (h *Handler) GetTriggers(w http.ResponseWriter, r *http.Request) {
	var req GetTriggersRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	pool, err := h.mgr.GetPool(req.ConnectionID)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("connection not found: %v", err))
		return
	}

	triggers, err := getTriggers(pool, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"triggers": triggers,
	})
}

// getTriggers 根据数据库类型获取触发器列表
func getTriggers(pool *db.DBPool, database string) ([]map[string]interface{}, error) {
	var triggers []map[string]interface{}
	db := pool.DB()

	switch pool.DbType {
	case "mysql", "mariadb":
		rows, err := db.Query(
			"SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_SCHEMA, EVENT_OBJECT_TABLE, "+
				"ACTION_TIMING, CREATED, ACTION_STATEMENT FROM information_schema.TRIGGERS"+
				" WHERE TRIGGER_SCHEMA = ?",
			database,
		)
		if err != nil {
			return nil, fmt.Errorf("get triggers failed: %v", err)
		}
		defer rows.Close()

		for rows.Next() {
			var name, event, schema, table, timing, created, stmt string
			if err := rows.Scan(&name, &event, &schema, &table, &timing, &created, &stmt); err == nil {
				triggers = append(triggers, map[string]interface{}{
					"name":               name,
					"event_manipulation": event,
					"table_name":         table,
					"timing":             timing,
					"created":            created,
					"statement":          stmt,
				})
			}
		}

	case "postgresql", "highgo", "vastbase":
		rows, err := db.Query(
			"SELECT tgname, pg_get_triggerdef(oid), relname"+
				" FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid"+
				" WHERE NOT tgisinternal AND c.relnamespace = $1::regnamespace",
			database,
		)
		if err != nil {
			return nil, fmt.Errorf("get triggers failed: %v", err)
		}
		defer rows.Close()

		for rows.Next() {
			var name, def, relname string
			if err := rows.Scan(&name, &def, &relname); err == nil {
				triggers = append(triggers, map[string]interface{}{
					"name":       name,
					"definition": def,
					"table_name": relname,
				})
			}
		}

	case "sqlite":
		// SQLite 从 sqlite_master 获取触发器
		rows, err := db.Query(
			"SELECT name, sql FROM sqlite_master WHERE type='trigger'",
		)
		if err != nil {
			return nil, fmt.Errorf("get triggers failed: %v", err)
		}
		defer rows.Close()

		for rows.Next() {
			var name, sql string
			if err := rows.Scan(&name, &sql); err == nil && sql != "" {
				triggers = append(triggers, map[string]interface{}{
					"name": name,
					"sql":  sql,
				})
			}
		}

	case "dameng", "kingbase":
		// 达梦/金仓
		rows, err := db.Query(
			"SELECT object_name, text FROM user_objects WHERE object_type = 'TRIGGER'",
		)
		if err != nil {
			return nil, fmt.Errorf("get triggers failed: %v", err)
		}
		defer rows.Close()

		for rows.Next() {
			var name, text string
			if err := rows.Scan(&name, &text); err == nil {
				triggers = append(triggers, map[string]interface{}{
					"name": name,
					"text": text,
				})
			}
		}
	}

	return triggers, nil
}

// GetEventsRequest 获取事件请求 (MySQL)
type GetEventsRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database,omitempty"`
}

// GetEvents 获取事件列表 (MySQL EVENT)
func (h *Handler) GetEvents(w http.ResponseWriter, r *http.Request) {
	var req GetEventsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	pool, err := h.mgr.GetPool(req.ConnectionID)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("connection not found: %v", err))
		return
	}

	events, err := getEvents(pool, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"events": events,
	})
}

// getEvents 获取事件列表 (MySQL)
func getEvents(pool *db.DBPool, database string) ([]map[string]interface{}, error) {
	var events []map[string]interface{}

	if pool.DbType != "mysql" && pool.DbType != "mariadb" {
		return events, nil
	}

	rows, err := pool.DB().Query(
		"SELECT EVENT_NAME, EVENT_TYPE, EXECUTE_AT, INTERVAL_VALUE, INTERVAL_FIELD, "+
			"STATUS, CREATED, LAST_ALTERED, LAST_EXECUTED, EVENT_DEFINITION, COMMENTS"+
			" FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ?",
		database,
	)
	if err != nil {
		return nil, fmt.Errorf("get events failed: %v", err)
	}
	defer rows.Close()

	for rows.Next() {
		var name, eventType, executeAt, intervalVal, intervalField string
		var status, created, lastAltered, lastExecuted, definition, comments interface{}
		if err := rows.Scan(&name, &eventType, &executeAt, &intervalVal, &intervalField,
			&status, &created, &lastAltered, &lastExecuted, &definition, &comments); err == nil {
			events = append(events, map[string]interface{}{
				"name":           name,
				"event_type":     eventType,
				"execute_at":     executeAt,
				"interval_value": intervalVal,
				"interval_field": intervalField,
				"status":         status,
				"created":        created,
				"last_altered":   lastAltered,
				"last_executed":  lastExecuted,
				"definition":     definition,
				"comments":       comments,
			})
		}
	}

	return events, nil
}
