/**
 * AI 对话历史（本地持久化）。
 *
 * - 订阅 store 的消息变更，合并后批量写盘：终态（完成/失败/停止/删除）立即落盘，
 *   流式过程中的增量每 2 秒存档一次，应用崩溃也留得住已生成的内容。
 * - 会话在首条用户消息发出时才创建（空对话不占历史），标题取首条消息。
 * - 上下文（连接/库/表）变化后延迟写回当前会话，恢复会话时原样带回。
 * - 写盘失败只影响历史记录，不打扰对话：重试 3 次后放弃，并在控制台留一条错误
 *   （会进诊断日志）。
 */
import { api } from '../api';
import type { AIChatMessageBatch, AIChatSession, StoredChatMessage } from '../types/api';
import { subscribeChatMutations, useAIChatStore } from '../stores/aiChatStore';
import type {
  AIChatSessionSummary,
  ChatContextSnapshot,
  ChatMessage,
  ChatMutation,
} from '../stores/aiChatStore';
import type { TFunction } from 'i18next';

/** setTimeout 的返回值：浏览器里是 number，测试环境（Node 类型）下是 Timeout */
type Timer = ReturnType<typeof setTimeout>;

const FLUSH_DEBOUNCE_MS = 500;
const CHECKPOINT_MS = 2000;
const MAX_ATTEMPTS = 3;
export const SESSION_TITLE_MAX = 30;

interface PendingUpsert {
  sessionId: string | null;
  generation: number;
  message: ChatMessage;
}

interface PendingDelete {
  sessionId: string | null;
  generation: number;
  id: string;
}

interface SessionBatch {
  upserts: StoredChatMessage[];
  deletes: string[];
}

let upserts: PendingUpsert[] = [];
let deletes: PendingDelete[] = [];
let flushTimer: Timer | undefined;
let checkpointTimer: Timer | undefined;
let contextTimer: Timer | undefined;
/** 写盘串行化：同一时刻只有一批在写 */
let chain: Promise<void> = Promise.resolve();
let creating: { generation: number; promise: Promise<string | null> } | null = null;
/** 当前这一轮对话的首条用户消息 + 发问时的上下文（建会话时用） */
let conversationHead: { generation: number; content: string; context: ChatContextSnapshot } | null =
  null;
/** 已经确定过会话的对话代际 → 会话 id */
const resolvedSessions = new Map<number, string>();
const streamingIds = new Set<string>();
let suppressContextSync = false;
let lastContext = snapshotContext(useAIChatStore.getState());

// ── 纯函数 ──

/** 会话标题：首条用户消息压成一行后的前若干字符 */
export function deriveTitle(content: string, max = SESSION_TITLE_MAX): string {
  const text = (content ?? '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
}

export function toStoredMessage(m: ChatMessage): StoredChatMessage {
  const out: StoredChatMessage = { id: m.id, role: m.role, content: m.content };
  if (m.status) out.status = m.status;
  if (m.error) out.error = m.error;
  if (m.elapsedMs !== undefined) out.elapsed_ms = Math.max(0, Math.round(m.elapsedMs));
  if (m.attachedSql) out.attached_sql = m.attachedSql;
  return out;
}

export function fromStoredMessage(m: StoredChatMessage): ChatMessage {
  const out: ChatMessage = {
    id: m.id,
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content ?? '',
  };
  if (m.status === 'streaming') {
    // 没等到正常收尾（崩溃/强退）：按「已停止」展示，保留已生成的内容
    out.status = 'stopped';
  } else if (m.status === 'done' || m.status === 'error' || m.status === 'stopped') {
    out.status = m.status;
  }
  if (m.error) out.error = m.error;
  if (typeof m.elapsed_ms === 'number') out.elapsedMs = m.elapsed_ms;
  if (m.attached_sql) out.attachedSql = m.attached_sql;
  return out;
}

/** Go 给的是纳秒精度的 RFC3339；JS 只认 3 位小数，多出来的先裁掉（否则 Safari 下是 Invalid Date） */
function parseTime(value: string | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isFinite(ms) ? ms : 0;
}

export function toSessionSummary(s: AIChatSession): AIChatSessionSummary {
  return {
    id: s.id,
    title: s.title ?? '',
    connectionId: s.connection_id ?? null,
    contextJson: s.context_json ?? '',
    createdAt: parseTime(s.created_at),
    updatedAt: parseTime(s.updated_at),
  };
}

export function serializeContext(ctx: ChatContextSnapshot): string {
  return JSON.stringify({
    connection_id: ctx.connectionId,
    databases: ctx.databases,
    tables: ctx.tables,
  });
}

function normalizeTables(value: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!value || typeof value !== 'object') return out;
  for (const [db, tables] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(tables)) out[db] = tables.filter((t): t is string => typeof t === 'string');
  }
  return out;
}

