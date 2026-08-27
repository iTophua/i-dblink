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
	}
	for _, c := range cases {
		if got := isTransientNetworkError(c.err); got != c.want {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
		}
	}
}
