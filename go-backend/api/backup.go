package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	"idblink-backend/models"
)

// BackupToolCheckRequest 检测备份工具请求
type BackupToolCheckRequest struct {
	DbType string `json:"db_type"`
}

// BackupToolCheckResponse 检测备份工具响应
type BackupToolCheckResponse struct {
	Available bool   `json:"available"`
	Path      string `json:"path,omitempty"`
	Error     string `json:"error,omitempty"`
}

// BackupRequest 备份请求
type BackupRequest struct {
	ConnectionID     string   `json:"connection_id"`
	Database         string   `json:"database"`
	Tables           []string `json:"tables,omitempty"`
	IncludeStructure bool     `json:"include_structure"`
	IncludeData      bool     `json:"include_data"`
	FilePath         string   `json:"file_path"`
}

// BackupResponse 备份响应
type BackupResponse struct {
	FilePath string `json:"file_path,omitempty"`
	Error    string `json:"error,omitempty"`
}

// RestoreRequest 恢复请求
type RestoreRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database"`
	FilePath     string `json:"file_path"`
}

// checkBackupTool 检测系统是否安装了备份工具
func checkBackupTool(dbType string) (bool, string) {
	switch dbType {
	case "mysql", "mariadb":
		path, _ := exec.LookPath("mysqldump")
		return path != "", path
	case "postgresql", "kingbase", "highgo", "vastbase":
		path, _ := exec.LookPath("pg_dump")
		return path != "", path
	default:
		return false, ""
	}
}

// CheckBackupTool 检测备份工具 HTTP handler
func (h *Handler) CheckBackupTool(w http.ResponseWriter, r *http.Request) {
	var req BackupToolCheckRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	available, path := checkBackupTool(req.DbType)
	resp := BackupToolCheckResponse{Available: available, Path: path}
	if !available {
		resp.Error = fmt.Sprintf("未找到 %s 的备份工具", req.DbType)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// Backup 执行备份 HTTP handler
func (h *Handler) Backup(w http.ResponseWriter, r *http.Request) {
	var req BackupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	args, err := h.mgr.GetConnectArgs(req.ConnectionID)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("connection not found: %v", err))
		return
	}

	dbType := args.DbType
	available, toolPath := checkBackupTool(dbType)
	if !available {
		writeJSONError(w, fmt.Sprintf("未找到 %s 的备份工具，请先安装", dbType))
		return
	}

	// 确保目录存在
	dir := filepath.Dir(req.FilePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		writeJSONError(w, fmt.Sprintf("创建目录失败: %v", err))
		return
	}

	var cmd *exec.Cmd
	switch dbType {
	case "mysql", "mariadb":
		cmdArgs := []string{
			fmt.Sprintf("-h%s", args.Host),
			fmt.Sprintf("-P%d", args.Port),
			fmt.Sprintf("-u%s", args.Username),
		}
		if !req.IncludeData {
			cmdArgs = append(cmdArgs, "--no-data")
		}
		if !req.IncludeStructure {
			cmdArgs = append(cmdArgs, "--no-create-info")
		}
		if len(req.Tables) > 0 {
			cmdArgs = append(cmdArgs, req.Database)
			cmdArgs = append(cmdArgs, req.Tables...)
		} else {
			cmdArgs = append(cmdArgs, req.Database)
		}
		cmd = exec.Command(toolPath, cmdArgs...)
		if args.Password != "" {
			cmd.Env = append(os.Environ(), fmt.Sprintf("MYSQL_PWD=%s", args.Password))
		}

	case "postgresql", "kingbase", "highgo", "vastbase":
		cmdArgs := []string{
			fmt.Sprintf("-h%s", args.Host),
			fmt.Sprintf("-p%d", args.Port),
			fmt.Sprintf("-U%s", args.Username),
			fmt.Sprintf("-d%s", req.Database),
			"-Fc",
		}
		if !req.IncludeData {
			cmdArgs = append(cmdArgs, "--schema-only")
		}
		if !req.IncludeStructure {
			cmdArgs = append(cmdArgs, "--data-only")
		}
		if len(req.Tables) > 0 {
			for _, t := range req.Tables {
				cmdArgs = append(cmdArgs, "-t", t)
			}
		}
		cmd = exec.Command(toolPath, cmdArgs...)
		if args.Password != "" {
			cmd.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", args.Password))
		}
	}

	if cmd == nil {
		writeJSONError(w, "不支持的数据库类型")
		return
	}

	// 执行备份并写入文件
	outFile, err := os.Create(req.FilePath)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("创建备份文件失败: %v", err))
		return
	}
	defer outFile.Close()

	cmd.Stdout = outFile
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		writeJSONError(w, fmt.Sprintf("启动备份失败: %v", err))
		return
	}

	// 读取 stderr
	stderrBytes, _ := io.ReadAll(stderr)
	if err := cmd.Wait(); err != nil {
		writeJSONError(w, fmt.Sprintf("备份失败: %v, stderr: %s", err, string(stderrBytes)))
		return
	}

	resp := BackupResponse{FilePath: req.FilePath}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// Restore 执行恢复 HTTP handler
func (h *Handler) Restore(w http.ResponseWriter, r *http.Request) {
	var req RestoreRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	args, err := h.mgr.GetConnectArgs(req.ConnectionID)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("connection not found: %v", err))
		return
	}

	dbType := args.DbType
	var toolName string
	switch dbType {
	case "mysql", "mariadb":
		toolName = "mysql"
	case "postgresql", "kingbase", "highgo", "vastbase":
		toolName = "pg_restore"
	default:
		writeJSONError(w, "不支持的数据库类型")
		return
	}

	toolPath, err := exec.LookPath(toolName)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("未找到恢复工具 %s，请先安装", toolName))
		return
	}

	// 检查文件是否存在
	if _, err := os.Stat(req.FilePath); err != nil {
		writeJSONError(w, fmt.Sprintf("备份文件不存在: %v", err))
		return
	}

	var cmd *exec.Cmd
	switch dbType {
	case "mysql", "mariadb":
		cmdArgs := []string{
			fmt.Sprintf("-h%s", args.Host),
			fmt.Sprintf("-P%d", args.Port),
			fmt.Sprintf("-u%s", args.Username),
			req.Database,
		}
		if args.Password != "" {
			cmdArgs = append(cmdArgs, fmt.Sprintf("-p%s", args.Password))
		}
		cmd = exec.Command(toolPath, cmdArgs...)
		inFile, err := os.Open(req.FilePath)
		if err != nil {
			writeJSONError(w, fmt.Sprintf("打开备份文件失败: %v", err))
			return
		}
		defer inFile.Close()
		cmd.Stdin = inFile

	case "postgresql", "kingbase", "highgo", "vastbase":
		cmdArgs := []string{
			fmt.Sprintf("-h%s", args.Host),
			fmt.Sprintf("-p%d", args.Port),
			fmt.Sprintf("-U%s", args.Username),
			fmt.Sprintf("-d%s", req.Database),
			req.FilePath,
		}
		cmd = exec.Command(toolPath, cmdArgs...)
		if args.Password != "" {
			cmd.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", args.Password))
		}
	}

	stderr, _ := cmd.StderrPipe()
	if err := cmd.Start(); err != nil {
		writeJSONError(w, fmt.Sprintf("启动恢复失败: %v", err))
		return
	}

	stderrBytes, _ := io.ReadAll(stderr)
	if err := cmd.Wait(); err != nil {
		writeJSONError(w, fmt.Sprintf("恢复失败: %v, stderr: %s", err, string(stderrBytes)))
		return
	}

	resp := models.GenericResponse{}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
