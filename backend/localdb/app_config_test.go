package localdb

import (
	"path/filepath"
	"testing"
)

func openTestAppConfigRepo(t *testing.T) *AppConfigRepository {
	t.Helper()
	pool, err := NewPool(filepath.Join(t.TempDir(), "config.db"))
	if err != nil {
		t.Fatalf("open pool: %v", err)
	}
	t.Cleanup(func() { _ = pool.Close() })
	if err := RunMigrations(pool.DB()); err != nil {
		t.Fatalf("migrations: %v", err)
	}
	return NewAppConfigRepository(pool.DB())
}

func TestAppConfigRepository(t *testing.T) {
	repo := openTestAppConfigRepo(t)

	// 没写过的 key：不是错误，只是没找到
	if _, found, err := repo.Get("startup_theme"); err != nil || found {
		t.Fatalf("expected missing key, got found=%v err=%v", found, err)
	}

	if err := repo.Set("startup_theme", `{"a":1}`); err != nil {
		t.Fatalf("set: %v", err)
	}
	got, found, err := repo.Get("startup_theme")
	if err != nil || !found || got != `{"a":1}` {
		t.Fatalf("expected {\"a\":1}, got %q found=%v err=%v", got, found, err)
	}

	// 同名再写是覆盖，不是多出一行
	if err := repo.Set("startup_theme", `{"a":2}`); err != nil {
		t.Fatalf("set again: %v", err)
	}
	got, found, err = repo.Get("startup_theme")
	if err != nil || !found || got != `{"a":2}` {
		t.Fatalf("expected {\"a\":2} after overwrite, got %q found=%v err=%v", got, found, err)
	}

	// 各 key 互不影响
	if err := repo.Set("other", "x"); err != nil {
		t.Fatalf("set other: %v", err)
	}
	if got, found, err = repo.Get("startup_theme"); err != nil || !found || got != `{"a":2}` {
		t.Fatalf("startup_theme changed by writing another key: %q found=%v err=%v", got, found, err)
	}
}

// 重开库之后还在：启动时读的是上次运行写下的值
func TestAppConfigRepositoryPersistsAcrossReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.db")
	pool, err := NewPool(path)
	if err != nil {
		t.Fatalf("open pool: %v", err)
	}
	if err := RunMigrations(pool.DB()); err != nil {
		t.Fatalf("migrations: %v", err)
	}
	if err := NewAppConfigRepository(pool.DB()).Set("startup_theme", "saved"); err != nil {
		t.Fatalf("set: %v", err)
	}
	_ = pool.Close()

	pool, err = NewPool(path)
	if err != nil {
		t.Fatalf("reopen pool: %v", err)
	}
	t.Cleanup(func() { _ = pool.Close() })
	got, found, err := NewAppConfigRepository(pool.DB()).Get("startup_theme")
	if err != nil || !found || got != "saved" {
		t.Fatalf("expected saved value after reopen, got %q found=%v err=%v", got, found, err)
	}
}