export function parseContext(json: string | undefined | null): ChatContextSnapshot | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') return null;
    return {
      connectionId: typeof raw.connection_id === 'string' ? raw.connection_id : null,
      databases: Array.isArray(raw.databases)
        ? raw.databases.filter((d): d is string => typeof d === 'string')
        : [],
      tables: normalizeTables(raw.tables),
    };
  } catch {
    return null;
  }
}

function snapshotContext(s: {
  connectionId: string | null;
  selectedDatabases: string[];
  selectedTables: Record<string, string[]>;
}): ChatContextSnapshot {
  return {
    connectionId: s.connectionId,
    databases: s.selectedDatabases,
    tables: s.selectedTables,
  };
}

/** 相对时间：刚刚 / n 分钟前 / n 小时前 / n 天前，再早显示日期 */
export function formatRelativeTime(ms: number, t: TFunction): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const diff = Math.max(0, Date.now() - ms);
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  if (diff < minute) return t('common.aiChat.timeJustNow');
  if (diff < hour) return t('common.aiChat.timeMinutesAgo', { n: Math.floor(diff / minute) });
  if (diff < day) return t('common.aiChat.timeHoursAgo', { n: Math.floor(diff / hour) });
  if (diff < 7 * day) return t('common.aiChat.timeDaysAgo', { n: Math.floor(diff / day) });
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear
    ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── 会话创建 ──

/** 拿到某一代对话对应的会话 id；没有就按首条用户消息新建一个 */
async function ensureSession(generation: number): Promise<string | null> {
  const known = resolvedSessions.get(generation);
  if (known) return known;
  const s = useAIChatStore.getState();
  if (s.sessionId && s.conversationSeq === generation) return s.sessionId;
  if (creating) {
    if (creating.generation === generation) return creating.promise;
    // 另一代对话正在建会话：等它建完再建这一代的，避免两轮对话挤进同一个会话
    await creating.promise.catch(() => null);
  }
  const settled = resolvedSessions.get(generation);
  if (settled) return settled;

  const head = conversationHead?.generation === generation ? conversationHead : null;
  if (!head) return null;
  // 失败要抛出去：writeBatch 靠它重试。这里自己吞掉的话，提问会悄悄丢失，
  // 而之后的批次重试建会话成功，历史里就只剩一个以提问为标题、却没有这条提问的会话
  const promise = (async (): Promise<string> => {
    const created = await api.createAIChatSession(
      deriveTitle(head.content),
      head.context.connectionId,
      serializeContext(head.context)
    );
    resolvedSessions.set(generation, created.id);
    if (resolvedSessions.size > 100) {
      // 只留最近的：删掉最小代际
      const oldest = Math.min(...resolvedSessions.keys());
      resolvedSessions.delete(oldest);
    }
    const st = useAIChatStore.getState();
    st.upsertSession(toSessionSummary(created));
    // 这一代对话仍是当前对话时才挂到面板上；已被「新对话」替换的只进历史列表
    if (st.conversationSeq === generation) st.setCurrentSession(created.id);
    return created.id;
  })();
  creating = { generation, promise };
  try {
    return await promise;
  } finally {
    if (creating?.promise === promise) creating = null;
  }
}

// ── 写盘 ──

function queueUpsert(sessionId: string | null, generation: number, message: ChatMessage): void {
  const idx = upserts.findIndex((p) => p.message.id === message.id && p.sessionId === sessionId);
  if (idx >= 0) upserts.splice(idx, 1);
  upserts.push({ sessionId, generation, message });
}

function scheduleFlush(): void {
  if (flushTimer !== undefined) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    void flushAIChatHistory();
  }, FLUSH_DEBOUNCE_MS);
}

function ensureCheckpoint(): void {
  if (checkpointTimer !== undefined) return;
  checkpointTimer = setTimeout(runCheckpoint, CHECKPOINT_MS);
}

/** 流式进行中：把已生成的内容存一次档 */
function runCheckpoint() {
  const s = useAIChatStore.getState();
  for (const id of [...streamingIds]) {
    const msg = s.messages.find((m) => m.id === id);
    if (!msg) {
      streamingIds.delete(id);
      continue;
    }
    queueUpsert(s.sessionId, s.conversationSeq, msg);
    if (msg.status !== 'streaming') streamingIds.delete(id);
  }
  checkpointTimer = undefined;
  if (streamingIds.size === 0) return;
  void flushAIChatHistory();
  ensureCheckpoint();
}

