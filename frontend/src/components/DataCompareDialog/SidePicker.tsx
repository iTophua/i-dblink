import { useEffect, useRef, useState } from 'react';
import { Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { Connection } from '../../stores/appStore';

export interface SideSelection {
  connectionId?: string;
  database?: string;
  table?: string;
}

interface SidePickerProps {
  connections: Connection[];
  value: SideSelection;
  onChange: (next: SideSelection) => void;
  /** 测试与无障碍标签用的前缀 */
  idPrefix: string;
  /**
   * 还没选表、而这个表在当前库的表列表里时自动选上。
   * 目标侧传源表名：多数场景是同名表在不同库之间对比，选完库就不用再点一次表。
   */
  preferredTable?: string;
  /** 对比进行中：暂时不能改选择（否则结果会对不上表单里的选择） */
  disabled?: boolean;
}

interface Loaded<T> {
  key: string;
  items: T[];
}

/**
 * 数据对比的一侧：连接 → 库 → 表 级联选择。
 * 库表列表按需加载；列表记着「是给哪个键加载的」，换了连接 / 库但还没加载完时不会串数据。
 */
export function SidePicker({
  connections,
  value,
  onChange,
  idPrefix,
  preferredTable,
  disabled,
}: SidePickerProps) {
  const { t } = useTranslation();
  // 异步回调里要读最新的选择，用 ref 转一手（不在渲染期间写 ref）
  const latest = useRef({ value, onChange, preferredTable });
  useEffect(() => {
    latest.current = { value, onChange, preferredTable };
  });
  const [dbs, setDbs] = useState<Loaded<string>>({ key: '', items: [] });
  const [tables, setTables] = useState<Loaded<string>>({ key: '', items: [] });

  const connId = value.connectionId ?? '';
  const tableKey = `${connId}\u0000${value.database ?? ''}`;
  const dbItems = dbs.key === connId ? dbs.items : [];
  const tableItems = tables.key === tableKey ? tables.items : [];

  useEffect(() => {
    if (!connId) return;
    let cancelled = false;
    api.getDatabases(connId).then(
      (list) => {
        if (!cancelled) setDbs({ key: connId, items: list ?? [] });
      },
      () => {
        if (!cancelled) setDbs({ key: connId, items: [] });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [connId]);

  useEffect(() => {
    if (!connId) return;
    let cancelled = false;
    api.getTablesCategorized(connId, value.database).then(
      (res) => {
        if (cancelled) return;
        const items = (res?.tables ?? []).map((x) => x.table_name);
        setTables({ key: tableKey, items });
        const { value: current, onChange: notify, preferredTable: preferred } = latest.current;
        if (preferred && !current.table && items.includes(preferred)) {
          notify({ ...current, table: preferred });
        }
      },
      () => {
        if (!cancelled) setTables({ key: tableKey, items: [] });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [connId, tableKey, value.database]);

  const pickConnection = (id?: string) => {
    const conn = connections.find((c) => c.id === id);
    // 连接自带默认库时直接选上
    onChange({ connectionId: id, database: conn?.database || undefined, table: undefined });
  };

  const connectionOptions = connections.map((c) => ({
    value: c.id,
    label:
      c.status === 'connected' ? c.name : `${c.name} (${t('common.dataCompare.notConnected')})`,
    disabled: c.status !== 'connected',
  }));

  return (
    <div className="dc-side">
      <Select
        className="dc-select"
        showSearch
        allowClear={false}
        optionFilterProp="label"
        placeholder={t('common.dataCompare.connection')}
        disabled={disabled}
        value={value.connectionId}
        options={connectionOptions}
        onChange={pickConnection}
        data-testid={`${idPrefix}-connection`}
      />
      <Select
        className="dc-select"
        showSearch
        allowClear={false}
        optionFilterProp="label"
        placeholder={t('common.dataCompare.database')}
        disabled={disabled || !connId}
        value={value.database}
        options={dbItems.map((d) => ({ value: d, label: d }))}
        onChange={(database: string) => onChange({ ...value, database, table: undefined })}
        data-testid={`${idPrefix}-database`}
      />
      <Select
        className="dc-select"
        showSearch
        allowClear={false}
        optionFilterProp="label"
        placeholder={t('common.dataCompare.table')}
        disabled={disabled || !connId}
        value={value.table}
        options={tableItems.map((name) => ({ value: name, label: name }))}
        onChange={(table: string) => onChange({ ...value, table })}
        data-testid={`${idPrefix}-table`}
      />
    </div>
  );
}
