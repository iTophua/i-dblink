import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Tabs,
  Table,
  Button,
  InputNumber,
  Select,
  Switch,
  Space,
  Popconfirm,
  message,
  Card,
  Typography,
  Tooltip,
  Spin,
} from 'antd';
import { useTranslation } from 'react-i18next';
import { GlobalInput } from '../GlobalInput';
import {
  PlusOutlined,
  DeleteOutlined,
  CodeOutlined,
  KeyOutlined,
  LinkOutlined,
  ColumnWidthOutlined,
  DragOutlined,
} from '@ant-design/icons';
import Editor, { OnMount } from '@monaco-editor/react';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../../api';
import type { ColumnInfo, IndexInfo, ForeignKeyInfo } from '../../types/api';
import { useThemeColors } from '../../hooks/useThemeColors';

const { Text } = Typography;

// ── Types ───────────────────────────────────────────────────────────────────

export interface DesignerColumn {
  key: string;
  name: string;
  type: string;
  length?: number;
  nullable: boolean;
  defaultValue?: string;
  comment?: string;
  isPrimary?: boolean;
}

export interface DesignerIndex {
  key: string;
  name: string;
  type: 'PRIMARY' | 'UNIQUE' | 'INDEX';
  columns: string[];
}

export interface DesignerForeignKey {
  key: string;
  name: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
  onUpdate: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION' | 'SET DEFAULT';
  onDelete: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION' | 'SET DEFAULT';
}

export interface TableDesignerProps {
  connectionId: string;
  tableName?: string;
  database?: string;
  dbType?: string;
  onSave?: (sql: string) => void;
  onCancel?: () => void;
}

// ── Constants ───────────────────────────────────────────────────────────────

const COMMON_TYPES = [
  'INT',
  'BIGINT',
  'SMALLINT',
  'TINYINT',
  'VARCHAR',
  'CHAR',
  'TEXT',
  'MEDIUMTEXT',
  'LONGTEXT',
  'DECIMAL',
  'FLOAT',
  'DOUBLE',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'TIMESTAMP',
  'TIME',
  'YEAR',
  'JSON',
  'BLOB',
  'MEDIUMBLOB',
  'LONGBLOB',
  'BINARY',
  'UUID',
];

const DB_TYPE_FIELDS: Record<string, string[]> = {
  mysql: [
    'INT',
    'BIGINT',
    'SMALLINT',
    'TINYINT',
    'MEDIUMINT',
    'VARCHAR',
    'CHAR',
    'TEXT',
    'MEDIUMTEXT',
    'LONGTEXT',
    'TINYTEXT',
    'DECIMAL',
    'FLOAT',
    'DOUBLE',
    'BOOLEAN',
    'DATE',
    'DATETIME',
    'TIMESTAMP',
    'TIME',
    'YEAR',
    'JSON',
    'BLOB',
    'MEDIUMBLOB',
    'LONGBLOB',
    'BINARY',
    'ENUM',
    'SET',
  ],
  postgresql: [
    'SMALLINT',
    'INTEGER',
    'BIGINT',
    'SERIAL',
    'BIGSERIAL',
    'VARCHAR',
    'CHAR',
    'TEXT',
    'DECIMAL',
    'NUMERIC',
    'REAL',
    'DOUBLE PRECISION',
    'BOOLEAN',
    'DATE',
    'TIMESTAMP',
    'TIMESTAMPTZ',
    'TIME',
    'TIMETZ',
    'JSON',
    'JSONB',
    'UUID',
    'BYTEA',
    'INET',
    'CIDR',
    'MACADDR',
  ],
  sqlite: [
    'INTEGER',
    'REAL',
    'TEXT',
    'BLOB',
    'NUMERIC',
    'BOOLEAN',
    'VARCHAR',
    'CHAR',
    'DATETIME',
    'DATE',
    'TIMESTAMP',
  ],
  dameng: [
    'INT',
    'BIGINT',
    'SMALLINT',
    'TINYINT',
    'VARCHAR',
    'CHAR',
    'TEXT',
    'CLOB',
    'DECIMAL',
    'NUMBER',
    'FLOAT',
    'DOUBLE',
    'BOOLEAN',
    'DATE',
    'TIMESTAMP',
    'TIMESTAMP WITH TIME ZONE',
    'BLOB',
    'BFILE',
  ],
  kingbase: [
    'SMALLINT',
    'INTEGER',
    'BIGINT',
    'SERIAL',
    'BIGSERIAL',
    'VARCHAR',
    'CHAR',
    'TEXT',
    'DECIMAL',
    'NUMERIC',
    'REAL',
    'DOUBLE PRECISION',
    'BOOLEAN',
    'DATE',
    'TIMESTAMP',
    'TIMESTAMPTZ',
    'JSON',
    'JSONB',
    'UUID',
    'BYTEA',
  ],
  highgo: [
    'SMALLINT',
    'INTEGER',
    'BIGINT',
    'SERIAL',
    'BIGINT',
    'VARCHAR',
    'CHAR',
    'TEXT',
    'DECIMAL',
    'NUMERIC',
    'REAL',
    'DOUBLE PRECISION',
    'BOOLEAN',
    'DATE',
    'TIMESTAMP',
    'TIMESTAMPTZ',
    'JSON',
    'JSONB',
    'UUID',
  ],
  vastbase: [
    'INT',
    'BIGINT',
    'SMALLINT',
    'TINYINT',
    'VARCHAR',
    'CHAR',
    'TEXT',
    'DECIMAL',
    'FLOAT',
    'DOUBLE',
    'BOOLEAN',
    'DATE',
    'DATETIME',
    'TIMESTAMP',
    'JSON',
    'BLOB',
  ],
  sqlserver: [
    'INT',
    'BIGINT',
    'SMALLINT',
    'TINYINT',
    'VARCHAR',
    'CHAR',
    'TEXT',
    'NVARCHAR',
    'NCHAR',
    'DECIMAL',
    'FLOAT',
    'REAL',
    'DOUBLE PRECISION',
    'BIT',
    'DATE',
    'DATETIME',
    'DATETIME2',
    'SMALLDATETIME',
    'TIMESTAMP',
    'BLOB',
    'XML',
    'UNIQUEIDENTIFIER',
  ],
};

