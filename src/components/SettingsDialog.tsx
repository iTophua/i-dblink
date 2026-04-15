import React from 'react';
import { Modal, Form, InputNumber, Select, Button, Divider } from 'antd';
import { useSettingsStore } from '../stores/settingsStore';

interface SettingsDialogProps {
  open: boolean;
  onCancel: () => void;
}

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
      theme: 'system',
      language: 'zh-CN',
    });
  };

  return (
    <Modal
      title="设置"
      open={open}
      onCancel={onCancel}
      width={500}
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

        <Form.Item label="主题" name="theme">
          <Select>
            <Select.Option value="light">浅色</Select.Option>
            <Select.Option value="dark">深色</Select.Option>
            <Select.Option value="system">跟随系统</Select.Option>
          </Select>
        </Form.Item>

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
