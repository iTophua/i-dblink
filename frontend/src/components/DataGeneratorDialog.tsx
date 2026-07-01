import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal,
  Select,
  InputNumber,
  Table,
  Button,
  Progress,
  Space,
  Steps,
  App,
  Tooltip,
} from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import type { ColumnInfo } from '../types/api';
import type { DataGenType, ColumnGenConfig } from '../utils/dataGenerator';
import {
  generateBatchRows,
  inferGenType,
  resetSequence,
} from '../utils/dataGenerator';
import { getErrorMessage } from '../utils/getErrorMessage';

interface DataGeneratorDialogProps {
  open: boolean;
  connectionId: string;
  database?: string;
  initialTable?: string;
  onCancel: () => void;
  onSuccess: () => void;
}

const BATCH_SIZE = 100;
const ALL_GEN_TYPES: DataGenType[] = [
  'auto', 'sequentialId', 'randomInt', 'randomDecimal',
  'firstName', 'lastName', 'fullName', 'email', 'phone',
  'address', 'city', 'country', 'company', 'url',
  'date', 'timestamp', 'uuid', 'boolean',
  'fixedValue', 'null', 'skip',
];

export const DataGeneratorDialog: React.FC<DataGeneratorDialogProps> = ({
  open,
  connectionId,
  database,
  initialTable,
  onCancel,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();

  // Step control
  const [currentStep, setCurrentStep] = useState(0);

  // Config state
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | undefined>(initialTable);
  const [rowCount, setRowCount] = useState(100);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [columnConfigs, setColumnConfigs] = useState<Map<string, ColumnGenConfig>>(new Map());
  const [loadingColumns, setLoadingColumns] = useState(false);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generated, setGenerated] = useState(0);

  // Preview data
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setCurrentStep(0);
      setSelectedTable(initialTable);
      setRowCount(100);
      setColumns([]);
      setColumnConfigs(new Map());
      setGenerating(false);
      setProgress(0);
      setGenerated(0);
      setPreviewRows([]);
      // Fetch tables
      api.getTables(connectionId, database).then((tbls) => {
        setTables(tbls.map((t) => t.table_name));
      }).catch(() => {
        // Silently fail; user can still type table name
      });
    }
  }, [open, connectionId, database, initialTable]);

  // Fetch columns when table changes
  useEffect(() => {
    if (!selectedTable || !open) return;
    setLoadingColumns(true);
    api.getColumns(connectionId, selectedTable, database).then((cols) => {
      setColumns(cols);
      // Build default configs with auto inference
      const newConfigs = new Map<string, ColumnGenConfig>();
      for (const col of cols) {
        newConfigs.set(col.column_name, {
          columnName: col.column_name,
          dbType: col.data_type,
          genType: inferGenType(col.data_type, col.column_name),
        });
      }
      setColumnConfigs(newConfigs);
    }).catch((err: unknown) => {
      message.error(t('common.dataGenerator.fetchColumnsFailed') + ': ' + getErrorMessage(err));
    }).finally(() => {
      setLoadingColumns(false);
    });
  }, [selectedTable, connectionId, database, open, t, message]);

  const updateColumnConfig = useCallback((colName: string, updates: Partial<ColumnGenConfig>) => {
    setColumnConfigs((prev) => {
      const next = new Map(prev);
      const existing = next.get(colName);
      if (existing) {
        next.set(colName, { ...existing, ...updates });
      }
      return next;
    });
  }, []);

  // Generate preview
  const generatePreview = useCallback(() => {
    const configs = Array.from(columnConfigs.values());
    resetSequence();
    const rows = generateBatchRows(configs, 0, Math.min(5, rowCount));
    setPreviewRows(rows);
  }, [columnConfigs, rowCount]);

  // Build preview columns from the first row
  const previewColumns = useMemo(() => {
    if (previewRows.length === 0) return [];
    return Object.keys(previewRows[0]).map((key) => ({
      title: key,
      dataIndex: key,
      key,
      ellipsis: true,
      width: 120,
      render: (val: unknown) => (val === null ? <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>NULL</span> : String(val)),
    }));
  }, [previewRows]);

  // Handle step transitions
  const handleNext = useCallback(() => {
    if (currentStep === 0) {
      if (!selectedTable) {
        message.warning(t('common.dataGenerator.noTableSelected'));
        return;
      }
      generatePreview();
      setCurrentStep(1);
    }
  }, [currentStep, selectedTable, generatePreview, message, t]);

  const handleBack = useCallback(() => {
    setCurrentStep(0);
    setPreviewRows([]);
  }, []);

  // Execute generation with batch INSERT via api.batchImport
  const handleGenerate = useCallback(async () => {
    if (!selectedTable) return;
    const configs = Array.from(columnConfigs.values());
    const activeConfigs = configs.filter((c) => c.genType !== 'skip');
    if (activeConfigs.length === 0) {
      message.warning(t('common.dataGenerator.noActiveColumns'));
      return;
    }

    setGenerating(true);
    setProgress(0);
    setGenerated(0);
    resetSequence();

    try {
      const totalBatches = Math.ceil(rowCount / BATCH_SIZE);
      let inserted = 0;

      for (let batch = 0; batch < totalBatches; batch++) {
        const startRow = batch * BATCH_SIZE;
        const thisBatch = Math.min(BATCH_SIZE, rowCount - startRow);
        const rows = generateBatchRows(configs, startRow, thisBatch);

        // Use api.batchImport for safe parameterized inserts
        const result = await api.batchImport({
          connectionId,
          database,
          tableName: selectedTable,
          mode: 'insert',
          rows,
        });

        inserted += result.success_count;
        const pct = Math.round((inserted / rowCount) * 100);
        setProgress(pct);
        setGenerated(inserted);

        if (result.failed_count > 0 && result.last_error) {
          message.warning(t('common.dataGenerator.batchWarning', { batch: batch + 1, error: result.last_error }));
        }
      }

      message.success(t('common.dataGenerator.generateSuccess', { count: inserted }));
      onSuccess();
    } catch (err: unknown) {
      message.error(t('common.dataGenerator.generateFailed') + ': ' + getErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  }, [selectedTable, columnConfigs, rowCount, connectionId, database, message, t, onSuccess]);

  // Column mapping table data source
  const mappingDataSource = useMemo(() => {
    return columns.map((col) => {
      const cfg = columnConfigs.get(col.column_name);
      return {
        key: col.column_name,
        columnName: col.column_name,
        dbType: col.data_type,
        genType: cfg?.genType ?? 'auto',
        fixedValue: cfg?.fixedValue ?? '',
        rangeMin: cfg?.rangeMin,
        rangeMax: cfg?.rangeMax,
        precision: cfg?.precision,
        dateFrom: cfg?.dateFrom,
        dateTo: cfg?.dateTo,
      };
    });
  }, [columns, columnConfigs]);

  const genTypeOptions = ALL_GEN_TYPES.map((gt) => ({
    label: t(`common.dataGenerator.types.${gt}`),
    value: gt,
  }));

  return (
    <Modal
      title={t('common.dataGenerator.title')}
      open={open}
      onCancel={onCancel}
      width={900}
      footer={null}
      destroyOnClose
      transitionName=""
      maskTransitionName=""
    >
      <Steps
        current={currentStep}
        size="small"
        style={{ marginBottom: 16 }}
        items={[
          { title: t('common.dataGenerator.stepConfig') },
          { title: t('common.dataGenerator.stepPreview') },
        ]}
      />

      {currentStep === 0 && (
        <div>
          <Space style={{ marginBottom: 16 }} wrap>
            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>{t('common.dataGenerator.tableSelector')}</div>
              <Select
                showSearch
                style={{ width: 240 }}
                placeholder={t('common.dataGenerator.selectTable')}
                value={selectedTable}
                onChange={setSelectedTable}
                options={tables.map((tbl) => ({ label: tbl, value: tbl }))}
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                allowClear
              />
            </div>
            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>{t('common.dataGenerator.rowCount')}</div>
              <InputNumber
                min={1}
                max={10000}
                value={rowCount}
                onChange={(v) => setRowCount(v ?? 100)}
                style={{ width: 120 }}
              />
            </div>
          </Space>

          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
            {t('common.dataGenerator.columnMapping')}
          </div>

          <Table
            size="small"
            loading={loadingColumns}
            pagination={false}
            scroll={{ y: 360 }}
            dataSource={mappingDataSource}
            columns={[
              {
                title: t('common.dataGenerator.columnName'),
                dataIndex: 'columnName',
                width: 160,
                ellipsis: true,
              },
              {
                title: t('common.dataGenerator.columnType'),
                dataIndex: 'dbType',
                width: 120,
                ellipsis: true,
              },
              {
                title: t('common.dataGenerator.generateType'),
                dataIndex: 'genType',
                width: 160,
                render: (_val: unknown, record: { columnName: string }) => {
                  const cfg = columnConfigs.get(record.columnName);
                  return (
                    <Select
                      size="small"
                      style={{ width: '100%' }}
                      value={cfg?.genType ?? 'auto'}
                      onChange={(val) => updateColumnConfig(record.columnName, { genType: val })}
                      options={genTypeOptions}
                    />
                  );
                },
              },
              {
                title: t('common.dataGenerator.rangeMin'),
                dataIndex: 'rangeMin',
                width: 80,
                render: (_val: unknown, record: { columnName: string; genType: DataGenType }) => {
                  const cfg = columnConfigs.get(record.columnName);
                  if (cfg?.genType !== 'randomInt' && cfg?.genType !== 'randomDecimal') return null;
                  return (
                    <InputNumber
                      size="small"
                      style={{ width: '100%' }}
                      value={cfg?.rangeMin}
                      onChange={(v) => updateColumnConfig(record.columnName, { rangeMin: v ?? undefined })}
                    />
                  );
                },
              },
              {
                title: t('common.dataGenerator.rangeMax'),
                dataIndex: 'rangeMax',
                width: 80,
                render: (_val: unknown, record: { columnName: string; genType: DataGenType }) => {
                  const cfg = columnConfigs.get(record.columnName);
                  if (cfg?.genType !== 'randomInt' && cfg?.genType !== 'randomDecimal') return null;
                  return (
                    <InputNumber
                      size="small"
                      style={{ width: '100%' }}
                      value={cfg?.rangeMax}
                      onChange={(v) => updateColumnConfig(record.columnName, { rangeMax: v ?? undefined })}
                    />
                  );
                },
              },
              {
                title: t('common.dataGenerator.precision'),
                dataIndex: 'precision',
                width: 80,
                render: (_val: unknown, record: { columnName: string; genType: DataGenType }) => {
                  const cfg = columnConfigs.get(record.columnName);
                  if (cfg?.genType !== 'randomDecimal') return null;
                  return (
                    <InputNumber
                      size="small"
                      min={0}
                      max={10}
                      style={{ width: '100%' }}
                      value={cfg?.precision ?? 2}
                      onChange={(v) => updateColumnConfig(record.columnName, { precision: v ?? 2 })}
                    />
                  );
                },
              },
              {
                title: t('common.dataGenerator.fixedValue'),
                dataIndex: 'fixedValue',
                width: 140,
                render: (_val: unknown, record: { columnName: string; genType: DataGenType }) => {
                  const cfg = columnConfigs.get(record.columnName);
                  if (cfg?.genType !== 'fixedValue') return null;
                  return (
                    <Tooltip title={t('common.dataGenerator.enterFixedValue')}>
                      <input
                        style={{
                          width: '100%',
                          padding: '2px 4px',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          background: 'var(--background)',
                          color: 'var(--text)',
                          fontSize: 12,
                        }}
                        value={cfg?.fixedValue ?? ''}
                        onChange={(e) => updateColumnConfig(record.columnName, { fixedValue: e.target.value })}
                        placeholder={t('common.dataGenerator.enterFixedValue')}
                      />
                    </Tooltip>
                  );
                },
              },
            ]}
          />

          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Button onClick={onCancel} style={{ marginRight: 8 }}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" onClick={handleNext} disabled={!selectedTable}>
              {t('common.next')}
            </Button>
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
            {t('common.dataGenerator.previewTitle')}
          </div>

          <Table
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
            dataSource={previewRows.map((row, i) => ({ ...row, _key: i }))}
            columns={previewColumns}
            style={{ marginBottom: 16 }}
          />

          {generating && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                {t('common.dataGenerator.generating')} {generated} / {rowCount}
              </div>
              <Progress percent={progress} status="active" />
            </div>
          )}

          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Button onClick={handleBack} disabled={generating} style={{ marginRight: 8 }}>
              {t('common.back')}
            </Button>
            <Button onClick={onCancel} disabled={generating} style={{ marginRight: 8 }}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" onClick={handleGenerate} loading={generating}>
              {t('common.dataGenerator.generate')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
