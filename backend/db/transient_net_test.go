package db

import (
	"errors"
	"fmt"
	"net"
	"os"
	"syscall"
	"testing"
)

func opErrWith(err error) error {
	return &net.OpError{Op: "dial", Net: "tcp", Err: err}
}

// dmStyleError 模拟达梦驱动的自有错误类型：不实现 Unwrap、
// 不暴露底层 net.OpError，错误文本自带 "dial address: host:port"
type dmStyleError struct{ msg string }

func (e *dmStyleError) Error() string { return e.msg }

func TestIsTransientNetworkError(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"EHOSTUNRECH", opErrWith(syscall.EHOSTUNREACH), true},
		{"ENETDOWN", opErrWith(syscall.ENETDOWN), true},
		{"ENETUNREACH", opErrWith(syscall.ENETUNREACH), true},
		{"EHOSTDOWN", opErrWith(syscall.EHOSTDOWN), true},
		{"wrapped EHOSTUNREACH", fmt.Errorf("dial tcp 172.18.10.95:7033: %w", opErrWith(syscall.EHOSTUNREACH)), true},
		{"timeout", opErrWith(os.ErrDeadlineExceeded), false},
		{"refused", opErrWith(syscall.ECONNREFUSED), false},
		{"plain error", errors.New("ping failed: invalid connection"), false},
		{"nil", nil, false},
		// 达梦驱动包装的拨号错误（errors.As 解不出 OpError）——生产实例报错原文
		{"dm wrapped dial", errors.New("Error 6001: 网络通信异常\tdial address: 172.18.11.200:7033"), true},
		{"dm typed dial error", &dmStyleError{msg: "Error 6001: 网络通信异常\tdial address: 172.18.11.200:7033"}, true},
		// 非拨号阶段的驱动错误（如查询期网络异常）不带 dial address，不重试
		{"dm query-stage error", &dmStyleError{msg: "Error 6001: 网络通信异常"}, false},
		{"auth error", errors.New("Error 1045: Access denied for user"), false},
	}
	for _, c := range cases {
		if got := isTransientNetworkError(c.err); got != c.want {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
		}
	}
}
