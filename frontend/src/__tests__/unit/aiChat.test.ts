import { describe, it, expect, beforeEach } from 'vitest';
import { mockGetAllColumns } from '../setupTests';
import {
  SCHEMA_MAX_CHARS,
  buildSchemaContext,
  buildSystemPrompt,
  composeUserContent,
  estimateTokens,
  formatElapsed,
  peekAllColumns,
  pickTables,
  sqlLabelFor,
  summarizeSchema,
  toggleTable,
  toRequestHistory,
  trimHistory,
} from '../../utils/aiChat';
import type { ChatMessage } from '../../stores/aiChatStore';

const col = (column_name: string, data_type: string, column_key?: string) => ({
  column_name,
  data_type,
  is_nullable: 'YES',
  ...(column_key ? { column_key } : {}),
});

/** 每个用例用独立的连接 ID，避免命中模块级列信息缓存 */
let seq = 0;
const nextConn = () => `conn-${++seq}`;

beforeEach(() => {
  mockGetAllColumns.mockReset();
});

describe('aiChat 表级筛选', () => {
  it('无筛选时按表名排序纳入整库', () => {
    expect(pickTables(['t_order', 't_user', 't_device'])).toEqual([
      't_device',
      't_order',
      't_user',
    ]);
  });

  it('有筛选时取筛选与现存表的交集，已不存在的表被丢弃', () => {
    expect(pickTables(['a', 'b', 'c'], ['c', 'a', 'gone'])).toEqual(['a', 'c']);
  });

  it('勾满整库后回到「无筛选」，取消最后一张返回空', () => {
    const all = ['a', 'b'];
    expect(toggleTable(all, ['a'], 'b')).toBeNull();
    expect(toggleTable(all, ['a'], 'a')).toEqual([]);
    expect(toggleTable(all, undefined, 'a')).toEqual(['b']);
  });
});

describe('aiChat 表结构上下文', () => {
  it('拼接 库.表 (字段 类型, PK) 并统计表数与字符数', async () => {
    const conn = nextConn();
    mockGetAllColumns.mockResolvedValue({
      tables: {
        t_user: [col('id', 'bigint', 'PRI'), col('name', 'varchar(64)')],
        t_order: [col('id', 'bigint', 'PRI')],
      },
    });
    const ctx = await buildSchemaContext({ connectionId: conn, databases: ['db1'] });
    // 同一库内的表逐行排列，库与库之间空一行
    expect(ctx.text).toBe(
      'db1.t_order (id bigint PK)\ndb1.t_user (id bigint PK, name varchar(64))'
    );
    expect(ctx.tableCount).toBe(2);
    expect(ctx.databaseCount).toBe(1);
    expect(ctx.chars).toBe(ctx.text.length);

    // 读过的库可以从缓存同步取数
    expect(peekAllColumns(conn, 'db1')?.stale).toBe(false);
    expect(summarizeSchema(conn, ['db1'])).toEqual({
      complete: true,
      tableCount: 2,
      chars: ctx.text.length + 1,
    });
  });

  it('未读过的库标记为未统计完成', () => {
    const conn = nextConn();
    expect(summarizeSchema(conn, ['db_x'])).toEqual({ complete: false, tableCount: 0, chars: 0 });
    expect(summarizeSchema(null, [])).toEqual({ complete: false, tableCount: 0, chars: 0 });
  });

  it('表级筛选只纳入勾选的表', async () => {
    mockGetAllColumns.mockResolvedValue({
      tables: {
        t_user: [col('id', 'bigint', 'PRI')],
        t_order: [col('id', 'bigint', 'PRI')],
      },
    });
    const ctx = await buildSchemaContext({
      connectionId: nextConn(),
      databases: ['db1'],
      tables: { db1: ['t_order'] },
    });
    expect(ctx.text).toBe('db1.t_order (id bigint PK)');
    expect(ctx.tableCount).toBe(1);
  });

  it('单个库拉取失败只跳过该库，不阻断对话', async () => {
    mockGetAllColumns.mockImplementation((_c, db) =>
      db === 'bad'
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ tables: { t_ok: [col('id', 'int')] } })
    );
    const ctx = await buildSchemaContext({ connectionId: nextConn(), databases: ['bad', 'good'] });
    expect(ctx.text).toBe('good.t_ok (id int)');
    expect(ctx.databaseCount).toBe(1);
  });

  it('后端返回 null（空 map 序列化结果）按无表处理', async () => {
    mockGetAllColumns.mockResolvedValue({ tables: null });
    const ctx = await buildSchemaContext({ connectionId: nextConn(), databases: ['empty'] });
    expect(ctx).toEqual({ text: '', databaseCount: 0, tableCount: 0, chars: 0 });
  });

  it('未选连接或未选库时没有上下文，也不会发请求', async () => {
    const ctx = await buildSchemaContext({ connectionId: null, databases: ['db1'] });
    expect(ctx.text).toBe('');
    expect(mockGetAllColumns).not.toHaveBeenCalled();
  });
});