function onMutation(m: ChatMutation): void {
  const generation = useAIChatStore.getState().conversationSeq;
  if (m.type === 'delete') {
    deletes.push({ sessionId: m.sessionId, generation, id: m.id });
    streamingIds.delete(m.id);
    void flushAIChatHistory(); // 删除立即生效
    return;
  }
  const msg = m.message;
  if (msg.role === 'user' && conversationHead?.generation !== generation) {
    conversationHead = {
      generation,
      content: msg.content,
      context: snapshotContext(useAIChatStore.getState()),
    };
  }
  queueUpsert(m.sessionId, generation, msg);
  if (msg.status === 'streaming') {
    streamingIds.add(msg.id);
    ensureCheckpoint();
    scheduleFlush(); // 占位回复：延迟合并
  } else {
    streamingIds.delete(msg.id);
    void flushAIChatHistory(); // 终态立即落盘
  }
}

/** 队列里的流式回复是入队时的快照：落盘前换成 store 里的最新内容，崩溃时少丢一段 */
function refreshStreaming(items: PendingUpsert[]): PendingUpsert[] {
  if (streamingIds.size === 0) return items;
  const current = useAIChatStore.getState().messages;
  return items.map((p) => {
    if (p.message.status !== 'streaming') return p;
    const latest = current.find((m) => m.id === p.message.id);
    return latest && latest.status === 'streaming' ? { ...p, message: latest } : p;
  });
}

/** 把队列里的内容全部写完（含正在写的一批）。返回的 Promise 结束时队列一定清空过。 */
export function flushAIChatHistory(): Promise<void> {
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  if (upserts.length === 0 && deletes.length === 0) return chain;
  const batchDeletes = deletes;
  // 后端对同一批是先删后插：队列里若还有这条消息的旧快照（比如刚发出就被撤掉的占位回复），
  // 不滤掉就会被原样写回去
  const deletedIds = new Set(batchDeletes.map((d) => d.id));
  const batchUpserts = refreshStreaming(upserts).filter((p) => !deletedIds.has(p.message.id));
  upserts = [];
  deletes = [];
  const run = async () => {
    try {
      await writeBatch(batchUpserts, batchDeletes, 1);
    } catch (err) {
      console.error('[aiChatHistory] 对话历史写入失败，已放弃这批内容', err);
    }
  };
  chain = chain.then(run, run);
  return chain;
}

async function writeBatch(
  batchUpserts: PendingUpsert[],
  batchDeletes: PendingDelete[],
  attempt: number
): Promise<void> {
  let firstError: unknown = null;
  const groups = new Map<string, SessionBatch>();
  const group = (sessionId: string): SessionBatch => {
    let g = groups.get(sessionId);
    if (!g) {
      g = { upserts: [], deletes: [] };
      groups.set(sessionId, g);
    }
    return g;
  };
  // 会话可能要现建：建会话失败和写入失败一样整批重试（写入按 id 幂等）
  try {
    for (const p of batchDeletes) {
      const sid = p.sessionId ?? (await ensureSession(p.generation));
      if (sid) group(sid).deletes.push(p.id);
    }
    for (const p of batchUpserts) {
      const sid = p.sessionId ?? (await ensureSession(p.generation));
      if (sid) group(sid).upserts.push(toStoredMessage(p.message));
    }
  } catch (err) {
    firstError = err;
  }
  if (firstError === null) {
    for (const [sessionId, batch] of groups) {
      try {
        await api.saveAIChatMessages(sessionId, batch as AIChatMessageBatch);
      } catch (err) {
        firstError ??= err;
      }
    }
  }
  if (firstError !== null) {
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => {
        setTimeout(resolve, 200 * attempt);
      });
      return writeBatch(batchUpserts, batchDeletes, attempt + 1);
    }
    throw firstError;
  }
}

/** 丢弃某个会话的待写内容（会话已被删除） */
function dropPendingFor(sessionId: string | null): void {
  upserts = upserts.filter((p) => p.sessionId !== sessionId);
  deletes = deletes.filter((p) => p.sessionId !== sessionId);
}

function onStoreChange(): void {
  const s = useAIChatStore.getState();
  const next = {
    connectionId: s.connectionId,
    databases: s.selectedDatabases,
    tables: s.selectedTables,
  };
  const changed =
    next.connectionId !== lastContext.connectionId ||
    next.databases !== lastContext.databases ||
    next.tables !== lastContext.tables;
  lastContext = next;
  if (!changed || suppressContextSync || !s.sessionId) return;
  if (contextTimer !== undefined) clearTimeout(contextTimer);
  contextTimer = setTimeout(() => {
    contextTimer = undefined;
    const current = useAIChatStore.getState();
    if (current.sessionId && !suppressContextSync) void saveContext(current.sessionId);
  }, FLUSH_DEBOUNCE_MS);
}

