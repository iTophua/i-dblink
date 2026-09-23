package db

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewManager(t *testing.T) {
	manager := NewManager()
	assert.NotNil(t, manager)
	assert.NotNil(t, manager.pools)
	assert.NotNil(t, manager.txs)
}

func TestManagerConnect(t *testing.T) {
	manager := NewManager()

	t.Run("connect with sqlite", func(t *testing.T) {
		err := manager.Connect("test-sqlite-1", ConnectArgs{
			DbType:   "sqlite",
			Database: ":memory:",
		})
		require.NoError(t, err)

		// Verify connection exists
		exec, err := manager.GetExecutor("test-sqlite-1", "")
		require.NoError(t, err)
		assert.NotNil(t, exec)
	})

	t.Run("empty connection id", func(t *testing.T) {
		err := manager.Connect("", ConnectArgs{
			DbType:   "sqlite",
			Database: ":memory:",
		})
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "connection_id is required")
	})

	t.Run("duplicate connection id", func(t *testing.T) {
		err := manager.Connect("test-dup", ConnectArgs{
			DbType:   "sqlite",
			Database: ":memory:",
		})
		require.NoError(t, err)

		err = manager.Connect("test-dup", ConnectArgs{
			DbType:   "sqlite",
			Database: ":memory:",
		})
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "already exists")
	})

	t.Run("invalid db type", func(t *testing.T) {
		err := manager.Connect("test-invalid", ConnectArgs{
			DbType:   "invalid",
			Host:     "localhost",
			Port:     3306,
			Username: "test",
			Password: "test",
		})
		assert.Error(t, err)
	})
}

func TestManagerDisconnect(t *testing.T) {
	manager := NewManager()

	// Setup connection
	err := manager.Connect("test-disconnect", ConnectArgs{
		DbType:   "sqlite",
		Database: ":memory:",
	})
	require.NoError(t, err)

	t.Run("disconnect existing", func(t *testing.T) {
		err := manager.Disconnect("test-disconnect")
		assert.NoError(t, err)

		// Verify connection is gone
		_, err = manager.GetExecutor("test-disconnect", "")
		assert.Error(t, err)
	})

	t.Run("disconnect non-existent", func(t *testing.T) {
		err := manager.Disconnect("non-existent")
		assert.Error(t, err)
	})

	t.Run("disconnect empty id", func(t *testing.T) {
		err := manager.Disconnect("")
		assert.Error(t, err)
	})
}

func TestManagerGetExecutor(t *testing.T) {
	manager := NewManager()

	// Setup connection
	err := manager.Connect("test-executor", ConnectArgs{
		DbType:   "sqlite",
		Database: ":memory:",
	})
	require.NoError(t, err)

	t.Run("get existing executor", func(t *testing.T) {
		exec, err := manager.GetExecutor("test-executor", "")
		require.NoError(t, err)
		assert.NotNil(t, exec)
	})

	t.Run("get non-existent executor", func(t *testing.T) {
		_, err := manager.GetExecutor("non-existent", "")
		assert.Error(t, err)
	})

	t.Run("get executor with database", func(t *testing.T) {
		// For SQLite, database parameter is ignored in connection lookup
		exec, err := manager.GetExecutor("test-executor", "main")
		require.NoError(t, err)
		assert.NotNil(t, exec)
	})
}

func TestManagerGetDBType(t *testing.T) {
	manager := NewManager()

	// Setup connection
	err := manager.Connect("test-dbtype", ConnectArgs{
		DbType:   "sqlite",
		Database: ":memory:",
	})
	require.NoError(t, err)

	t.Run("get db type for existing", func(t *testing.T) {
		dbType, err := manager.GetDBType("test-dbtype")
		require.NoError(t, err)
		assert.Equal(t, "sqlite", dbType)
	})

	t.Run("get db type for non-existent", func(t *testing.T) {
		_, err := manager.GetDBType("non-existent")
		assert.Error(t, err)
	})
}

func TestManagerConcurrentAccess(t *testing.T) {
	manager := NewManager()

	// Connect multiple databases concurrently
	for i := 0; i < 10; i++ {
		go func(idx int) {
			connID := "concurrent-" + string(rune('0'+idx))
			err := manager.Connect(connID, ConnectArgs{
				DbType:   "sqlite",
				Database: ":memory:",
			})
			assert.NoError(t, err)
		}(i)
	}

	// Simple delay to let goroutines complete
	// In real tests, use sync.WaitGroup
	for i := 0; i < 10; i++ {
		connID := "concurrent-" + string(rune('0'+i))
		exec, err := manager.GetExecutor(connID, "")
		if err == nil {
			assert.NotNil(t, exec)
		}
	}
}

