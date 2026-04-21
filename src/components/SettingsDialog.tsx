import React from 'react';
import { Modal, Form, InputNumber, Select, Button, Divider, Space, Tag, Tooltip } from 'antd';
import { useSettingsStore, ThemeMode } from '../stores/settingsStore';
import { ThemePreset, THEME_PRESETS_LIST, THEMES } from '../styles/theme';

interface SettingsDialogProps {
  open: boolean;
  onCancel: () => void;
}

const THEME_PREVIEW_COLORS: Record<ThemePreset, { light: string; dark: string }> = {
  neonCyber: { light: '#00f5ff', dark: '#00f5ff' },
  midnightDeep: { light: '#6366f1', dark: '#818cf8' },
  forestDusk: { light: '#22c55e', dark: '#4ade80' },
  oceanBlue: { light: '#0ea5e9', dark: '#38bdf8' },
  sunsetAurora: { light: '#a855f7', dark: '#c084fc' },
  nordicFrost: { light: '#64748b', dark: '#94a3b8' },
};

export function SettingsDialog({ open, onCancel }: SettingsDialogProps) {
  const { settings, updateSettings, resetSettings } = useSettingsStore();
  const [form] = Form.useForm();

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

  return (
    <Modal
      title="设置"
      open={open}
      onCancel={onCancel}
      width={560}
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
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={settings}
        style={{ marginTop: 16 }}
      >
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

        <Divider />

        <Form.Item label="主题预览">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {THEME_PRESETS_LIST.map((item) => (
              <Tooltip key={item.value} title={item.description}>
                <Tag
                  color={THEME_PREVIEW_COLORS[item.value].dark}
                  style={{
                    cursor: 'pointer',
                    border: settings.themePreset === item.value ? '2px solid var(--color-primary)' : '1px solid var(--border-color)',
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
          <Select
            value={settings.themeSyncSystem ? 'sync' : 'manual'}
            onChange={(value: string) => {
              const syncSystem = value === 'sync';
              form.setFieldsValue({ themeSyncSystem: syncSystem });
              if (syncSystem) {
                const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                form.setFieldsValue({ themeMode: isDark ? 'dark' : 'light' });
              }
            }}
          >
            <Select.Option value="sync">跟随系统</Select.Option>
            <Select.Option value="manual">手动设置</Select.Option>
          </Select>
        </Form.Item>

        <Divider />

        <Form.Item label="语言" name="language">
          <Select>
            <Select.Option value="zh-CN">简体中文</Select.Option>
            <Select.Option value="en-US">English</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
}
