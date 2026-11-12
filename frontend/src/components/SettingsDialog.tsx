import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Modal,
  Form,
  InputNumber,
  Select,
  Button,
  Switch,
  Input,
  Segmented,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  message,
} from 'antd';
import {
  ApiOutlined,
  BgColorsOutlined,
  CheckOutlined,
  CopyOutlined,
  LaptopOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  GlobalOutlined,
  LoadingOutlined,
  MoonOutlined,
  ReloadOutlined,
  RobotOutlined,
  SearchOutlined,
  SettingOutlined,
  SunOutlined,
  ThunderboltOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { useAIStore } from '../stores/aiStore';
import { api } from '../api';
import { useSettingsStore, type AppSettings } from '../stores/settingsStore';
import { THEME_PRESETS_LIST, THEMES, type ThemePreset } from '../styles/theme';
import {
  MENU_SHORTCUTS,
  isMacOS,
  formatShortcutForDisplay,
  getEffectiveShortcut,
} from '../constants/menuShortcuts';
import { SQL_LIVE_TEMPLATES } from '../constants/sqlLiveTemplates';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../hooks/useThemeColors';
import { getErrorMessage } from '../utils/getErrorMessage';

interface SettingsDialogProps {
  open: boolean;
  onCancel: () => void;
}

type SettingsTab = 'general' | 'appearance' | 'language' | 'shortcuts' | 'editor' | 'ai' | 'mcp';

const MENU_ITEMS: Array<{
  key: SettingsTab;
  labelKey: string;
  icon: React.ReactNode;
  group: 'basic' | 'advanced';
}> = [
  { key: 'general', labelKey: 'common.general', icon: <SettingOutlined />, group: 'basic' },
  { key: 'appearance', labelKey: 'common.appearance', icon: <BgColorsOutlined />, group: 'basic' },
  { key: 'language', labelKey: 'common.language', icon: <GlobalOutlined />, group: 'basic' },
  { key: 'shortcuts', labelKey: 'common.shortcuts', icon: <ThunderboltOutlined />, group: 'advanced' },
  { key: 'editor', labelKey: 'common.editor', icon: <EditOutlined />, group: 'advanced' },
  { key: 'ai', labelKey: 'common.ai', icon: <RobotOutlined />, group: 'advanced' },
  { key: 'mcp', labelKey: 'common.mcp', icon: <ApiOutlined />, group: 'advanced' },
];

/** 设置面板分区标题：一个分区内的设置行用 1px 分隔线串起来，不再嵌套卡片 */
function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
      {description && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3, lineHeight: 1.6 }}>
          {description}
        </div>
      )}
      <div style={{ marginTop: 12, borderTop: '1px solid var(--border)' }}>{children}</div>
    </section>
  );
}

/** 设置行：左侧标题/说明，右侧控件 */
function SettingsRow({
  label,
  description,
  control,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  control: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
        padding: '12px 0',
        borderBottom: '1px solid var(--border-light, var(--border))',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
        {description && (
          <div
            style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2, lineHeight: 1.5 }}
          >
            {description}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{control}</div>
    </div>
  );
}

/** 设置字段：标签在上、控件占满整行的表单式布局（URL/密钥等长输入用） */
function SettingsField({
  label,
  description,
  children,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: '12px 0',
        borderBottom: '1px solid var(--border-light, var(--border))',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
      {description && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2, lineHeight: 1.5 }}>
          {description}
        </div>
      )}
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

