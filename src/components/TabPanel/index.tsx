import React, { useState } from 'react';
import { Tabs } from 'antd';
import { DatabaseOutlined, TableOutlined } from '@ant-design/icons';
import { SQLEditor } from '../SQLEditor';
import { DataTable } from '../DataTable';
import { TableList } from '../TableList';
import { theme } from 'antd';

export interface OpenedTable {
  name: string;
  connectionId: string;
}

type TabPanelProps = {
  selectedConnectionId: string | null;
  selectedTable: string | null;
  onTableOpen: (tableName: string) => void;
};

export function TabPanel({
  selectedConnectionId,
  selectedTable,
  onTableOpen,
}: TabPanelProps) {
  const { token } = theme.useToken();
  const isDarkMode = token.colorBgLayout === '#1f1f1f';
  const [activeKey, setActiveKey] = useState('objects');
  const [openedTables, setOpenedTables] = useState<OpenedTable[]>([]);

  const openTableTab = (tableName: string, connId: string) => {
    const exists = openedTables.find(t => t.name === tableName);
    if (!exists) {
      setOpenedTables(prev => [...prev, { name: tableName, connectionId: connId }]);
    }
    setActiveKey(tableName);
  };

  React.useEffect(() => {
    if (selectedTable && selectedConnectionId) {
      openTableTab(selectedTable, selectedConnectionId);
    }
  }, [selectedTable, selectedConnectionId]);

  const handleTabEdit = (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
    if (action === 'remove') {
      const key = typeof targetKey === 'string' ? targetKey : '';
      setOpenedTables(prev => prev.filter(t => t.name !== key));
      if (activeKey === key) {
        setActiveKey('objects');
      }
    }
  };

  const tabItems = [
    {
      key: 'sql',
      label: (
        <span style={{ fontSize: 12 }}>
          <DatabaseOutlined style={{ marginRight: 2 }} />
          SQL 查询
        </span>
      ),
      children: (
        <div style={{ height: '100%', overflow: 'auto' }}>
          <SQLEditor connectionId={selectedConnectionId} />
        </div>
      ),
      closable: false,
    },
    ...openedTables.map(table => ({
      key: table.name,
      label: (
        <span style={{ fontSize: 12 }}>
          <TableOutlined style={{ marginRight: 2 }} />
          {table.name}
        </span>
      ),
      children: (
        <div style={{ height: '100%', overflow: 'hidden' }}>
          <DataTable tableName={table.name} connectionId={table.connectionId} />
        </div>
      ),
      closable: true,
    })),
  ];

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Tabs
        type="editable-card"
        activeKey={activeKey}
        onChange={setActiveKey}
        hideAdd
        style={{ height: '100%', background: isDarkMode ? '#1f1f1f' : '#fff', display: 'flex', flexDirection: 'column' }}
        tabBarStyle={{ margin: 0, paddingTop: 2, paddingLeft: 4, paddingBottom: 0, background: 'transparent', flex: '0 0 auto' }}
        tabBarGutter={2}
        items={tabItems}
        onEdit={handleTabEdit}
      />
    </div>
  );
}

export default TabPanel;
