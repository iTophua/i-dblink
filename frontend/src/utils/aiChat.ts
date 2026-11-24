import { api } from '../api';
import type { AIChatMessage } from '../api';
import type { ColumnInfo } from '../types/api';
import type { ChatMessage } from '../stores/aiChatStore';

// ==================== 表结构上下文 ====================

export interface SchemaSelection {
  connectionId: string | null;
  /** 纳入的数据库 */
  databases: string[];
  /** 表级筛选：db → 表名；未出现的库表示整库 */
  tables?: Record<string, string[]>;
}

export interface SchemaContext {
  /** 喂给模型的表结构文本；为空表示没有上下文 */
  text: string;
  databaseCount: number;
  tableCount: number;
  /** text 的字符数，用于体积分级 */
  chars: number;
}

/** 表结构上下文体积分界（字符）：超过 WARN 提示变慢/超限风险，超过 MAX 拒绝发送 */
export const SCHEMA_WARN_CHARS = 60_000;
export const SCHEMA_MAX_CHARS = 240_000;

const COLUMNS_TTL_MS = 5 * 60 * 1000;
const columnsCache = new Map<string, { at: number; tables: Record<string, ColumnInfo[]> }>();
const columnsInflight = new Map<string, Promise<Record<string, ColumnInfo[]>>>();

/**
 * 拉取某库的全量列信息（表名 → 列），同一库并发请求合并、成功结果缓存 5 分钟。
 * 上下文选择与发送共用这一份缓存：面板里看过的库，发送时不必再查。
 */
export function loadAllColumns(
  connectionId: string,
  db: string
): Promise<Record<string, ColumnInfo[]>> {
  const key = `${connectionId}\u0000${db}`;
  const cached = columnsCache.get(key);
  if (cached && Date.now() - cached.at < COLUMNS_TTL_MS) return Promise.resolve(cached.tables);
  const inflight = columnsInflight.get(key);
  if (inflight) return inflight;
  const req = api
    .getAllColumns(connectionId, db)
    // 后端空 map 会序列化成 null（无表的库、不支持该元数据查询的库类型），统一归一成空对象
    .then((raw) => {
      const tables = raw && typeof raw === 'object' ? raw : {};
      columnsCache.set(key, { at: Date.now(), tables });
      return tables;
    })
    .finally(() => columnsInflight.delete(key));
  columnsInflight.set(key, req);
  return req;
}

/** 某库最终纳入的表：无筛选 = 整库；有筛选 = 筛选与现存表的交集。统一按表名排序，保证提示词稳定 */
export function pickTables(all: string[], filter?: string[] | null): string[] {
  const sorted = [...all].sort((a, b) => a.localeCompare(b));
  if (!filter) return sorted;
  const picked = new Set(filter);
  return sorted.filter((t) => picked.has(t));
}

/** 勾选/取消单张表后该库的筛选结果：null 表示整库纳入，[] 表示该库不再纳入 */
export function toggleTable(
  all: string[],
  filter: string[] | undefined,
  table: string
): string[] | null {
  const current = new Set(pickTables(all, filter));
  if (current.has(table)) current.delete(table);
  else current.add(table);
  return current.size === all.length ? null : [...current];
}

function formatTableLine(db: string, table: string, cols: ColumnInfo[]): string {
  const colStr = cols
    .map((c) => `${c.column_name} ${c.data_type}${c.column_key === 'PRI' ? ' PK' : ''}`)
    .join(', ');
  return `${db}.${table} (${colStr})`;
}

/** 同步读取缓存：命中返回列信息及是否已过期；未命中返回 null */
export function peekAllColumns(
  connectionId: string,
  db: string
): { tables: Record<string, ColumnInfo[]>; stale: boolean } | null {
  const cached = columnsCache.get(`${connectionId}\u0000${db}`);
  if (!cached) return null;
  return { tables: cached.tables, stale: Date.now() - cached.at >= COLUMNS_TTL_MS };
}

