# Phase 0 可行性验证 demo

验证 `yzma + Qwen2.5-Coder-3B-Instruct (Q4_K_M)` 能否满足 iDBLink 的 AI 子系统需求。

**这是独立 CLI 程序，不影响主应用。** 跑通后才决定是否推进完整 AI 架构。

## 验证目标

| # | 假设 | 通过标准 |
|---|------|---------|
| 1 | **速度**：3B 模型在目标硬件上够快 | M2/M3 ≥ 25 tok/s（Metal 加速）|
| 2 | **质量**：SQL 转换够准 | 5 条用例 ≥ 4/5 正确，无语义错误 |
| 3 | **内存**：峰值可控 | < 4 GB |

## 前置准备（约 10 分钟）

### 1. 安装 yzma CLI（用于下载动态库）

```bash
go install github.com/hybridgroup/yzma/cmd/yzma@latest
```

### 2. 下载 llama.cpp 动态库

> **动态库按平台/硬件分变体**（见 AI_ARCHITECTURE.md §9.3）。GGUF 模型文件跨平台通用，但动态库必须匹配你的硬件才能获得最佳速度。

```bash
cd backend/ai/poc

# 方式 A: 用 yzma install（推荐，自动检测硬件选最优变体）
yzma install
#   macOS arm64 → 自动选 Metal 版（~25MB，含 GPU 加速）
#   Windows x64 → 检测到 NVIDIA 则选 CUDA 版，否则 CPU 版
#   Linux       → 检测 CUDA/ROCm/Vulkan，否则 CPU 版

# 方式 B: 手动从 llama-cpp-builder release 下载
# https://github.com/hybridgroup/llama-cpp-builder/releases
# 按你的平台选对应变体（文件名模式见下表），解压后放到本目录
```

| 平台 | 硬件 | 应选文件名模式 | 体积 | 动态库格式 |
|------|------|--------------|------|-----------|
| macOS arm64 (Apple Silicon) | Metal GPU | `llama-*-bin-macos-arm64.tar.gz` | ~25 MB | `libllama.dylib` |
| macOS x64 (Intel) | CPU only | `llama-*-bin-macos-x64.tar.gz` | ~15 MB | `libllama.dylib` |
| Windows x64 + NVIDIA | CUDA 13 | `llama-*-bin-win-cuda-13.1-x64.zip` + cudart 包 | ~95 MB | `libllama.dll` |
| Windows x64 无 GPU | CPU | `llama-*-bin-win-cpu-x64.zip` | ~15 MB | `libllama.dll` |
| Linux x64 + NVIDIA | CUDA | `llama-*-bin-ubuntu-cuda-x64.tar.gz` | ~89 MB | `libllama.so` |
| Linux x64 无 GPU | CPU | `llama-*-bin-ubuntu-cpu-x64.tar.gz` | ~8 MB | `libllama.so` |

> **变体选错会怎样**：选成 CPU 变体（在有 GPU 的机器上）只是慢一些，不会报错；但选成 CUDA 变体（在无 NVIDIA 的机器上）会加载失败。**拿不准就选 CPU 变体**，一定能跑。

### 3. 下载模型（~1.96 GB）

```bash
cd backend/ai/poc

# 推荐：魔搭社区（阿里官方，国内速度快，Qwen 是阿里模型首发于此）
curl -L -o qwen2.5-coder-3b-instruct-q4_k_m.gguf \
  "https://modelscope.cn/models/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/master/qwen2.5-coder-3b-instruct-q4_k_m.gguf"

# 备用：HuggingFace（国际用户，或 ModelScope 不可用时）
curl -L -o qwen2.5-coder-3b-instruct-q4_k_m.gguf \
  "https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf"
```

> **为什么优先魔搭**：国内访问 HuggingFace 常超时/断流，魔搭社区是阿里官方模型托管，Qwen 系列模型在此首发且同步最新，国内下载速度通常快 10-50 倍。两个源是同一份文件（SHA256 一致）。
>
> **断点续传**：下载中断后重新执行上面命令，加 `-C -` 参数即可续传：`curl -L -C - -o ...`

## 运行

```bash
cd backend/ai/poc

# 默认参数（模型 + 动态库在当前目录）
go run .

# 自定义路径/参数
go run . -model /path/to/model.gguf -lib /path/to/libllama.dylib -temp 0.1 -n 512

# 显示 llama.cpp 详细日志
go run . -v
```

## 输出示例（预期）

```
═══════════════════════════════════════════════════════════════
  iDBLink AI — Phase 0 可行性验证
  yzma + Qwen2.5-Coder-3B-Instruct (Q4_K_M)
═══════════════════════════════════════════════════════════════
  模型: qwen2.5-coder-3b-instruct-q4_k_m.gguf
  动态库: libllama.dylib
  温度: 0.10  上下文: 4096  最大生成: 512

▶ [1/4] 加载 llama.cpp 动态库...
  ✓ 加载完成 (0.12s)
▶ [2/4] 加载模型 qwen2.5-coder-3b-instruct-q4_k_m.gguf...
  ✓ 模型加载完成 (3.45s)
▶ [3/4] 创建推理上下文...
  ✓ 上下文就绪 (NCtx=4096)
  ✓ Chat 模板: qwen2.5-instruct...

▶ [4/4] 运行 SQL 转换测试用例...

【用例 1/5】反引号 + LIMIT
  输入: SELECT `id`, `name` FROM `users` WHERE `age` > 18 LIMIT 10 OFFSET 20;
  期望: 双引号标识符 + OFFSET...FETCH NEXT（达梦用 Oracle 风格分页）
  AI 输出:
    SELECT "id", "name" FROM "users" WHERE "age" > 20 OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY;
    ── 45 tokens, 1100ms, 40.9 tok/s ──

...

═══════════════════════════════════════════════════════════════
  汇总报告
═══════════════════════════════════════════════════════════════
  总 token: 312
  总耗时: 7.85s
  平均速度: 39.7 tok/s
  内存峰值 RSS: 2840 MB

  ── 通过标准 ──
  ✓ 速度: 39.7 tok/s ≥ 25 tok/s
  ✓ 内存: 2840 MB < 4096 MB
  ? 质量: 请人工对比上面 5 个用例的「AI 输出」与「期望」
═══════════════════════════════════════════════════════════════
```

## 结果判定

demo 跑完后，根据三方面判断是否推进 Phase 4：

| 指标 | 通过 | 不通过的处理 |
|------|------|------------|
| 速度 ≥ 25 tok/s | ✅ 进 Phase 4 | 考虑 1.5B 模型或放弃本地推理 |
| 内存 < 4 GB | ✅ | 提示低端设备用户 / 提供 1.5B 选项 |
| 质量 ≥ 4/5 | ✅ | 考虑 7B（体积+速度代价）或限定任务范围 |

## 文件

- `main.go` — demo 主程序（~250 行）
- `README.md` — 本文件
- `go.mod` — 独立 module（避免污染主项目 go.mod，见下）

## 关于独立 go.mod

本目录有独立 `go.mod`，与主项目根目录的 `go.mod` 隔离。原因：

1. yzma 依赖较重（purego + ffi），demo 阶段不强制主项目引入
2. demo 是临时的，验证完可整体删除，不影响主项目依赖树
3. 避免 `go test ./...`（主项目测试命令）误跑 demo

验证通过后，正式集成时把 yzma 加入根 `go.mod`，删除本目录。
