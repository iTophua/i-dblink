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
  { key: 'general', label: '通用设置' },
  { key: 'appearance', label: '外观与主题' },
  { key: 'language', label: '语言设置' },
  { key: 'shortcuts', label: '快捷键设置' },
];

export function SettingsDialog({ open, onCancel }: SettingsDialogProps) {
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetSettings = useSettingsStore((s) => s.resetSettings);
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

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
        label: item.label,
        style: {
          padding: '8px 16px',
          borderRadius: 6,
          margin: '2px 8px',
          width: 'calc(100% - 16px)',
        },
      })),
    []
  );

  return (
    <Modal
      title="设置"
      open={open}
      onCancel={onCancel}
      width={900}
      forceRender
      transitionName=""
      maskTransitionName=""
      styles={{ body: { maxHeight: 'calc(100vh - 200px)', overflow: 'hidden', padding: 0 } }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button onClick={handleReset}>恢复默认</Button>
          <div>
            <Button onClick={onCancel} style={{ marginRight: 8 }}>
              取消
            </Button>
            <Button type="primary" onClick={handleSave}>
              保存
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
                  label="默认分页大小"
                  name="pageSize"
                  rules={[{ required: true, message: '请输入分页大小' }]}
                  tooltip="每次加载数据的行数"
                >
                  <InputNumber
                    min={10}
                    max={10000}
                    step={100}
                    style={{ width: '100%' }}
                    addonAfter="行"
                  />
                </Form.Item>
                <Form.Item
                  label="查询结果上限"
                  name="maxResultRows"
                  rules={[{ required: true, message: '请输入查询结果上限' }]}
                  tooltip="SQL 查询返回的最大行数，超过此限制将只返回前 N 行并提示"
                >
                  <InputNumber
                    min={100}
                    max={100000}
                    step={1000}
                    style={{ width: '100%' }}
                    addonAfter="行"
                  />
                </Form.Item>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div>
                <Form.Item label="选择主题" style={{ marginBottom: 12 }}>
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

                <Form.Item label="主题风格" name="themePreset" rules={[{ required: true }]}>
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

                <Form.Item label="显示模式" name="themeMode">
                  <Select onChange={handleModeChange}>
                    <Select.Option value="light">浅色</Select.Option>
                    <Select.Option value="dark">深色</Select.Option>
                  </Select>
                </Form.Item>

                <Form.Item
                  name="themeSyncSystem"
                  valuePropName="checked"
                  tooltip="开启后主题将跟随系统设置自动切换"
                >
                  <Space>
                    <Switch
                      checked={themeSyncSystem}
                      size="small"
                      onChange={(checked) => form.setFieldsValue({ themeSyncSystem: checked })}
                    />
                    <span>跟随系统主题</span>
                  </Space>
                </Form.Item>
              </div>
            )}

            {activeTab === 'language' && (
              <div>
                <Form.Item label="界面语言" name="language">
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
        messageApi.warning(
          `快捷键与「${conflictDesc}」冲突，请使用其他组合键`,
          3
        );
        return;
      }
      const newShortcuts = { ...shortcuts };
      if (inputValue) {
        newShortcuts[editingKey] = inputValue;
      } else {
        delete newShortcuts[editingKey];
      }
      updateSettings({ shortcuts: newShortcuts });
      messageApi.success('快捷键已保存');
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
    messageApi.success('已恢复默认快捷键');
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
    file: '文件操作',
    edit: '编辑操作',
    view: '查看操作',
    connection: '连接操作',
    tools: '工具操作',
    window: '窗口操作',
    help: '帮助操作',
  };

  return (
    <div>
      {contextHolder}
      <div style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 12 }}>
        点击快捷键进行修改。修改后自动生效，无需保存。
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
                            ? { borderColor: 'var(--color-error)', boxShadow: '0 0 0 2px rgba(255,77,79,0.2)' }
                            : {}),
                        }}
                        autoFocus
                        placeholder="按下组合键"
                        status={conflictKey ? 'error' : undefined}
                      />
                      <Button size="small" type="primary" onClick={handleShortcutSave}>
                        确定
                      </Button>
                      <Button size="small" onClick={handleCancel}>
                        取消
                      </Button>
                    </Space>
                    {conflictKey && (
                      <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>
                        ⚠ 与「{MENU_SHORTCUTS.find((s) => s.id === conflictKey)?.description || conflictKey}
                        」冲突
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
                      <Tooltip title="恢复默认">
                        <Button
                          size="small"
                          type="text"
                          style={{ fontSize: 11, padding: '0 4px', height: 20 }}
                          onClick={() => handleRestoreDefault(shortcut.id)}
                        >
                          默认
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
