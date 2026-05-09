#!/bin/bash
# TC-04: 主题切换测试
SCREENSHOTS=/tmp/idblink-test-screenshots
echo "=========================================="
echo "TC-04: 主题切换"
echo "=========================================="

# 检查当前主题切换按钮
echo "--- 切换暗色/亮色主题 ---"
tauri-mcp webview-interact --action click --selector "深色\|Dark" --strategy text 2>&1
sleep 2
DOM=$(tauri-mcp webview-dom-snapshot --type accessibility 2>&1)
echo "  当前主题按钮: $(echo "$DOM" | grep -E "浅色\|深色\|Light\|Dark" | head -3)"
tauri-mcp webview-screenshot --file $SCREENSHOTS/TC-04-theme-switched.png 2>&1
echo "  ✅ 主题切换截图已保存"

# 切回默认
echo "--- 切回默认主题 ---"
tauri-mcp webview-interact --action click --selector "浅色\|Light" --strategy text 2>&1
sleep 1

# 打开设置-外观
echo "--- 设置-外观: 主题预设 ---"
tauri-mcp webview-interact --action click --selector "设置" --strategy text 2>&1
sleep 2

# 点击外观
tauri-mcp webview-interact --action click --selector "外观" --strategy text 2>&1
sleep 2

tauri-mcp webview-screenshot --file $SCREENSHOTS/TC-04-theme-settings.png 2>&1
echo "  ✅ 外观设置截图已保存"

# 关闭设置
tauri-mcp webview-execute-js --script "document.querySelector('.ant-modal-close')?.click();" 2>&1
sleep 1

echo ""
echo "=========================================="
echo "TC-04 测试完成"
echo "=========================================="