function getFieldTypes(dbType?: string): string[] {
  if (!dbType) return COMMON_TYPES;
  const key = dbType.toLowerCase();
  return DB_TYPE_FIELDS[key] || COMMON_TYPES;
}

const genKey = () => Math.random().toString(36).slice(2, 10);

// ── Helpers ─────────────────────────────────────────────────────────────────

function escapeIdentifier(name: string, dbType?: string): string {
  let open = '`';
  let close = '`';
  let escapeQuote = (n: string) => n.replace(/`/g, '``');

  switch (dbType) {
    case 'postgresql':
    case 'kingbase':
    case 'highgo':
    case 'vastbase':
    case 'oracle':
    case 'dameng':
      open = '"';
      close = '"';
      escapeQuote = (n) => n.replace(/"/g, '""');
      break;
    case 'sqlserver':
      open = '[';
      close = ']';
      escapeQuote = (n) => n.replace(/\]/g, ']]');
      break;
  }

  return `${open}${escapeQuote(name)}${close}`;
}

function generateColumnDef(col: DesignerColumn, dbType?: string): string {
  let line = `${escapeIdentifier(col.name, dbType)} ${col.type}`;
  if (col.length && col.type !== 'BOOLEAN' && col.type !== 'JSON') {
    line += `(${col.length})`;
  }
  if (!col.nullable) {
    line += ' NOT NULL';
  }
  if (col.defaultValue) {
    const val = col.defaultValue.trim();
    // 处理特殊默认值（根据数据库类型）
    const upperVal = val.toUpperCase();
    if (
      upperVal === 'CURRENT_TIMESTAMP' ||
      upperVal === 'NOW()' ||
      upperVal === 'NULL' ||
      upperVal === 'TRUE' ||
      upperVal === 'FALSE'
    ) {
      // 保留关键字和函数原样
      line += ` DEFAULT ${val}`;
    } else if (/^-?\d+(\.\d+)?$/.test(val)) {
      // 纯数字
      line += ` DEFAULT ${val}`;
    } else {
      // 字符串默认值：需要加引号
      // 根据数据库类型选择引号风格
      const quote = dbType === 'sqlserver' ? "'" : "'";
      const escaped = val.replace(/'/g, "''");
      line += ` DEFAULT ${quote}${escaped}${quote}`;
    }
  }
  if (col.comment && (dbType === 'mysql' || dbType === 'mariadb')) {
    line += ` COMMENT '${col.comment.replace(/'/g, "''")}'`;
  }
  return line;
}

