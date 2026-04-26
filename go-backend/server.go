package main

import (
	"fmt"
	"net"
	"net/http"
	"os"

	"idblink-backend/api"
	"idblink-backend/db"
)

// StartServer 启动 HTTP 服务并打印端口到 stdout
func StartServer() (*http.Server, error) {
	manager := db.NewManager()

	mux := http.NewServeMux()
	api.RegisterRoutes(mux, manager)

	// 监听随机端口
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("failed to listen: %w", err)
	}

	port := listener.Addr().(*net.TCPAddr).Port

	server := &http.Server{
		Handler: mux,
	}

	// 打印端口，Rust 侧读取
	fmt.Fprintf(os.Stdout, "PORT: %d\n", port)
	os.Stdout.Sync()

	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		}
	}()

	return server, nil
}
