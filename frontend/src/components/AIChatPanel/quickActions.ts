import type { TFunction } from 'i18next';

export type QuickActionKey = 'generate' | 'explain' | 'optimize' | 'convert';

export interface QuickAction {
  key: QuickActionKey;
  title: string;
  description: string;
  /** 需要引用编辑器里的 SQL（有选区用选区，否则用全文） */
  requiresSql?: boolean;
  /** 点击后直接发送；否则只把提示词填进输入框 */
  autoSend?: boolean;
  /** convert 带目标方言参数 */
  prompt: string | ((target: string) => string);
}

/** 「转换方言」可选的目标数据库 */
export const CONVERT_TARGETS = [
  'MySQL',
  'PostgreSQL',
  'Oracle',
  'SQL Server',
  'SQLite',
  'DM',
  'ClickHouse',
];

/** 空态快捷卡片与输入区「快捷指令」共用的动作定义；提示词语言跟随界面语言 */
export function buildQuickActions(t: TFunction, language: string): QuickAction[] {
  const zh = language.toLowerCase().startsWith('zh');
  return [
    {
      key: 'generate',
      title: t('common.aiChat.qaGenerateTitle'),
      description: t('common.aiChat.qaGenerateDesc'),
      prompt: zh ? '帮我写一个 SQL：' : 'Write a SQL query that ',
    },
    {
      key: 'explain',
      title: t('common.aiChat.qaExplainTitle'),
      description: t('common.aiChat.qaExplainDesc'),
      requiresSql: true,
      autoSend: true,
      prompt: zh
        ? '请解释这段 SQL 的执行逻辑：按执行顺序说明每一步做了什么，并指出潜在的正确性或性能风险。'
        : 'Explain what this SQL does step by step in execution order, and point out any correctness or performance risks.',
    },
    {
      key: 'optimize',
      title: t('common.aiChat.qaOptimizeTitle'),
      description: t('common.aiChat.qaOptimizeDesc'),
      requiresSql: true,
      autoSend: true,
      prompt: zh
        ? '请分析这段 SQL 的性能问题：先说明瓶颈在哪里、建议补充哪些索引（给出 DDL），再给出语义完全等价的优化 SQL。'
        : 'Analyze the performance of this SQL: explain the bottleneck, propose indexes (with DDL), then give an equivalent, optimized query.',
    },
    {
      key: 'convert',
      title: t('common.aiChat.qaConvertTitle'),
      description: t('common.aiChat.qaConvertDesc'),
      requiresSql: true,
      prompt: (target) =>
        zh
          ? `请把这段 SQL 转换为 ${target} 方言，只输出转换后的 SQL，并用一句话说明改动了哪些地方。`
          : `Convert this SQL to the ${target} dialect. Output only the converted SQL, then one sentence on what changed.`,
    },
  ];
}

/** 解析快捷菜单项 key：convert 的子项形如 `convert:MySQL` */
export function parseQuickActionKey(key: string): { action: QuickActionKey; target?: string } {
  const idx = key.indexOf(':');
  if (idx === -1) return { action: key as QuickActionKey };
  return { action: key.slice(0, idx) as QuickActionKey, target: key.slice(idx + 1) };
}
