import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, InputNumber, Select, Button, Space, Tag, Tooltip, Switch, Menu } from 'antd';
import { useSettingsStore, ThemeMode } from '../stores/settingsStore';
import { ThemePreset, THEME_PRESETS_LIST } from '../styles/theme';

interface SettingsDialogProps {
  open: boolean;
  onCancel: () => void;
}

type SettingsTab = 'general' | 'appearance' | 'language';

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
];

export function SettingsDialog({ open, onCancel }: SettingsDialogProps) {
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetSettings = useSettingsStore((s) => s.resetSettings);
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  useEffect(() => {
    if (open) {
      form.setFieldsValue(useSettingsStore.getState().settings);
      setActiveTab('general');
    }
  }, [open, form]);

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

  const menuItems = useMemo(() =>
    MENU_ITEMS.map(item => ({
      key: item.key,
      label: item.label,
      style: {
        padding: '8px 16px',
        borderRadius: 6,
        margin: '2px 8px',
        width: 'calc(100% - 16px)',
      }
    })),
  []);

  return (
    <Modal
      title="设置"
      open={open}
      onCancel={onCancel}
      width={720}
      forceRender
      transitionName=""
      maskTransitionName=""
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
      <div style={{ display: 'flex', marginTop: 16 }}>
        <div
          style={{
            width: 140,
            flexShrink: 0,
            background: 'var(--background-card)',
            borderRight: '1px solid var(--border-color)',
            padding: '8px 0',
          }}
        >
          <Menu
            mode="inline"
            selectedKeys={[activeTab]}
            onClick={({ key }) => setActiveTab(key as SettingsTab)}
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
            minHeight: 300,
          }}
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={useSettingsStore.getState().settings}
          >
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
                            border: themePreset === item.value ? '2px solid var(--color-primary)' : '1px solid var(--border-color)',
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
                    <Switch checked={themeSyncSystem} size="small" />
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
          </Form>
        </div>
      </div>
    </Modal>
  );
}
