import { AutoComplete, Input } from 'antd';
import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';

interface SqlInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onPressEnter?: () => void;
  columns: { column_name: string; data_type: string }[];
  style?: React.CSSProperties;
  className?: string;
  placeholder?: string;
  size?: 'small' | 'middle' | 'large';
}

// 根据数据类型分类
type DataTypeCategory = 'number' | 'string' | 'date' | 'boolean' | 'other';

function getDataTypeCategory(dataType: string): DataTypeCategory {
  const upper = dataType.toUpperCase();
  // 数字类型
  if (/^(INT|FLOAT|DOUBLE|DECIMAL|NUMBER|NUMERIC|REAL|BIGINT|SMALLINT|TINYINT)/.test(upper)) {
    return 'number';
  }
  // 日期时间类型
  if (/(DATE|TIME|TIMESTAMP|YEAR)/.test(upper)) {
    return 'date';
  }
  // 布尔类型
  if (/^(BOOL|BOOLEAN|BIT)/.test(upper)) {
    return 'boolean';
  }
  // 字符串类型（默认）
  if (/^(CHAR|VARCHAR|TEXT|STRING|ENUM|SET|BINARY|VARBINARY|BLOB)/.test(upper)) {
    return 'string';
  }
  return 'other';
}

// 根据数据类型获取推荐的运算符
function getOperatorsForType(category: DataTypeCategory): string[] {
  switch (category) {
    case 'number':
      return ['=', '!=', '>', '<', '>=', '<=', 'BETWEEN'];
    case 'date':
      return ['=', '!=', '>', '<', '>=', '<=', 'BETWEEN', 'IS NULL', 'IS NOT NULL'];
    case 'boolean':
      return ['=', '!=', 'IS NULL', 'IS NOT NULL'];
    case 'string':
    default:
      return ['LIKE', 'NOT LIKE', '=', '!=', 'IS NULL', 'IS NOT NULL', 'IN', 'NOT IN'];
  }
}

const OPERATORS = [
  '=',
  '!=',
  '<>',
  '>',
  '<',
  '>=',
  '<=',
  'LIKE',
  'NOT LIKE',
  'IS NULL',
  'IS NOT NULL',
  'IN',
  'NOT IN',
  'BETWEEN',
];
const CLAUSE_STARTERS = ['WHERE', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'SET', 'VALUES'];
const LOGIC_KEYWORDS = ['AND', 'OR'];
const ORDER_DIR = ['ASC', 'DESC'];

type SuggestState =
  | 'start'
  | 'column'
  | 'operator'
  | 'value'
  | 'value2'
  | 'orderDir'
  | 'logic'
  | 'afterLogic';

interface ParsedInput {
  state: SuggestState;
  lastWord: string;
  prevWord: string;
  querySoFar: string;
}

