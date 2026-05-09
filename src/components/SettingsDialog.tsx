import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  Form,
  InputNumber,
  Select,
  Button,
  Space,
  Tag,
  Tooltip,
  Switch,
  Menu,
  Input,
  message,
  type InputRef,
} from 'antd';
import { useSettingsStore, ThemeMode } from '../stores/settingsStore';
import { ThemePreset, THEME_PRESETS_LIST } from '../styles/theme';
import { MENU_SHORTCUTS, isMacOS } from '../constants/menuShortcuts';
import { useTranslation } from 'react-i18next';

interface SettingsDialogProps {
  open: boolean;
  onCancel: () => void;
}

type SettingsTab = 'general' | 'appearance' | 'language' | 'shortcuts';

const THEME_PREVIEW_COLORS: Record<ThemePreset, { light: string; dark: string }> = {
  neonCyber: { light: '#00f5ff', dark: '#00f5ff' },
  midnightDeep: { light: '#6366f1', dark: '#818cf8' },
  oceanBlue: { light: '#0ea5e9', dark: '#38bdf8' },
  nordicFrost: { light: '#64748b', dark: '#94a3b8' },
};

const MENU_ITEMS = [
  { key: 'general', labelKey: 'common.general' },
  { key: 'appearance', labelKey: 'common.appearance' },
  { key: 'language', labelKey: 'common.language' },
  { key: 'shortcuts', labelKey: 'common.shortcuts' },
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
      themePreset: 'midnightDeep',
      themeMode: 'dark',
      themeSyncSystem: true,
      language: 'zh-CN',
    });
  };

  const handlePresetChange = (preset: ThemePreset) => {
    form.setFieldsValue({ themePreset: preset });
  };

  const handleModeChange = (mode: ThemeMode) => {
    form.setFieldsValue({ themeMode: mode, themeSyncSystem: false });
  };

  const themePreset = Form.useWatch('themePreset', form) ?? 'midnightDeep';
  const themeSyncSystem = Form.useWatch('themeSyncSystem', form) ?? true;

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
      width={900}
      forceRender
      transitionName=""
      maskTransitionName=""
      styles={{ body: { maxHeight: 'calc(100vh - 200px)', overflow: 'hidden', padding: 0 } }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button onClick={handleReset}>{t('common.reset')}</Button>
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
            minHeight: 400,
            maxHeight: 'calc(100vh - 200px)',
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
                <Form.Item label={t('common.theme')} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {THEME_PRESETS_LIST.map((item) => (
                      <Tooltip key={item.value} title={item.description}>
                        <Tag
                          color={THEME_PREVIEW_COLORS[item.value].dark}
                          style={{
                            cursor: 'pointer',
                            border:
                              themePreset === item.value
                                ? '2px solid var(--color-primary)'
                                : '1px solid var(--border-color)',
                            padding: '4px 12px',
                            fontSize: 12,
                          }}
                          onClick={() => handlePresetChange(item.value)}
                        >
                          {item.label}
                        </Tag>
                      </Tooltip>
                    ))}
                  </div>
                </Form.Item>

                <Form.Item
                  label={t('common.themePreset')}
                  name="themePreset"
                  rules={[{ required: true }]}
                >
                  <Select>
                    {THEME_PRESETS_LIST.map((item) => (
                      <Select.Option key={item.value} value={item.value}>
                        <Space>
                          <span
                            style={{
                              display: 'inline-block',
                              width: 12,
                              height: 12,
                              borderRadius: 2,
                              background: `linear-gradient(135deg, ${THEME_PREVIEW_COLORS[item.value].light}, ${THEME_PREVIEW_COLORS[item.value].dark})`,
                            }}
                          />
                          <span>{item.label}</span>
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                            - {item.description}
                          </span>
                        </Space>
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item label={t('common.themeMode')} name="themeMode">
                  <Select onChange={handleModeChange}>
                    <Select.Option value="light">{t('common.light')}</Select.Option>
                    <Select.Option value="dark">{t('common.dark')}</Select.Option>
                  </Select>
                </Form.Item>

                <Form.Item
                  name="themeSyncSystem"
                  valuePropName="checked"
                  tooltip={t('common.followSystemTheme')}
                >
                  <Space>
                    <Switch
                      checked={themeSyncSystem}
                      size="small"
                      onChange={(checked) => form.setFieldsValue({ themeSyncSystem: checked })}
                    />
                    <span>{t('common.followSystem')}</span>
                  </Space>
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
      const effective = isMac && s.macKeys ? s.macKeys : s.keys;
      map[s.id] = shortcuts[s.id] || effective;
    });
    return map;
  }, [shortcuts, isMac]);

  // 检查快捷键冲突，返回冲突的快捷键 id，无冲突返回 null
  const checkConflict = (targetKey: string, newKeys: string): string | null => {
    const normalized = newKeys.toLowerCase();
    for (const [id, k] of Object.entries(effectiveShortcuts)) {
      if (id !== targetKey && k.toLowerCase() === normalized) {
        return id;
      }
    }
    return null;
  };

  const handleShortcutClick = (shortcutId: string) => {
    setEditingKey(shortcutId);
    setConflictKey(null);
    const current =
      shortcuts[shortcutId] || MENU_SHORTCUTS.find((s) => s.id === shortcutId)?.keys || '';
    setInputValue(current);
  };

  const handleShortcutSave = () => {
    if (editingKey) {
      const conflict = checkConflict(editingKey, inputValue);
      if (conflict) {
        const conflictDesc = MENU_SHORTCUTS.find((s) => s.id === conflict)?.description || conflict;
        messageApi.warning(t('common.confirmWith', { desc: conflictDesc }), 3);
        return;
      }
      const newShortcuts = { ...shortcuts };
      if (inputValue) {
        newShortcuts[editingKey] = inputValue;
      } else {
        delete newShortcuts[editingKey];
      }
      updateSettings({ shortcuts: newShortcuts });
      messageApi.success(t('common.shortcutSaved'));
    }
    setEditingKey(null);
    setInputValue('');
    setConflictKey(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const keys: string[] = [];
    if (e.metaKey || e.ctrlKey) keys.push('mod');
    if (e.altKey) keys.push('alt');
    if (e.shiftKey) keys.push('shift');
    if (!['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) {
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
    const custom = shortcuts[shortcutId];
    if (custom) {
      return custom
        .replace('mod+', isMac ? '⌘' : 'Ctrl+')
        .replace('shift+', '⇧')
        .replace('alt+', isMac ? '⌥' : 'Alt+')
        .replace('enter', '↵')
        .toUpperCase();
    }
    const defaultShortcut = MENU_SHORTCUTS.find((s) => s.id === shortcutId);
    if (!defaultShortcut) return '';
    const keys = isMac && defaultShortcut.macKeys ? defaultShortcut.macKeys : defaultShortcut.keys;
    return keys
      .replace('mod+', isMac ? '⌘' : 'Ctrl+')
      .replace('shift+', '⇧')
      .replace('alt+', isMac ? '⌥' : 'Alt+')
      .replace('enter', '↵')
      .toUpperCase();
  };

  const categories = useMemo(() => {
    const cats: Record<string, typeof MENU_SHORTCUTS> = {};
    MENU_SHORTCUTS.forEach((s) => {
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
        {t('common.clickToModify')}
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
                  background: 'var(--background-toolbar)',
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
                        placeholder={t('common.pressComboKeys')}
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
                        ⚠{' '}
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
                      }}
                      onClick={() => handleShortcutClick(shortcut.id)}
                    >
                      {getDisplayKeys(shortcut.id)}
                    </Tag>
                    {shortcuts[shortcut.id] && (
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
