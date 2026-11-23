import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Input, Modal, Progress, Segmented, App } from 'antd';
import {
  CheckCircleOutlined,
  DownloadOutlined,
  InfoCircleOutlined,
  TableOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  CodeOutlined,
  ApartmentOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { utils as xlsxUtils, write as xlsxWrite } from 'xlsx';
import { api, EventsOn } from '../../api';
import { useThemeColors } from '../../hooks/useThemeColors';

export type ExportFormat = 'csv' | 'json' | 'xlsx' | 'txt' | 'xml' | 'md';

interface ResultExportDialogProps {
  open: boolean;
  initialFormat: ExportFormat;
  columns: string[];
  /** 全部行（数组形式，与结果集一致） */
  rows: unknown[][];
  /** 选中行（无选中时传 null，范围选项禁用） */
  selectedRows: unknown[][] | null;
  /** 产生当前结果的 SQL（「全部数据」服务端导出用它重新执行） */
  sql?: string;
  connectionId?: string;
  database?: string | null;
  onClose: () => void;
}

const EXTENSIONS: Record<ExportFormat, string> = {
  csv: 'csv',
  json: 'json',
  xlsx: 'xlsx',
  txt: 'txt',
  xml: 'xml',
  md: 'md',
};

// ── 各格式内容生成（返回字符串；xlsx 单独走二进制）──
function exportToCsv(
  cols: string[],
  rows: unknown[][],
  opts: { delimiter: string; bom: boolean }
): string {
  const d = opts.delimiter;
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return s.includes(d) || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = cols.map(esc).join(d) + '\n' + rows.map((r) => r.map(esc).join(d)).join('\n');
  return (opts.bom ? '\uFEFF' : '') + body;
}
function exportToJson(cols: string[], rows: unknown[][]): string {
  return JSON.stringify(
    rows.map((r) => {
      const o: Record<string, unknown> = {};
      cols.forEach((c, i) => {
        o[c] = r[i];
      });
      return o;
    }),
    null,
    2
  );
}
function exportToTxt(cols: string[], rows: unknown[][], bom: boolean): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return s.includes('\t') || s.includes('\n') ? s.replace(/\t/g, ' ').replace(/\n/g, '\\n') : s;
  };
  const body = cols.map(esc).join('\t') + '\n' + rows.map((r) => r.map(esc).join('\t')).join('\n');
  return (bom ? '\uFEFF' : '') + body;
}
function exportToXml(cols: string[], rows: unknown[][]): string {
  const sanitize = (n: string) => n.replace(/[^a-zA-Z0-9_\u4e00-\u9fff.-]/g, '_');
  const esc = (v: unknown) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<data>'];
  for (const row of rows) {
    lines.push('  <row>');
    cols.forEach((c, i) => lines.push(`    <${sanitize(c)}>${esc(row[i])}</${sanitize(c)}>`));
    lines.push('  </row>');
  }
  lines.push('</data>');
  return lines.join('\n');
}
function exportToMd(cols: string[], rows: unknown[][], bom: boolean): string {
  const esc = (v: unknown) =>
    String(v ?? '')
      .replace(/\|/g, '\\|')
      .replace(/\n/g, '<br>');
  const h = '| ' + cols.map(esc).join(' | ') + ' |';
  const body =
    h +
    '\n| ' +
    cols.map(() => '---').join(' | ') +
    ' |\n' +
    rows.map((r) => '| ' + r.map(esc).join(' | ') + ' |').join('\n');
  return (bom ? '\uFEFF' : '') + body;
}
function bytesToBase64(u8: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(s);
}