function schemaLines(
  db: string,
  tables: Record<string, ColumnInfo[]>,
  filter?: string[] | null
): string[] {
  return pickTables(Object.keys(tables), filter).map((t) =>
    formatTableLine(db, t, tables[t] ?? [])
  );
}

export interface SchemaSummary {
  /** 所选库是否都已读过列信息（未读齐时数量不完整） */
  complete: boolean;
  tableCount: number;
  chars: number;
}

/** 按当前选择估算上下文体积（只读缓存，不触发请求）；库未读过时 complete=false */
export function summarizeSchema(
  connectionId: string | null,
  databases: string[],
  tables?: Record<string, string[]>
): SchemaSummary {
  let complete = true;
  let tableCount = 0;
  let chars = 0;
  if (!connectionId) return { complete: false, tableCount: 0, chars: 0 };
  for (const db of databases) {
    const hit = peekAllColumns(connectionId, db);
    if (!hit) {
      complete = false;
      continue;
    }
    const lines = schemaLines(db, hit.tables, tables?.[db]);
    tableCount += lines.length;
    chars += lines.reduce((n, line) => n + line.length + 1, 0);
  }
  return { complete, tableCount, chars };
}

/**
 * 构建发给模型的表结构文本。
 * 示例输出：
 * db_a.users (id INT PK, name VARCHAR(255))
 *
 * 单库拉取失败只跳过该库（返回值里不计入），不让一次元数据查询失败阻断对话。
 */
export async function buildSchemaContext(selection: SchemaSelection): Promise<SchemaContext> {
  const { connectionId, databases, tables } = selection;
  if (!connectionId || databases.length === 0) {
    return { text: '', databaseCount: 0, tableCount: 0, chars: 0 };
  }
  const parts = await Promise.all(
    databases.map(async (db) => {
      try {
        const cols = await loadAllColumns(connectionId, db);
        return schemaLines(db, cols, tables?.[db]);
      } catch {
        return [];
      }
    })
  );
  const included = parts.filter((lines) => lines.length > 0);
  const text = included.map((lines) => lines.join('\n')).join('\n\n');
  return {
    text,
    databaseCount: included.length,
    tableCount: included.reduce((n, lines) => n + lines.length, 0),
    chars: text.length,
  };
}

/** 粗估 token 数：表结构以 ASCII 标识符为主，按约 3 字符 1 token 估 */
export function estimateTokens(chars: number): number {
  return Math.max(1, Math.round(chars / 3));
}

// ==================== 对话历史裁剪 ====================

/** 随每轮请求重发的历史预算：条数与字符数双上限，超出后丢弃最早的轮次 */
export const HISTORY_MAX_MESSAGES = 16;
export const HISTORY_MAX_CHARS = 24_000;

/**
 * 截取仍可随请求发送的历史：从最新一条往前累加，超出预算即截止；
 * 历史必须以 user 消息开头（落单的 assistant 回复缺少提问语境）。
 */
export function trimHistory(
  messages: AIChatMessage[],
  maxMessages = HISTORY_MAX_MESSAGES,
  maxChars = HISTORY_MAX_CHARS
): AIChatMessage[] {
  let kept = messages.slice(-maxMessages);
  const firstUser = kept.findIndex((m) => m.role === 'user');
  kept = firstUser === -1 ? [] : kept.slice(firstUser);
  if (kept.length === 0) return kept;

  let total = 0;
  let cut = 0;
  for (let i = kept.length - 1; i >= 0; i--) {
    total += kept[i].content.length;
    if (total > maxChars) {
      cut = i + 1;
      break;
    }
  }
  // 截断点落在 assistant 上时顺延到下一条 user
  while (cut < kept.length && kept[cut].role !== 'user') cut++;
  // 最新一条自身就超出预算：宁可超一点也要保留，否则这一轮没有提问可发
  if (cut >= kept.length) return kept.slice(-1);
  return cut === 0 ? kept : kept.slice(cut);
}

// ==================== 消息与提示词构建 ====================

