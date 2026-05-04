package testutil

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"idblink-backend/db"
)

// NewTestHandler creates a handler with test database
func NewTestHandler(t *testing.T) (*db.Manager, *http.ServeMux) {
	manager := db.NewManager()
	mux := http.NewServeMux()
	return manager, mux
}

// MakeRequest creates a test HTTP request
func MakeRequest(t *testing.T, method, path string, body interface{}) *http.Request {
	var bodyBytes []byte
	if body != nil {
		var err error
		bodyBytes, err = json.Marshal(body)
		if err != nil {
			t.Fatalf("failed to marshal request body: %v", err)
		}
	}

	req := httptest.NewRequest(method, path, bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	return req
}

// ExecuteRequest executes HTTP request and returns response
func ExecuteRequest(t *testing.T, handler http.Handler, req *http.Request) *httptest.ResponseRecorder {
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	return rr
}

// ParseResponse parses JSON response into target
func ParseResponse(t *testing.T, rr *httptest.ResponseRecorder, target interface{}) {
	if err := json.NewDecoder(rr.Body).Decode(target); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
}

// AssertStatus asserts HTTP status code
func AssertStatus(t *testing.T, rr *httptest.ResponseRecorder, expected int) {
	if rr.Code != expected {
		t.Errorf("expected status %d, got %d", expected, rr.Code)
	}
}

// AssertJSON asserts response contains valid JSON
func AssertJSON(t *testing.T, rr *httptest.ResponseRecorder) {
	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("expected Content-Type application/json, got %s", contentType)
	}

	var dummy map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&dummy); err != nil {
		t.Errorf("response is not valid JSON: %v", err)
	}
}
