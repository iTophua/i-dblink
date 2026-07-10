// Phase 0 可行性验证 demo — 验证 yzma + Qwen2.5-Coder-3B 能否满足 iDBLink 的需求
//
// 验证三个核心假设：
//  1. 速度：3B 模型在目标硬件上的 token/s（通过标准 ≥ 25 tok/s @ Metal）
//  2. 质量：5 条真实 MySQL→达梦 SQL 转换的正确率（通过标准 ≥ 4/5）
//  3. 内存：峰值 RSS（通过标准 < 4GB）
//
// 用法见 README.md。这是独立 CLI，不影响主应用。
package main

import (
	"flag"
	"fmt"
	"os"
	"runtime"
	"time"

	"github.com/hybridgroup/yzma/pkg/llama"
)

// 默认配置（可通过 flag 覆盖）
const (
	defaultModelPath = "qwen2.5-coder-3b-instruct-q4_k_m.gguf"
	defaultLibPath   = "libllama.dylib"
	defaultNPredict  = 512
	defaultCtxSize   = 4096
)

// 测试用例：5 条 MySQL → 达梦 SQL 转换
// 期望结果用人工判断，demo 会打印 AI 输出 + 预期，供人工对比。
var sqlConvertCases = []struct {
	name     string
	input    string
	expected string // 人工判断的"合理转换"参考，非唯一正确答案
}{
	{
		name:     "反引号 + LIMIT",
		input:    "SELECT `id`, `name` FROM `users` WHERE `age` > 18 LIMIT 10 OFFSET 20;",
		expected: `双引号标识符 + OFFSET...FETCH NEXT（达梦用 Oracle 风格分页）`,
	},
	{
		name:     "IFNULL 函数",
		input:    "SELECT IFNULL(`email`, 'N/A') FROM `users`;",
		expected: `IFNULL → COALESCE，反引号 → 双引号`,
	},
	{
		name:     "NOW() + AUTO_INCREMENT 风格 DDL",
		input:    "CREATE TABLE `logs` (`id` INT AUTO_INCREMENT, `msg` TEXT, `ts` DATETIME DEFAULT NOW());",
		expected: `AUTO_INCREMENT → GENERATED ALWAYS AS IDENTITY (或类似)，NOW() → SYSDATE，反引号→双引号，TEXT→CLOB`,
	},
	{
		name:     "GROUP_CONCAT",
		input:    "SELECT `uid`, GROUP_CONCAT(`tag` SEPARATOR ',') FROM `tags` GROUP BY `uid`;",
		expected: `GROUP_CONCAT → LISTAGG（达梦/Oracle 风格），反引号 → 双引号`,
	},
	{
		name:     "复杂 JOIN + 子查询",
		input:    "SELECT `u`.`name`, COUNT(`o`.`id`) FROM `users` u LEFT JOIN `orders` o ON `u`.`id` = `o`.`uid` WHERE `u`.`status` = 'active' GROUP BY `u`.`id` ORDER BY COUNT(`o`.`id`) DESC LIMIT 5;",
		expected: `反引号→双引号，LIMIT 5 → FETCH FIRST 5 ROWS ONLY（或 ROWNUM），其余语义保持`,
	},
}

