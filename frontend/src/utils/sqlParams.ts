function escapeSqlValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(new RegExp(String.fromCharCode(0), 'g'), '');
}

export function extractParams(sql: string): string[] {
  const matches = sql.match(/:(\w+)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.substring(1)))];
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