/** 用户消息 + 引用的编辑器 SQL → 实际发给模型的内容 */
export function composeUserContent(
  text: string,
  attachedSql: string | undefined,
  sqlLabel: string
): string {
  const body = text.trim();
  if (!attachedSql?.trim()) return body;
  return `${body}\n\n${sqlLabel}\n\`\`\`sql\n${attachedSql.trim()}\n\`\`\``;
}

/** 界面消息 → 请求消息（引用的 SQL 并入正文），再按预算裁剪 */
export function toRequestHistory(messages: ChatMessage[], sqlLabel: string): AIChatMessage[] {
  return trimHistory(
    messages
      .filter((m) => m.content.trim() || m.attachedSql?.trim())
      .map((m) => ({
        role: m.role,
        content: composeUserContent(m.content, m.attachedSql, sqlLabel),
      }))
  );
}

export interface SystemPromptInput {
  /** 未选连接时为空：退化为不绑定方言的通用助手 */
  dbType?: string;
  schemaText?: string;
  /** 界面语言，决定回答语言；zh 开头用中文提示词 */
  language: string;
}

/** system prompt（数据库方言 + 表结构上下文 + 输出约定） */
export function buildSystemPrompt({ dbType, schemaText, language }: SystemPromptInput): string {
  const zh = language.toLowerCase().startsWith('zh');
  const schema = schemaText?.trim();
  if (zh) {
    let prompt = dbType
      ? `你是 ${dbType} 数据库专家助手，帮助用户编写、分析、优化 SQL。\n\n`
      : `你是数据库专家助手，帮助用户编写、分析、优化 SQL。\n\n`;
    prompt += '要求：\n';
    if (dbType) prompt += `- 生成的 SQL 必须符合 ${dbType} 方言语法\n`;
    else prompt += '- 未指明数据库时使用标准 SQL；用户说明了数据库类型则遵循该方言\n';
    prompt += '- SQL 代码放在 ```sql 代码块中\n';
    if (schema) prompt += '- 只使用下方表结构中真实存在的库、表和字段，不要臆造\n';
    prompt += '- 不确定的地方明确说明，不要编造\n';
    prompt += '- 解释保持简洁，使用中文\n';
    if (schema) {
      prompt += `\n表结构（格式：库名.表名 (字段 类型, ...)，PK 表示主键）：\n${schema}\n`;
      prompt += `\n跨库查询时使用"库名.表名"的完整引用格式。\n`;
    }
    return prompt;
  }
  let prompt = dbType
    ? `You are a ${dbType} expert assistant that helps write, analyze and optimize SQL.\n\n`
    : `You are a database expert assistant that helps write, analyze and optimize SQL.\n\n`;
  prompt += 'Rules:\n';
  if (dbType) prompt += `- Generated SQL must follow the ${dbType} dialect\n`;
  else prompt += '- Use standard SQL unless the user names a database; then follow that dialect\n';
  prompt += '- Put SQL in ```sql code blocks\n';
  if (schema)
    prompt +=
      '- Only use databases, tables and columns that exist in the schema below; never invent names\n';
  prompt += '- Say so when you are unsure; do not make things up\n';
  prompt += '- Keep explanations concise and answer in English\n';
  if (schema) {
    prompt += `\nSchema (format: db.table (column TYPE, ...); PK marks a primary key):\n${schema}\n`;
    prompt += `\nFor cross-database queries, qualify tables as "db.table".\n`;
  }
  return prompt;
}

/** 用户消息里引用 SQL 时的小标题（随界面语言） */
export function sqlLabelFor(language: string): string {
  return language.toLowerCase().startsWith('zh') ? '当前编辑器中的 SQL：' : 'SQL from the editor:';
}

// ==================== 展示辅助 ====================

/** 耗时展示：1 秒内保留 1 位小数，之后整数秒，超过 1 分钟显示 m:ss */
export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  return `${m}m ${String(sec % 60).padStart(2, '0')}s`;
}