async function saveContext(sessionId: string): Promise<void> {
  const s = useAIChatStore.getState();
  if (s.sessionId !== sessionId) return;
  const context = snapshotContext(s);
  const json = serializeContext(context);
  try {
    await api.updateAIChatSessionContext(sessionId, context.connectionId, json);
    const existing = useAIChatStore.getState().sessions.find((item) => item.id === sessionId);
    if (existing) {
      // 不改 updatedAt：换一下上下文不该把会话顶到「最近」（和改名一样）
      useAIChatStore.getState().upsertSession({
        ...existing,
        connectionId: context.connectionId,
        contextJson: json,
      });
    }
  } catch (err) {
    console.error('[aiChatHistory] 保存对话上下文失败', err);
  }
}

function onPageHide(): void {
  void flushAIChatHistory();
}

// ── 对外操作 ──

/** 拉取历史会话列表。返回是否成功：失败时调用方可以稍后再试 */
export async function refreshAIChatSessions(): Promise<boolean> {
  try {
    const list = await api.listAIChatSessions();
    useAIChatStore.getState().setSessions((list ?? []).map(toSessionSummary));
    return true;
  } catch (err) {
    console.error('[aiChatHistory] 读取对话历史失败', err);
    return false;
  }
}

/** 开始新对话：先把当前对话写完，再清空面板（已落盘的内容留在历史里） */
export async function startNewAIChat(): Promise<void> {
  await flushAIChatHistory();
  const st = useAIChatStore.getState();
  dropPendingFor(st.sessionId);
  dropPendingFor(null);
  streamingIds.clear();
  st.clearMessages();
}

/** 恢复一个历史会话：消息与发问时的上下文一起带回 */
export async function resumeAIChatSession(id: string): Promise<void> {
  await flushAIChatHistory();
  const messages = await api.getAIChatMessages(id);
  const summary = useAIChatStore.getState().sessions.find((s) => s.id === id);
  suppressContextSync = true;
  try {
    useAIChatStore.getState().hydrateConversation({
      sessionId: id,
      messages: (messages ?? []).map(fromStoredMessage),
      context: parseContext(summary?.contextJson),
    });
  } finally {
    suppressContextSync = false;
  }
}

export async function deleteAIChatSession(id: string): Promise<void> {
  await flushAIChatHistory();
  await api.deleteAIChatSession(id);
  dropPendingFor(id);
  streamingIds.clear();
  const st = useAIChatStore.getState();
  st.removeSessionFromList(id);
  // 删的是当前对话：面板回到新对话
  if (st.sessionId === id) st.clearMessages();
}

export async function renameAIChatSession(id: string, title: string): Promise<void> {
  const clean = title.trim();
  await api.renameAIChatSession(id, clean);
  const summary = useAIChatStore.getState().sessions.find((s) => s.id === id);
  if (summary) useAIChatStore.getState().upsertSession({ ...summary, title: clean });
}

export async function clearAIChatHistory(): Promise<void> {
  await flushAIChatHistory();
  await api.deleteAllAIChatSessions();
  upserts = [];
  deletes = [];
  streamingIds.clear();
  const st = useAIChatStore.getState();
  st.setSessions([]);
  st.clearMessages();
}

/** 安装持久化（应用启动时调用一次），返回卸载函数 */
export function installAIChatHistory(): () => void {
  const offMutations = subscribeChatMutations(onMutation);
  const unsubStore = useAIChatStore.subscribe(onStoreChange);
  window.addEventListener('pagehide', onPageHide);
  return () => {
    offMutations();
    unsubStore();
    window.removeEventListener('pagehide', onPageHide);
    void flushAIChatHistory();
  };
}

/** 仅测试用：清空队列与定时器 */
export function resetAIChatHistoryForTests(): void {
  for (const timer of [flushTimer, checkpointTimer, contextTimer]) {
    if (timer !== undefined) clearTimeout(timer);
  }
  flushTimer = undefined;
  checkpointTimer = undefined;
  contextTimer = undefined;
  upserts = [];
  deletes = [];
  chain = Promise.resolve();
  creating = null;
  conversationHead = null;
  resolvedSessions.clear();
  streamingIds.clear();
  suppressContextSync = false;
  lastContext = snapshotContext(useAIChatStore.getState());
}
