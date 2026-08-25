import React from 'react';

/**
 * 搜索命中片段高亮：大小写不敏感地拆分文本，命中片段加主题色 + 加粗。
 * query 为空时原样返回，零开销。
 */
export const HighlightText = React.memo(function HighlightText({
  text,
  query,
}: {
  text: string;
  query?: string;
}) {
  const q = (query || '').trim().toLowerCase();
  if (!q || !text) return <>{text}</>;

  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let last = 0;
  let idx = lower.indexOf(q, last);
  while (idx !== -1) {
    if (idx > last) {
      parts.push(<React.Fragment key={parts.length}>{text.slice(last, idx)}</React.Fragment>);
    }
    parts.push(
      <mark
        key={parts.length}
        style={{
          background: 'transparent',
          color: 'var(--color-primary)',
          fontWeight: 600,
          padding: 0,
        }}
      >
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    last = idx + q.length;
    idx = lower.indexOf(q, last);
  }
  if (last < text.length) {
    parts.push(<React.Fragment key={parts.length}>{text.slice(last)}</React.Fragment>);
  }
  return <>{parts}</>;
});