function tokenize(sql: string): string[] {
  const tokens: string[] = [];
  const regex = /`[^`]+`|\S+/g;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

function parseInput(sql: string): ParsedInput {
  const trimmed = sql.trimEnd();
  if (!trimmed) {
    return { state: 'start', lastWord: '', prevWord: '', querySoFar: '' };
  }

  const tokens = tokenize(trimmed);
  const lastWord = tokens[tokens.length - 1] || '';
  const prevWord = tokens.length > 1 ? tokens[tokens.length - 2] : '';
  const lastUpper = lastWord.toUpperCase();
  const prevUpper = prevWord.toUpperCase();

  const endsWithSpace = trimmed.endsWith(' ');

  if (lastUpper === 'ORDER' && !endsWithSpace) {
    return { state: 'column', lastWord: 'ORDER BY', prevWord, querySoFar: trimmed };
  }
  if (lastUpper === 'GROUP' && !endsWithSpace) {
    return { state: 'column', lastWord: 'GROUP BY', prevWord, querySoFar: trimmed };
  }
  if (lastUpper === 'HAVING' && !endsWithSpace) {
    return { state: 'value', lastWord: 'HAVING', prevWord, querySoFar: trimmed };
  }
  if (lastUpper === 'SET' && !endsWithSpace) {
    return { state: 'column', lastWord: 'SET', prevWord, querySoFar: trimmed };
  }
  if (lastUpper === 'VALUES' && !endsWithSpace) {
    return { state: 'value', lastWord: 'VALUES', prevWord, querySoFar: trimmed };
  }

  if (
    ['ORDER BY', 'GROUP BY', 'WHERE', 'HAVING', 'SET', 'VALUES'].includes(lastUpper) &&
    endsWithSpace
  ) {
    return { state: 'column', lastWord: '', prevWord: lastUpper, querySoFar: trimmed };
  }

  if (lastUpper === 'BY' && ['ORDER', 'GROUP'].includes(prevUpper)) {
    const clauseWord = prevUpper === 'ORDER' ? 'ORDER BY' : 'GROUP BY';
    return { state: 'column', lastWord: clauseWord, prevWord: prevUpper, querySoFar: trimmed };
  }

  if (prevUpper === 'ORDER BY' || prevUpper === 'GROUP BY') {
    if (endsWithSpace) {
      return { state: 'column', lastWord: '', prevWord: prevUpper, querySoFar: trimmed };
    }
    if (ORDER_DIR.includes(lastUpper)) {
      return { state: 'orderDir', lastWord: lastUpper, prevWord: prevUpper, querySoFar: trimmed };
    }
    return { state: 'column', lastWord, prevWord: prevUpper, querySoFar: trimmed };
  }

  if (prevUpper === 'WHERE') {
    if (endsWithSpace) {
      return { state: 'column', lastWord: '', prevWord: 'WHERE', querySoFar: trimmed };
    }
    return { state: 'column', lastWord, prevWord: 'WHERE', querySoFar: trimmed };
  }

  if (prevUpper === 'HAVING') {
    if (endsWithSpace) {
      return { state: 'value', lastWord: '', prevWord: 'HAVING', querySoFar: trimmed };
    }
    if (OPERATORS.map((op) => op.toUpperCase()).includes(lastUpper)) {
      return { state: 'value', lastWord, prevWord: 'HAVING', querySoFar: trimmed };
    }
    return { state: 'value', lastWord, prevWord: 'HAVING', querySoFar: trimmed };
  }

  if (prevUpper === 'SET') {
    if (endsWithSpace) {
      return { state: 'value', lastWord: '', prevWord: 'SET', querySoFar: trimmed };
    }
    return { state: 'value', lastWord, prevWord: 'SET', querySoFar: trimmed };
  }

  if (prevUpper === 'VALUES') {
    if (endsWithSpace) {
      return { state: 'value', lastWord: '', prevWord: 'VALUES', querySoFar: trimmed };
    }
    return { state: 'value', lastWord, prevWord: 'VALUES', querySoFar: trimmed };
  }

  if (lastWord.match(/^`[^`]+`$/) || lastWord.endsWith('`')) {
    if (endsWithSpace) {
      return { state: 'operator', lastWord: '', prevWord: lastWord, querySoFar: trimmed };
    }
    return { state: 'operator', lastWord, prevWord: '', querySoFar: trimmed };
  }

  if (lastUpper === 'BETWEEN' && !endsWithSpace) {
    return { state: 'value', lastWord: 'BETWEEN', prevWord: prevUpper, querySoFar: trimmed };
  }
  if (prevUpper === 'BETWEEN') {
    if (endsWithSpace) {
      return { state: 'value2', lastWord: '', prevWord: 'BETWEEN', querySoFar: trimmed };
    }
    return { state: 'value2', lastWord, prevWord: 'BETWEEN', querySoFar: trimmed };
  }
  if (lastUpper === 'AND' && prevUpper === 'BETWEEN') {
    return { state: 'value2', lastWord: 'AND', prevWord: 'BETWEEN', querySoFar: trimmed };
  }

  if (OPERATORS.map((op) => op.toUpperCase()).includes(lastUpper)) {
    if (endsWithSpace) {
      return { state: 'value', lastWord: '', prevWord: lastUpper, querySoFar: trimmed };
    }
    return { state: 'value', lastWord, prevWord: prevUpper, querySoFar: trimmed };
  }

  if (lastUpper === 'IN' || lastUpper === 'NOT IN') {
    if (endsWithSpace) {
      return { state: 'value', lastWord: '(', prevWord: lastUpper, querySoFar: trimmed };
    }
    if (lastWord === '(') {
      return { state: 'value', lastWord: '', prevWord: lastUpper, querySoFar: trimmed };
    }
    return { state: 'value', lastWord, prevWord: prevUpper, querySoFar: trimmed };
  }

  if (lastUpper === 'IS') {
    return { state: 'operator', lastWord: 'IS', prevWord: prevUpper, querySoFar: trimmed };
  }
  if (lastUpper === 'NOT' && (prevUpper === 'IS' || prevWord === '`')) {
    return { state: 'operator', lastWord: 'NOT', prevWord: prevUpper, querySoFar: trimmed };
  }

  if (lastUpper === 'NULL') {
    return { state: 'logic', lastWord: 'NULL', prevWord: prevUpper, querySoFar: trimmed };
  }

  if (lastUpper === 'LIMIT') {
    if (endsWithSpace) {
      return { state: 'value', lastWord: '', prevWord: 'LIMIT', querySoFar: trimmed };
    }
    return { state: 'value', lastWord, prevWord: 'LIMIT', querySoFar: trimmed };
  }

  if (lastUpper === 'ASC' || lastUpper === 'DESC') {
    return { state: 'orderDir', lastWord: lastUpper, prevWord: prevUpper, querySoFar: trimmed };
  }

  if (lastUpper === 'AND' || lastUpper === 'OR') {
    if (endsWithSpace) {
      return { state: 'column', lastWord: '', prevWord: lastUpper, querySoFar: trimmed };
    }
    return { state: 'column', lastWord, prevWord: lastUpper, querySoFar: trimmed };
  }

  if (lastWord === '(' || lastWord === ',') {
    return { state: 'value', lastWord: '', prevWord: lastWord, querySoFar: trimmed };
  }

  if (
    lastUpper === 'SELECT' ||
    lastUpper === 'FROM' ||
    lastUpper === 'JOIN' ||
    lastUpper === 'LEFT' ||
    lastUpper === 'RIGHT' ||
    lastUpper === 'INNER' ||
    lastUpper === 'OUTER' ||
    lastUpper === 'ON'
  ) {
    return { state: 'column', lastWord: '', prevWord: lastUpper, querySoFar: trimmed };
  }

  return { state: 'column', lastWord, prevWord, querySoFar: trimmed };
}

