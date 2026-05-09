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

  const GROUP_ICONS = [
    { label: t('common.folder'), value: '📁', icon: <FolderOutlined /> },
    { label: t('common.globe'), value: '🌐', icon: <GlobalOutlined /> },
    { label: t('common.server'), value: '🖥️', icon: <CloudServerOutlined /> },
    { label: t('common.computer'), value: '💻', icon: <LaptopOutlined /> },
    { label: t('common.databaseLabel'), value: '🗄️', icon: <DatabaseOutlined /> },
    { label: t('common.project'), value: '📂', icon: <ProjectOutlined /> },
    { label: t('common.homeLabel'), value: '🏠', icon: <HomeOutlined /> },
    { label: t('common.favorite'), value: '⭐', icon: <StarOutlined /> },
  ];

  const GROUP_COLORS = [
    { label: t('common.blue'), value: '#1890ff' },
    { label: t('common.green'), value: '#52c41a' },
    { label: t('common.orange'), value: '#faad14' },
    { label: t('common.red'), value: '#ff4d4f' },
    { label: t('common.purple'), value: '#722ed1' },
    { label: t('common.cyan'), value: '#13c2c2' },
    { label: t('common.pink'), value: '#eb2f96' },
    { label: t('common.gray'), value: '#8c8c8c' },
  ];

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
      title={editingGroup ? t('common.editGroupTitle') : t('common.newGroupTitle')}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={saving}
      width={420}
      transitionName=""
      maskTransitionName=""
      okText={editingGroup ? t('common.saveGroup') : t('common.createGroup')}
      cancelText={t('common.cancel')}
    >
      <Form form={form} layout="vertical" size="middle" style={{ marginTop: 8 }}>
        <Form.Item
          name="name"
          label={t('common.groupNameLabel')}
          rules={[{ required: true, message: t('common.userManagement.nameRequired') }]}
        >
          <GlobalInput placeholder={t('common.enterGroupNamePlaceholder')} maxLength={50} />
        </Form.Item>

        <Form.Item
          name="icon"
          label={t('common.groupIconLabel')}
          rules={[{ required: true, message: t('common.selectGroupIcon') }]}
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
          label={t('common.groupColorLabel')}
          rules={[{ required: true, message: t('common.selectGroupColor') }]}
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
