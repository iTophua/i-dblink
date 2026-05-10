use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tokio::sync::Mutex as AsyncMutex;
use tokio::time::sleep;

/// SidecarState 包装 Arc<Mutex> 并实现 Deref
pub struct SidecarState(pub Arc<AsyncMutex<Option<Arc<SidecarManager>>>>);

impl std::ops::Deref for SidecarState {
    type Target = AsyncMutex<Option<Arc<SidecarManager>>>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// Sidecar 管理器：负责启动 Go 后端进程、心跳维护、看门狗和自动重启
pub struct SidecarManager {
    port: u16,
    client: reqwest::Client,
    process: AsyncMutex<Child>,
    child_pid: u32,
    stop_watchdog: Arc<AtomicBool>,
    heartbeat_tx: std::sync::mpsc::Sender<()>,
}

impl SidecarManager {
    /// 启动 Go sidecar 进程
    ///
    /// 包含三层保护：
    /// 1. 启动前清理：检查并 kill 旧的 go-backend 进程
    /// 2. pid 文件追踪
    /// 3. stdin 心跳绑定
    pub fn start() -> Result<Self, String> {
        Self::cleanup_old_processes();

        let binary_path = find_binary()?;

        let mut child = Command::new(&binary_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!(
                "Failed to start sidecar at {:?}: {}. Please build Go backend first: cd go-backend && go build",
                binary_path, e
            ))?;

        let child_pid = child.id() as u32;
        let _ = Self::write_pid_file(child_pid);

        let log_path = Self::get_log_path();
        let log_path_stderr = log_path.clone();

        if let Some(stderr) = child.stderr.take() {
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                let file = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&log_path_stderr)
                    .ok();
                let mut writer = file.map(|f| std::io::LineWriter::new(f));
                for line in reader.lines().flatten() {
                    let msg = format!("[go-backend stderr] {}", line);
                    eprintln!("{}", msg);
                    if let Some(ref mut w) = writer {
                        let _ = writeln!(w, "{}", msg);
                    }
                }
            });
        }

        let stdout = child.stdout.take().ok_or_else(|| {
            "Failed to capture stdout".to_string()
        })?;
        let mut reader = BufReader::new(stdout);
        let mut port = 0u16;
        let mut buf = String::new();

        loop {
            buf.clear();
            match reader.read_line(&mut buf) {
                Ok(0) => break,
                Ok(_) => {
                    let line = buf.trim_end();
                    tracing::info!("Read line from stdout: {}", line);
                    if line.starts_with("PORT: ") {
                        port = line[6..].trim().parse()
                            .map_err(|e| format!("Invalid port: {}", e))?;
                        break;
                    }
                }
                Err(e) => return Err(format!("Read stdout error: {}", e)),
            }
        }

        if port == 0 {
            let _ = Self::remove_pid_file();
            return Err("Sidecar did not report port".to_string());
        }

        std::thread::spawn(move || {
            let file = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_path)
                .ok();
            let mut writer = file.map(|f| std::io::LineWriter::new(f));
            loop {
                buf.clear();
                match reader.read_line(&mut buf) {
                    Ok(0) => break,
                    Ok(_) => {
                        let line = buf.trim_end();
                        if !line.is_empty() {
                            let msg = format!("[go-backend stdout] {}", line);
                            eprintln!("{}", msg);
                            if let Some(ref mut w) = writer {
                                let _ = writeln!(w, "{}", msg);
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| e.to_string())?;

        // 启动 stdin 心跳线程
        let mut stdin = child.stdin.take().ok_or("Failed to get stdin")?;
        let (heartbeat_tx, heartbeat_rx) = std::sync::mpsc::channel::<()>();

        std::thread::spawn(move || {
            let _ = stdin.write_all(b"\n");
            let _ = stdin.flush();

            loop {
                match heartbeat_rx.recv_timeout(Duration::from_secs(5)) {
                    Ok(()) | Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                        if stdin.write_all(b"\n").is_err() || stdin.flush().is_err() {
                            break;
                        }
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                        break;
                    }
                }
            }
        });

        tracing::info!("Go sidecar started successfully on port {}", port);

        Ok(Self {
            port,
            client,
            process: AsyncMutex::new(child),
            child_pid,
            stop_watchdog: Arc::new(AtomicBool::new(false)),
            heartbeat_tx,
        })
    }

    /// 启动看门狗：定期 health check，崩溃时自动重启
    pub fn spawn_watchdog(
        manager: Arc<Self>,
        sidecar_state: Arc<AsyncMutex<Option<Arc<Self>>>>,
    ) {
        tokio::spawn(async move {
            let mut consecutive_failures = 0;
            let max_failures = 3;
            let max_restarts = 3;
            let mut restart_count = 0;

            loop {
                sleep(Duration::from_secs(10)).await;

                if manager.stop_watchdog.load(Ordering::Relaxed) {
                    break;
                }

                match manager.health_check().await {
                    Ok(()) => {
                        consecutive_failures = 0;
                    }
                    Err(e) => {
                        consecutive_failures += 1;
                        tracing::warn!(
                            "Go sidecar health check failed ({}/{}): {}",
                            consecutive_failures,
                            max_failures,
                            e
                        );

                        if consecutive_failures >= max_failures {
                            if restart_count >= max_restarts {
                                tracing::error!(
                                    "Go sidecar restart limit ({}) reached. Sidecar features unavailable.",
                                    max_restarts
                                );
                                let mut guard = sidecar_state.lock().await;
                                *guard = None;
                                break;
                            }

                            restart_count += 1;

                            tracing::info!(
                                "Attempting to restart Go sidecar ({}/{})...",
                                restart_count,
                                max_restarts
                            );

                            // 停止旧进程
                            let _ = manager.stop_internal().await;

                            match Self::start() {
                                Ok(new_manager) => {
                                    let new_manager = Arc::new(new_manager);
                                    let mut guard = sidecar_state.lock().await;
                                    *guard = Some(new_manager.clone());
                                    drop(guard);

                                    // 启动新的看门狗，当前看门狗退出
                                    Self::spawn_watchdog(new_manager, sidecar_state);
                                    break;
                                }
                                Err(e) => {
                                    tracing::error!("Failed to restart Go sidecar: {}", e);
                                    let mut guard = sidecar_state.lock().await;
                                    *guard = None;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    /// 检查 sidecar 进程是否仍在运行
    pub async fn is_alive(&self) -> bool {
        let mut child = self.process.lock().await;
        match child.try_wait() {
            Ok(None) => true,
            Ok(Some(status)) => {
                tracing::error!("Go sidecar process exited with status: {:?}", status);
                false
            }
            Err(e) => {
                tracing::error!("Failed to check sidecar status: {}", e);
                false
            }
        }
    }

    /// 发送 POST 请求并解析 JSON 响应
    pub async fn post<T: serde::Serialize, R: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        body: &T,
    ) -> Result<R, String> {
        if !self.is_alive().await {
            return Err(
                "Go sidecar process has exited unexpectedly. Please check the logs and restart the application."
                    .to_string(),
            );
        }

        let url = format!("{}{}", self.base_url(), path);
        let resp = self
            .client
            .post(&url)
            .json(body)
            .send()
            .await
            .map_err(|e| format!(
                "HTTP request failed: {}. Go sidecar may have crashed or is not responding.",
                e
            ))?;

        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;

        if !status.is_success() {
            return Err(format!("HTTP {}: {}", status, text));
        }

        let result: R = serde_json::from_str(&text)
            .map_err(|e| format!("JSON parse error: {} (body: {})", e, text))?;
        Ok(result)
    }

    /// 发送 GET /health 进行 readiness 探测
    pub async fn health_check(&self) -> Result<(), String> {
        let url = format!("{}/health", self.base_url());
        let resp = self
            .client
            .get(&url)
            .timeout(Duration::from_secs(5))
            .send()
            .await
            .map_err(|e| format!("Health check failed: {}", e))?;

        if resp.status().is_success() {
            Ok(())
        } else {
            Err(format!("Health check returned status: {}", resp.status()))
        }
    }

    /// 停止 sidecar 进程（外部调用）
    pub async fn stop(&self) -> Result<(), String> {
        self.stop_watchdog.store(true, Ordering::Relaxed);
        self.stop_internal().await
    }

    /// 内部停止：不更新 watchdog 标志
    async fn stop_internal(&self) -> Result<(), String> {
        let mut child = self.process.lock().await;
        child
            .kill()
            .map_err(|e| format!("Failed to kill sidecar process: {}", e))?;
        child
            .wait()
            .map_err(|e| format!("Failed to wait for sidecar process: {}", e))?;

        let _ = self.heartbeat_tx.send(());
        let _ = Self::remove_pid_file();

        tracing::info!("Go sidecar process stopped");
        Ok(())
    }

    // --- pid 文件管理 ---

    fn get_pid_file_path() -> PathBuf {
        #[cfg(debug_assertions)]
        {
            std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .parent()
                .unwrap_or(&PathBuf::from("."))
                .join(".dev-data")
                .join(".go-backend.pid")
        }
        #[cfg(not(debug_assertions))]
        {
            std::env::temp_dir().join("idblink-go-backend.pid")
        }
    }

    fn get_log_path() -> PathBuf {
        std::env::current_dir()
            .ok()
            .map(|p| p.join("go-backend.log"))
            .unwrap_or_else(|| PathBuf::from("go-backend.log"))
    }

    fn write_pid_file(pid: u32) -> Result<(), String> {
        let path = Self::get_pid_file_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&path, pid.to_string())
            .map_err(|e| format!("Failed to write pid file: {}", e))
    }

    fn read_pid_file() -> Option<u32> {
        let path = Self::get_pid_file_path();
        let content = std::fs::read_to_string(&path).ok()?;
        content.trim().parse().ok()
    }

    fn remove_pid_file() -> Result<(), String> {
        let path = Self::get_pid_file_path();
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| format!("Failed to remove pid file: {}", e))
        } else {
            Ok(())
        }
    }

    /// 启动前清理旧的 go-backend 进程
    fn cleanup_old_processes() {
        // 1. 通过 pid 文件 kill 旧进程
        if let Some(old_pid) = Self::read_pid_file() {
            tracing::info!("Found old go-backend process with pid {}, attempting to kill...", old_pid);
            unsafe {
                libc::kill(old_pid as libc::pid_t, libc::SIGTERM);
            }
            std::thread::sleep(Duration::from_millis(500));
            unsafe {
                libc::kill(old_pid as libc::pid_t, libc::SIGKILL);
            }
            let _ = Self::remove_pid_file();
        }
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        if self.child_pid > 0 {
            tracing::info!("SidecarManager drop: killing process {}", self.child_pid);
            unsafe {
                libc::kill(self.child_pid as libc::pid_t, libc::SIGKILL);
            }
            let _ = Self::remove_pid_file();
        }
    }
}

/// 查找 Go 后端二进制文件
fn find_binary() -> Result<PathBuf, String> {
    // 开发模式候选路径（相对于项目根目录和 src-tauri 目录）
    let dev_candidates = [
        // 相对于 src-tauri 目录
        PathBuf::from("go-backend/go-backend"),
        PathBuf::from("go-backend/go-backend.exe"),
        // 相对于项目根目录（src-tauri 的父目录）
        PathBuf::from("../go-backend/go-backend"),
        PathBuf::from("../go-backend/go-backend.exe"),
    ];
    for candidate in &dev_candidates {
        if candidate.exists() {
            return Ok(candidate.clone());
        }
    }

    // 尝试从可执行文件所在目录查找（适用于打包后的应用）
    if let Ok(exe_dir) = std::env::current_exe().and_then(|p| {
        p.parent().map(PathBuf::from).ok_or(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "no parent",
        ))
    }) {
        let mut bundled_candidates: Vec<PathBuf> = Vec::new();
        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        bundled_candidates
            .push(exe_dir.join("../Resources/sidecars/go-backend-aarch64-apple-darwin"));
        #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
        bundled_candidates
            .push(exe_dir.join("../Resources/sidecars/go-backend-x86_64-apple-darwin"));
        #[cfg(target_os = "macos")]
        bundled_candidates
            .push(exe_dir.join("../Resources/sidecars/go-backend-x86_64-apple-darwin")); // aarch64 回退到 x86_64 (Rosetta)
        #[cfg(target_os = "linux")]
        bundled_candidates.push(exe_dir.join("sidecars/go-backend-x86_64-unknown-linux-gnu"));
        #[cfg(target_os = "windows")]
        bundled_candidates.push(exe_dir.join("sidecars/go-backend-x86_64-pc-windows-msvc.exe"));

        for candidate in &bundled_candidates {
            if candidate.exists() {
                return Ok(candidate.clone());
            }
        }
    }

    // Tauri sidecar 打包路径（根据平台自动选择，相对当前工作目录）
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        let p = PathBuf::from("src-tauri/sidecars/go-backend-aarch64-apple-darwin");
        if p.exists() {
            return Ok(p);
        }
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        let p = PathBuf::from("src-tauri/sidecars/go-backend-x86_64-apple-darwin");
        if p.exists() {
            return Ok(p);
        }
    }
    #[cfg(target_os = "macos")]
    {
        // aarch64 Mac 可以回退到 x86_64 binary（如果安装了 Rosetta 2）
        let p = PathBuf::from("src-tauri/sidecars/go-backend-x86_64-apple-darwin");
        if p.exists() {
            return Ok(p);
        }
        // 相对于项目根目录
        let p = PathBuf::from("../src-tauri/sidecars/go-backend-x86_64-apple-darwin");
        if p.exists() {
            return Ok(p);
        }
    }
    #[cfg(target_os = "linux")]
    {
        let p = PathBuf::from("src-tauri/sidecars/go-backend-x86_64-unknown-linux-gnu");
        if p.exists() {
            return Ok(p);
        }
        let p = PathBuf::from("../src-tauri/sidecars/go-backend-x86_64-unknown-linux-gnu");
        if p.exists() {
            return Ok(p);
        }
    }
    #[cfg(target_os = "windows")]
    {
        let p = PathBuf::from("src-tauri/sidecars/go-backend-x86_64-pc-windows-msvc.exe");
        if p.exists() {
            return Ok(p);
        }
        let p = PathBuf::from("../src-tauri/sidecars/go-backend-x86_64-pc-windows-msvc.exe");
        if p.exists() {
            return Ok(p);
        }
    }

    Err(
        "Go backend binary not found. Please build it first:\n  cd go-backend && go build"
            .to_string(),
    )
}
