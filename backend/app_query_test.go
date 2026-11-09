package backend

import (
	"context"
	"testing"
	"time"
)

// 用户取消与超时必须区分：Cancel → cancelled=true（不计错误）；
// DeadlineExceeded → 正常超时错误。
func TestIsContextCanceled(t *testing.T) {
	canceledCtx, cancel := context.WithCancel(context.Background())
	cancel()

	timeoutCtx, timeoutCancel := context.WithTimeout(context.Background(), time.Nanosecond)
	defer timeoutCancel()
	<-timeoutCtx.Done() // 确保已超时

	cases := []struct {
		name    string
		ctx     context.Context
		errMsg  string
		want    bool
	}{
		{"用户取消-裸错误", canceledCtx, "context canceled", true},
		{"用户取消-带前缀", canceledCtx, "row scan failed at row 3: context canceled", true},
		{"用户取消-其他错误", canceledCtx, "syntax error", false},
		{"超时-不算取消", timeoutCtx, "context deadline exceeded", false},
		{"超时但消息是canceled", timeoutCtx, "context canceled", false},
		{"未取消", context.Background(), "context canceled", false},
		{"nil ctx", nil, "context canceled", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := isContextCanceled(c.ctx, c.errMsg); got != c.want {
				t.Errorf("isContextCanceled(%v, %q) = %v, want %v", c.ctx, c.errMsg, got, c.want)
			}
		})
	}
}