function buildXlsxBuffer(cols: string[], rows: unknown[][]): ArrayBuffer {
  const data = rows.map((r) => {
    const o: Record<string, unknown> = {};
    cols.forEach((c, i) => {
      o[c] = r[i];
    });
    return o;
  });
  const ws = xlsxUtils.json_to_sheet(data);
  const wb = xlsxUtils.book_new();
  xlsxUtils.book_append_sheet(wb, ws, 'Query Result');
  return xlsxWrite(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

// 尾部行数子句（最外层）：LIMIT n / LIMIT o,n / LIMIT n OFFSET m /
// OFFSET n ROWS [FETCH NEXT|FIRST n ROWS ONLY] / 头部 SELECT TOP (n)
const TRAILING_LIMIT_RE =
  /\s+(?:limit\s+\d+\s*(?:,\s*\d+\s*|\s+offset\s+\d+\s*)?|offset\s+\d+\s+rows?\s*(?:fetch\s+(?:next|first)\s+\d+\s+rows?\s+only)?)$/i;
const SELECT_TOP_RE = /^(\s*select\s+(?:distinct\s+|all\s+)?)top\s*\(?\s*\d+\s*\)?\s+/i;

/**
 * 剥除最外层行数子句，仅用于「全部数据」模式的 SQL 预览默认值——
 * 子查询内的 LIMIT 有业务语义不动；用户可在预览框里改回或继续编辑。
 */
function stripOuterLimit(sqlText: string): { sql: string; removed: boolean } {
  let q = sqlText.trim().replace(/;+$/, '').trim();
  let removed = false;
  for (;;) {
    const m = q.match(TRAILING_LIMIT_RE);
    if (!m || m.index === undefined) break;
    q = q.slice(0, m.index).trim();
    removed = true;
  }
  const t = q.replace(SELECT_TOP_RE, '$1');
  if (t !== q) {
    q = t.trim();
    removed = true;
  }
  return { sql: q, removed };
}

/** 毫秒 → 人读时长：<60s → Ns；<1h → Nm；否则 ~Nh Nm */
function fmtDuration(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m${sec % 60 ? (sec % 60) + 's' : ''}`;
  return `~${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m`;
}

/** 表单分区：小标题 + 内容，统一间距 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const tc = useThemeColors();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, color: tc.textTertiary, fontWeight: 500 }}>{title}</span>
      {children}
    </div>
  );
}

/**
 * 查询结果导出向导：格式 / 范围（全部/选中）/ CSV 分隔符与 BOM / 保存位置。
 * 保存位置走原生保存对话框（SaveExportFileDialog），内容经 WriteExportFile
 * 落盘到用户选择的路径——不经过浏览器下载目录。
 */
export function ResultExportDialog({
  open,
  initialFormat,
  columns,
  rows,
  selectedRows,
  sql,
  connectionId,
  database,
  onClose,
}: ResultExportDialogProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const tc = useThemeColors();

  const [format, setFormat] = useState<ExportFormat>(initialFormat);
  const [scope, setScope] = useState<'all' | 'selected' | 'full'>('all');
  const [savePath, setSavePath] = useState('');
  const [delimiter, setDelimiter] = useState<string>(',');
  const [bom, setBom] = useState(true);
  const [exporting, setExporting] = useState(false);
  // 「全部数据」将执行的 SQL：默认为剥除尾部行数子句后的原句，
  // 用户可编辑（pristine=false 后隐藏“已移除”提示条）
  const [fullSql, setFullSql] = useState('');
  const [fullSqlPristine, setFullSqlPristine] = useState(true);
  const [limitRemoved, setLimitRemoved] = useState(false);
  // 服务端导出进度（按 path 过滤事件，避免多 Tab 串扰）
  const [progress, setProgress] = useState<{
    phase: 'counting' | 'exporting';
    rows: number;
    total: number;
    elapsedMs: number;
  } | null>(null);
  // 成功态：不自动关窗，展示行数/用时/打开位置
  const [doneInfo, setDoneInfo] = useState<{ rows: number; elapsedMs: number } | null>(null);

  useEffect(() => {
    if (open) {
      setFormat(initialFormat);
      setScope('all');
      setSavePath('');
      setExporting(false);
      setProgress(null);
      setDoneInfo(null);
      const stripped = stripOuterLimit(sql || '');
      setFullSql(stripped.sql);
      setFullSqlPristine(true);
      setLimitRemoved(stripped.removed);
    }
  }, [open, initialFormat, sql]);

  const hasSelection = !!selectedRows && selectedRows.length > 0;
  const exportRows = scope === 'selected' && hasSelection && selectedRows ? selectedRows : rows;

  const defaultName = useMemo(() => 'result.' + EXTENSIONS[format], [format]);
  // 切格式后旧路径后缀不匹配，视为未选择
  const pathValid = savePath.toLowerCase().endsWith('.' + EXTENSIONS[format]);

  const browse = async () => {
    try {
      const path = await api.saveExportFileDialog(defaultName, format);
      if (path) setSavePath(path);
    } catch (e) {
      message.error(String(e));
    }
  };

  const doExport = async () => {
    setExporting(true);
    setDoneInfo(null);
    // 服务端导出期间订阅进度事件（同一保存路径才算自己的）
    let unsub: (() => void) | undefined;
    try {
      // 全部数据：服务端重新执行 SQL 流式落盘（不受查询行数限制）
      if (scope === 'full') {
        unsub = EventsOn<{
          path: string;
          phase: string;
          rows: number;
          total: number;
          elapsedMs: number;
        }>('export-progress', (p) => {
          if (p && p.path === savePath) {
            setProgress({
              phase: p.phase === 'counting' ? 'counting' : 'exporting',
              rows: p.rows,
              total: p.total,
              elapsedMs: p.elapsedMs,
            });
          }
        });
        // 执行预览框里的 SQL（所见即所导）；未动过即剥除版
        const result = await api.exportQueryResultToFile(
          connectionId || '',
          fullSql,
          database || '',
          format,
          savePath
        );
        setDoneInfo({ rows: result.rows, elapsedMs: result.elapsedMs ?? 0 });
        return;
      }
      let data: Uint8Array;
      if (format === 'xlsx') {
        data = new Uint8Array(buildXlsxBuffer(columns, exportRows));
      } else {
        let text: string;
        switch (format) {
          case 'csv': {
            const delim = delimiter === '\\t' ? '\t' : delimiter;
            text = exportToCsv(columns, exportRows, { delimiter: delim, bom });
            break;
          }
          case 'json':
            text = exportToJson(columns, exportRows);
            break;
          case 'txt':
            text = exportToTxt(columns, exportRows, bom);
            break;
          case 'xml':
            text = exportToXml(columns, exportRows);
            break;
          default:
            text = exportToMd(columns, exportRows, bom);
        }
        data = new TextEncoder().encode(text);
      }
      await api.writeExportFile(savePath, bytesToBase64(data));
      setDoneInfo({ rows: exportRows.length, elapsedMs: 0 });
    } catch (e) {
      message.error(t('common.resultExport.failed') + ': ' + String(e));
    } finally {
      unsub?.();
      setProgress(null);
      setExporting(false);
    }
  };

  const formatOptions = [
    {
      value: 'csv',
      label: 'CSV',
      icon: <TableOutlined />,
      color: '#217346',
      descKey: 'common.resultExport.descCsv',
    },
    {
      value: 'xlsx',
      label: 'Excel',
      icon: <FileExcelOutlined />,
      color: '#1D6F42',
      descKey: 'common.resultExport.descXlsx',
    },
    {
      value: 'json',
      label: 'JSON',
      icon: <CodeOutlined />,
      color: '#8B89BF',
      descKey: 'common.resultExport.descJson',
    },
    {
      value: 'txt',
      label: 'TXT',
      icon: <FileTextOutlined />,
      color: '#7A8399',
      descKey: 'common.resultExport.descTxt',
    },
    {
      value: 'xml',
      label: 'XML',
      icon: <ApartmentOutlined />,
      color: '#D77E3A',
      descKey: 'common.resultExport.descXml',
    },
    {
      value: 'md',
      label: 'MD',
      icon: <ReadOutlined />,
      color: '#3B7DD8',
      descKey: 'common.resultExport.descMd',
    },
  ] as const;

  return (
    <Modal
      open={open}
      onCancel={exporting ? undefined : onClose}
      onOk={doExport}
      okText={t('common.resultExport.exportBtn')}
      okButtonProps={{ icon: <DownloadOutlined />, loading: exporting, disabled: !pathValid }}
      cancelText={t('common.cancel')}
      title={t('common.resultExport.title')}
      width={580}
      centered
      transitionName=""
      maskTransitionName=""
      data-testid="result-export-dialog"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 6 }}>
        {/* 成功横幅：不自动关窗，可换格式重导或打开所在位置 */}
        {doneInfo && !exporting && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              borderRadius: 10,
              background: 'var(--color-success-alpha-15)',
              border: '1px solid var(--color-success)',
              fontSize: 12,
            }}
            data-testid="result-export-done"
          >
            <CheckCircleOutlined style={{ color: 'var(--color-success)', fontSize: 14 }} />
            <span style={{ flex: 1, color: tc.textPrimary }}>
              {t('common.resultExport.successBanner', {
                rows: doneInfo.rows.toLocaleString(),
                duration: fmtDuration(doneInfo.elapsedMs),
              })}
            </span>
            <Button
              size="small"
              icon={<FolderOpenOutlined />}
              onClick={() => api.openInFolder(savePath).catch((e) => message.error(String(e)))}
            >
              {t('common.resultExport.openLocation')}
            </Button>
          </div>
        )}

        {/* 服务端导出进度：百分比/行数/速度/预计剩余 */}
        {exporting && scope === 'full' && progress && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'var(--background-toolbar)',
              fontSize: 12,
            }}
            data-testid="result-export-progress"
          >
            <Progress
              percent={
                progress.total > 0 && progress.rows > 0
                  ? Math.min(99, Math.round((progress.rows / progress.total) * 100))
                  : 0
              }
              status={progress.total > 0 ? 'normal' : 'active'}
              showInfo={progress.total > 0}
              size="small"
              strokeColor="var(--color-primary)"
            />
            <div
              style={{ display: 'flex', justifyContent: 'space-between', color: tc.textTertiary }}
            >
              <span>
                {progress.phase === 'counting'
                  ? t('common.resultExport.progCounting')
                  : progress.total > 0
                    ? t('common.resultExport.progRows', {
                        done: progress.rows.toLocaleString(),
                        total: progress.total.toLocaleString(),
                      })
                    : t('common.resultExport.progRowsUnknown', {
                        done: progress.rows.toLocaleString(),
                      })}
              </span>
              {progress.phase === 'exporting' &&
                progress.rows > 0 &&
                progress.elapsedMs > 0 &&
                (() => {
                  const speed = progress.rows / (progress.elapsedMs / 1000);
                  const eta =
                    progress.total > 0
                      ? t('common.resultExport.progEta', {
                          eta: fmtDuration(((progress.total - progress.rows) / speed) * 1000),
                        })
                      : '';
                  return (
                    <span>
                      {t('common.resultExport.progSpeed', {
                        speed: Math.round(speed).toLocaleString(),
                      })}
                      {eta ? ` · ${eta}` : ''}
                    </span>
                  );
                })()}
            </div>
          </div>
        )}

        {/* 单列：格式 → 选项 → 范围 → SQL → 位置 */}
        <Section title={t('common.resultExport.format')}>
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}
            data-testid="result-export-format"
          >
            {formatOptions.map((o) => {
              const selected = format === o.value;
              return (
                <div
                  key={o.value}
                  className="hoverable"
                  onClick={() => setFormat(o.value)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--border-color)'}`,
                    background: selected
                      ? 'var(--color-primary-alpha-15)'
                      : 'var(--background-toolbar)',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s ease, background 0.15s ease',
                    boxShadow: selected ? '0 0 0 2px var(--color-primary-alpha-15)' : 'none',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 15, color: o.color, lineHeight: 1 }}>{o.icon}</span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: selected ? 600 : 500,
                        color: selected ? tc.textPrimary : tc.textSecondary,
                      }}
                    >
                      {o.label}
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      lineHeight: 1.3,
                      color: selected ? tc.textSecondary : tc.textTertiary,
                    }}
                  >
                    {t(o.descKey)}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>

        {format === 'csv' && (
          <Section title={t('common.resultExport.csvOptions')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Segmented
                value={delimiter}
                onChange={(v) => setDelimiter(v as string)}
                size="small"
                options={[
                  { value: ',', label: t('common.resultExport.delimComma') },
                  { value: ';', label: t('common.resultExport.delimSemicolon') },
                  { value: '\\t', label: t('common.resultExport.delimTab') },
                ]}
              />
              <Checkbox
                checked={bom}
                onChange={(e) => setBom(e.target.checked)}
                style={{ fontSize: 12 }}
              >
                {t('common.resultExport.bom')}
              </Checkbox>
            </div>
          </Section>
        )}

        {(format === 'txt' || format === 'md') && (
          <Checkbox
            checked={bom}
            onChange={(e) => setBom(e.target.checked)}
            style={{ fontSize: 12 }}
          >
            {t('common.resultExport.bom')}
          </Checkbox>
        )}

        <Section title={t('common.resultExport.scope')}>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
            data-testid="result-export-scope"
          >
            {(
              [
                {
                  value: 'all' as const,
                  label: t('common.resultExport.allRows', { count: rows.length }),
                  disabled: rows.length === 0,
                  desc: '',
                },
                {
                  value: 'selected' as const,
                  label: t('common.resultExport.selectedRows', {
                    count: selectedRows?.length ?? 0,
                  }),
                  disabled: !hasSelection,
                  desc: '',
                },
                {
                  value: 'full' as const,
                  label: t('common.resultExport.fullRows'),
                  disabled: false,
                  desc: t('common.resultExport.fullRowsHint'),
                },
              ] as const
            ).map((o) => {
              const selected = scope === o.value;
              return (
                <div
                  key={o.value}
                  className="hoverable"
                  onClick={() => {
                    if (!o.disabled) setScope(o.value);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--border-color)'}`,
                    background: selected
                      ? 'var(--color-primary-alpha-15)'
                      : 'var(--background-toolbar)',
                    cursor: o.disabled ? 'not-allowed' : 'pointer',
                    opacity: o.disabled ? 0.45 : 1,
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      flexShrink: 0,
                      border: selected
                        ? '3.5px solid var(--color-primary)'
                        : '1.5px solid var(--text-tertiary)',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ fontWeight: selected ? 600 : 500, color: tc.textPrimary }}>
                    {o.label}
                  </span>
                  {o.desc && (
                    <span style={{ color: tc.textTertiary, fontSize: 11, marginLeft: 'auto' }}>
                      {o.desc}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {scope === 'full' && (
          <Section title={t('common.resultExport.execSql')}>
            {limitRemoved && fullSqlPristine && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11,
                  color: 'var(--color-warning)',
                  marginBottom: 2,
                }}
              >
                <InfoCircleOutlined />
                {t('common.resultExport.limitRemovedTip')}
                <Button
                  type="link"
                  size="small"
                  style={{ fontSize: 11, padding: 0, height: 'auto' }}
                  onClick={() => {
                    setFullSql((sql || '').trim());
                    setLimitRemoved(false);
                  }}
                >
                  {t('common.resultExport.restoreOriginal')}
                </Button>
              </div>
            )}
            <Input.TextArea
              value={fullSql}
              onChange={(e) => {
                setFullSql(e.target.value);
                setFullSqlPristine(false);
              }}
              autoSize={{ minRows: 2, maxRows: 8 }}
              spellCheck={false}
              style={{
                fontFamily: 'var(--font-family-code)',
                fontSize: 11,
                borderRadius: 8,
              }}
              data-testid="result-export-full-sql"
            />
          </Section>
        )}

        <Section title={t('common.resultExport.saveLocation')}>
          <div
            onClick={browse}
            className="hoverable"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 10,
              border: `1px solid ${pathValid ? 'var(--border-color)' : 'var(--color-warning)'}`,
              background: 'var(--background-toolbar)',
              cursor: 'pointer',
              fontSize: 12,
              minHeight: 36,
            }}
            data-testid="result-export-location"
          >
            <FolderOpenOutlined style={{ color: tc.primary, flexShrink: 0 }} />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-family-code)',
                color: pathValid ? tc.textPrimary : tc.textTertiary,
              }}
              title={savePath || undefined}
            >
              {pathValid ? savePath : t('common.resultExport.selectLocation')}
            </span>
          </div>
        </Section>

        <div style={{ fontSize: 12, color: tc.textSecondary }} data-testid="result-export-summary">
          {scope === 'full'
            ? t('common.resultExport.fullSummary', {
                fetched: rows.length,
                cols: columns.length,
              })
            : t('common.resultExport.summary', { rows: exportRows.length, cols: columns.length })}
        </div>
      </div>
    </Modal>
  );
}
