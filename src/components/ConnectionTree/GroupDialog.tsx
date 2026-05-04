import { useState, useEffect, useCallback } from 'react';
import { Modal, Form, Select, message } from 'antd';
import {
  FolderOutlined,
  GlobalOutlined,
  CloudServerOutlined,
  LaptopOutlined,
  DatabaseOutlined,
  ProjectOutlined,
  HomeOutlined,
  StarOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ConnectionGroup } from '../../stores/appStore';
import { GlobalInput } from '../GlobalInput';

const GROUP_ICONS = [
  { label: '文件夹', value: '📁', icon: <FolderOutlined /> },
  { label: '地球', value: '🌐', icon: <GlobalOutlined /> },
  { label: '服务器', value: '🖥️', icon: <CloudServerOutlined /> },
  { label: '电脑', value: '💻', icon: <LaptopOutlined /> },
  { label: '数据库', value: '🗄️', icon: <DatabaseOutlined /> },
  { label: '项目', value: '📂', icon: <ProjectOutlined /> },
  { label: '主页', value: '🏠', icon: <HomeOutlined /> },
  { label: '收藏', value: '⭐', icon: <StarOutlined /> },
];

const GROUP_COLORS = [
  { label: '蓝色', value: '#1890ff' },
  { label: '绿色', value: '#52c41a' },
  { label: '橙色', value: '#faad14' },
  { label: '红色', value: '#ff4d4f' },
  { label: '紫色', value: '#722ed1' },
  { label: '青色', value: '#13c2c2' },
  { label: '粉色', value: '#eb2f96' },
  { label: '灰色', value: '#8c8c8c' },
];

interface GroupDialogProps {
  open: boolean;
  editingGroup?: ConnectionGroup | null;
  parentGroupId?: string | null;
  onCancel: () => void;
  onSave: (data: {
    id?: string;
    name: string;
    icon: string;
    color: string;
    parent_id?: string;
  }) => void;
}

export function GroupDialog({
  open,
  editingGroup,
  parentGroupId,
  onCancel,
  onSave,
}: GroupDialogProps) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (editingGroup) {
        form.setFieldsValue({
          name: editingGroup.name,
          icon: editingGroup.icon,
          color: editingGroup.color,
        });
      } else {
        form.setFieldsValue({
          name: '',
          icon: '📁',
          color: '#1890ff',
        });
      }
    } else {
      form.resetFields();
    }
  }, [open, editingGroup, form]);

  const handleOk = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await onSave({
        id: editingGroup?.id,
        name: values.name,
        icon: values.icon,
        color: values.color,
        parent_id: parentGroupId || undefined,
      });
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(`${t('common.operationFailed')}: ${error}`);
    } finally {
      setSaving(false);
    }
  }, [form, editingGroup, parentGroupId, onSave]);

  return (
    <Modal
      title={editingGroup ? '编辑分组' : '新建分组'}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={saving}
      width={420}
      transitionName=""
      maskTransitionName=""
      okText={editingGroup ? '保存' : '创建'}
      cancelText="取消"
    >
      <Form form={form} layout="vertical" size="middle" style={{ marginTop: 8 }}>
        <Form.Item
          name="name"
          label="分组名称"
          rules={[{ required: true, message: '请输入分组名称' }]}
        >
          <GlobalInput placeholder="例如：开发环境" maxLength={50} />
        </Form.Item>

        <Form.Item
          name="icon"
          label="分组图标"
          rules={[{ required: true, message: '请选择分组图标' }]}
        >
          <Select>
            {GROUP_ICONS.map((item) => (
              <Select.Option key={item.value} value={item.value}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {item.icon}
                  {item.label}
                </span>
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="color"
          label="分组颜色"
          rules={[{ required: true, message: '请选择分组颜色' }]}
        >
          <Select>
            {GROUP_COLORS.map((item) => (
              <Select.Option key={item.value} value={item.value}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      backgroundColor: item.value,
                    }}
                  />
                  {item.label}
                </span>
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default GroupDialog;
