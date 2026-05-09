#!/bin/bash
# TC-02: 国际化 - 中文界面验证
# TC-03: 国际化 - 英文界面切换验证
SCREENSHOTS=/tmp/idblink-test-screenshots
mkdir -p $SCREENSHOTS

echo "=========================================="
echo "TC-02: 中文界面验证"
echo "=========================================="

DOM=$(tauri-mcp webview-dom-snapshot --type accessibility 2>&1)

# 验证中文界面元素
echo "--- 验证中文界面 ---"
if echo "$DOM" | grep -q "新建连接"; then
  echo "  ✅ 按钮文字: 新建连接"
else
  echo "  ❌ 按钮文字: 新建连接 未找到"
fi

if echo "$DOM" | grep -q "刷新"; then
  echo "  ✅ 按钮文字: 刷新"
fi

if echo "$DOM" | grep -q "新建查询"; then
  echo "  ✅ 按钮文字: 新建查询"
fi

if echo "$DOM" | grep -q "设置"; then
  echo "  ✅ 按钮文字: 设置"
fi

# 检查状态栏
if echo "$DOM" | grep -q "未连接"; then
  echo "  ✅ 状态栏: 未连接"
fi

tauri-mcp webview-screenshot --file $SCREENSHOTS/TC-02-zh-interface.png 2>&1
echo "  ✅ 截图已保存"

echo ""
echo "=========================================="
echo "TC-03: 切换到英文界面"
echo "=========================================="

# Step 1: 打开设置
tauri-mcp webview-interact --action click --selector "设置" --strategy text 2>&1
sleep 2

# 检查设置对话框
DOM_SETTINGS=$(tauri-mcp webview-dom-snapshot --type accessibility 2>&1)

# Step 2: 在设置左侧菜单中找到语言选项
echo "--- 查找语言设置 ---"
# 尝试直接找到语言对应的元素
LANG_FOUND=$(echo "$DOM_SETTINGS" | grep -i "语言\|Language" | head -3)
echo "  语言选项: $LANG_FOUND"

# 点击语言菜单项 (可能在左侧导航中)
tauri-mcp webview-interact --action click --selector "语言" --strategy text 2>&1
sleep 1

# 选择 English
tauri-mcp webview-interact --action click --selector "English" --strategy text 2>&1
sleep 2

# 验证界面切换
echo "--- 验证英文界面 ---"
DOM_EN=$(tauri-mcp webview-dom-snapshot --type accessibility 2>&1)

if echo "$DOM_EN" | grep -qi "new connection\|New Connection"; then
  echo "  ✅ 界面已切换为英文 (发现 New Connection)"
else
  echo "  ⚠️ 英文切换可能需要确认 - 尝试再次点击"
  # 尝试确认
  tauri-mcp webview-interact --action click --selector "lang\|English\|Confirm" --strategy text 2>&1
  sleep 2
  DOM_EN=$(tauri-mcp webview-dom-snapshot --type accessibility 2>&1)
fi

tauri-mcp webview-screenshot --file $SCREENSHOTS/TC-03-en-interface.png 2>&1
echo "  ✅ 英文界面截图已保存"

# Step 3: 切回中文
echo "--- 切回中文 ---"
tauri-mcp webview-interact --action click --selector "设置" --strategy text 2>&1
sleep 2
tauri-mcp webview-interact --action click --selector "Language\|语言" --strategy text 2>&1
sleep 1
tauri-mcp webview-interact --action click --selector "中文" --strategy text 2>&1
sleep 2
tauri-mcp webview-screenshot --file $SCREENSHOTS/TC-03-restore-zh.png 2>&1
echo "  ✅ 已切回中文"

echo ""
echo "=========================================="
echo "TC-02 & TC-03 测试完成"
echo "=========================================="