describe('aiChat 历史裁剪', () => {
  const msg = (role: 'user' | 'assistant', content: string): ChatMessage => ({
    id: role + content,
    role,
    content,
  });

  it('未超预算时原样保留', () => {
    const history = [msg('user', 'a'), msg('assistant', 'b')];
    expect(trimHistory(history)).toEqual(history);
  });

  it('超出条数上限时只保留最近的，并从 user 消息开始', () => {
    const history: ChatMessage[] = [];
    for (let i = 0; i < 12; i++) history.push(msg('user', `q${i}`), msg('assistant', `a${i}`));
    const kept = trimHistory(history);
    expect(kept).toHaveLength(16);
    expect(kept[0].role).toBe('user');
    expect(kept[kept.length - 1].content).toBe('a11');
  });

  it('超出字符预算时丢掉最早的轮次，最新一条始终保留', () => {
    const history = [
      msg('user', 'x'.repeat(600)),
      msg('assistant', 'y'.repeat(600)),
      msg('user', 'z'.repeat(600)),
      msg('assistant', 'w'.repeat(20)),
    ];
    const kept = trimHistory(history, 16, 1000);
    // 从最新往前累加：20 + 600 = 620 ≤ 1000，再加 600 超出 → 截断点顺延到下一条 user
    expect(kept.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(kept[0].content.startsWith('z')).toBe(true);

    const single = [msg('user', 'x'.repeat(5000))];
    expect(trimHistory(single, 16, 100)).toEqual(single);
  });

  it('没有 user 消息的历史不发送', () => {
    expect(trimHistory([msg('assistant', 'orphan')])).toEqual([]);
  });
});

describe('aiChat 消息与提示词构建', () => {
  it('引用的 SQL 以代码块并入用户消息，未引用时保持原文', () => {
    const label = sqlLabelFor('zh-CN');
    expect(label).toBe('当前编辑器中的 SQL：');
    expect(composeUserContent('  解释一下  ', undefined, label)).toBe('解释一下');
    expect(composeUserContent('解释一下', 'SELECT 1\n', label)).toBe(
      '解释一下\n\n当前编辑器中的 SQL：\n```sql\nSELECT 1\n```'
    );
    expect(sqlLabelFor('en-US')).toBe('SQL from the editor:');
  });

  it('界面消息转请求消息：带上引用的 SQL，并跳过空回复', () => {
    const messages: ChatMessage[] = [
      { id: '1', role: 'user', content: '问', attachedSql: 'SELECT 1' },
      { id: '2', role: 'assistant', content: '' },
      { id: '3', role: 'assistant', content: '答' },
    ];
    const history = toRequestHistory(messages, 'SQL：');
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: 'user', content: '问\n\nSQL：\n```sql\nSELECT 1\n```' });
    expect(history[1]).toEqual({ role: 'assistant', content: '答' });
  });

  it('system prompt 带方言与表结构；未选连接时退化为通用助手', () => {
    const zh = buildSystemPrompt({
      dbType: 'mysql',
      schemaText: 'db.t (id INT)',
      language: 'zh-CN',
    });
    expect(zh).toContain('mysql 数据库专家助手');
    expect(zh).toContain('db.t (id INT)');
    expect(zh).toContain('使用中文');

    const generic = buildSystemPrompt({ language: 'zh-CN' });
    expect(generic).not.toContain('方言语法');
    expect(generic).toContain('标准 SQL');
    expect(generic).not.toContain('表结构');

    const en = buildSystemPrompt({ dbType: 'postgresql', language: 'en-US' });
    expect(en).toContain('postgresql expert assistant');
    expect(en).toContain('answer in English');
  });

  it('token 估算与耗时展示', () => {
    expect(estimateTokens(0)).toBe(1);
    expect(estimateTokens(3000)).toBe(1000);
    expect(formatElapsed(820)).toBe('0.8s');
    expect(formatElapsed(3240)).toBe('3s');
    expect(formatElapsed(65_400)).toBe('1m 05s');
  });

  it('上下文上限常量保持可用（发送前的拦截依赖它）', () => {
    expect(SCHEMA_MAX_CHARS).toBeGreaterThan(0);
  });
});
