import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import {
  ApiOutlined,
  CopyOutlined,
  CheckOutlined,
  ReloadOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useAIStore } from '../stores/aiStore';
import { api } from '../api';
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

type SettingsTab = 'general' | 'appearance' | 'language' | 'shortcuts' | 'editor' | 'ai' | 'mcp';

const MENU_ITEMS = [
  { key: 'general', labelKey: 'common.general' },
  { key: 'appearance', labelKey: 'common.appearance' },
  { key: 'language', labelKey: 'common.language' },
  { key: 'shortcuts', labelKey: 'common.shortcuts' },
  { key: 'editor', labelKey: 'common.editor' },
  { key: 'ai', labelKey: 'common.ai' },
  { key: 'mcp', labelKey: 'common.mcp' },
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

  // AI（自动保存）和 MCP（只读展示）两个 tab 不依赖底部全局保存按钮
  const isAutoSaveTab = activeTab === 'ai' || activeTab === 'mcp';

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {isAutoSaveTab ? (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {t('common.aiSettings.autoSaveHint')}
            </span>
          ) : (
            <Button onClick={handleReset} data-testid="settings-reset-btn">{t('common.reset')}</Button>
          )}
          <div>
            <Button onClick={onCancel} style={{ marginRight: 8 }}>
              {t('common.close')}
            </Button>
            {!isAutoSaveTab && (
              <Button type="primary" onClick={handleSave}>
                {t('common.save')}
              </Button>
            )}
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

// AI 预置服务商列表（与后端 ai.PresetProviders 对应）
const AI_PRESET_PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'qwen', name: '通义千问 (Qwen)', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { id: 'moonshot', name: '月之暗面 (Kimi)', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
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
        messageApi.error(t('common.aiSettings.saveFailed') + ': ' + String(err));
      } finally {
        setSavingField((cur2) => (cur2 === fieldName ? null : cur2));
      }
    });
    return saveChainRef.current;
  };

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // #3：首次加载配置后，若已配置 baseUrl 且 models 为空，自动拉取一次模型列表
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (autoLoadedRef.current) return;
    if (models0.length > 0) return;
    // 等配置加载完成且有 baseUrl（说明已配过 API 地址）
    if (!baseUrl) return;
    autoLoadedRef.current = true;
    loadModels({ baseUrl }).catch(() => {
      // 静默失败，用户可手动点刷新
      autoLoadedRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, models0.length]);

  // 从后端加载后同步本地表单（后端数据变化时同步到本地受控 state）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProvider(config.provider || 'deepseek');
    setBaseUrl(config.baseUrl);
    setModel(config.model);
    setEnabled(config.enabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      messageApi.error(t('common.aiSettings.loadModelsFailed') + ': ' + String(err));
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
    try {
      const result = await testConnection({
        enabled,
        provider,
        baseUrl,
        apiKey,
        model,
      });
      if (result.success) {
        messageApi.success(t('common.aiSettings.testSuccess') + ': ' + result.message);
      } else {
        messageApi.error(t('common.aiSettings.testFailed') + ': ' + result.message);
      }
    } catch (err) {
      messageApi.error(t('common.aiSettings.testFailed') + ': ' + String(err));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      {contextHolder}
      <div style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.6 }}>
        {t('common.aiSettings.description')}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontWeight: 600 }}>{t('common.aiSettings.enableAI')}</span>
        <Space size="small">
          {savingField === 'enabled' && <LoadingOutlined style={{ fontSize: 12 }} />}
          <Switch checked={enabled} onChange={handleEnabledChange} />
        </Space>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>{t('common.aiSettings.provider')}</div>
          <Select
            value={provider}
            onChange={handleProviderChange}
            style={{ width: '100%' }}
            options={AI_PRESET_PROVIDERS.map((p) => ({ value: p.id, label: p.name }))}
          />
        </div>

        <div>
          <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>{t('common.aiSettings.baseUrl')}</div>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            onBlur={handleBaseUrlBlur}
            placeholder="https://api.example.com/v1"
          />
        </div>

        <div>
          <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>{t('common.aiSettings.apiKey')}</div>
          <Input.Password
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onBlur={handleApiKeyBlur}
            placeholder={config.apiKeyMask || t('common.aiSettings.apiKeyPlaceholder')}
          />
          {config.apiKeyMask && !apiKey && (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {t('common.aiSettings.apiKeyMasked')}: {config.apiKeyMask}
            </div>
          )}
        </div>

        <div>
          <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
            {t('common.aiSettings.model')}
          </div>
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
              suffixIcon={
                savingField === 'model' ? (
                  <LoadingOutlined />
                ) : undefined
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
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {t('common.aiSettings.modelTip')}
          </div>
        </div>

        <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button icon={<ApiOutlined />} loading={testing} onClick={handleTest} style={{ flex: 1 }}>
            {testing ? t('common.aiSettings.testing') : t('common.aiSettings.testConnection')}
          </Button>
          {/* P1-#2：保存中全局反馈——按钮区右侧小 loading 图标 */}
          {savingField && savingField !== 'enabled' && savingField !== 'model' && (
            <Tooltip title={t('common.aiSettings.saving')}>
              <LoadingOutlined style={{ fontSize: 14, color: 'var(--text-tertiary)' }} />
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}

// MCP 设置组件 — 展示 MCP Server 配置信息
function MCPSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<import('../api').MCPConfigInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    api
      .getMCPConfig()
      .then((info) => {
        setConfig(info);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to get MCP config:', err);
        setLoading(false);
      });
  }, []);

  const handleCopyConfig = () => {
    if (!config) return;
    navigator.clipboard.writeText(config.configJSON);
    setCopied(true);
    messageApi.success(t('common.mcpSettings.copied'));
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
        {t('common.loading')}
      </div>
    );
  }

  if (!config) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-error)' }}>
        {t('common.mcpSettings.loadFailed')}
      </div>
    );
  }

  return (
    <div>
      {contextHolder}
      <div style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.6 }}>
        {t('common.mcpSettings.description')}
      </div>

      {/* 可执行文件路径 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
          {t('common.mcpSettings.executablePath')}
        </div>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            value={config.executablePath}
            readOnly
            style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 12 }}
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
        {config.isDev && (
          <div style={{ fontSize: 11, color: 'var(--color-warning)', marginTop: 2 }}>
            {t('common.mcpSettings.devModeWarning')}
          </div>
        )}
      </div>

      {/* Claude Desktop 配置 JSON */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            marginBottom: 4,
            fontSize: 13,
            fontWeight: 500,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{t('common.mcpSettings.configJSON')}</span>
          <Button size="small" type="link" onClick={handleCopyConfig} icon={copied ? <CheckOutlined /> : <CopyOutlined />}>
            {t('common.mcpSettings.copyConfig')}
          </Button>
        </div>
        <pre
          style={{
            background: 'var(--background-active)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 12,
            fontSize: 12,
            fontFamily: 'monospace',
            overflow: 'auto',
            margin: 0,
            maxHeight: 200,
            color: 'var(--text-primary)',
          }}
        >
          {config.configJSON}
        </pre>
      </div>

      {/* 配置文件路径 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
          {t('common.mcpSettings.configFilePath')}
        </div>
        <Input
          value={config.configPath}
          readOnly
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
          {t('common.mcpSettings.configFileTip')}
        </div>
      </div>

      {/* 可用工具列表 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
          {t('common.mcpSettings.availableTools')}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {config.tools.split(', ').map((tool) => (
            <Tag key={tool} style={{ fontFamily: 'monospace', fontSize: 11 }}>
              {tool}
            </Tag>
          ))}
        </div>
      </div>

      {/* 使用步骤 */}
      <div>
        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 500 }}>
          {t('common.mcpSettings.steps')}
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <li>{t('common.mcpSettings.step1')}</li>
          <li>{t('common.mcpSettings.step2')}</li>
          <li>{t('common.mcpSettings.step3')}</li>
          <li>{t('common.mcpSettings.step4')}</li>
        </ol>
      </div>
    </div>
  );
}