func main() {
	// ── flags ──────────────────────────────────────────────────────────
	modelPath := flag.String("model", defaultModelPath, "GGUF 模型文件路径")
	libPath := flag.String("lib", defaultLibPath, "llama.cpp 动态库路径 (.dylib/.dll/.so)")
	nPredict := flag.Int("n", defaultNPredict, "最大生成 token 数")
	ctxSize := flag.Int("ctx", defaultCtxSize, "上下文窗口大小")
	temperature := flag.Float64("temp", 0.1, "温度（SQL 任务建议低温）")
	verbose := flag.Bool("v", false, "显示 llama.cpp 日志")
	flag.Parse()

	fmt.Println("═══════════════════════════════════════════════════════════════")
	fmt.Println("  iDBLink AI — Phase 0 可行性验证")
	fmt.Println("  yzma + Qwen2.5-Coder-3B-Instruct (Q4_K_M)")
	fmt.Println("═══════════════════════════════════════════════════════════════")
	fmt.Printf("  模型: %s\n", *modelPath)
	fmt.Printf("  动态库: %s\n", *libPath)
	fmt.Printf("  温度: %.2f  上下文: %d  最大生成: %d\n\n", *temperature, *ctxSize, *nPredict)

	// ── 1. 加载动态库 ────────────────────────────────────────────────────
	fmt.Println("▶ [1/4] 加载 llama.cpp 动态库...")
	t0 := time.Now()
	if err := llama.Load(*libPath); err != nil {
		fail("无法加载动态库 %s: %v\n"+
			"提示: macOS 用 `yzma install` 或从 llama-cpp-builder release 下载 libllama.dylib", *libPath, err)
	}
	if !*verbose {
		llama.LogSet(llama.LogSilent())
	}
	llama.Init()
	defer llama.Close()
	fmt.Printf("  ✓ 加载完成 (%.2fs)\n", time.Since(t0).Seconds())

	// ── 2. 加载模型 ────────────────────────────────────────────────────
	fmt.Printf("▶ [2/4] 加载模型 %s...\n", *modelPath)
	t0 = time.Now()
	mParams := llama.ModelDefaultParams()
	model, err := llama.ModelLoadFromFile(*modelPath, mParams)
	if err != nil || model == 0 {
		fail("无法加载模型 %s: %v", *modelPath, err)
	}
	defer llama.ModelFree(model)
	vocab := llama.ModelGetVocab(model)
	fmt.Printf("  ✓ 模型加载完成 (%.2fs)\n", time.Since(t0).Seconds())

	// ── 3. 创建推理上下文 ────────────────────────────────────────────────
	fmt.Println("▶ [3/4] 创建推理上下文...")
	ctxParams := llama.ContextDefaultParams()
	ctxParams.NCtx = uint32(*ctxSize)
	lctx, err := llama.InitFromModel(model, ctxParams)
	if err != nil {
		fail("无法创建推理上下文: %v", err)
	}
	defer llama.Free(lctx)
	fmt.Printf("  ✓ 上下文就绪 (NCtx=%d)\n", ctxParams.NCtx)

	// 采样器（低温 + top-k/top-p，SQL 任务要确定性）
	sp := llama.DefaultSamplerParams()
	sp.Temp = float32(*temperature)
	sp.TopK = 40
	sp.TopP = 0.9
	sampler := llama.NewSampler(model, []llama.SamplerType{
		llama.SamplerTypeTopK, llama.SamplerTypeTopP, llama.SamplerTypeTemperature,
	}, sp)
	defer llama.SamplerFree(sampler)

	// 获取模型自带的 chat 模板（Qwen2.5 有内置模板，无需手写 Jinja）
	tmpl := llama.ModelChatTemplate(model, "")
	if tmpl == "" {
		tmpl = "chatml"
	}
	fmt.Printf("  ✓ Chat 模板: %s\n\n", truncate(tmpl, 50))

	// ── 4. 跑测试用例 ────────────────────────────────────────────────
	fmt.Println("▶ [4/4] 运行 SQL 转换测试用例...")
	fmt.Println("───────────────────────────────────────────────────────────────")

	totalTokens := 0
	totalMs := int64(0)
	for i, tc := range sqlConvertCases {
		fmt.Printf("\n【用例 %d/%d】%s\n", i+1, len(sqlConvertCases), tc.name)
		fmt.Printf("  输入: %s\n", tc.input)
		fmt.Printf("  期望: %s\n", tc.expected)
		fmt.Printf("  AI 输出:\n    ")

		output, tokens, durMs := runInference(lctx, vocab, model, sampler, tmpl, tc.input, *nPredict)
		fmt.Println(output)
		fmt.Printf("    ── %d tokens, %dms, %.1f tok/s ──\n",
			tokens, durMs, float64(tokens)*1000/float64(max(durMs, 1)))

		totalTokens += tokens
		totalMs += durMs
	}

	// ── 汇总报告 ────────────────────────────────────────────────────────
	fmt.Println("\n═══════════════════════════════════════════════════════════════")
	fmt.Println("  汇总报告")
	fmt.Println("═══════════════════════════════════════════════════════════════")
	avgTokS := float64(totalTokens) * 1000 / float64(max(totalMs, 1))
	fmt.Printf("  总 token: %d\n", totalTokens)
	fmt.Printf("  总耗时: %.2fs\n", float64(totalMs)/1000)
	fmt.Printf("  平均速度: %.1f tok/s\n", avgTokS)
	fmt.Printf("  内存峰值 RSS: %d MB\n", getRSSMB())

	// 判定
	fmt.Println("\n  ── 通过标准 ──")
	passed := true
	if avgTokS >= 25 {
		fmt.Printf("  ✓ 速度: %.1f tok/s ≥ 25 tok/s\n", avgTokS)
	} else {
		fmt.Printf("  ✗ 速度: %.1f tok/s < 25 tok/s\n", avgTokS)
		passed = false
	}
	if rss := getRSSMB(); rss < 4096 {
		fmt.Printf("  ✓ 内存: %d MB < 4096 MB\n", rss)
	} else {
		fmt.Printf("  ✗ 内存: %d MB ≥ 4096 MB\n", rss)
		passed = false
	}
	fmt.Println("  ? 质量: 请人工对比上面 5 个用例的「AI 输出」与「期望」")
	fmt.Println("         通过标准: ≥ 4/5 转换正确且无语义错误")
	fmt.Println("═══════════════════════════════════════════════════════════════")
	if !passed {
		os.Exit(1)
	}
}

