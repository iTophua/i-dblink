#!/bin/bash
# TC-05 ~ TC-07: 创建连接 + 浏览数据库
SCREENSHOTS=/tmp/idblink-test-screenshots
mkdir -p $SCREENSHOTS
set -e

echo "=========================================="
echo "TC-05: 创建 MySQL 数据库连接"
echo "=========================================="

# 1. 点击新建连接
tauri-mcp webview-interact --action click --selector "新建连接" --strategy text 2>&1
sleep 2

# 2. 选择 MySQL
tauri-mcp webview-interact --action click --selector "MySQL" --strategy text 2>&1
sleep 2

# 3. 填写表单
tauri-mcp webview-execute-js --script "
(() => {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return 'NOT FOUND: ' + id;
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return 'OK';
  };
  return JSON.stringify([setVal('name','Docker MySQL'),setVal('host','127.0.0.1'),setVal('port','13306'),setVal('username','testuser'),setVal('password','testpass'),setVal('database','testdb')]);
})()
" 2>&1
sleep 1

# 4. 测试连接
echo "--- 测试连接 ---"
tauri-mcp webview-interact --action click --selector "测试连接" --strategy text 2>&1
sleep 3

# 5. 点击创建
echo "--- 保存连接 ---"
tauri-mcp webview-interact --action click --selector "创 建" --strategy text 2>&1
sleep 3

# 6. 验证
DOM=$(tauri-mcp webview-dom-snapshot --type accessibility 2>&1)
if echo "$DOM" | grep -q "Docker MySQL"; then
  echo "  ✅ MySQL 连接创建成功"
else
  echo "  ❌ MySQL 连接创建失败"
fi
tauri-mcp webview-screenshot --file $SCREENSHOTS/TC-05-mysql-connection.png 2>&1

echo ""
echo "=========================================="
echo "TC-06: 创建 PostgreSQL 连接"
echo "=========================================="

# 1. 点击新建连接
tauri-mcp webview-interact --action click --selector "新建连接" --strategy text 2>&1
sleep 2

# 2. 选择 PostgreSQL
tauri-mcp webview-interact --action click --selector "PostgreSQL" --strategy text 2>&1
sleep 2

# 3. 填写 PG 表单
tauri-mcp webview-execute-js --script "
(() => {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return 'NOT FOUND: ' + id;
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return 'OK';
  };
  return JSON.stringify([setVal('name','Docker PG'),setVal('host','127.0.0.1'),setVal('port','15432'),setVal('username','testuser'),setVal('password','testpassword'),setVal('database','testdb')]);
})()
" 2>&1
sleep 1

# 4. 测试连接
echo "--- 测试 PG 连接 ---"
tauri-mcp webview-interact --action click --selector "测试连接" --strategy text 2>&1
sleep 3

# 5. 保存
echo "--- 保存连接 ---"
tauri-mcp webview-interact --action click --selector "创 建" --strategy text 2>&1
sleep 3

# 6. 验证
DOM=$(tauri-mcp webview-dom-snapshot --type accessibility 2>&1)
if echo "$DOM" | grep -q "Docker PG"; then
  echo "  ✅ PostgreSQL 连接创建成功"
else
  echo "  ❌ PostgreSQL 连接创建失败"
fi
tauri-mcp webview-screenshot --file $SCREENSHOTS/TC-06-pg-connection.png 2>&1

echo ""
echo "=========================================="
echo "TC-07: 连接数据库并浏览表"
echo "=========================================="

# 点击 Docker MySQL 连接
tauri-mcp webview-interact --action click --selector "Docker MySQL" --strategy text 2>&1
sleep 3

# 展开数据库
DOM=$(tauri-mcp webview-dom-snapshot --type accessibility 2>&1)
echo "--- 展开后的连接树 ---"
echo "$DOM" | grep -E "treeitem\|table\|view" | head -15

# 点击子项展开 - 可能需要双击或点击展开箭头
tauri-mcp webview-interact --action click --selector "testdb" --strategy text 2>&1
sleep 3

DOM2=$(tauri-mcp webview-dom-snapshot --type accessibility 2>&1)
echo "--- 展开数据库后 ---"
echo "$DOM2" | grep -iE "table\|view\|tables\|表\|视图" | head -10

tauri-mcp webview-screenshot --file $SCREENSHOTS/TC-07-browse-tables.png 2>&1
echo "  ✅ 数据库浏览截图已保存"

echo ""
echo "=========================================="
echo "TC-05 ~ TC-07 测试完成"
echo "=========================================="
