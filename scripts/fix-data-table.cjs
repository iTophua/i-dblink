const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/DataTable.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 替换模式：将 escapeSqlValue(...) 替换为 escapeSqlValue(..., dbType)
// 但只替换那些没有第二个参数的情况

const patterns = [
  // 基本替换
  { from: /escapeSqlValue\(([^,)]+)\)/g, to: 'escapeSqlValue($1, dbType)' },
  // 已经带有dbType的不再替换（通过反向引用来避免）
];

// 先标记所有已经带有dbType的
const alreadyHasDbType = /escapeSqlValue\([^,]+,\s*dbType\)/g;
const marked = content.replace(alreadyHasDbType, (match) => match.replace('escapeSqlValue', 'ESCAPE_SQL_VALUE_ALREADY_FIXED'));

// 替换剩余的
let fixed = marked.replace(/escapeSqlValue\(([^,)]+)\)/g, 'escapeSqlValue($1, dbType)');

// 恢复已标记的
fixed = fixed.replace(/ESCAPE_SQL_VALUE_ALREADY_FIXED/g, 'escapeSqlValue');

fs.writeFileSync(filePath, fixed, 'utf8');
console.log('Fixed escapeSqlValue calls in DataTable.tsx');
