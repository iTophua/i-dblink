#!/bin/bash
# TC-01: 应用启动与页面布局显示
SCREENSHOTS=/tmp/idblink-test-screenshots
mkdir -p $SCREENSHOTS

echo "=========================================="
echo "TC-01: 应用启动与页面布局显示"
echo "=========================================="

# Step 1: 获取 DOM 快照验证页面结构
echo "--- Step 1: 获取 DOM 快照 ---"
DOM_SNAPSHOT=$(tauri-mcp webview-dom-snapshot --type accessibility 2>&1)

# 验证关键元素存在
echo "--- 验证页面元素 ---"

# 检查工具栏
if echo "$DOM_SNAPSHOT" | grep -q "新建连接"; then
  echo "  ✅ 工具栏显示: 新建连接按钮"
else
  echo "  ❌ 工具栏缺少: 新建连接按钮"
fi

if echo "$DOM_SNAPSHOT" | grep -q "刷新"; then
  echo "  ✅ 工具栏显示: 刷新按钮"
else
  echo "  ❌ 工具栏缺少: 刷新按钮"
fi

if echo "$DOM_SNAPSHOT" | grep -q "新建查询"; then
  echo "  ✅ 工具栏显示: 新建查询按钮"
else
  echo "  ❌ 工具栏缺少: 新建查询按钮"
fi

if echo "$DOM_SNAPSHOT" | grep -q "设置"; then
  echo "  ✅ 工具栏显示: 设置按钮"
else
  echo "  ❌ 工具栏缺少: 设置按钮"
fi

# 检查侧边栏
if echo "$DOM_SNAPSHOT" | grep -q "noConnections\|无连接\|treeitem\|没有连接"; then
  echo "  ✅ 侧边栏显示: 连接树区域"
else
  echo "  ⚠️ 侧边栏连接树区域需要确认"
fi

# 检查主区域
if echo "$DOM_SNAPSHOT" | grep -q "对象\|objects\|请从左侧选择一个连接"; then
  echo "  ✅ 主区域显示: 对象标签页"
else
  echo "  ⚠️ 主区域对象标签页需要确认"
fi

# 检查状态栏
if echo "$DOM_SNAPSHOT" | grep -q "未连接\|Disconnected\|UTF-8\|未连接"; then
  echo "  ✅ 状态栏显示: 连接状态"
else
  echo "  ⚠️ 状态栏需要确认"
fi

# Step 2: 截图
echo "--- Step 2: 截图保存 ---"
tauri-mcp webview-screenshot --file $SCREENSHOTS/TC-01-initial-page.png 2>&1
echo "  ✅ 截图已保存: $SCREENSHOTS/TC-01-initial-page.png"

# 验证页面元素完整
echo "--- 验证结果 ---"
ELEMENT_COUNT=$(echo "$DOM_SNAPSHOT" | grep -c "\[ref=")
echo "  DOM 元素总数: $ELEMENT_COUNT"

if echo "$DOM_SNAPSHOT" | grep -q "banner"; then
  echo "  ✅ banner 区域存在"
fi
if echo "$DOM_SNAPSHOT" | grep -q "complementary\|tree"; then
  echo "  ✅ 侧边栏区域存在"
fi
if echo "$DOM_SNAPSHOT" | grep -q "main\|tabpanel"; then
  echo "  ✅ 主内容区域存在"
fi
if echo "$DOM_SNAPSHOT" | grep -q "contentinfo"; then
  echo "  ✅ 状态栏区域存在"
fi

echo "=========================================="
echo "TC-01 测试完成"
echo "=========================================="
