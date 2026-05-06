use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tokio::sync::Mutex as AsyncMutex;

/// SidecarState 包装 Arc<Mutex> 并实现 Deref
/// 使用 tokio::sync::Mutex 因为它支持 async lock
/// Arc<tokio::sync::Mutex<T>> 是 Sync 的（Arc 提供了必要的同步）
pub struct SidecarState(pub Arc<AsyncMutex<Option<SidecarManager>>>);

impl std::ops::Deref for SidecarState {
    type Target = AsyncMutex<Option<SidecarManager>>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// Sidecar 管理器：负责启动 Go 后端进程并提供 HTTP 客户端
pub struct SidecarManager {
    port: u16,
    client: reqwest::Client,
    process: AsyncMutex<Child>,
}

impl SidecarManager {
    /// 启动 Go sidecar 进程，读取 stdout 中的 PORT 行
    ///
    /// 注意：此函数包含同步阻塞 IO，应在 blocking 线程中调用
    pub fn start() -> Result<Self, String> {
        let binary_path = find_binary();
        let binary_path = binary_path?;

        let mut child = Command::new(&binary_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                format!(
                    "Failed to start sidecar at {:?}: {}. Please build Go backend first: cd go-backend && go build",
                    binary_path, e
                )
            })?;

        // 启动后台线程消费 stderr，防止管道缓冲区满导致 sidecar 死锁
        // 日志同时写入 go-backend.log 文件，方便终端不可见时查看
        let log_path = std::env::current_dir()
            .ok()
            .map(|p| p.join("go-backend.log"))
            .unwrap_or_else(|| PathBuf::from("go-backend.log"));

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
                        port = line[6..]
                            .trim()
                            .parse()
                            .map_err(|e| format!("Invalid port: {}", e))?;
                        break;
                    }
                }
                Err(e) => return Err(format!("Read stdout error: {}", e)),
            }
        }

        if port == 0 {
            return Err("Sidecar did not report port".to_string());
        }

        // 读取到 PORT 后，启动后台线程继续消费 stdout 剩余数据，防止 Go 端 fmt.Printf 阻塞
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
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .map_err(|e| e.to_string())?;

        tracing::info!("Go sidecar started successfully");

        Ok(Self {
            port,
            client,
            process: AsyncMutex::new(child),
        })
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
            .map_err(|e| {
                format!(
                    "HTTP request failed: {}. Go sidecar may have crashed or is not responding.",
                    e
                )
            })?;

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
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
            .map_err(|e| format!("Health check failed: {}", e))?;

        if resp.status().is_success() {
            Ok(())
        } else {
            Err(format!("Health check returned status: {}", resp.status()))
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
