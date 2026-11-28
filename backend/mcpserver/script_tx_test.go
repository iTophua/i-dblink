package mcpserver

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"idblink/backend/models"
)

// fakeDMLRunner 记录脚本执行期间对后端事务接口的调用。stmtErrors[i] 是第 i 条语句的
// SQL 报错——真实后端把 SQL 报错放在 QueryResult.Error 里，Go 的 err 只表示没执行到数据库那一层
type fakeDMLRunner struct {
	activeBefore  bool
	stmtErrors    map[int]string
	stmtGoError   error
	commitActive  bool
	commitErr     error
	cancelAt      int // 第几条语句执行时调用方的 ctx 被取消（cancel 为 nil 时不取消）
	cancel        context.CancelFunc
	begins        []string
	rollbacks     int
	commits       int
	execUseTx     []bool
	execDatabases []*string
}

func (f *fakeDMLRunner) GetTransactionStatus(connectionID string, sessionID string) (bool, error) {
	return f.activeBefore, nil
}

func (f *fakeDMLRunner) BeginTransaction(connectionID string, sessionID string, database string) error {
	f.begins = append(f.begins, database)
	return nil
}

func (f *fakeDMLRunner) RollbackTransaction(connectionID string, sessionID string) (bool, error) {
	f.rollbacks++
	return true, nil
}

func (f *fakeDMLRunner) CommitTransaction(connectionID string, sessionID string) (bool, error) {
	f.commits++
	return f.commitActive, f.commitErr
}

func (f *fakeDMLRunner) ExecuteQueryCtx(ctx context.Context, connectionID string, sql string, database *string, useTransaction *bool, sessionID string) (models.QueryResult, error) {
	f.execUseTx = append(f.execUseTx, useTransaction != nil && *useTransaction)
	f.execDatabases = append(f.execDatabases, database)
	if f.cancel != nil && f.cancelAt == len(f.execUseTx)-1 {
		// 模拟调用方的 ctx 到期：语句被打断，驱动报 context canceled
		f.cancel()
		return models.QueryResult{}, ctx.Err()
	}
	if f.stmtGoError != nil {
		return models.QueryResult{}, f.stmtGoError
	}
	return models.QueryResult{Error: f.stmtErrors[len(f.execUseTx)-1]}, nil
}

func resultText(res *mcp.CallToolResult) string {
	var b strings.Builder
	for _, c := range res.Content {
		if text, ok := c.(mcp.TextContent); ok {
			b.WriteString(text.Text)
		}
	}
	return b.String()
}

// 脚本的 DML 分支承诺「任一语句失败整体回滚」。此前只看 Go 的 err，而 SQL 报错在
// res.Error 里：失败的语句被当成成功，脚本继续往下跑并提交了前面的语句。
func TestRunDMLScriptRollsBackOnSQLError(t *testing.T) {
	db := "app"
	runner := &fakeDMLRunner{stmtErrors: map[int]string{1: "UNIQUE constraint failed: users.username"}}
	result := scriptResult{StatementCount: 3}

	failed := runDMLScript(context.Background(), runner, "conn", []string{
		"INSERT INTO users (username) VALUES ('a')",
		"INSERT INTO users (username) VALUES ('dup')",
		"INSERT INTO users (username) VALUES ('c')",
	}, &db, &result)

	require.NotNil(t, failed, "a failed statement must produce an error result")
	assert.True(t, failed.IsError)
	assert.Contains(t, resultText(failed), "statement 2/3 failed: UNIQUE constraint failed: users.username")
	assert.Contains(t, resultText(failed), "transaction rolled back (1 statements had succeeded)")
	assert.Equal(t, "rolled_back", result.Transaction)
	assert.Equal(t, 1, result.Executed, "statements after the failure must not run")
	assert.Equal(t, []string{"app"}, runner.begins, "tx must open on the script's database")
	assert.Equal(t, 1, runner.rollbacks)
	assert.Zero(t, runner.commits, "a failed script must not commit")
	assert.Len(t, runner.execUseTx, 2)
	assert.Equal(t, []bool{true, true}, runner.execUseTx, "statements must require the script's tx")
}

func TestRunDMLScriptRollsBackOnGoError(t *testing.T) {
	runner := &fakeDMLRunner{stmtGoError: errors.New("connection not found")}
	result := scriptResult{StatementCount: 2}

	failed := runDMLScript(context.Background(), runner, "conn", []string{"UPDATE t SET a = 1", "UPDATE t SET b = 2"}, nil, &result)

	require.NotNil(t, failed)
	assert.Contains(t, resultText(failed), "connection not found")
	assert.Equal(t, 1, runner.rollbacks)
	assert.Zero(t, runner.commits)
}

// 事务在脚本结束前被看门狗回收：没有东西可提交，不能报「已提交」
func TestRunDMLScriptReportsMissingTxAtCommit(t *testing.T) {
	runner := &fakeDMLRunner{commitActive: false}
	result := scriptResult{StatementCount: 1}

	failed := runDMLScript(context.Background(), runner, "conn", []string{"DELETE FROM t"}, nil, &result)

	require.NotNil(t, failed)
	assert.Contains(t, resultText(failed), "no longer active at commit time")
	assert.Equal(t, "", result.Transaction)
	assert.Equal(t, 1, runner.commits)
}

func TestRunDMLScriptCommitsWhenAllSucceed(t *testing.T) {
	runner := &fakeDMLRunner{commitActive: true}
	result := scriptResult{StatementCount: 2}

	failed := runDMLScript(context.Background(), runner, "conn", []string{"INSERT INTO t (a) VALUES (1)", "UPDATE t SET a = 2"}, nil, &result)

	assert.Nil(t, failed)
	assert.Equal(t, "committed", result.Transaction)
	assert.Equal(t, 2, result.Executed)
	assert.Equal(t, []string{""}, runner.begins, "no database given → the connection's default database")
	assert.Equal(t, 1, runner.commits)
	assert.Zero(t, runner.rollbacks)
}

// 调用方的 ctx 在脚本跑到一半时到期（timeout_seconds / 客户端取消）：
// 被打断的语句按失败处理，前面已执行的语句一起回滚，不留半截脚本
func TestRunDMLScriptRollsBackWhenContextIsCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	runner := &fakeDMLRunner{cancelAt: 1, cancel: cancel}
	result := scriptResult{StatementCount: 2}

	failed := runDMLScript(ctx, runner, "conn", []string{"INSERT INTO t (a) VALUES (1)", "UPDATE t SET a = 2"}, nil, &result)

	require.NotNil(t, failed)
	assert.Contains(t, resultText(failed), "context canceled")
	assert.Equal(t, 1, runner.rollbacks)
	assert.Zero(t, runner.commits)
}

func TestRunDMLScriptRefusesWhenManualTxIsActive(t *testing.T) {
	runner := &fakeDMLRunner{activeBefore: true}
	result := scriptResult{StatementCount: 1}

	failed := runDMLScript(context.Background(), runner, "conn", []string{"INSERT INTO t (a) VALUES (1)"}, nil, &result)

	require.NotNil(t, failed)
	assert.Contains(t, resultText(failed), "active manual transaction")
	assert.Empty(t, runner.begins, "the user's own tx must not be touched")
	assert.Zero(t, runner.rollbacks)
	assert.Zero(t, runner.commits)
}
