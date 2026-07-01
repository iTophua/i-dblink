/**
 * ChartView — lightweight CSS-based chart visualization for query results.
 *
 * Auto-detects numeric columns as data series and the first non-numeric column
 * as labels. Supports vertical bar and horizontal bar chart types.
 */
import { useMemo, useState } from 'react';
import { Empty, Select, Space } from 'antd';
import { useTranslation } from 'react-i18next';

// ── Types ──

interface ChartViewProps {
  columns: string[];
  rows: unknown[][];
}

type ChartType = 'bar' | 'horizontalBar';

// ── Color palette ──

const SERIES_COLORS = [
  '#1890ff',
  '#52c41a',
  '#faad14',
  '#f5222d',
  '#722ed1',
  '#13c2c2',
  '#eb2f96',
  '#fa8c16',
  '#2f54eb',
  '#a0d911',
];

// ── Helpers ──

/** Detect which column indices are numeric (contain at least one number). */
function detectNumericColumns(columns: string[], rows: unknown[][]): number[] {
  const numeric: number[] = [];
  for (let ci = 0; ci < columns.length; ci++) {
    let hasNumber = false;
    for (let ri = 0; ri < rows.length; ri++) {
      const val = rows[ri]?.[ci];
      if (typeof val === 'number' && Number.isFinite(val)) {
        hasNumber = true;
        break;
      }
    }
    if (hasNumber) numeric.push(ci);
  }
  return numeric;
}

/** Find the first non-numeric column index to use as labels. */
function detectLabelColumn(columns: string[], numericCols: Set<number>): number {
  for (let ci = 0; ci < columns.length; ci++) {
    if (!numericCols.has(ci)) return ci;
  }
  // Fallback: use first column
  return 0;
}

/** Get a color for a series index. */
function getSeriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

