import { useState } from 'react';
import { Modal, Form, Input } from 'antd';
import { useTranslation } from 'react-i18next';

interface ParamDialogProps {
  open: boolean;
  params: string[];
  onCancel: () => void;
  onExecute: (values: Record<string, string>) => void;
}

export function ParamDialog({ open, params, onCancel, onExecute }: ParamDialogProps) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      onExecute(values);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={t('common.enterParameterValues')}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={loading}
      width={450}
      okText={t('common.execute')}
      cancelText={t('common.cancel')}
    >
      <Form form={form} layout="vertical">
        {params.map((param) => (
          <Form.Item
            key={param}
            name={param}
            label={`:${param}`}
            rules={[{ required: true, message: t('common.pleaseEnterParameterValue', { param }) }]}
          >
            <Input placeholder={t('common.enterParameterValue', { param })} />
          </Form.Item>
        ))}
      </Form>
    </Modal>
  );
}
