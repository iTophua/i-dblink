export const isBaseTable = (tableType: string): boolean => {
  const normalizedType = (tableType || '').toUpperCase().trim();
  if (!normalizedType || normalizedType === 'NULL') return false;
  return (
    normalizedType === 'BASE TABLE' ||
    normalizedType === 'TABLE' ||
    normalizedType === 'BASE_TABLE' ||
    normalizedType === 'SYSTEM TABLE' ||
    normalizedType === 'SYSTEM TABLES' ||
    normalizedType === 'LOCAL TEMPORARY' ||
    normalizedType === 'GLOBAL TEMPORARY' ||
    normalizedType === 'TEMPORARY'
  );
};

export const isView = (tableType: string): boolean => {
  const normalizedType = (tableType || '').toUpperCase().trim();
  if (!normalizedType) return false;
  return (
    normalizedType === 'VIEW' ||
    normalizedType === 'SYSTEM VIEW' ||
    normalizedType === 'SYSTEM VIEWS' ||
    normalizedType === 'MATERIALIZED VIEW' ||
    normalizedType === 'MATERIALIZED_VIEW'
  );
};

export const formatRowCount = (count: number): string => {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 10_000) return `${(count / 1_000).toFixed(0)}K`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
};

export const TABLE_NODE_STYLE = {
  cursor: 'pointer',
  padding: '1px 4px',
  borderRadius: 3,
  display: 'inline-flex' as const,
  alignItems: 'center' as const,
  gap: 4,
  transition: 'all 0.2s ease',
};
