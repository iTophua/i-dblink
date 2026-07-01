import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  Form,
  InputNumber,
  Select,
  Button,
  Switch,
  Menu,
  Input,
  Space,
  Tag,
  Tooltip,
  message,
  type InputRef,
} from 'antd';
import { useSettingsStore, ThemeMode } from '../stores/settingsStore';
import { THEME_PRESETS_LIST } from '../styles/theme';
import {
  MENU_SHORTCUTS,
  isMacOS,
  formatShortcutForDisplay,
  getEffectiveShortcut,
} from '../constants/menuShortcuts';
import { SQL_LIVE_TEMPLATES } from '../constants/sqlLiveTemplates';
import { useTranslation } from 'react-i18next';

interface SettingsDialogProps {
  open: boolean;
  onCancel: () => void;
}

type SettingsTab = 'general' | 'appearance' | 'language' | 'shortcuts' | 'editor';

const MENU_ITEMS = [
  { key: 'general', labelKey: 'common.general' },
  { key: 'appearance', labelKey: 'common.appearance' },
  { key: 'language', labelKey: 'common.language' },
  { key: 'shortcuts', labelKey: 'common.shortcuts' },
  { key: 'editor', labelKey: 'common.editor' },
];

export function SettingsDialog({ open, onCancel }: SettingsDialogProps) {
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetSettings = useSettingsStore((s) => s.resetSettings);
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const { t } = useTranslation();

  useEffect(() => {
    if (open) {
      const savedTab = useSettingsStore.getState().settings.settingsActiveTab || 'general';
      form.setFieldsValue(useSettingsStore.getState().settings);
      setActiveTab(savedTab);
    }
  }, [open, form]);

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    updateSettings({ settingsActiveTab: tab });
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      updateSettings(values);
      onCancel();
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  const handleReset = () => {
    resetSettings();
    form.setFieldsValue({
      pageSize: 1000,
      maxResultRows: 10000,
      themeMode: 'system',
      themePreset: 'default',
      language: 'zh-CN',
    });
  };

  const handleModeChange = (mode: ThemeMode) => {
    form.setFieldsValue({ themeMode: mode });
  };

  const menuItems = useMemo(
    () =>
      MENU_ITEMS.map((item) => ({
        key: item.key,
        label: t(item.labelKey),
        style: {
          padding: '8px 16px',
          borderRadius: 6,
          margin: '2px 8px',
          width: 'calc(100% - 16px)',
        },
      })),
    [t]
  );

  return (
    <Modal
      title={t('common.settings')}
      open={open}
      onCancel={onCancel}
      width={780}
      style={{ maxHeight: 550 }}
      forceRender
      transitionName=""
      maskTransitionName=""
      styles={{ body: { height: 470, overflow: 'hidden', padding: 0 } }}
      className="settings-dialog-modal"
      data-testid="settings-dialog"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button onClick={handleReset} data-testid="settings-reset-btn">{t('common.reset')}</Button>
          <div>
            <Button onClick={onCancel} style={{ marginRight: 8 }}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" onClick={handleSave}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', height: '100%' }}>
        <div
          style={{
            width: 140,
            flexShrink: 0,
            background: 'var(--background-toolbar)',
            borderRight: '1px solid var(--border-color)',
            padding: '8px 0',
            overflowY: 'auto',
          }}
        >
          <Menu
            mode="inline"
            selectedKeys={[activeTab]}
            onClick={({ key }) => handleTabChange(key as SettingsTab)}
            style={{
              background: 'transparent',
              border: 'none',
            }}
            items={menuItems}
          />
        </div>
        <div
          style={{
            flex: 1,
            background: 'var(--background-card)',
            padding: '16px 24px',
            height: 470,
            overflowY: 'auto',
          }}
        >
          <Form form={form} layout="vertical" initialValues={useSettingsStore.getState().settings}>
            {activeTab === 'general' && (
              <div>
                <Form.Item
                  label={t('common.defaultPageSize')}
                  name="pageSize"
                  rules={[{ required: true, message: t('common.defaultPageSize') }]}
                  tooltip={t('common.loadRows')}
                >
                  <InputNumber
                    min={10}
                    max={10000}
                    step={100}
                    style={{ width: '100%' }}
                    addonAfter={t('common.rows')}
                  />
                </Form.Item>
                <Form.Item
                  label={t('common.maxResultRows')}
                  name="maxResultRows"
                  rules={[{ required: true, message: t('common.maxResultRows') }]}
                  tooltip={t('common.maxReturnRows')}
                >
                  <InputNumber
                    min={100}
                    max={100000}
                    step={1000}
                    style={{ width: '100%' }}
                    addonAfter={t('common.rows')}
                  />
                </Form.Item>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div>
                <Form.Item label={t('common.themePreset')} name="themePreset">
                  <Select>
                    {THEME_PRESETS_LIST.map((preset) => (
                      <Select.Option key={preset.value} value={preset.value}>
                        <div>
                          <div>{preset.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                            {preset.description}
                          </div>
                        </div>
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item label={t('common.themeMode')} name="themeMode">
                  <Select onChange={handleModeChange}>
                    <Select.Option value="light">{t('common.light')}</Select.Option>
                    <Select.Option value="dark">{t('common.dark')}</Select.Option>
                    <Select.Option value="system">{t('common.followSystem')}</Select.Option>
                  </Select>
                </Form.Item>
              </div>
            )}

            {activeTab === 'language' && (
              <div>
                <Form.Item label={t('common.interfaceLanguage')} name="language">
                  <Select style={{ width: 200 }}>
                    <Select.Option value="zh-CN">简体中文</Select.Option>
                    <Select.Option value="en-US">English</Select.Option>
                  </Select>
                </Form.Item>
              </div>
            )}

            {activeTab === 'shortcuts' && <ShortcutsSettings />}

            {activeTab === 'editor' && <EditorSettings />}
          </Form>
        </div>
      </div>
    </Modal>
  );
}

function ShortcutsSettings() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [conflictKey, setConflictKey] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const isMac = isMacOS();
  const { t } = useTranslation();

  const shortcuts: Record<string, string> = settings.shortcuts || {};

  // 获取当前生效的快捷键映射 (id -> keys)
  const effectiveShortcuts = useMemo(() => {
    const map: Record<string, string> = {};
    MENU_SHORTCUTS.forEach((s) => {
      map[s.id] = getEffectiveShortcut(s.id, shortcuts, isMac);
    });
    return map;
  }, [shortcuts, isMac]);

  // 检查快捷键冲突，返回冲突的快捷键 id，无冲突返回 null
  const checkConflict = (targetKey: string, newKeys: string): string | null => {
    if (!newKeys) return null;
    const normalized = newKeys.toLowerCase();
    for (const [id, k] of Object.entries(effectiveShortcuts)) {
      if (id !== targetKey && k && k.toLowerCase() === normalized) {
        return id;
      }
    }
    return null;
  };

  const handleShortcutClick = (shortcutId: string) => {
    setEditingKey(shortcutId);
    setConflictKey(null);
    // 显示当前生效的快捷键（用户自定义或默认）
    const current = getEffectiveShortcut(shortcutId, shortcuts, isMac);
    setInputValue(current);
  };

  const handleShortcutSave = () => {
    if (editingKey) {
      const conflict = inputValue ? checkConflict(editingKey, inputValue) : null;
      if (conflict) {
        const conflictDesc = MENU_SHORTCUTS.find((s) => s.id === conflict)?.description || conflict;
        messageApi.warning(t('common.confirmWith', { desc: conflictDesc }), 3);
        return;
      }
      const newShortcuts = { ...shortcuts };
      if (inputValue) {
        newShortcuts[editingKey] = inputValue;
      } else {
        // 用户清空输入，保存为空字符串表示禁用
        newShortcuts[editingKey] = '';
      }
      updateSettings({ shortcuts: newShortcuts });
      messageApi.success(inputValue ? t('common.shortcutSaved') : t('common.shortcutDisabled'));
    }
    setEditingKey(null);
    setInputValue('');
    setConflictKey(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();

    // Delete / Backspace 清空快捷键（表示禁用）
    if (e.key === 'Delete' || e.key === 'Backspace') {
      setInputValue('');
      setConflictKey(null);
      return;
    }

    const keys: string[] = [];
    if (e.metaKey || e.ctrlKey) keys.push('mod');
    if (e.altKey) keys.push('alt');
    if (e.shiftKey) keys.push('shift');
    if (!['Control', 'Meta', 'Alt', 'Shift', 'Delete', 'Backspace'].includes(e.key)) {
      keys.push(e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase());
    }
    if (keys.length > 0) {
      const newKeys = keys.join('+');
      setInputValue(newKeys);
      // 实时检测冲突
      const conflict = editingKey ? checkConflict(editingKey, newKeys) : null;
      setConflictKey(conflict);
    }
  };

  const handleCancel = () => {
    setEditingKey(null);
    setInputValue('');
    setConflictKey(null);
  };

  const handleRestoreDefault = (shortcutId: string) => {
    const newShortcuts = { ...shortcuts };
    delete newShortcuts[shortcutId];
    updateSettings({ shortcuts: newShortcuts });
    messageApi.success(t('common.shortcutRestored'));
  };

  const getDisplayKeys = (shortcutId: string) => {
    const keys = getEffectiveShortcut(shortcutId, shortcuts, isMac);
    if (!keys) return t('common.disabled');
    return formatShortcutForDisplay(keys, isMac);
  };

  const isCustomized = (shortcutId: string) => shortcutId in shortcuts;

  const categories = useMemo(() => {
    const cats: Record<string, typeof MENU_SHORTCUTS> = {};
    MENU_SHORTCUTS.forEach((s) => {
      // 编辑类快捷键为系统级，不允许修改
      if (s.category === 'edit') return;
      if (!cats[s.category]) cats[s.category] = [];
      cats[s.category].push(s);
    });
    return cats;
  }, []);

  const categoryNames: Record<string, string> = {
    file: t('common.fileOperations'),
    edit: t('common.editOperations'),
    view: t('common.viewOperations'),
    connection: t('common.connectionOperations'),
    tools: t('common.toolOperations'),
    window: t('common.windowOperations'),
    help: t('common.helpOperations'),
  };

  return (
    <div>
      {contextHolder}
      <div style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 12 }}>
        {t('common.clickToModifyOrDelete')}
      </div>
      {Object.entries(categories).map(([category, catShortcuts]) => (
        <div key={category} style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--color-primary)' }}>
            {categoryNames[category] || category}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {catShortcuts.map((shortcut) => (
              <div
                key={shortcut.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: 'var(--background-active)',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{ fontSize: 13 }}>{shortcut.description}</span>
                {editingKey === shortcut.id ? (
                  <div>
                    <Space size="small" align="center">
                      <Input
                        size="small"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        style={{
                          width: 140,
                          fontFamily: 'monospace',
                          fontSize: 12,
                          ...(conflictKey
                            ? {
                                borderColor: 'var(--color-error)',
                                boxShadow: '0 0 0 2px rgba(255,77,79,0.2)',
                              }
                            : {}),
                        }}
                        autoFocus
                        placeholder={t('common.pressComboKeysOrDelete')}
                        status={conflictKey ? 'error' : undefined}
                      />
                      <Button size="small" type="primary" onClick={handleShortcutSave}>
                        {t('common.confirm')}
                      </Button>
                      <Button size="small" onClick={handleCancel}>
                        {t('common.cancel')}
                      </Button>
                    </Space>
                    {conflictKey && (
                      <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>
                        {' '}
                        {t('common.confirmWithKey', {
                          key:
                            MENU_SHORTCUTS.find((s) => s.id === conflictKey)?.description ||
                            conflictKey,
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <Space size="small">
                    <Tag
                      style={{
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                        fontSize: 12,
                        padding: '2px 8px',
                        color: !effectiveShortcuts[shortcut.id] ? 'var(--text-tertiary)' : undefined,
                      }}
                      onClick={() => handleShortcutClick(shortcut.id)}
                    >
                      {getDisplayKeys(shortcut.id)}
                    </Tag>
                    {isCustomized(shortcut.id) && (
                      <Tooltip title={t('common.restoreDefault')}>
                        <Button
                          size="small"
                          type="text"
                          style={{ fontSize: 11, padding: '0 4px', height: 20 }}
                          onClick={() => handleRestoreDefault(shortcut.id)}
                        >
                          {t('common.default')}
                        </Button>
                      </Tooltip>
                    )}
                  </Space>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const LIVE_TEMPLATE_CATEGORIES: Record<string, string> = {
  dml: 'DML',
  ddl: 'DDL',
  dcl: 'DCL',
  common: 'Common',
};

function EditorSettings() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const { t } = useTranslation();

  const liveTemplatesEnabled = settings.liveTemplatesEnabled !== false;

  // Group templates by category
  const grouped = SQL_LIVE_TEMPLATES.reduce<Record<string, typeof SQL_LIVE_TEMPLATES>>((acc, tpl) => {
    if (!acc[tpl.category]) acc[tpl.category] = [];
    acc[tpl.category].push(tpl);
    return acc;
  }, {});

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
              {t('common.liveTemplates.title')}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              {t('common.liveTemplates.description')}
            </div>
          </div>
          <Switch
            checked={liveTemplatesEnabled}
            onChange={(checked) => updateSettings({ liveTemplatesEnabled: checked })}
          />
        </div>
      </div>

      {liveTemplatesEnabled &&
        Object.entries(grouped).map(([category, templates]) => (
          <div key={category} style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--color-primary)', fontSize: 13 }}>
              {LIVE_TEMPLATE_CATEGORIES[category] || category}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {templates.map((tpl) => (
                <div
                  key={tpl.trigger}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: 'var(--background-active)',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--color-primary)',
                        background: 'var(--color-primary-alpha-15)',
                        padding: '1px 8px',
                        borderRadius: 4,
                        flexShrink: 0,
                      }}
                    >
                      {tpl.trigger}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                      {t(`common.liveTemplates.${tpl.nameKey}`)}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--text-tertiary)',
                      fontFamily: 'monospace',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 300,
                    }}
                  >
                    {t(`common.liveTemplates.${tpl.descriptionKey}`)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}