function fuzzyMatch(input: string, optionValue: string): boolean {
  const normalizedInput = input.toLowerCase().replace(/`/g, '');
  const normalizedOption = optionValue.toLowerCase().replace(/`/g, '');
  return normalizedOption.includes(normalizedInput);
}

// 查找输入中最后一个列名的数据类型
interface ColumnOption {
  dataType: string;
  columnName: string;
}

function findLastColumn(
  sql: string,
  columns: ColumnOption[]
): { dataType: string; columnName: string } | null {
  const tokens = tokenize(sql);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i].replace(/`/g, '');
    const col = columns.find((c) => c.columnName === token);
    if (col) {
      return { dataType: col.dataType, columnName: col.columnName };
    }
  }
  return null;
}

export const SqlInput: React.FC<SqlInputProps> = ({
  value = '',
  onChange,
  onPressEnter,
  columns,
  style,
  className,
  placeholder,
  size = 'small',
}) => {
  const columnOptions = useMemo(() => {
    return columns.map((col) => ({
      value: `\`${col.column_name}\``,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span>{col.column_name}</span>
          <span style={{ color: '#888', fontSize: 10 }}>{col.data_type}</span>
        </div>
      ),
      dataType: col.data_type,
      columnName: col.column_name,
    }));
  }, [columns]);

  const inputRef = useRef<HTMLInputElement>(null);
  const lastSelectedRef = useRef<number>(0);
  const [autoOpen, setAutoOpen] = useState(false);
  const isAutoSelectedRef = useRef(false);

  const getSuggestions = useCallback(
    (input: string): Array<{ value: string; label: React.ReactNode }> => {
      const parsed = parseInput(input);
      const { state, lastWord } = parsed;
      const searchValue = lastWord.startsWith('`') ? lastWord.slice(1, -1) : lastWord;

      switch (state) {
        case 'start':
          return [
            ...columnOptions.slice(0, 5),
            { value: 'WHERE', label: <span style={{ color: '#1890ff' }}>WHERE</span> },
            { value: 'ORDER BY', label: <span style={{ color: '#1890ff' }}>ORDER BY</span> },
            { value: 'GROUP BY', label: <span style={{ color: '#1890ff' }}>GROUP BY</span> },
          ];

        case 'column':
          if (!searchValue) {
            return columnOptions.slice(0, 10);
          }
          return columnOptions
            .filter((opt) => fuzzyMatch(searchValue, opt.value))
            .map((opt) => ({
              value: opt.value,
              label: (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>{opt.columnName}</span>
                  <span style={{ color: '#888', fontSize: 10 }}>{opt.dataType}</span>
                </div>
              ),
            }))
            .slice(0, 10);

        case 'operator': {
          // 获取最后一个列名的数据类型，用于推荐合适的运算符
          const lastColumn = findLastColumn(input, columnOptions);
          const category = lastColumn ? getDataTypeCategory(lastColumn.dataType) : 'string';
          const typeOperators = getOperatorsForType(category);
          return typeOperators
            .filter((op) => fuzzyMatch(searchValue, op))
            .map((op) => ({
              value: op.endsWith(' ') ? op : op + ' ',
              label: <span style={{ color: '#52c41a' }}>{op}</span>,
            }));
        }

        case 'value': {
          // 根据前一个列的类型推荐值
          const lastColumn = findLastColumn(input, columnOptions);
          const category = lastColumn ? getDataTypeCategory(lastColumn.dataType) : 'string';

          if (searchValue) {
            const suggestions: Array<{ value: string; label: React.ReactNode }> = [];
            const { prevWord } = parsed;
            const prevUpper = prevWord.toUpperCase();

            // 如果是 IN 子句内，提供列名作为建议
            if (prevUpper === 'IN' || prevUpper === 'NOT IN') {
              columnOptions
                .filter((opt) => fuzzyMatch(searchValue, opt.value))
                .forEach((opt) => {
                  suggestions.push({
                    value: opt.value,
                    label: (
                      <div
                        style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}
                      >
                        <span>{opt.columnName}</span>
                        <span style={{ color: '#888', fontSize: 10 }}>{opt.dataType}</span>
                      </div>
                    ),
                  });
                });
            } else {
              columnOptions
                .filter((opt) => fuzzyMatch(searchValue, opt.value))
                .forEach((opt) => {
                  suggestions.push({
                    value: opt.value,
                    label: (
                      <div
                        style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}
                      >
                        <span>{opt.columnName}</span>
                        <span style={{ color: '#888', fontSize: 10 }}>{opt.dataType}</span>
                      </div>
                    ),
                  });
                });

              // 根据类型添加常用值模板
              if (category === 'string') {
                if (!suggestions.some((s) => s.value === `'%${searchValue}%'`)) {
                  suggestions.push({
                    value: `'%${searchValue}%'`,
                    label: <span style={{ color: '#fa8c16' }}>'%{searchValue}%'</span>,
                  });
                }
              } else if (category === 'date') {
                if (!suggestions.some((s) => s.value === `'NOW()'`)) {
                  suggestions.push({
                    value: `'NOW()'`,
                    label: <span style={{ color: '#fa8c16' }}>'NOW()'</span>,
                  });
                }
                if (!suggestions.some((s) => s.value === `'${searchValue}'`)) {
                  suggestions.push({
                    value: `'${searchValue}'`,
                    label: <span style={{ color: '#fa8c16' }}>'{searchValue}'</span>,
                  });
                }
              } else if (category === 'boolean') {
                if (!suggestions.some((s) => s.value === `'TRUE'`)) {
                  suggestions.push({
                    value: `'TRUE'`,
                    label: <span style={{ color: '#fa8c16' }}>'TRUE'</span>,
                  });
                }
                if (!suggestions.some((s) => s.value === `'FALSE'`)) {
                  suggestions.push({
                    value: `'FALSE'`,
                    label: <span style={{ color: '#fa8c16' }}>'FALSE'</span>,
                  });
                }
              } else {
                if (!suggestions.some((s) => s.value === `'${searchValue}'`)) {
                  suggestions.push({
                    value: `'${searchValue}'`,
                    label: <span style={{ color: '#fa8c16' }}>'{searchValue}'</span>,
                  });
                }
              }
            }
            return suggestions.slice(0, 8);
          }
          return columnOptions.slice(0, 5);
        }

        case 'value2':
          return [
            { value: `'`, label: <span style={{ color: '#fa8c16' }}>'value'</span> },
            ...columnOptions.slice(0, 3).map((opt) => ({
              value: opt.value,
              label: (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>{opt.columnName}</span>
                  <span style={{ color: '#888', fontSize: 10 }}>{opt.dataType}</span>
                </div>
              ),
            })),
          ];

        case 'orderDir':
          return ORDER_DIR.filter(
            (dir) => dir !== lastWord.toUpperCase() && fuzzyMatch(searchValue, dir)
          ).map((dir) => ({
            value: dir + ' ',
            label: <span style={{ color: '#1890ff' }}>{dir}</span>,
          }));

        case 'logic':
          return [
            { value: 'AND ', label: <span style={{ color: '#722ed1' }}>AND</span> },
            { value: 'OR ', label: <span style={{ color: '#722ed1' }}>OR</span> },
            { value: 'ORDER BY ', label: <span style={{ color: '#1890ff' }}>ORDER BY</span> },
            { value: 'LIMIT ', label: <span style={{ color: '#1890ff' }}>LIMIT</span> },
          ];

        case 'afterLogic':
          return columnOptions.slice(0, 5);

        default:
          return columnOptions.slice(0, 5);
      }
    },
    [columnOptions]
  );

  const smartOptions = useMemo(() => getSuggestions(value), [value, getSuggestions]);

  const handleChange = (text: string) => {
    onChange?.(text);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') {
      if (isAutoSelectedRef.current) {
        isAutoSelectedRef.current = false;
        return;
      }

      e.preventDefault();
      const now = Date.now();
      if (now - lastSelectedRef.current < 100) {
        return;
      }
      onPressEnter?.();
    }
  };

  const handleSelect = (val: string) => {
    lastSelectedRef.current = Date.now();

    const upperVal = val.toUpperCase();
    const endsWithSpace = val.endsWith(' ');

    if (val.startsWith('`') && endsWithSpace) {
      isAutoSelectedRef.current = true;
      setAutoOpen(true);
      setTimeout(() => {
        onChange?.(val);
        setAutoOpen(false);
      }, 0);
      return;
    }

    if (['=', '!=', '<>', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE', 'IS NULL', 'IS NOT NULL', 'IN', 'NOT IN', 'BETWEEN'].includes(upperVal) && endsWithSpace) {
      isAutoSelectedRef.current = true;
      setAutoOpen(true);
      setTimeout(() => {
        onChange?.(val);
        setAutoOpen(false);
      }, 0);
      return;
    }

    if ((val.startsWith("'") || val === 'NULL') && endsWithSpace) {
      isAutoSelectedRef.current = true;
      setAutoOpen(true);
      setTimeout(() => {
        onChange?.(val);
        setAutoOpen(false);
      }, 0);
      return;
    }

    onChange?.(val);
  };

  const filterOption = () => true;

  return (
    <AutoComplete
      value={value}
      onChange={handleChange}
      onSelect={handleSelect}
      options={smartOptions}
      style={{ width: '100%', ...style }}
      className={className}
      size={size}
      placeholder={placeholder}
      dropdownMatchSelectWidth={false}
      dropdownStyle={{ minWidth: 200, fontSize: 12, maxHeight: 300, overflowY: 'auto' }}
      filterOption={filterOption}
      open={autoOpen}
    >
      <Input
        ref={inputRef as any}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        style={{ height: 20, fontSize: 11, padding: '0 4px' }}
        onKeyDown={handleKeyDown}
      />
    </AutoComplete>
  );
};
