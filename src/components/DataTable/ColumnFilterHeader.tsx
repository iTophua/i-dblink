import React, { useState, useMemo, useCallback, useRef } from 'react';
import { FilterOutlined, CaretUpOutlined, CaretDownOutlined } from '@ant-design/icons';
import { Popover, Checkbox, Input, Button, Space, Spin } from 'antd';
import type { IHeaderParams } from 'ag-grid-community';

export interface ColumnFilterHeaderProps extends IHeaderParams {
  rowData: any[];
}

export function ColumnFilterHeader(props: ColumnFilterHeaderProps) {
  const { displayName, column, api, enableSorting, progressSort, rowData } = props;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const field = column.getColId();

  const sort = column.getSort();

  // 从所有行数据中提取该列的去重值
  const uniqueValues = useMemo(() => {
    const vals = new Set<string | number>();
    rowData.forEach((row) => {
      const v = row[field];
      if (v !== null && v !== undefined) {
        vals.add(v);
      } else {
        vals.add('(NULL)');
      }
    });
    return Array.from(vals).sort((a, b) => String(a).localeCompare(String(b)));
  }, [rowData, field]);

  const filteredValues = useMemo(() => {
    if (!search) return uniqueValues;
    const q = search.toLowerCase();
    return uniqueValues.filter((v) => String(v).toLowerCase().includes(q));
  }, [uniqueValues, search]);

  const currentFilter = api.getFilterModel()?.[field];
  const isFiltered = !!currentFilter;

  const getSelectedValues = useCallback(() => {
    const model = api.getFilterModel()?.[field];
    if (!model) return new Set<string | number>();
    // 单条件 equals
    if (model.type === 'equals' && model.filter !== undefined) {
      return new Set([model.filter === '' ? '(NULL)' : model.filter]);
    }
    // OR 组合（最多两层）
    const vals = new Set<string | number>();
    if (model.operator === 'OR') {
      [model.condition1, model.condition2].forEach((c: any) => {
        if (c?.type === 'equals' && c.filter !== undefined) {
          vals.add(c.filter === '' ? '(NULL)' : c.filter);
        }
      });
    }
    return vals;
  }, [api, field]);

  const [selected, setSelected] = useState<Set<string | number>>(new Set());

  const handleOpenChange = (visible: boolean) => {
    setOpen(visible);
    if (visible) {
      setSearch('');
      setSelected(getSelectedValues());
    }
  };

  const handleApply = () => {
    const s = Array.from(selected);
    if (s.length === 0) {
      // 清除筛选
      const model = { ...api.getFilterModel() };
      delete model[field];
      api.setFilterModel(Object.keys(model).length ? model : null);
    } else if (s.length === 1) {
      const val = s[0] === '(NULL)' ? '' : s[0];
      api.setFilterModel({
        ...api.getFilterModel(),
        [field]: {
          filterType: 'text',
          type: 'equals',
          filter: val,
        },
      });
    } else {
      // 最多支持两个条件的 OR（AG Grid Community 限制）
      // 如果超过两个，只取前两个
      const [v1, v2] = s.slice(0, 2);
      api.setFilterModel({
        ...api.getFilterModel(),
        [field]: {
          filterType: 'text',
          operator: 'OR',
          condition1: {
            filterType: 'text',
            type: 'equals',
            filter: v1 === '(NULL)' ? '' : v1,
          },
          condition2: {
            filterType: 'text',
            type: 'equals',
            filter: v2 === '(NULL)' ? '' : v2,
          },
        },
      });
    }
    setOpen(false);
  };

  const handleClear = () => {
    const model = { ...api.getFilterModel() };
    delete model[field];
    api.setFilterModel(Object.keys(model).length ? model : null);
    setOpen(false);
  };

  const content = (
    <div style={{ width: 200, maxHeight: 320, display: 'flex', flexDirection: 'column' }}>
      <Input
        size="small"
        placeholder="搜索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <div style={{ flex: 1, overflow: 'auto', marginBottom: 8 }}>
        <Checkbox
          checked={selected.size === 0}
          onChange={() => setSelected(new Set())}
          style={{ marginBottom: 4 }}
        >
          (全部)
        </Checkbox>
        {filteredValues.map((val) => (
          <div key={String(val)}>
            <Checkbox
              checked={selected.has(val)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) {
                  next.add(val);
                } else {
                  next.delete(val);
                }
                setSelected(next);
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  maxWidth: 150,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'inline-block',
                  verticalAlign: 'bottom',
                }}
                title={String(val)}
              >
                {String(val)}
              </span>
            </Checkbox>
          </div>
        ))}
        {filteredValues.length === 0 && (
          <div
            style={{ color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center', padding: 8 }}
          >
            无匹配项
          </div>
        )}
      </div>
      <Space style={{ justifyContent: 'flex-end' }}>
        <Button size="small" onClick={handleClear}>
          重置
        </Button>
        <Button type="primary" size="small" onClick={handleApply}>
          确定
        </Button>
      </Space>
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '0 4px',
        userSelect: 'none',
        cursor: enableSorting ? 'pointer' : 'default',
      }}
      onClick={(e) => {
        // 点击列名区域触发排序（不是图标区域）
        if ((e.target as HTMLElement).closest('.header-icon')) return;
        if (enableSorting) {
          progressSort();
        }
      }}
    >
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
        title={displayName}
      >
        {displayName}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}>
        {sort && (
          <span style={{ fontSize: 10, color: 'var(--color-primary)' }}>
            {sort === 'asc' ? <CaretUpOutlined /> : <CaretDownOutlined />}
          </span>
        )}
        <Popover
          content={content}
          title={`筛选: ${displayName}`}
          trigger="click"
          open={open}
          onOpenChange={handleOpenChange}
          placement="bottomLeft"
        >
          <FilterOutlined
            className="header-icon"
            style={{
              fontSize: 11,
              color: isFiltered ? 'var(--color-primary)' : 'var(--text-tertiary)',
              cursor: 'pointer',
              padding: 2,
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </Popover>
      </span>
    </div>
  );
}

export default ColumnFilterHeader;
