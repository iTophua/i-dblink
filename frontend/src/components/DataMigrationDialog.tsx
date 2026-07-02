import { useState, useCallback, useEffect } from 'react';
import {
  Modal,
  Steps,
  Select,
  Button,
  message,
  Table,
  Space,
  Switch,
  InputNumber,
  Tag,
  List,
  Alert,
} from 'antd';
import {
  SwapOutlined,
  DatabaseOutlined,
  TableOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../stores/appStore';
import { api } from '../api';

interface DataMigrationDialogProps {
  open: boolean;
  onClose: () => void;
}

interface MigrationTablePreview {
  table_name: string;
  row_count: number;
  columns: { column_name: string; data_type: string; is_nullable: string }[];
  compatible: boolean;
  warnings: string[];
}

interface MigrationTableResult {
  table_name: string;
  row_count: number;
  time_ms: number;
  success: boolean;
  error: string;
}

export function DataMigrationDialog({ open, onClose }: DataMigrationDialogProps) {
  const { t } = useTranslation();
  const connections = useAppStore((s) => s.connections);
  const [currentStep, setCurrentStep] = useState(0);
  const [sourceConnId, setSourceConnId] = useState('');
  const [sourceDatabase, setSourceDatabase] = useState('');
  const [targetConnId, setTargetConnId] = useState('');
  const [targetDatabase, setTargetDatabase] = useState('');
  const [databases, setDatabases] = useState<string[]>([]);
  const [targetDatabases, setTargetDatabases] = useState<string[]>([]);
  const [tables, setTables] = useState<{ name: string; rows: number }[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<MigrationTablePreview[]>([]);
  const [createTable, setCreateTable] = useState(true);
  const [dropExisting, setDropExisting] = useState(false);
  const [truncateTarget, setTruncateTarget] = useState(false);
  const [batchSize, setBatchSize] = useState(500);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationTableResult[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const connectedConnections = connections.filter((c) => c.status === 'connected');

  // 加载源数据库列表
  useEffect(() => {
    if (sourceConnId && open) {
      api.getDatabases(sourceConnId).then(setDatabases).catch(() => setDatabases([]));
    }
  }, [sourceConnId, open]);

  // 加载目标数据库列表
  useEffect(() => {
    if (targetConnId && open) {
      api.getDatabases(targetConnId).then(setTargetDatabases).catch(() => setTargetDatabases([]));
    }
  }, [targetConnId, open]);

  // 加载源表列表
  useEffect(() => {
    if (sourceConnId && sourceDatabase && open) {
      setLoadingTables(true);
      api
        .getTables(sourceConnId, sourceDatabase)
        .then((t) => {
          const tableList = (t as unknown as { table_name: string; row_count?: number }[]).map(
            (item) => ({
              name: item.table_name,
              rows: item.row_count ?? 0,
            })
          );
          setTables(tableList);
        })
        .catch(() => setTables([]))
        .finally(() => setLoadingTables(false));
    }
  }, [sourceConnId, sourceDatabase, open]);

  const handleClose = useCallback(() => {
    setCurrentStep(0);
    setSourceConnId('');
    setSourceDatabase('');
    setTargetConnId('');
    setTargetDatabase('');
    setDatabases([]);
    setTargetDatabases([]);
    setTables([]);
    setSelectedTables([]);
    setPreviewData([]);
    setMigrationResult([]);
    setMigrating(false);
    setLoadingTables(false);
    setLoadingPreview(false);
    onClose();
  }, [onClose]);

  const handlePreview = useCallback(async () => {
    if (selectedTables.length === 0) {
      message.warning(t('common.migration.selectTablesFirst'));
      return;
    }
    setLoadingPreview(true);
    try {
      const result = (await api.getMigrationPreview(
        sourceConnId,
        targetConnId,
        sourceDatabase,
        targetDatabase,
        selectedTables
      )) as unknown as { tables: MigrationTablePreview[]; warnings: string[] };
      setPreviewData(result.tables);
      setCurrentStep(3);
    } catch (err) {
      message.error(t('common.migration.previewFailed'));
    } finally {
      setLoadingPreview(false);
    }
  }, [sourceConnId, targetConnId, sourceDatabase, selectedTables, t]);

  const handleMigrate = useCallback(async () => {
    setMigrating(true);
    try {
      const result = (await api.executeMigration(sourceConnId, targetConnId, sourceDatabase, targetDatabase, selectedTables, {
        create_table: createTable,
        drop_existing: dropExisting,
        truncate_target: truncateTarget,
        batch_size: batchSize,
      })) as unknown as { tables: MigrationTableResult[]; total_rows: number; success: boolean; error: string };
      setMigrationResult(result.tables);
      if (result.success) {
        message.success(t('common.migration.success'));
      } else {
        message.warning(result.error || t('common.migration.partialFailure'));
      }
    } catch (err) {
      message.error(t('common.migration.failed'));
    } finally {
      setMigrating(false);
    }
  }, [
    sourceConnId,
    targetConnId,
    sourceDatabase,
    selectedTables,
    createTable,
    dropExisting,
    truncateTarget,
    batchSize,
    t,
  ]);

  const canProceedStep0 = sourceConnId && sourceDatabase;
  const canProceedStep1 = targetConnId && targetDatabase;
  const canProceedStep2 = selectedTables.length > 0;

  const stepItems = [
    { title: t('common.migration.stepSource'), icon: <DatabaseOutlined /> },
    { title: t('common.migration.stepTarget'), icon: <SwapOutlined /> },
    { title: t('common.migration.stepTables'), icon: <TableOutlined /> },
    { title: t('common.migration.stepExecute'), icon: <PlayCircleOutlined /> },
  ];

  const columns = [
    {
      title: t('common.migration.tableName'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('common.migration.estimatedRows'),
      dataIndex: 'rows',
      key: 'rows',
      render: (v: number) => v.toLocaleString(),
    },
  ];

  const completedCount = migrationResult.filter((r) => r.success).length;
  const failedCount = migrationResult.filter((r) => !r.success).length;

  return (
    <Modal
      title={t('common.migration.title')}
      open={open}
      onCancel={handleClose}
      width={800}
      destroyOnClose
      transitionName=""
      maskTransitionName=""
      footer={
        <Space>
          <Button onClick={handleClose}>{t('common.cancel')}</Button>
          {currentStep > 0 && currentStep < 3 && !migrating && (
            <Button onClick={() => setCurrentStep((s) => s - 1)}>{t('common.back')}</Button>
          )}
          {currentStep === 0 && (
            <Button type="primary" disabled={!canProceedStep0} onClick={() => setCurrentStep(1)}>
              {t('common.next')}
            </Button>
          )}
          {currentStep === 1 && (
            <Button type="primary" disabled={!canProceedStep1} onClick={() => setCurrentStep(2)}>
              {t('common.next')}
            </Button>
          )}
          {currentStep === 2 && (
            <Button type="primary" disabled={!canProceedStep2} loading={loadingPreview} onClick={handlePreview}>
              {t('common.migration.preview')}
            </Button>
          )}
          {currentStep === 3 && (
            <Button type="primary" loading={migrating} onClick={handleMigrate}>
              {t('common.migration.execute')}
            </Button>
          )}
        </Space>
      }
    >
      <Steps current={currentStep} items={stepItems} style={{ marginBottom: 24 }} />

      {/* Step 0: 选择源 */}
      {currentStep === 0 && (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('common.migration.sourceConnection')}</div>
            <Select
              placeholder={t('common.migration.selectConnection')}
              style={{ width: '100%' }}
              value={sourceConnId || undefined}
              onChange={setSourceConnId}
              options={connectedConnections.map((c) => ({
                value: c.id,
                label: `${c.name} (${c.db_type})`,
              }))}
            />
          </div>
          {sourceConnId && (
            <div>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('common.migration.sourceDatabase')}</div>
              <Select
                placeholder={t('common.migration.selectDatabase')}
                style={{ width: '100%' }}
                value={sourceDatabase || undefined}
                onChange={setSourceDatabase}
                loading={databases.length === 0}
                options={databases.map((d) => ({ value: d, label: d }))}
                showSearch
              />
            </div>
          )}
        </Space>
      )}

      {/* Step 1: 选择目标 */}
      {currentStep === 1 && (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type="info"
            showIcon
            message={t('common.migration.crossDbNotice')}
            style={{ marginBottom: 8 }}
          />
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('common.migration.targetConnection')}</div>
            <Select
              placeholder={t('common.migration.selectConnection')}
              style={{ width: '100%' }}
              value={targetConnId || undefined}
              onChange={setTargetConnId}
              options={connectedConnections
                .filter((c) => c.id !== sourceConnId)
                .map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.db_type})`,
                }))}
            />
          </div>
          {targetConnId && (
            <div>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('common.migration.targetDatabase')}</div>
              <Select
                placeholder={t('common.migration.selectDatabase')}
                style={{ width: '100%' }}
                value={targetDatabase || undefined}
                onChange={setTargetDatabase}
                loading={targetDatabases.length === 0}
                options={targetDatabases.map((d) => ({ value: d, label: d }))}
                showSearch
              />
            </div>
          )}
        </Space>
      )}

      {/* Step 2: 选择表 */}
      {currentStep === 2 && (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              {t('common.migration.selectedTables')}: <Tag color="blue">{selectedTables.length}</Tag>
            </span>
            <Space>
              <Button size="small" onClick={() => setSelectedTables(tables.map((t) => t.name))}>
                {t('common.selectAll')}
              </Button>
              <Button size="small" onClick={() => setSelectedTables([])}>
                {t('common.deselectAll')}
              </Button>
            </Space>
          </div>
          <Table
            dataSource={tables}
            columns={columns}
            rowKey="name"
            size="small"
            loading={loadingTables}
            pagination={{ pageSize: 10 }}
            rowSelection={{
              selectedRowKeys: selectedTables,
              onChange: (keys) => setSelectedTables(keys as string[]),
            }}
            scroll={{ y: 300 }}
          />
        </div>
      )}

      {/* Step 3: 配置 + 执行 */}
      {currentStep === 3 && (
        <div>
          {migrationResult.length === 0 ? (
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '12px 24px',
                  padding: '16px',
                  background: 'var(--ant-color-fill-tertiary)',
                  borderRadius: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{t('common.migration.createTable')}</span>
                  <Switch checked={createTable} onChange={setCreateTable} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{t('common.migration.dropExisting')}</span>
                  <Switch checked={dropExisting} onChange={setDropExisting} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{t('common.migration.truncateTarget')}</span>
                  <Switch checked={truncateTarget} onChange={setTruncateTarget} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{t('common.migration.batchSize')}</span>
                  <InputNumber min={100} max={10000} value={batchSize} onChange={(v) => setBatchSize(v ?? 500)} />
                </div>
              </div>

              {previewData.length > 0 && (
                <div>
                  <div style={{ fontWeight: 500, marginBottom: 8 }}>{t('common.migration.previewTitle')}</div>
                  <List
                    size="small"
                    bordered
                    dataSource={previewData}
                    renderItem={(item) => (
                      <List.Item>
                        <Space>
                          <span>{item.table_name}</span>
                          <Tag>{item.row_count.toLocaleString()} rows</Tag>
                          <Tag color={item.compatible ? 'green' : 'orange'}>
                            {item.compatible ? t('common.migration.compatible') : t('common.migration.hasWarnings')}
                          </Tag>
                        </Space>
                      </List.Item>
                    )}
                  />
                </div>
              )}
            </Space>
          ) : (
            <div>
              <div style={{ marginBottom: 16 }}>
                <Space>
                  <Tag color="green">{t('common.migration.success')}: {completedCount}</Tag>
                  {failedCount > 0 && (
                    <Tag color="red">{t('common.migration.failed')}: {failedCount}</Tag>
                  )}
                </Space>
              </div>
              <Table
                dataSource={migrationResult}
                size="small"
                pagination={false}
                rowKey="table_name"
                columns={[
                  { title: t('common.migration.tableName'), dataIndex: 'table_name', key: 'table_name' },
                  {
                    title: t('common.migration.migratedRows'),
                    dataIndex: 'row_count',
                    key: 'row_count',
                    render: (v: number) => v.toLocaleString(),
                  },
                  {
                    title: t('common.migration.time'),
                    dataIndex: 'time_ms',
                    key: 'time_ms',
                    render: (v: number) => `${(v / 1000).toFixed(1)}s`,
                  },
                  {
                    title: t('common.status'),
                    dataIndex: 'success',
                    key: 'success',
                    render: (v: boolean, record: MigrationTableResult) =>
                      v ? (
                        <Tag color="green">{t('common.migration.success')}</Tag>
                      ) : (
                        <Tag color="red" title={record.error}>
                          {t('common.migration.failed')}
                        </Tag>
                      ),
                  },
                ]}
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
