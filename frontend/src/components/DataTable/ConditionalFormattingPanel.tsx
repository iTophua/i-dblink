/**
 * ConditionalFormattingPanel — manage cell formatting rules for the data grid.
 *
 * Allows users to add/edit/delete rules that highlight cells based on conditions
 * such as NULL, equals, contains, greaterThan, lessThan, between.
 * Includes predefined presets for quick setup.
 */
import { useState, useCallback } from 'react';
import { Button, Select, Input, Space, Popconfirm, ColorPicker, Empty } from 'antd';
import { PlusOutlined, DeleteOutlined, BgColorsOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

// ── Types ──

export type FormatCondition =
  | 'isNull'
  | 'isNotNull'
  | 'equals'
  | 'contains'
  | 'greaterThan'
  | 'lessThan'
  | 'between';

export interface FormatRule {
  id: string;
  column: string; // column name, or '*' for all
  condition: FormatCondition;
  value?: string | number;
  value2?: string | number; // for 'between'
  backgroundColor: string;
  textColor?: string;
}

interface ConditionalFormattingPanelProps {
  visible: boolean;
  onClose: () => void;
  rules: FormatRule[];
  onRulesChange: (rules: FormatRule[]) => void;
  columns: string[];
}

// ── Presets ──

function getHighlightNullsPreset(): FormatRule {
  return {
    id: `preset-nulls-${Date.now()}`,
    column: '*',
    condition: 'isNull',
    backgroundColor: '#fff1f0',
    textColor: '#cf1322',
  };
}

function getHighlightNumbersPreset(): FormatRule[] {
  return [
    {
      id: `preset-pos-${Date.now()}`,
      column: '*',
      condition: 'greaterThan',
      value: 0,
      backgroundColor: '#f6ffed',
      textColor: '#389e0d',
    },
    {
      id: `preset-neg-${Date.now() + 1}`,
      column: '*',
      condition: 'lessThan',
      value: 0,
      backgroundColor: '#fff1f0',
      textColor: '#cf1322',
    },
  ];
}

function getHighlightDuplicatesPreset(): FormatRule {
  return {
    id: `preset-dupes-${Date.now()}`,
    column: '*',
    condition: 'equals',
    value: '__DUPLICATES__',
    backgroundColor: '#fffbe6',
    textColor: '#d48806',
  };
}

// ── Helpers ──

let ruleIdCounter = 0;
function nextRuleId(): string {
  return `rule-${Date.now()}-${++ruleIdCounter}`;
}

function createEmptyRule(): FormatRule {
  return {
    id: nextRuleId(),
    column: '*',
    condition: 'isNull',
    backgroundColor: '#fff1f0',
  };
}

// ── Component ──

export function ConditionalFormattingPanel({
  visible,
  onClose,
  rules,
  onRulesChange,
  columns,
}: ConditionalFormattingPanelProps) {
  const { t } = useTranslation();
  const [editingRule, setEditingRule] = useState<FormatRule | null>(null);

  const handleAddRule = useCallback(() => {
    const newRule = createEmptyRule();
    onRulesChange([...rules, newRule]);
    setEditingRule(newRule);
  }, [rules, onRulesChange]);

  const handleDeleteRule = useCallback(
    (id: string) => {
      onRulesChange(rules.filter((r) => r.id !== id));
      if (editingRule?.id === id) setEditingRule(null);
    },
    [rules, onRulesChange, editingRule]
  );

  const handleUpdateRule = useCallback(
    (id: string, updates: Partial<FormatRule>) => {
      onRulesChange(rules.map((r) => (r.id === id ? { ...r, ...updates } : r)));
      if (editingRule?.id === id) setEditingRule({ ...editingRule, ...updates });
    },
    [rules, onRulesChange, editingRule]
  );

  const handleApplyPreset = useCallback(
    (preset: 'nulls' | 'numbers' | 'duplicates') => {
      let newRules: FormatRule[];
      if (preset === 'nulls') {
        newRules = [getHighlightNullsPreset()];
      } else if (preset === 'numbers') {
        newRules = getHighlightNumbersPreset();
      } else {
        newRules = [getHighlightDuplicatesPreset()];
      }
      onRulesChange([...rules, ...newRules]);
    },
    [rules, onRulesChange]
  );

  if (!visible) return null;

  const conditionOptions = [
    { value: 'isNull', label: t('common.dataGrid.isNull') },
    { value: 'isNotNull', label: t('common.dataGrid.isNotNull') },
    { value: 'equals', label: t('common.dataGrid.equals') },
    { value: 'contains', label: t('common.dataGrid.contains') },
    { value: 'greaterThan', label: t('common.dataGrid.greaterThan') },
    { value: 'lessThan', label: t('common.dataGrid.lessThan') },
    { value: 'between', label: t('common.dataGrid.between') },
  ];

  const columnOptions = [
    { value: '*', label: t('common.dataGrid.allColumns') },
    ...columns.map((c) => ({ value: c, label: c })),
  ];

  const needsValue = (cond: FormatCondition) => cond !== 'isNull' && cond !== 'isNotNull';
  const needsValue2 = (cond: FormatCondition) => cond === 'between';

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 380,
        height: '100%',
        background: 'var(--background-card)',
        borderLeft: '1px solid var(--border)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-2px 0 8px rgba(0,0,0,0.08)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          <BgColorsOutlined style={{ marginRight: 6 }} />
          {t('common.dataGrid.conditionalFormatting')}
        </span>
        <Space size={4}>
          <Select
            size="small"
            placeholder={t('common.dataGrid.presets')}
            style={{ width: 150 }}
            options={[
              { value: 'nulls', label: t('common.dataGrid.presetHighlightNulls') },
              { value: 'numbers', label: t('common.dataGrid.presetHighlightNumbers') },
              { value: 'duplicates', label: t('common.dataGrid.presetHighlightDuplicates') },
            ]}
            onChange={(val) => { if (val) handleApplyPreset(val as 'nulls' | 'numbers' | 'duplicates'); }}
            value={undefined}
          />
          <Button size="small" type="text" onClick={onClose}>
            {t('common.close')}
          </Button>
        </Space>
      </div>

      {/* Rules list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        {rules.length === 0 ? (
          <Empty
            description={t('common.dataGrid.noRules')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ marginTop: 40 }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                columnOptions={columnOptions}
                conditionOptions={conditionOptions}
                needsValue={needsValue}
                needsValue2={needsValue2}
                onUpdate={handleUpdateRule}
                onDelete={handleDeleteRule}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add button */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <Button
          size="small"
          type="dashed"
          block
          icon={<PlusOutlined />}
          onClick={handleAddRule}
        >
          {t('common.dataGrid.addRule')}
        </Button>
      </div>
    </div>
  );
}

// ── RuleRow ──

interface RuleRowProps {
  rule: FormatRule;
  columnOptions: { value: string; label: string }[];
  conditionOptions: { value: string; label: string }[];
  needsValue: (cond: FormatCondition) => boolean;
  needsValue2: (cond: FormatCondition) => boolean;
  onUpdate: (id: string, updates: Partial<FormatRule>) => void;
  onDelete: (id: string) => void;
}

function RuleRow({
  rule,
  columnOptions,
  conditionOptions,
  needsValue,
  needsValue2,
  onUpdate,
  onDelete,
}: RuleRowProps) {
  const { t } = useTranslation();

  const parseColorValue = (color: string | undefined): string => color ?? '#ffffff';

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        background: 'var(--background-elevated, var(--background-card))',
      }}
    >
      {/* Row 1: column + condition + delete */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Select
          size="small"
          style={{ flex: 1 }}
          value={rule.column}
          options={columnOptions}
          onChange={(val) => onUpdate(rule.id, { column: val })}
        />
        <Select
          size="small"
          style={{ flex: 1 }}
          value={rule.condition}
          options={conditionOptions}
          onChange={(val) => onUpdate(rule.id, { condition: val as FormatCondition })}
        />
        <Popconfirm
          title={t('common.dataGrid.deleteRule')}
          onConfirm={() => onDelete(rule.id)}
          okText={t('common.confirm')}
          cancelText={t('common.cancel')}
        >
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </div>

      {/* Row 2: value inputs (if needed) */}
      {needsValue(rule.condition) && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Input
            size="small"
            placeholder={t('common.dataGrid.value')}
            value={rule.value != null ? String(rule.value) : ''}
            onChange={(e) => {
              const raw = e.target.value;
              const num = Number(raw);
              onUpdate(rule.id, { value: raw === '' ? undefined : !isNaN(num) && raw.trim() !== '' ? num : raw });
            }}
            style={{ flex: 1 }}
          />
          {needsValue2(rule.condition) && (
            <Input
              size="small"
              placeholder={t('common.dataGrid.value2')}
              value={rule.value2 != null ? String(rule.value2) : ''}
              onChange={(e) => {
                const raw = e.target.value;
                const num = Number(raw);
                onUpdate(rule.id, { value2: raw === '' ? undefined : !isNaN(num) && raw.trim() !== '' ? num : raw });
              }}
              style={{ flex: 1 }}
            />
          )}
        </div>
      )}

      {/* Row 3: colors */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 60 }}>
          {t('common.dataGrid.backgroundColor')}:
        </span>
        <ColorPicker
          size="small"
          value={parseColorValue(rule.backgroundColor)}
          onChange={(_, hex) => onUpdate(rule.id, { backgroundColor: hex })}
          showText={false}
          disabledAlpha
        />
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 50 }}>
          {t('common.dataGrid.textColor')}:
        </span>
        <ColorPicker
          size="small"
          value={parseColorValue(rule.textColor)}
          onChange={(_, hex) => onUpdate(rule.id, { textColor: hex })}
          showText={false}
          disabledAlpha
        />
      </div>
    </div>
  );
}

export default ConditionalFormattingPanel;