/** 主题预设选择：直接看配色预览，比下拉框更直观 */
function ThemePresetPicker({
  value,
  onChange,
}: {
  value?: ThemePreset;
  onChange?: (value: ThemePreset) => void;
}) {
  const { isDark } = useThemeColors();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {THEME_PRESETS_LIST.map((preset) => {
        // 预览块跟随当前明暗模式，避免深色弹窗里出现三块刺眼的白卡
        const config = isDark ? THEMES[preset.value].dark : THEMES[preset.value].light;
        const neutral = config.neutralColors;
        const colors = config.colors;
        const active = value === preset.value;
        return (
          <button
            key={preset.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange?.(preset.value)}
            style={{
              width: 168,
              padding: 10,
              textAlign: 'left',
              cursor: 'pointer',
              borderRadius: 10,
              border: active ? `1px solid ${colors.primary}` : '1px solid var(--border)',
              background: 'var(--surface-elevated)',
              boxShadow: active ? `0 0 0 3px ${colors.primary}22` : 'none',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 6,
                height: 48,
                padding: 8,
                borderRadius: 7,
                background: neutral.background,
                border: `1px solid ${neutral.border}`,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 32,
                  borderRadius: 4,
                  background: neutral.backgroundCard,
                  border: `1px solid ${neutral.border}`,
                }}
              />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <span
                  style={{
                    height: 8,
                    width: '70%',
                    borderRadius: 2,
                    background: colors.primary,
                  }}
                />
                <span
                  style={{
                    height: 6,
                    width: '100%',
                    borderRadius: 2,
                    background: neutral.backgroundHover,
                  }}
                />
                <span
                  style={{
                    height: 6,
                    width: '55%',
                    borderRadius: 2,
                    background: neutral.border,
                  }}
                />
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginTop: 8,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: active ? 600 : 500 }}>{preset.label}</span>
              <span style={{ display: 'inline-flex', gap: 3 }}>
                {[colors.primary, colors.success, colors.warning, colors.error].map((color) => (
                  <span
                    key={color}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: color,
                    }}
                  />
                ))}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function SettingsDialog({ open, onCancel }: SettingsDialogProps) {
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const { t } = useTranslation();

  useEffect(() => {
    if (open) {
      const savedTab = useSettingsStore.getState().settings.settingsActiveTab || 'general';
      form.setFieldsValue(useSettingsStore.getState().settings);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开弹窗时恢复上次所在 tab
      setActiveTab(savedTab);
    }
  }, [open, form]);

  const contentRef = useRef<HTMLDivElement>(null);

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    updateSettings({ settingsActiveTab: tab });
    contentRef.current?.scrollTo({ top: 0 });
  };

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  // 设置即时生效：表单值变化后立即写回 store（setFieldsValue 不会触发本回调）
  const handleValuesChange = (changed: Partial<AppSettings>) => {
    const patch = Object.fromEntries(
      Object.entries(changed).filter(([, value]) => value !== undefined && value !== null)
    );
    if (Object.keys(patch).length > 0) {
      updateSettings(patch as Partial<AppSettings>);
    }
  };

  const footerHint =
    activeTab === 'ai'
      ? t('common.aiSettings.autoSaveHint')
      : activeTab === 'mcp'
        ? t('common.settingsUi.mcpReadonlyHint')
        : t('common.settingsUi.instantHint');

  const navGroups = useMemo(
    () => [
      { key: 'basic' as const, items: MENU_ITEMS.filter((item) => item.group === 'basic') },
      { key: 'advanced' as const, items: MENU_ITEMS.filter((item) => item.group === 'advanced') },
    ],
    []
  );

  return (
    <Modal
      title={t('common.settings')}
      open={open}
      onCancel={onCancel}
      width={860}
      forceRender
      className="settings-dialog-modal"
      data-testid="settings-dialog"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{footerHint}</span>
          <Button onClick={onCancel}>{t('common.close')}</Button>
        </div>
      }
    >
      <div
        style={{
          display: 'flex',
          gap: 12,
          height: 'min(560px, calc(100vh - 260px))',
          minHeight: 360,
        }}
      >
        {/* 左栏：圆角导航卡片，和连接弹窗的数据库选择栏保持同一套语汇 */}
        <nav
          data-testid="settings-menu"
          style={{
            width: 190,
            flexShrink: 0,
            background: 'var(--background-toolbar)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 8,
            overflowY: 'auto',
          }}
        >
          {navGroups.map((group) => (
            <div key={group.key} style={{ marginBottom: group.key === 'basic' ? 10 : 0 }}>
              <div
                style={{
                  padding: '6px 10px 4px',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  color: 'var(--text-tertiary)',
                }}
              >
                {t(
                  group.key === 'basic'
                    ? 'common.settingsUi.navBasic'
                    : 'common.settingsUi.navAdvanced'
                )}
              </div>
              {group.items.map((item) => {
                const active = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`settings-nav-item${active ? ' is-active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => handleTabChange(item.key)}
                  >
                    <span style={{ fontSize: 14, display: 'inline-flex' }}>{item.icon}</span>
                    <span>{t(item.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div
          ref={contentRef}
          style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '2px 4px 8px 2px' }}
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={useSettingsStore.getState().settings}
            onValuesChange={handleValuesChange}
          >
            {activeTab === 'general' && (
              <SettingsSection
                title={t('common.general')}
                description={t('common.settingsUi.generalDesc')}
              >
                <SettingsRow
                  label={t('common.defaultPageSize')}
                  description={t('common.loadRows')}
                  control={
                    <Form.Item
                      name="pageSize"
                      noStyle
                      rules={[{ required: true, message: t('common.defaultPageSize') }]}
                    >
                      <InputNumber
                        min={10}
                        max={10000}
                        step={100}
                        style={{ width: 220 }}
                        suffix={t('common.rows')}
                      />
                    </Form.Item>
                  }
                />
                <SettingsRow
                  label={t('common.maxResultRows')}
                  description={t('common.maxReturnRows')}
                  control={
                    <Form.Item
                      name="maxResultRows"
                      noStyle
                      rules={[{ required: true, message: t('common.maxResultRows') }]}
                    >
                      <InputNumber
                        min={100}
                        max={100000}
                        step={1000}
                        style={{ width: 220 }}
                        suffix={t('common.rows')}
                      />
                    </Form.Item>
                  }
                />
              </SettingsSection>
            )}

            {activeTab === 'appearance' && (
              <div>
                <SettingsSection
                  title={t('common.themePreset')}
                  description={t('common.settingsUi.presetDesc')}
                >
                  <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border-light, var(--border))' }}>
                    <Form.Item name="themePreset" noStyle>
                      <ThemePresetPicker />
                    </Form.Item>
                  </div>
                </SettingsSection>
                <SettingsSection
                  title={t('common.settingsUi.modeSection')}
                  description={t('common.settingsUi.modeDesc')}
                >
                  <SettingsRow
                    label={t('common.themeMode')}
                    control={
                      <Form.Item name="themeMode" noStyle>
                        <Segmented
                          options={[
                            {
                              value: 'light',
                              label: (
                                <span className="settings-mode-option">
                                  <SunOutlined />
                                  {t('common.light')}
                                </span>
                              ),
                            },
                            {
                              value: 'dark',
                              label: (
                                <span className="settings-mode-option">
                                  <MoonOutlined />
                                  {t('common.dark')}
                                </span>
                              ),
                            },
                            {
                              value: 'system',
                              label: (
                                <span className="settings-mode-option">
                                  <LaptopOutlined />
                                  {t('common.followSystem')}
                                </span>
                              ),
                            },
                          ]}
                        />
                      </Form.Item>
                    }
                  />
                </SettingsSection>
              </div>
            )}

            {activeTab === 'language' && (
              <SettingsSection
                title={t('common.language')}
                description={t('common.settingsUi.languageDesc')}
              >
                <SettingsRow
                  label={t('common.interfaceLanguage')}
                  control={
                    <Form.Item name="language" noStyle>
                      <Select
                        style={{ width: 200 }}
                        options={[
                          { value: 'zh-CN', label: '简体中文' },
                          { value: 'en-US', label: 'English' },
                        ]}
                      />
                    </Form.Item>
                  }
                />
              </SettingsSection>
            )}

            {activeTab === 'shortcuts' && <ShortcutsSettings />}

            {activeTab === 'editor' && <EditorSettings />}

            {activeTab === 'ai' && <AISettings />}

            {activeTab === 'mcp' && <MCPSettings />}
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

  const shortcuts = useMemo<Record<string, string>>(
    () => settings.shortcuts || {},
    [settings.shortcuts]
  );

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

  const [query, setQuery] = useState('');

  const categories = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cats: Record<string, typeof MENU_SHORTCUTS> = {};
    MENU_SHORTCUTS.forEach((s) => {
      // 编辑类快捷键为系统级，不允许修改
      if (s.category === 'edit') return;
      if (
        q &&
        !s.description.toLowerCase().includes(q) &&
        !(getEffectiveShortcut(s.id, shortcuts, isMac) || '').toLowerCase().includes(q)
      ) {
        return;
      }
      if (!cats[s.category]) cats[s.category] = [];
      cats[s.category].push(s);
    });
    return cats;
  }, [query, shortcuts, isMac]);

  const hasResults = Object.keys(categories).length > 0;

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
      <SettingsSection
        title={t('common.shortcuts')}
        description={t('common.clickToModifyOrDelete')}
      >
        <div style={{ padding: '12px 0' }}>
          <Input
            allowClear
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
            placeholder={t('common.settingsUi.shortcutSearch')}
            style={{ width: 260 }}
          />
        </div>
      </SettingsSection>

      {!hasResults && (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
          {t('common.settingsUi.shortcutNoMatch')}
        </div>
      )}

      {Object.entries(categories).map(([category, catShortcuts]) => (
        <div key={category} style={{ marginBottom: 18 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.3,
              color: 'var(--text-secondary)',
              marginBottom: 4,
            }}
          >
            {categoryNames[category] || category}
          </div>
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {catShortcuts.map((shortcut) => (
              <div
                key={shortcut.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 16,
                  padding: '9px 0',
                  borderBottom: '1px solid var(--border-light, var(--border))',
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
                          fontFamily: 'var(--font-family-code)',
                          fontSize: 12,
                          ...(conflictKey
                            ? {
                                borderColor: 'var(--color-error)',
                                boxShadow: '0 0 0 2px var(--color-error-alpha-15)',
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
                        fontFamily: 'var(--font-family-code)',
                        fontSize: 12,
                        padding: '2px 8px',
                        marginInlineEnd: 0,
                        color: !effectiveShortcuts[shortcut.id]
                          ? 'var(--text-tertiary)'
                          : undefined,
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
                          icon={<UndoOutlined />}
                          style={{ fontSize: 11, padding: '0 4px', height: 20 }}
                          onClick={() => handleRestoreDefault(shortcut.id)}
                        >
                          {t('common.restoreDefault')}
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
  const editorWordWrap = settings.editorWordWrap === true;

  // Group templates by category
  const grouped = SQL_LIVE_TEMPLATES.reduce<Record<string, typeof SQL_LIVE_TEMPLATES>>(
    (acc, tpl) => {
      if (!acc[tpl.category]) acc[tpl.category] = [];
      acc[tpl.category].push(tpl);
      return acc;
    },
    {}
  );

  return (
    <div>
      <SettingsSection
        title={t('common.editor')}
        description={t('common.settingsUi.editorDesc')}
      >
        <SettingsRow
          label={t('common.editorSettings.wordWrap')}
          description={t('common.editorSettings.wordWrapDesc')}
          control={
            <Switch
              checked={editorWordWrap}
              onChange={(checked) => updateSettings({ editorWordWrap: checked })}
            />
          }
        />
        <SettingsRow
          label={t('common.liveTemplates.title')}
          description={t('common.liveTemplates.description')}
          control={
            <Switch
              checked={liveTemplatesEnabled}
              onChange={(checked) => updateSettings({ liveTemplatesEnabled: checked })}
            />
          }
        />
      </SettingsSection>

      {liveTemplatesEnabled &&
        Object.entries(grouped).map(([category, templates]) => (
          <div key={category} style={{ marginBottom: 18 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.3,
                color: 'var(--text-secondary)',
                marginBottom: 4,
              }}
            >
              {LIVE_TEMPLATE_CATEGORIES[category] || category}
            </div>
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {templates.map((tpl) => (
                <div
                  key={tpl.trigger}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 16,
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border-light, var(--border))',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-family-code)',
                        fontSize: 12,
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
                      fontFamily: 'var(--font-family-code)',
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

// AI 预置服务商列表（与后端 ai.PresetProviders 对应）
const AI_PRESET_PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  {
    id: 'qwen',
    name: '通义千问 (Qwen)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
  },
  {
    id: 'moonshot',
    name: '月之暗面 (Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
  },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'custom', name: '自定义 (OpenAI 兼容)', baseUrl: '', model: '' },
];

function AISettings() {
  const { t } = useTranslation();
  const loadConfig = useAIStore((s) => s.loadConfig);
  const saveConfig = useAIStore((s) => s.saveConfig);
  const testConnection = useAIStore((s) => s.testConnection);
  const loadModels = useAIStore((s) => s.loadModels);
  const clearModels = useAIStore((s) => s.clearModels);
  // 独立选择器，避免对象返回导致的重渲染
  const enabled0 = useAIStore((s) => s.enabled);
  const provider0 = useAIStore((s) => s.provider);
  const baseUrl0 = useAIStore((s) => s.baseUrl);
  const apiKeyMask = useAIStore((s) => s.apiKeyMask);
  const model0 = useAIStore((s) => s.model);
  const models0 = useAIStore((s) => s.models);
  const loadingModels0 = useAIStore((s) => s.loadingModels);

  const config = {
    enabled: enabled0,
    provider: provider0,
    baseUrl: baseUrl0,
    apiKeyMask,
    model: model0,
  };
  const [provider, setProvider] = useState(config.provider || 'deepseek');
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [apiKey, setApiKey] = useState(''); // 空 = 不修改
  const [model, setModel] = useState(config.model);
  const [enabled, setEnabled] = useState(config.enabled);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  // P0-3 修复：autoSave 请求排队，串行化避免竞态。
  // 1. saveChainRef：链式 Promise 保证请求串行执行（先发先到后端）。
  // 2. latestRef：存最新的表单值。enqueueSave 接收 patch 时同步合并到 ref，
  //    这样回调执行时（可能在 React re-render 前）也能读到最新值。
  //    apiKey 不走 patch（仅失焦保存），通过 useEffect 同步到 ref。
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const latestRef = useRef({ enabled, provider, baseUrl, model, apiKey });
  useEffect(() => {
    latestRef.current.enabled = enabled;
    latestRef.current.provider = provider;
    latestRef.current.baseUrl = baseUrl;
    latestRef.current.model = model;
    latestRef.current.apiKey = apiKey;
  }, [enabled, provider, baseUrl, model, apiKey]);

  const enqueueSave = (
    patch: Partial<{ enabled: boolean; provider: string; baseUrl: string; model: string }>
  ): Promise<void> => {
    // 同步更新 ref，确保回调读到最新值（不等 useEffect flush）
    if (patch.enabled !== undefined) latestRef.current.enabled = patch.enabled;
    if (patch.provider !== undefined) latestRef.current.provider = patch.provider;
    if (patch.baseUrl !== undefined) latestRef.current.baseUrl = patch.baseUrl;
    if (patch.model !== undefined) latestRef.current.model = patch.model;

    const fieldName = Object.keys(patch)[0] || 'all';
    setSavingField(fieldName);
    saveChainRef.current = saveChainRef.current.then(async () => {
      const cur = latestRef.current;
      try {
        await saveConfig({
          enabled: cur.enabled,
          provider: cur.provider,
          baseUrl: cur.baseUrl,
          apiKey: cur.apiKey,
          model: cur.model,
        });
      } catch (err) {
        messageApi.error(t('common.aiSettings.saveFailed') + ': ' + getErrorMessage(err));
      } finally {
        setSavingField((cur2) => (cur2 === fieldName ? null : cur2));
      }
    });
    return saveChainRef.current;
  };

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // #3：首次进入 AI tab 时，若已配置 baseUrl 且 models 为空，自动拉取一次。
  // 失败不重试（ref 已置 true），用户可手动点刷新按钮。
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (autoLoadedRef.current) return;
    if (models0.length > 0) return;
    if (!baseUrl) return;
    autoLoadedRef.current = true;
    loadModels({ baseUrl }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, models0.length]);

  // 从后端加载后同步本地表单（后端数据变化时同步到本地受控 state）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProvider(config.provider || 'deepseek');
    setBaseUrl(config.baseUrl);
    setModel(config.model);
    setEnabled(config.enabled);
  }, [config.provider, config.baseUrl, config.model, config.enabled]);

  const handleProviderChange = (value: string) => {
    setProvider(value);
    // P0-2 修复：切换服务商后清空旧的模型列表（不同服务商模型不通用）
    clearModels();
    const preset = AI_PRESET_PROVIDERS.find((p) => p.id === value);
    const newBaseUrl = preset?.baseUrl ?? baseUrl;
    const newModel = preset?.model ?? '';
    setBaseUrl(newBaseUrl);
    setModel(newModel);
    // 切换服务商后自动保存（含新的 baseUrl/model）
    enqueueSave({ provider: value, baseUrl: newBaseUrl, model: newModel });
  };

  const handleEnabledChange = (checked: boolean) => {
    setEnabled(checked);
    enqueueSave({ enabled: checked });
  };

  // baseUrl 失焦时保存（避免输入过程中频繁保存）
  const handleBaseUrlBlur = () => {
    enqueueSave({ baseUrl });
  };

  // API Key 失焦时保存（仅当用户输入了内容）
  const handleApiKeyBlur = () => {
    if (!apiKey) return;
    enqueueSave({});
    setApiKey(''); // 保存后清空明文输入
  };

  // 动态加载模型列表
  const handleLoadModels = async () => {
    try {
      await loadModels({
        baseUrl,
        apiKey, // 空则后端用已存的 key
      });
    } catch (err) {
      messageApi.error(t('common.aiSettings.loadModelsFailed') + ': ' + getErrorMessage(err));
    }
  };

  // P0-1 修复：onChange 可能传入 undefined（手动清空输入），显式转空字符串。
  // model 清空会让 Provider 无法初始化，但允许临时清空以重新选择。
  const handleModelChange = (value: string | undefined) => {
    const next = value ?? '';
    setModel(next);
    enqueueSave({ model: next });
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // 从 latestRef 读 apiKey，避免 onBlur 清空 state 后拿到空值
      const result = await testConnection({
        enabled,
        provider,
        baseUrl,
        apiKey: apiKey || latestRef.current.apiKey,
        model,
      });
      setTestResult({
        ok: result.success,
        text:
          (result.success
            ? t('common.aiSettings.testSuccess')
            : t('common.aiSettings.testFailed')) +
          (result.message ? ': ' + result.message : ''),
      });
    } catch (err) {
      setTestResult({
        ok: false,
        text: t('common.aiSettings.testFailed') + ': ' + getErrorMessage(err),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      {contextHolder}
      <SettingsSection
        title={t('common.ai')}
        description={t('common.aiSettings.description')}
      >
        <SettingsRow
          label={t('common.aiSettings.enableAI')}
          control={<Switch checked={enabled} onChange={handleEnabledChange} />}
        />
      </SettingsSection>

      <SettingsSection
        title={t('common.settingsUi.aiConnection')}
        description={t('common.settingsUi.aiConnectionDesc')}
      >
        <SettingsField label={t('common.aiSettings.provider')}>
          <Select
            value={provider}
            onChange={handleProviderChange}
            style={{ width: '100%' }}
            options={AI_PRESET_PROVIDERS.map((p) => ({ value: p.id, label: p.name }))}
          />
        </SettingsField>

        <SettingsField label={t('common.aiSettings.baseUrl')}>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            onBlur={handleBaseUrlBlur}
            placeholder="https://api.example.com/v1"
          />
        </SettingsField>

        <SettingsField
          label={t('common.aiSettings.apiKey')}
          description={
            config.apiKeyMask && !apiKey
              ? `${t('common.aiSettings.apiKeyMasked')}: ${config.apiKeyMask}`
              : undefined
          }
        >
          <Input.Password
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onBlur={handleApiKeyBlur}
            placeholder={config.apiKeyMask || t('common.aiSettings.apiKeyPlaceholder')}
          />
        </SettingsField>

        <SettingsField label={t('common.aiSettings.model')} description={t('common.aiSettings.modelTip')}>
          <Space.Compact style={{ width: '100%' }}>
            <Select
              value={model || undefined}
              onChange={handleModelChange}
              style={{ width: 'calc(100% - 40px)' }}
              placeholder={t('common.aiSettings.modelPlaceholder')}
              showSearch
              options={models0.map((m) => ({
                value: m.id,
                label: m.owned_by ? `${m.id} (${m.owned_by})` : m.id,
              }))}
              notFoundContent={
                loadingModels0
                  ? t('common.aiSettings.loadingModels')
                  : t('common.aiSettings.noModels')
              }
            />
            <Tooltip title={t('common.aiSettings.loadModels')}>
              <Button
                icon={loadingModels0 ? <LoadingOutlined /> : <ReloadOutlined />}
                onClick={handleLoadModels}
                loading={loadingModels0}
              />
            </Tooltip>
          </Space.Compact>
        </SettingsField>

        <div style={{ padding: '12px 0' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button
              icon={<ApiOutlined />}
              loading={testing}
              onClick={handleTest}
              onMouseDown={(e) => e.preventDefault()}
              style={{ flex: 1 }}
            >
              {testing ? t('common.aiSettings.testing') : t('common.aiSettings.testConnection')}
            </Button>
            {/* 统一的保存中指示器——任何字段保存时都显示 */}
            {savingField && (
              <Tooltip title={t('common.aiSettings.saving')}>
                <LoadingOutlined style={{ fontSize: 14, color: 'var(--text-tertiary)' }} />
              </Tooltip>
            )}
          </div>
          {testResult && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 10,
                fontSize: 12,
                color: testResult.ok ? 'var(--color-success)' : 'var(--color-error)',
              }}
            >
              {testResult.ok ? <CheckOutlined /> : <ExclamationCircleOutlined />}
              <span>{testResult.text}</span>
            </div>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}

// MCP 设置组件 — 展示 MCP Server 配置信息
function MCPSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<import('../api').MCPConfigInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [copiedInstruction, setCopiedInstruction] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      setConfig(await api.getMCPConfig());
    } catch (err) {
      console.error('Failed to get MCP config:', err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 进入 MCP tab 时拉取只读配置
    loadConfig();
  }, [loadConfig]);

  // 一句话安装说明：agent 最清楚自己的配置格式与位置，把含真实路径的
  // 指令复制给它即可自行安装/更新，免去逐客户端适配配置文件
  const instructionText = config
    ? t('common.mcpSettings.installInstruction', { path: config.executablePath })
    : '';

  const handleCopyInstruction = () => {
    if (!instructionText) return;
    navigator.clipboard.writeText(instructionText);
    setCopiedInstruction(true);
    messageApi.success(t('common.mcpSettings.copied'));
    setTimeout(() => setCopiedInstruction(false), 2000);
  };

  if (loading) {
    return (
      <div>
        {contextHolder}
        <SettingsSection title={t('common.mcp')} description={t('common.mcpSettings.description')}>
          <div style={{ padding: '12px 0' }}>
            <Skeleton active title={false} paragraph={{ rows: 4 }} />
          </div>
        </SettingsSection>
      </div>
    );
  }

  if (loadFailed || !config) {
    return (
      <div>
        {contextHolder}
        <SettingsSection title={t('common.mcp')} description={t('common.mcpSettings.description')}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '20px 0',
              fontSize: 12,
              color: 'var(--color-error)',
            }}
          >
            <ExclamationCircleOutlined />
            <span>{t('common.mcpSettings.loadFailed')}</span>
            <Button size="small" icon={<ReloadOutlined />} onClick={loadConfig}>
              {t('common.settingsUi.retry')}
            </Button>
          </div>
        </SettingsSection>
      </div>
    );
  }

  const tools = (config.tools || '')
    .split(',')
    .map((tool) => tool.trim())
    .filter(Boolean);

  return (
    <div>
      {contextHolder}
      <SettingsSection
        title={t('common.mcp')}
        description={t('common.mcpSettings.description')}
      >
        <SettingsField
          label={t('common.mcpSettings.executablePath')}
          description={
            config.isDev ? (
              <span style={{ color: 'var(--color-warning)' }}>
                {t('common.mcpSettings.devModeWarning')}
              </span>
            ) : undefined
          }
        >
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={config.executablePath}
              readOnly
              style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-family-code)', fontSize: 12 }}
            />
            <Button
              onClick={() => {
                navigator.clipboard.writeText(config.executablePath);
                messageApi.success(t('common.mcpSettings.copied'));
              }}
            >
              {t('common.copy')}
            </Button>
          </Space.Compact>
        </SettingsField>
      </SettingsSection>

      {/* 安装到 Agent：复制一句话，agent 自行完成安装 */}
      <SettingsSection
        title={t('common.mcpSettings.installTitle')}
        description={t('common.mcpSettings.installHint')}
      >
        <div style={{ padding: '12px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <Button
              size="small"
              type="primary"
              onClick={handleCopyInstruction}
              icon={copiedInstruction ? <CheckOutlined /> : <CopyOutlined />}
            >
              {t('common.mcpSettings.copyInstruction')}
            </Button>
          </div>
          <pre
            style={{
              background: 'var(--background-toolbar)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
              lineHeight: 1.7,
              overflow: 'auto',
              margin: 0,
              maxHeight: 160,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-family-code)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {instructionText}
          </pre>
        </div>
      </SettingsSection>

      <SettingsSection title={t('common.mcpSettings.availableTools')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '12px 0' }}>
          {tools.length > 0 ? (
            tools.map((tool) => (
              <Tag key={tool} style={{ fontFamily: 'var(--font-family-code)', fontSize: 11 }}>
                {tool}
              </Tag>
            ))
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {t('common.settingsUi.noTools')}
            </span>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