function generateCreateTableSQL(
  tableName: string,
  columns: DesignerColumn[],
  indexes: DesignerIndex[],
  foreignKeys: DesignerForeignKey[],
  dbType?: string
): string {
  if (!tableName) return '-- Enter table name to generate SQL';

  const parts: string[] = [];

  // Column definitions
  for (const col of columns) {
    if (!col.name) continue;
    parts.push(`  ${generateColumnDef(col, dbType)}`);
  }

  // Index definitions
  for (const idx of indexes) {
    if (!idx.name || idx.columns.length === 0) continue;
    const cols = idx.columns.map((c) => escapeIdentifier(c, dbType)).join(', ');
    if (idx.type === 'PRIMARY') {
      parts.push(`  PRIMARY KEY (${cols})`);
    } else if (idx.type === 'UNIQUE') {
      parts.push(`  CONSTRAINT ${escapeIdentifier(idx.name, dbType)} UNIQUE (${cols})`);
    } else {
      parts.push(`  INDEX ${escapeIdentifier(idx.name, dbType)} (${cols})`);
    }
  }

  // Auto-add primary key from column flag if no explicit PK index
  const pkColumns = columns.filter((c) => c.isPrimary).map((c) => escapeIdentifier(c.name, dbType));
  if (pkColumns.length > 0 && !indexes.some((i) => i.type === 'PRIMARY')) {
    parts.push(`  PRIMARY KEY (${pkColumns.join(', ')})`);
  }

  // Foreign key definitions
  for (const fk of foreignKeys) {
    if (!fk.name || !fk.column || !fk.referencedTable || !fk.referencedColumn) continue;
    parts.push(
      `  CONSTRAINT ${escapeIdentifier(fk.name, dbType)} FOREIGN KEY (${escapeIdentifier(fk.column, dbType)}) REFERENCES ${escapeIdentifier(fk.referencedTable, dbType)}(${escapeIdentifier(fk.referencedColumn, dbType)}) ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}`
    );
  }

  const isMySQL = dbType === 'mysql' || dbType === 'mariadb';
  const tableSuffix = isMySQL ? '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;' : '\n);';

  return `CREATE TABLE ${escapeIdentifier(tableName, dbType)} (\n${parts.join(',\n')}${tableSuffix}`;
}

function generateAlterTableSQL(
  tableName: string,
  columns: DesignerColumn[],
  indexes: DesignerIndex[],
  foreignKeys: DesignerForeignKey[],
  originalColumns: DesignerColumn[],
  originalIndexes: DesignerIndex[],
  originalForeignKeys: DesignerForeignKey[],
  dbType?: string
): string {
  if (!tableName) return '-- Enter table name to generate SQL';

  const alters: string[] = [];
  const tableRef = escapeIdentifier(tableName, dbType);

  // --- 列变更 ---
  const origColMap = new Map(originalColumns.map((c) => [c.name, c]));
  const newColMap = new Map(columns.map((c) => [c.name, c]));

  // 新增列
  for (const col of columns) {
    if (!col.name) continue;
    if (!origColMap.has(col.name)) {
      alters.push(`ALTER TABLE ${tableRef} ADD COLUMN ${generateColumnDef(col, dbType)};`);
    }
  }

  // 修改列
  for (const col of columns) {
    if (!col.name) continue;
    const orig = origColMap.get(col.name);
    if (!orig) continue;
    const hasChanged =
      orig.type !== col.type ||
      orig.length !== col.length ||
      orig.nullable !== col.nullable ||
      orig.defaultValue !== col.defaultValue ||
      orig.comment !== col.comment ||
      orig.isPrimary !== col.isPrimary;
    if (hasChanged) {
      alters.push(`ALTER TABLE ${tableRef} MODIFY COLUMN ${generateColumnDef(col, dbType)};`);
    }
  }

  // 删除列
  for (const orig of originalColumns) {
    if (!newColMap.has(orig.name)) {
      alters.push(`ALTER TABLE ${tableRef} DROP COLUMN ${escapeIdentifier(orig.name, dbType)};`);
    }
  }

  // --- 索引变更 ---
  const origIdxMap = new Map(originalIndexes.map((i) => [i.name, i]));
  const newIdxMap = new Map(indexes.map((i) => [i.name, i]));

  // 删除索引
  for (const orig of originalIndexes) {
    if (!newIdxMap.has(orig.name)) {
      alters.push(`ALTER TABLE ${tableRef} DROP INDEX ${escapeIdentifier(orig.name, dbType)};`);
    }
  }

  // 新增/修改索引
  for (const idx of indexes) {
    if (!idx.name || idx.columns.length === 0) continue;
    const orig = origIdxMap.get(idx.name);
    const cols = idx.columns.map((c) => escapeIdentifier(c, dbType)).join(', ');
    const idxChanged =
      !orig ||
      orig.type !== idx.type ||
      orig.columns.length !== idx.columns.length ||
      orig.columns.some((c, i) => c !== idx.columns[i]);
    if (idxChanged) {
      if (orig) {
        alters.push(`ALTER TABLE ${tableRef} DROP INDEX ${escapeIdentifier(idx.name, dbType)};`);
      }
      if (idx.type === 'UNIQUE') {
        alters.push(
          `ALTER TABLE ${tableRef} ADD CONSTRAINT ${escapeIdentifier(idx.name, dbType)} UNIQUE (${cols});`
        );
      } else {
        alters.push(
          `ALTER TABLE ${tableRef} ADD INDEX ${escapeIdentifier(idx.name, dbType)} (${cols});`
        );
      }
    }
  }

  // --- 外键变更 ---
  const origFkMap = new Map(originalForeignKeys.map((f) => [f.name, f]));
  const newFkMap = new Map(foreignKeys.map((f) => [f.name, f]));

  // 删除外键
  for (const orig of originalForeignKeys) {
    if (!newFkMap.has(orig.name)) {
      alters.push(
        `ALTER TABLE ${tableRef} DROP FOREIGN KEY ${escapeIdentifier(orig.name, dbType)};`
      );
    }
  }

  // 新增外键
  for (const fk of foreignKeys) {
    if (!fk.name || !fk.column || !fk.referencedTable || !fk.referencedColumn) continue;
    if (!origFkMap.has(fk.name)) {
      alters.push(
        `ALTER TABLE ${tableRef} ADD CONSTRAINT ${escapeIdentifier(fk.name, dbType)} FOREIGN KEY (${escapeIdentifier(fk.column, dbType)}) REFERENCES ${escapeIdentifier(fk.referencedTable, dbType)}(${escapeIdentifier(fk.referencedColumn, dbType)}) ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete};`
      );
    }
  }

  if (alters.length === 0) return '-- 没有检测到结构变更';
  return alters.join('\n');
}

