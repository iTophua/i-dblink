import { useState } from 'react';
import { Modal, Form, Input } from 'antd';

interface ParamDialogProps {
  open: boolean;
  params: string[];
  onCancel: () => void;
  onExecute: (values: Record<string, string>) => void;
}

export function ParamDialog({ open, params, onCancel, onExecute }: ParamDialogProps) {
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
      title="输入参数值"
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={loading}
      width={450}
      okText="执行"
      cancelText="取消"
    >
      <Form form={form} layout="vertical">
        {params.map((param) => (
          <Form.Item
            key={param}
            name={param}
            label={`:${param}`}
            rules={[{ required: true, message: `请输入参数 ${param} 的值` }]}
          >
            <Input placeholder={`输入 ${param} 的值`} />
          </Form.Item>
        ))}
      </Form>
    </Modal>
  );
}