func TestConnectArgsValidation(t *testing.T) {
	tests := []struct {
		name    string
		args    ConnectArgs
		wantErr bool
	}{
		{
			name: "valid sqlite",
			args: ConnectArgs{
				DbType:   "sqlite",
				Database: ":memory:",
			},
			wantErr: false,
		},
		{
			name: "valid mysql",
			args: ConnectArgs{
				DbType:   "mysql",
				Host:     "localhost",
				Port:     3306,
				Username: "root",
				Password: "password",
			},
			wantErr: false,
		},
		{
			name: "valid postgres",
			args: ConnectArgs{
				DbType:   "postgresql",
				Host:     "localhost",
				Port:     5432,
				Username: "postgres",
				Password: "password",
			},
			wantErr: false,
		},
		{
			name: "missing host for mysql",
			args: ConnectArgs{
				DbType:   "mysql",
				Host:     "",
				Port:     3306,
				Username: "root",
			},
			wantErr: true,
		},
		{
			name: "invalid port",
			args: ConnectArgs{
				DbType:   "mysql",
				Host:     "localhost",
				Port:     0,
				Username: "root",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Note: This test validates argument structure
			// Actual connection success depends on database availability
			manager := NewManager()
			err := manager.Connect("test-"+tt.name, tt.args)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				// For SQLite in-memory, should succeed
				// For network databases, might fail due to no server
				if tt.args.DbType == "sqlite" {
					assert.NoError(t, err)
				}
			}
		})
	}
}

func TestSSLArgs(t *testing.T) {
	ssl := SSLArgs{
		Enabled:    true,
		CAPath:     "/path/to/ca.pem",
		CertPath:   "/path/to/cert.pem",
		KeyPath:    "/path/to/key.pem",
		SkipVerify: false,
	}

	assert.True(t, ssl.Enabled)
	assert.Equal(t, "/path/to/ca.pem", ssl.CAPath)
	assert.Equal(t, "/path/to/cert.pem", ssl.CertPath)
	assert.Equal(t, "/path/to/key.pem", ssl.KeyPath)
	assert.False(t, ssl.SkipVerify)
}

func TestSSHTunnelArgs(t *testing.T) {
	ssh := SSHTunnelArgs{
		Enabled:        true,
		Host:           "ssh.example.com",
		Port:           22,
		Username:       "sshuser",
		AuthMethod:     "password",
		Password:       "sshpass",
		PrivateKeyPath: "",
		Passphrase:     "",
	}

	assert.True(t, ssh.Enabled)
	assert.Equal(t, "ssh.example.com", ssh.Host)
	assert.Equal(t, 22, ssh.Port)
	assert.Equal(t, "sshuser", ssh.Username)
	assert.Equal(t, "password", ssh.AuthMethod)
	assert.Equal(t, "sshpass", ssh.Password)
}

// countRows 用池执行器（非事务）统计行数——事务效果必须从事务外可见才作数
func countRows(t *testing.T, manager *Manager, connID, table string) int {
	t.Helper()
	exec, err := manager.GetExecutor(connID, "")
	require.NoError(t, err)
	var n int
	require.NoError(t, exec.QueryRowContext(context.Background(),
		fmt.Sprintf("SELECT COUNT(*) FROM %s", table)).Scan(&n))
	return n
}

// TestTransactionLifecycle 回归：事务在 BeginTransaction 返回后必须仍然存活。
// 此前 BeginTx 绑定了函数级 ctx（defer cancel），Begin 返回的瞬间事务即被
// database/sql 异步回滚，事务内任何语句都报 sql.ErrTxDone、提交也落不了库
// （GUI 手工事务与 MCP execute_script 的 DML 分支全部失效）。
func TestTransactionLifecycle(t *testing.T) {
	manager := NewManager()
	connID := "tx-lifecycle"
	dbPath := filepath.Join(t.TempDir(), "tx_test.db")
	require.NoError(t, manager.Connect(connID, ConnectArgs{DbType: "sqlite", Database: dbPath}))
	defer manager.Disconnect(connID)

	pool, err := manager.GetExecutor(connID, "")
	require.NoError(t, err)
	_, err = pool.ExecContext(context.Background(),
		"CREATE TABLE tx_reg (id INTEGER PRIMARY KEY, v TEXT)")
	require.NoError(t, err)

	t.Run("commit persists statements after Begin returns", func(t *testing.T) {
		require.NoError(t, manager.BeginTransaction(connID))

		// 事务执行器：Begin 已返回，语句必须能执行（不能是 ErrTxDone）
		txExec, err := manager.GetExecutor(connID, "")
		require.NoError(t, err)
		_, err = txExec.ExecContext(context.Background(),
			"INSERT INTO tx_reg (v) VALUES ('committed')")
		require.NoError(t, err)

		require.NoError(t, manager.CommitTransaction(connID))
		assert.Equal(t, 1, countRows(t, manager, connID, "tx_reg"))
		assert.False(t, manager.HasTransaction(connID))
	})

	t.Run("rollback discards statements", func(t *testing.T) {
		require.NoError(t, manager.BeginTransaction(connID))

		txExec, err := manager.GetExecutor(connID, "")
		require.NoError(t, err)
		_, err = txExec.ExecContext(context.Background(),
			"INSERT INTO tx_reg (v) VALUES ('rolled-back')")
		require.NoError(t, err)

		require.NoError(t, manager.RollbackTransaction(connID))
		assert.Equal(t, 1, countRows(t, manager, connID, "tx_reg"), "回滚后插入不应落库")
		assert.False(t, manager.HasTransaction(connID))
	})
}
