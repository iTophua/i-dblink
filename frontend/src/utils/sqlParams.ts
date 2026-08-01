function escapeSqlValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(new RegExp(String.fromCharCode(0), 'g'), '');
}

// 参数化查询已禁用：原正则 /:(\w+)/g 会误把字符串字面量里的 :00（如时间
// '2024-01-10 00:00:00'）识别成命名参数，导致达梦/Oracle 等 INSERT 含时间
// 字面量的 SQL 时弹窗要求输入"参数 00"。始终返回空数组跳过参数弹窗，SQL 原
// 样执行。replaceParams 保留，未来若恢复参数化功能需配合更精确的占位符语法。
export function extractParams(): string[] {
  return [];
}

export function replaceParams(sql: string, values: Record<string, string>): string {
  let result = sql;
  for (const [key, value] of Object.entries(values)) {
    const trimmed = value.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      result = result.replaceAll(`:${key}`, trimmed);
    } else {
      const escaped = escapeSqlValue(value);
      result = result.replaceAll(`:${key}`, `'${escaped}'`);
    }
  }
  return result;
}
