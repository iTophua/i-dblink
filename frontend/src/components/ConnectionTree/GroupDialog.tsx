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
import { getErrorMessage } from '../../utils/getErrorMessage';

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

  // 与主题语义色体系协调的分组色板（旧分组存的 antd 色值仍可显示，见 colorOptions）
  const GROUP_COLORS = [
    { label: t('common.blue'), value: '#3B82F6' },
    { label: t('common.green'), value: '#059669' },
    { label: t('common.orange'), value: '#F59E0B' },
    { label: t('common.red'), value: '#EF4444' },
    { label: t('common.purple'), value: '#8B5CF6' },
    { label: t('common.cyan'), value: '#06B6D4' },
    { label: t('common.pink'), value: '#EC4899' },
    { label: t('common.gray'), value: '#6B7280' },
  ];

  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // 正在编辑的旧分组可能存有色板外的颜色（如旧 antd 色），追加为选项避免显示原始 hex
  const watchedColor = Form.useWatch('color', form);
  const colorOptions =
    watchedColor && !GROUP_COLORS.some((c) => c.value === watchedColor)
      ? [{ label: t('common.currentColor'), value: watchedColor }, ...GROUP_COLORS]
      : GROUP_COLORS;

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
          color: '#3B82F6',
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
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      message.error(`${t('common.operationFailed')}: ${getErrorMessage(error)}`);
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
            {colorOptions.map((item) => (
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