// ── Component ───────────────────────────────────────────────────────────────

export function TableDesigner({
  connectionId,
  tableName: propTableName,
  database,
  dbType,
  onSave,
  onCancel,
}: TableDesignerProps) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const editorRef = useRef<any>(null);
  const isEditMode = !!propTableName;
  const [activeTab, setActiveTab] = useState('columns');
  const [tableName, setTableName] = useState(propTableName || '');
  const [columns, setColumns] = useState<DesignerColumn[]>([
    { key: genKey(), name: 'id', type: 'INT', length: 11, nullable: false, isPrimary: true },
  ]);
  const [indexes, setIndexes] = useState<DesignerIndex[]>([]);
  const [foreignKeys, setForeignKeys] = useState<DesignerForeignKey[]>([]);
  const [loading, setLoading] = useState(false);

  // 保存原始结构用于生成 ALTER 语句
  const [originalColumns, setOriginalColumns] = useState<DesignerColumn[]>([]);
  const [originalIndexes, setOriginalIndexes] = useState<DesignerIndex[]>([]);
  const [originalForeignKeys, setOriginalForeignKeys] = useState<DesignerForeignKey[]>([]);

  const lastLoadedRef = useRef('');

  // Sync tableName when prop changes
  useEffect(() => {
    if (propTableName) setTableName(propTableName);
  }, [propTableName]);

  // Load existing table structure
  useEffect(() => {
    if (!connectionId || !propTableName) return;
    const cacheKey = `${connectionId}::${database || ''}::${propTableName}`;
    if (lastLoadedRef.current === cacheKey) return;

    const loadStructure = async () => {
      setLoading(true);
      try {
        const structure = await api.getTableStructure(connectionId, propTableName, database);

        // Convert columns
        const loadedColumns: DesignerColumn[] = structure.columns.map((col: ColumnInfo) => {
          const rawType = col.data_type;
          const baseMatch = rawType.match(/^([A-Z]+)/i);
          const baseType = (baseMatch ? baseMatch[1] : rawType).toUpperCase();
          const sizeMatch = rawType.match(/\(([^)]+)\)/);
          let length = 255;
          if (sizeMatch) {
            const parts = sizeMatch[1].split(',').map((s: string) => s.trim());
            const firstNum = parseInt(parts[0], 10);
            if (!isNaN(firstNum)) length = firstNum;
          }
          return {
            key: genKey(),
            name: col.column_name,
            type: baseType,
            length,
            nullable: col.is_nullable === 'YES',
            defaultValue: col.column_default || undefined,
            comment: col.comment || undefined,
            isPrimary: col.column_key === 'PRI',
          };
        });
        setColumns(loadedColumns);
        setOriginalColumns(loadedColumns.map((c) => ({ ...c })));

        // Convert indexes (skip primary key index as it's handled by column's isPrimary)
        const loadedIndexes: DesignerIndex[] = structure.indexes
          .filter((idx: IndexInfo) => !idx.is_primary)
          .map((idx: IndexInfo) => ({
            key: genKey(),
            name: idx.index_name,
            type: idx.is_unique ? ('UNIQUE' as const) : ('INDEX' as const),
            columns: [idx.column_name],
          }));
        setIndexes(loadedIndexes);
        setOriginalIndexes(loadedIndexes.map((i) => ({ ...i, columns: [...i.columns] })));

        // Convert foreign keys
        const loadedForeignKeys: DesignerForeignKey[] = structure.foreign_keys.map(
          (fk: ForeignKeyInfo) => ({
            key: genKey(),
            name: fk.constraint_name,
            column: fk.column_name,
            referencedTable: fk.referenced_table,
            referencedColumn: fk.referenced_column,
            onUpdate: 'CASCADE' as const,
            onDelete: 'CASCADE' as const,
          })
        );
        setForeignKeys(loadedForeignKeys);
        setOriginalForeignKeys(loadedForeignKeys.map((f) => ({ ...f })));

        lastLoadedRef.current = cacheKey;
      } catch (err) {
        console.error('Failed to load table structure:', err);
        message.error(t('common.failedToLoadTableStructure'));
      } finally {
        setLoading(false);
      }
    };

    loadStructure();
  }, [connectionId, propTableName, database]);

  // ── SQL Preview ────────────────────────────────────────────────────────
  const sqlPreview = useMemo(() => {
    if (isEditMode) {
      return generateAlterTableSQL(
        tableName,
        columns,
        indexes,
        foreignKeys,
        originalColumns,
        originalIndexes,
        originalForeignKeys,
        dbType
      );
    }
    return generateCreateTableSQL(tableName, columns, indexes, foreignKeys, dbType);
  }, [
    tableName,
    columns,
    indexes,
    foreignKeys,
    originalColumns,
    originalIndexes,
    originalForeignKeys,
    isEditMode,
    dbType,
  ]);

  // ── Column CRUD ────────────────────────────────────────────────────────
  const addColumn = () => {
    setColumns((prev) => [
      ...prev,
      { key: genKey(), name: '', type: 'VARCHAR', length: 255, nullable: true },
    ]);
  };

  const updateColumn = (
    key: string,
    field: keyof DesignerColumn,
    value: DesignerColumn[keyof DesignerColumn]
  ) => {
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, [field]: value } : c)));
  };

  const deleteColumn = (key: string) => {
    setColumns((prev) => prev.filter((c) => c.key !== key));
    // Also remove from indexes
    const col = columns.find((c) => c.key === key);
    if (col) {
      setIndexes((prev) =>
        prev.map((idx) => ({
          ...idx,
          columns: idx.columns.filter((c) => c !== col.name),
        }))
      );
    }
  };

  const moveColumn = (fromIndex: number, toIndex: number) => {
    setColumns((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  };

  // ── Index CRUD ─────────────────────────────────────────────────────────
  const addIndex = () => {
    setIndexes((prev) => [
      ...prev,
      { key: genKey(), name: `idx_${genKey()}`, type: 'INDEX', columns: [] },
    ]);
  };

  const updateIndex = (
    key: string,
    field: keyof DesignerIndex,
    value: DesignerIndex[keyof DesignerIndex]
  ) => {
    setIndexes((prev) => prev.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
  };

  const deleteIndex = (key: string) => {
    setIndexes((prev) => prev.filter((i) => i.key !== key));
  };

  // ── Foreign Key CRUD ───────────────────────────────────────────────────
  const addForeignKey = () => {
    setForeignKeys((prev) => [
      ...prev,
      {
        key: genKey(),
        name: `fk_${genKey()}`,
        column: '',
        referencedTable: '',
        referencedColumn: '',
        onUpdate: 'RESTRICT',
        onDelete: 'RESTRICT',
      },
    ]);
  };

  const updateForeignKey = (
    key: string,
    field: keyof DesignerForeignKey,
    value: DesignerForeignKey[keyof DesignerForeignKey]
  ) => {
    setForeignKeys((prev) => prev.map((fk) => (fk.key === key ? { ...fk, [field]: value } : fk)));
  };

  const deleteForeignKey = (key: string) => {
    setForeignKeys((prev) => prev.filter((fk) => fk.key !== key));
  };

  // ── Save ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!tableName) {
      message.error(t('common.pleaseEnterTableName'));
      return;
    }
    if (columns.length === 0) {
      message.error(t('common.atLeastOneColumnRequired'));
      return;
    }
    if (!sqlPreview || sqlPreview.startsWith('--')) {
      message.info(t('common.noSqlToExecute'));
      return;
    }

    // 触发 onSave，由父组件负责执行 SQL
    onSave?.(sqlPreview);
  };

  // ── Column Table Columns ───────────────────────────────────────────────
  const columnDefs: ColumnsType<DesignerColumn> = [
    {
      title: '',
      dataIndex: 'drag',
      width: 40,
      render: (_: unknown, __: DesignerColumn, index: number) => (
        <Tooltip title={t('common.dragToReorder')}>
          <DragOutlined
            style={{ cursor: 'grab', color: '#999' }}
            onMouseDown={(e) => {
              // Simple drag: use HTML5 drag
              const row = e.currentTarget.closest('tr');
              if (!row) return;
              row.setAttribute('draggable', 'true');
              row.addEventListener('dragstart', (ev: DragEvent) => {
                ev.dataTransfer?.setData('text/plain', String(index));
                ev.dataTransfer!.effectAllowed = 'move';
              });
              row.addEventListener('dragover', (ev: DragEvent) => {
                ev.preventDefault();
                ev.dataTransfer!.dropEffect = 'move';
              });
              row.addEventListener('drop', (ev: DragEvent) => {
                ev.preventDefault();
                const from = Number(ev.dataTransfer?.getData('text/plain'));
                if (!isNaN(from) && from !== index) {
                  moveColumn(from, index);
                }
                row.removeAttribute('draggable');
              });
              row.addEventListener('dragend', () => {
                row.removeAttribute('draggable');
              });
            }}
          />
        </Tooltip>
      ),
    },
    {
      title: t('common.tableStructure.columnName'),
      dataIndex: 'name',
      width: 160,
      render: (val: string, record: DesignerColumn) => (
        <GlobalInput
          size="small"
          value={val}
              placeholder={t('common.tableStructure.columnPlaceholder')}
              onChange={(e) => updateColumn(record.key, 'name', e.target.value)}
          onBlur={(e) => {
            // Sync column name to indexes
            if (val !== e.target.value && val) {
              setIndexes((prev) =>
                prev.map((idx) => ({
                  ...idx,
                  columns: idx.columns.map((c) => (c === val ? e.target.value : c)),
                }))
              );
            }
          }}
        />
      ),
    },
    {
      title: t('common.columnType'),
      dataIndex: 'type',
      width: 160,
      render: (val: string, record: DesignerColumn) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={val}
          options={getFieldTypes(dbType).map((t) => ({ label: t, value: t }))}
          onChange={(v) => updateColumn(record.key, 'type', v)}
          showSearch
          optionFilterProp="label"
        />
      ),
    },
    {
      title: t('common.columnLength'),
      dataIndex: 'length',
      width: 100,
      render: (val: number | undefined, record: DesignerColumn) => (
        <InputNumber
          size="small"
          min={1}
          value={val}
          placeholder="-"
          onChange={(v: number | null) => updateColumn(record.key, 'length', v ?? undefined)}
        />
      ),
    },
    {
      title: t('common.columnNullable'),
      dataIndex: 'nullable',
      width: 80,
      render: (val: boolean, record: DesignerColumn) => (
        <Switch
          size="small"
          checked={val}
          onChange={(v) => updateColumn(record.key, 'nullable', v)}
        />
      ),
    },
    {
      title: t('common.columnDefault'),
      dataIndex: 'defaultValue',
      width: 140,
      render: (val: string | undefined, record: DesignerColumn) => (
        <GlobalInput
          size="small"
          value={val || ''}
              placeholder={t('common.tableStructure.nullDefault')}
          onChange={(e) => updateColumn(record.key, 'defaultValue', e.target.value)}
        />
      ),
    },
    {
      title: t('common.columnComment'),
      dataIndex: 'comment',
      width: 160,
      render: (val: string | undefined, record: DesignerColumn) => (
        <GlobalInput
          size="small"
          value={val || ''}
              placeholder={t('common.tableStructure.commentPlaceholder')}
          onChange={(e) => updateColumn(record.key, 'comment', e.target.value)}
        />
      ),
    },
    {
      title: t('common.columnPK'),
      dataIndex: 'isPrimary',
      width: 50,
      render: (val: boolean, record: DesignerColumn) => (
        <Switch
          size="small"
          checked={val}
          checkedChildren={<KeyOutlined />}
          onChange={(v) => updateColumn(record.key, 'isPrimary', v)}
        />
      ),
    },
    {
      title: '',
      width: 50,
      render: (_: unknown, record: DesignerColumn) => (
        <Popconfirm
          title={t('common.confirmDeleteColumn')}
          onConfirm={() => deleteColumn(record.key)}
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  // ── Index Table Columns ────────────────────────────────────────────────
  const indexDefs: ColumnsType<DesignerIndex> = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      width: 200,
      render: (val: string, record: DesignerIndex) => (
        <GlobalInput
          size="small"
          value={val}
              placeholder={t('common.tableStructure.indexNamePlaceholder')}
          onChange={(e) => updateIndex(record.key, 'name', e.target.value)}
        />
      ),
    },
    {
      title: t('common.type'),
      dataIndex: 'type',
      width: 140,
      render: (val: DesignerIndex['type'], record: DesignerIndex) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={val}
          options={[
            { label: 'PRIMARY', value: 'PRIMARY' },
            { label: 'UNIQUE', value: 'UNIQUE' },
            { label: 'INDEX', value: 'INDEX' },
          ]}
          onChange={(v) => updateIndex(record.key, 'type', v)}
        />
      ),
    },
    {
      title: t('common.tableStructure.columns'),
      dataIndex: 'columns',
      render: (val: string[], record: DesignerIndex) => (
        <Select
          mode="multiple"
          size="small"
          style={{ width: '100%' }}
          value={val}
          placeholder={t('common.selectColumns')}
          options={columns.filter((c) => c.name).map((c) => ({ label: c.name, value: c.name }))}
          onChange={(v) => updateIndex(record.key, 'columns', v)}
        />
      ),
    },
    {
      title: '',
      width: 50,
      render: (_: unknown, record: DesignerIndex) => (
        <Popconfirm
          title={t('common.confirmDeleteIndex')}
          onConfirm={() => deleteIndex(record.key)}
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  // ── Foreign Key Table Columns ──────────────────────────────────────────
  const fkDefs: ColumnsType<DesignerForeignKey> = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      width: 180,
      render: (val: string, record: DesignerForeignKey) => (
        <GlobalInput
          size="small"
          value={val}
              placeholder={t('common.tableStructure.fkNamePlaceholder')}
          onChange={(e) => updateForeignKey(record.key, 'name', e.target.value)}
        />
      ),
    },
    {
      title: t('common.column'),
      dataIndex: 'column',
      width: 150,
      render: (val: string, record: DesignerForeignKey) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={val || undefined}
          placeholder={t('common.selectColumn')}
          options={columns.filter((c) => c.name).map((c) => ({ label: c.name, value: c.name }))}
          onChange={(v) => updateForeignKey(record.key, 'column', v)}
          allowClear
        />
      ),
    },
    {
      title: t('common.referencedTable'),
      dataIndex: 'referencedTable',
      width: 160,
      render: (val: string, record: DesignerForeignKey) => (
        <GlobalInput
          size="small"
          value={val}
          placeholder={t('common.tableStructure.tableNamePlaceholder')}
              onChange={(e) => updateForeignKey(record.key, 'referencedTable', e.target.value)}
        />
      ),
    },
    {
      title: t('common.referencedColumn'),
      dataIndex: 'referencedColumn',
      width: 160,
      render: (val: string, record: DesignerForeignKey) => (
        <GlobalInput
          size="small"
          value={val}
          placeholder={t('common.tableStructure.columnPlaceholder')}
           onChange={(e) => updateForeignKey(record.key, 'referencedColumn', e.target.value)}
        />
      ),
    },
    {
      title: t('common.onUpdate'),
      dataIndex: 'onUpdate',
      width: 140,
      render: (val: DesignerForeignKey['onUpdate'], record: DesignerForeignKey) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={val}
          options={[
            { label: 'CASCADE', value: 'CASCADE' },
            { label: 'SET NULL', value: 'SET NULL' },
            { label: 'RESTRICT', value: 'RESTRICT' },
            { label: 'NO ACTION', value: 'NO ACTION' },
            { label: 'SET DEFAULT', value: 'SET DEFAULT' },
          ]}
          onChange={(v) => updateForeignKey(record.key, 'onUpdate', v)}
        />
      ),
    },
    {
      title: t('common.onDelete'),
      dataIndex: 'onDelete',
      width: 140,
      render: (val: DesignerForeignKey['onDelete'], record: DesignerForeignKey) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={val}
          options={[
            { label: 'CASCADE', value: 'CASCADE' },
            { label: 'SET NULL', value: 'SET NULL' },
            { label: 'RESTRICT', value: 'RESTRICT' },
            { label: 'NO ACTION', value: 'NO ACTION' },
            { label: 'SET DEFAULT', value: 'SET DEFAULT' },
          ]}
          onChange={(v) => updateForeignKey(record.key, 'onDelete', v)}
        />
      ),
    },
    {
      title: '',
      width: 50,
      render: (_: unknown, record: DesignerForeignKey) => (
        <Popconfirm
          title={t('common.confirmDeleteForeignKey')}
          onConfirm={() => deleteForeignKey(record.key)}
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────
  const tabItems = [
    {
      key: 'columns',
      label: (
        <Space>
          <ColumnWidthOutlined /> {t('common.tabColumns')}
        </Space>
      ),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <Button type="text" icon={<PlusOutlined />} onClick={addColumn}>
              {t('common.addColumn')}
            </Button>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Table
              rowKey="key"
              columns={columnDefs}
              dataSource={columns}
              size="small"
              pagination={false}
              scroll={{ y: 'calc(100vh - 320px)' }}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'indexes',
      label: (
        <Space>
          <KeyOutlined /> {t('common.tabIndexes')}
        </Space>
      ),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <Button type="text" icon={<PlusOutlined />} onClick={addIndex}>
              {t('common.addIndex')}
            </Button>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Table
              rowKey="key"
              columns={indexDefs}
              dataSource={indexes}
              size="small"
              pagination={false}
              scroll={{ y: 'calc(100vh - 320px)' }}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'foreign_keys',
      label: (
        <Space>
          <LinkOutlined /> {t('common.tabForeignKeys')}
        </Space>
      ),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <Button type="text" icon={<PlusOutlined />} onClick={addForeignKey}>
              {t('common.addForeignKey')}
            </Button>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Table
              rowKey="key"
              columns={fkDefs}
              dataSource={foreignKeys}
              size="small"
              pagination={false}
              scroll={{ y: 'calc(100vh - 320px)' }}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'sql_preview',
      label: (
        <span>
          <CodeOutlined /> {t('common.sqlPreview')}
        </span>
      ),
      children: (
        <Card
          size="small"
          className="sql-preview-card"
          style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          bodyStyle={{ flex: 1, overflow: 'hidden', padding: 0 }}
        >
          <Editor
            height="100%"
            defaultLanguage="sql"
            language="sql"
            value={sqlPreview}
            onMount={(editor, monaco) => {
              editorRef.current = editor;
              // 定义适配应用主题的自定义主题
              monaco.editor.defineTheme('app-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [
                  { token: '', foreground: 'e4e4ed', background: '13132a' },
                  { token: 'comment', foreground: '686888', fontStyle: 'italic' },
                  { token: 'keyword', foreground: '00f5ff', fontStyle: 'bold' },
                  { token: 'string', foreground: '39ff14' },
                  { token: 'number', foreground: 'fbbf24' },
                  { token: 'operator', foreground: 'f0abfc' },
                ],
                colors: {
                  'editor.background': '#13132a',
                  'editor.foreground': '#e4e4ed',
                  'editor.lineHighlightBackground': '#1c1c38',
                  'editorLineNumber.foreground': '#686888',
                  'editorLineNumber.activeForeground': '#a0a0b8',
                  'editor.selectionBackground': '#00f5ff30',
                  'editorCursor.foreground': '#00f5ff',
                },
              });
              monaco.editor.defineTheme('app-light', {
                base: 'vs',
                inherit: true,
                rules: [
                  { token: '', foreground: '1a1a2e', background: 'ffffff' },
                  { token: 'comment', foreground: '8a8a9a', fontStyle: 'italic' },
                  { token: 'keyword', foreground: '00e5ff', fontStyle: 'bold' },
                  { token: 'string', foreground: '00ff55' },
                  { token: 'number', foreground: 'd946ff' },
                  { token: 'operator', foreground: 'e879f9' },
                ],
                colors: {
                  'editor.background': '#ffffff',
                  'editor.foreground': '#1a1a2e',
                  'editor.lineHighlightBackground': '#f0f0f4',
                  'editorLineNumber.foreground': '#8a8a9a',
                  'editorLineNumber.activeForeground': '#5a5a6e',
                  'editor.selectionBackground': '#00e5ff20',
                  'editorCursor.foreground': '#00e5ff',
                },
              });
              monaco.editor.setTheme(tc.isDark ? 'app-dark' : 'app-light');
            }}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              renderLineHighlight: 'none',
              fixedOverflowWidgets: true,
              padding: { top: 8, bottom: 8 },
            }}
          />
        </Card>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {loading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(255,255,255,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <Spin tip={t('common.loadingTableStructure')} />
        </div>
      )}
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fff',
        }}
      >
        <Space>
<Text strong style={{ fontSize: 14 }}>
             {t('common.tableDesigner')}
           </Text>
          <GlobalInput
            size="small"
            style={{ width: 200 }}
            value={tableName}
              placeholder={t('common.tableStructure.tableNamePlaceholder')}
              onChange={(e) => setTableName(e.target.value)}
            prefix={<CodeOutlined style={{ color: '#999' }} />}
          />
        </Space>
        <Space>
          {onCancel && (
             <Button size="small" onClick={onCancel}>
                {t('common.tableStructure.cancel')}
             </Button>
          )}
             <Button type="primary" size="small" onClick={handleSave}>
                {t('common.tableStructure.saveSQL')}
             </Button>
        </Space>
      </div>

      {/* Tabs */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '12px 16px' }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          destroyInactiveTabPane
          style={{ flex: 1, overflow: 'hidden' }}
        />
      </div>
    </div>
  );
}

export default TableDesigner;
