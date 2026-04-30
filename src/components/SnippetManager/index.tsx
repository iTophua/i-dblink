import React, { useState, useEffect } from 'react';
import { Drawer, Form, Input, Button, List, Tag, Space, Typography, App, Modal } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CodeOutlined } from '@ant-design/icons';
import { api } from '../../api';

const { Text } = Typography;

interface Snippet {
  id: string;
  name: string;
  sql_text: string;
  db_type?: string;
  category?: string;
  tags?: string;
  is_private: boolean;
  created_at: string;
  updated_at: string;
}

interface SnippetManagerProps {
  open: boolean;
  onClose: () => void;
  onInsert?: (sql: string) => void;
  dbType?: string;
}

export function SnippetManager({ open, onClose, onInsert, dbType }: SnippetManagerProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadSnippets();
    }
  }, [open]);

  const loadSnippets = async () => {
    try {
      setLoading(true);
      const data = await api.getSnippets();
      setSnippets(data);
    } catch (err: any) {
      message.error(`加载失败：${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      setLoading(true);
      await api.saveSnippet({
        id: editingId,
        ...values,
      });
      message.success(editingId ? '更新成功' : '保存成功');
      form.resetFields();
      setEditingId(undefined);
      await loadSnippets();
    } catch (err: any) {
      message.error(`保存失败：${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (snippet: Snippet) => {
    setEditingId(snippet.id);
    form.setFieldsValue({
      name: snippet.name,
      sql_text: snippet.sql_text,
      db_type: snippet.db_type,
      category: snippet.category,
      tags: snippet.tags,
    });
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除此代码片段吗？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.deleteSnippet(id);
          message.success('删除成功');
          await loadSnippets();
        } catch (err: any) {
          message.error(`删除失败：${err.message || err}`);
        }
      },
    });
  };

  const handleInsert = (sql: string) => {
    onInsert?.(sql);
    onClose();
  };

  const filteredSnippets = dbType
    ? snippets.filter((s) => s.db_type === dbType || !s.db_type)
    : snippets;

  const categories = Array.from(new Set(snippets.map((s) => s.category).filter(Boolean)));

  return (
    <Drawer
      title="代码片段"
      placement="right"
      width={520}
      open={open}
      onClose={onClose}
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields();
            setEditingId(undefined);
          }}
        >
          新建
        </Button>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* 编辑表单 */}
        {(editingId || !snippets.some((s) => s.name === form.getFieldValue('name'))) && (
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
              <Input placeholder="例如：分页查询" />
            </Form.Item>

            <Form.Item
              name="sql_text"
              label="SQL 内容"
              rules={[{ required: true, message: '请输入 SQL' }]}
            >
              <Input.TextArea
                rows={6}
                placeholder="SELECT * FROM users WHERE status = 'active' LIMIT 10 OFFSET 0"
              />
            </Form.Item>

            <Form.Item name="db_type" label="数据库类型">
              <Input placeholder="留空表示通用" />
            </Form.Item>

            <Form.Item name="category" label="分类">
              <Input placeholder="例如：查询、DDL、DML" />
            </Form.Item>

            <Form.Item name="tags" label="标签">
              <Input placeholder="逗号分隔，如：查询，分页" />
            </Form.Item>

            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={loading}>
                  {editingId ? '更新' : '保存'}
                </Button>
                {editingId && (
                  <Button
                    onClick={() => {
                      form.resetFields();
                      setEditingId(undefined);
                    }}
                  >
                    取消
                  </Button>
                )}
              </Space>
            </Form.Item>
          </Form>
        )}

        {/* 片段列表 */}
        {categories.length > 0 && (
          <Space style={{ marginBottom: 8 }}>
            {categories.map((cat) => (
              <Tag key={cat}>{cat}</Tag>
            ))}
          </Space>
        )}

        <List
          loading={loading}
          dataSource={filteredSnippets}
          renderItem={(snippet) => (
            <List.Item
              style={{
                cursor: 'pointer',
                background: 'var(--background)',
                border: `1px solid var(--border)`,
                borderRadius: 4,
                padding: '12px 16px',
              }}
              onClick={() => handleInsert(snippet.sql_text)}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <CodeOutlined />
                    <Text strong>{snippet.name}</Text>
                    {snippet.db_type && (
                      <Tag color="blue" style={{ fontSize: 10 }}>
                        {snippet.db_type}
                      </Tag>
                    )}
                    {snippet.is_private && (
                      <Tag color="orange" style={{ fontSize: 10 }}>
                        私有
                      </Tag>
                    )}
                  </Space>
                }
                description={
                  <Space direction="vertical" size={2}>
                    <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {snippet.sql_text.substring(0, 80)}
                      {snippet.sql_text.length > 80 ? '...' : ''}
                    </Text>
                    {snippet.tags && (
                      <Space>
                        {snippet.tags
                          .split(',')
                          .filter((t: string) => t.trim())
                          .map((tag: string, i: number) => (
                            <Tag key={i} style={{ fontSize: 10 }}>
                              {tag.trim()}
                            </Tag>
                          ))}
                      </Space>
                    )}
                  </Space>
                }
              />
              <Space>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(snippet);
                  }}
                />
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(snippet.id);
                  }}
                />
              </Space>
            </List.Item>
          )}
        />
      </Space>
    </Drawer>
  );
}

export default SnippetManager;