/** Parse a numeric value, returning 0 for non-numeric. */
function toNumber(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

// ── Component ──

export function ChartView({ columns, rows }: ChartViewProps) {
  const { t } = useTranslation();
  const [chartType, setChartType] = useState<ChartType>('bar');

  const numericColIndices = useMemo(() => detectNumericColumns(columns, rows), [columns, rows]);
  const numericColSet = useMemo(() => new Set(numericColIndices), [numericColIndices]);
  const labelColIndex = useMemo(() => detectLabelColumn(columns, numericColSet), [columns, numericColSet]);

  const dataSeries = useMemo(() => {
    return numericColIndices.map((ci) => ({
      index: ci,
      name: columns[ci],
      values: rows.map((r) => toNumber(r[ci])),
    }));
  }, [numericColIndices, columns, rows]);

  const labels = useMemo(() => {
    return rows.map((r, i) => String(r[labelColIndex] ?? `#${i + 1}`));
  }, [rows, labelColIndex]);

  // Compute global max for scaling (must be before early returns to follow hooks rules)
  const globalMax = useMemo(() => {
    let max = 0;
    for (const series of dataSeries) {
      for (const v of series.values) {
        if (Math.abs(v) > max) max = Math.abs(v);
      }
    }
    return max || 1;
  }, [dataSeries]);

  if (numericColIndices.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description={t('common.dataGrid.noNumericColumns')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description={t('common.dataGrid.noData')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Chart type selector */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Space size={8}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('common.dataGrid.chartType')}:</span>
          <Select
            size="small"
            value={chartType}
            onChange={(val) => setChartType(val as ChartType)}
            style={{ width: 130 }}
            options={[
              { value: 'bar', label: t('common.dataGrid.barChart') },
              { value: 'horizontalBar', label: t('common.dataGrid.horizontalBarChart') },
            ]}
          />
        </Space>
        {/* Legend */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {dataSeries.map((series, i) => (
            <span key={series.index} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: getSeriesColor(i), display: 'inline-block' }} />
              {series.name}
            </span>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
        {chartType === 'bar' ? (
          <BarChart dataSeries={dataSeries} labels={labels} globalMax={globalMax} />
        ) : (
          <HorizontalBarChart dataSeries={dataSeries} labels={labels} globalMax={globalMax} />
        )}
      </div>
    </div>
  );
}

// ── BarChart (vertical) ──

interface BarChartProps {
  dataSeries: { index: number; name: string; values: number[] }[];
  labels: string[];
  globalMax: number;
}

function BarChart({ dataSeries, labels, globalMax }: BarChartProps) {
  const barGroupWidth = 40;
  const groupGap = 16;
  const chartHeight = 260;
  const yAxisWidth = 60;
  const maxBarsPerGroup = dataSeries.length;
  const barWidth = Math.max(6, Math.floor((barGroupWidth - (maxBarsPerGroup - 1) * 2) / maxBarsPerGroup));

  // Y-axis ticks
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (globalMax / tickCount) * i);

  const totalWidth = labels.length * (barGroupWidth + groupGap) + yAxisWidth + 20;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ position: 'relative', minWidth: totalWidth, height: chartHeight + 50 }}>
        {/* Y-axis labels */}
        {ticks.map((tick, i) => {
          const y = chartHeight - (tick / globalMax) * chartHeight;
          return (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: 0,
                top: y - 6,
                width: yAxisWidth - 8,
                textAlign: 'right',
                fontSize: 10,
                color: 'var(--text-secondary)',
                fontFamily: 'monospace',
              }}
            >
              {tick.toFixed(tick >= 1000 ? 0 : tick >= 1 ? 1 : 2)}
            </span>
          );
        })}

        {/* Grid lines */}
        {ticks.map((tick, i) => {
          const y = chartHeight - (tick / globalMax) * chartHeight;
          return (
            <div
              key={`grid-${i}`}
              style={{
                position: 'absolute',
                left: yAxisWidth,
                top: y,
                right: 0,
                height: 1,
                background: i === 0 ? 'var(--border)' : 'var(--border-subtle, rgba(0,0,0,0.06))',
              }}
            />
          );
        })}

        {/* Bar groups */}
        {labels.map((label, rowIdx) => {
          const groupX = yAxisWidth + rowIdx * (barGroupWidth + groupGap);
          return (
            <div key={rowIdx} style={{ position: 'absolute', left: groupX, top: 0, width: barGroupWidth }}>
              {/* Bars */}
              <div style={{ display: 'flex', alignItems: 'flex-end', height: chartHeight, gap: 2, justifyContent: 'center' }}>
                {dataSeries.map((series, si) => {
                  const val = Math.abs(series.values[rowIdx] ?? 0);
                  const pct = (val / globalMax) * 100;
                  const isNeg = (series.values[rowIdx] ?? 0) < 0;
                  return (
                    <div
                      key={series.index}
                      title={`${series.name}: ${series.values[rowIdx]?.toLocaleString() ?? 0}`}
                      style={{
                        width: barWidth,
                        height: `${pct}%`,
                        background: getSeriesColor(si),
                        opacity: isNeg ? 0.5 : 1,
                        borderRadius: '2px 2px 0 0',
                        minHeight: val > 0 ? 2 : 0,
                        transition: 'height 0.2s ease',
                      }}
                    />
                  );
                })}
              </div>
              {/* Label */}
              <div
                style={{
                  textAlign: 'center',
                  fontSize: 10,
                  color: 'var(--text-secondary)',
                  marginTop: 4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: barGroupWidth,
                }}
                title={label}
              >
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── HorizontalBarChart ──

function HorizontalBarChart({ dataSeries, labels, globalMax }: BarChartProps) {
  const rowHeight = Math.max(28, Math.min(40, 600 / labels.length));
  const labelWidth = 120;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {labels.map((label, rowIdx) => (
        <div key={rowIdx} style={{ display: 'flex', alignItems: 'center', height: rowHeight, gap: 8 }}>
          {/* Label */}
          <div
            style={{
              width: labelWidth,
              textAlign: 'right',
              fontSize: 11,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
            title={label}
          >
            {label}
          </div>
          {/* Bars */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {dataSeries.map((series, si) => {
              const val = Math.abs(series.values[rowIdx] ?? 0);
              const pct = (val / globalMax) * 100;
              const isNeg = (series.values[rowIdx] ?? 0) < 0;
              return (
                <div
                  key={series.index}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, height: (rowHeight - 4) / dataSeries.length }}
                >
                  <div
                    title={`${series.name}: ${series.values[rowIdx]?.toLocaleString() ?? 0}`}
                    style={{
                      width: `${pct}%`,
                      minWidth: val > 0 ? 2 : 0,
                      height: '100%',
                      background: getSeriesColor(si),
                      opacity: isNeg ? 0.5 : 1,
                      borderRadius: '0 2px 2px 0',
                      transition: 'width 0.2s ease',
                    }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {series.values[rowIdx]?.toLocaleString() ?? 0}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default ChartView;