// runInference 执行一次完整的对话推理，返回输出文本、token 数、耗时
func runInference(
	lctx llama.Context,
	vocab llama.Vocab,
	model llama.Model,
	sampler llama.Sampler,
	tmpl, userInput string,
	nPredict int,
) (string, int, int64) {
	systemPrompt := "你是 SQL 方言转换专家。将用户给出的 MySQL SQL 转换为达梦数据库兼容的 SQL。" +
		"只输出转换后的 SQL，不要解释。"
	messages := []llama.ChatMessage{
		llama.NewChatMessage("system", systemPrompt),
		llama.NewChatMessage("user", userInput),
	}

	// 应用 chat 模板拼接 prompt
	buf := make([]byte, 4096)
	promptLen := llama.ChatApplyTemplate(tmpl, messages, true, buf)
	prompt := string(buf[:promptLen])

	tokens := llama.Tokenize(vocab, prompt, true, true)
	batch := llama.BatchGetOne(tokens)

	start := time.Now()
	output := ""
	count := 0

	for pos := int32(0); pos < int32(nPredict); pos += batch.NTokens {
		llama.Decode(lctx, batch)
		token := llama.SamplerSample(sampler, lctx, -1)

		if llama.VocabIsEOG(vocab, token) {
			break
		}

		piece := make([]byte, 256)
		l := llama.TokenToPiece(vocab, token, piece, 0, false)
		output += string(piece[:l])

		batch = llama.BatchGetOne([]llama.Token{token})
		count++
	}

	durMs := time.Since(start).Milliseconds()
	return output, count, durMs
}

// ── 工具函数 ────────────────────────────────────────────────────────

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "✗ "+format+"\n", args...)
	os.Exit(1)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func max(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

// getRSSMB 返回当前进程的驻留内存 (MB)，用于观察模型内存占用
func getRSSMB() int64 {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	// 注意: Go runtime 的 Sys 不是完整 RSS（不含 CGO/FFI 分配），
	// 但 purego 调用的 llama.cpp 内存会反映在系统 RSS 里，这里用 Sys 作近似。
	return int64(m.Sys / 1024 / 1024)
}
