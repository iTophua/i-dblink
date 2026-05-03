import { useState, useRef } from 'react';
import { Modal, Button, Progress, message } from 'antd';
import { api } from '../api';

interface RunSqlFileDialogProps {
  open: boolean;
  connectionId: string;
  database?: string;
  onCancel: () => void;
  onSuccess: () => void;
}

function splitSqlStatements(content: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let inComment = false;
  let commentType = ''; // 'line' or 'block'

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    // 处理注释
    if (!inString && !inComment) {
      if (char === '-' && nextChar === '-') {
        inComment = true;
        commentType = 'line';
        i++;
        continue;
      }
      if (char === '/' && nextChar === '*') {
        inComment = true;
        commentType = 'block';
        i++;
        continue;
      }
    } else if (inComment) {
      if (commentType === 'line' && char === '\n') {
        inComment = false;
      } else if (commentType === 'block' && char === '*' && nextChar === '/') {
        inComment = false;
        i++;
      }
      continue;
    }

    // 处理字符串
    if (!inComment) {
      if (!inString && (char === "'" || char === '"' || char === '`')) {
        inString = true;
        stringChar = char;
        current += char;
        continue;
      } else if (inString && char === stringChar) {
        // 检查是否是转义
        if (content[i - 1] !== '\\') {
          inString = false;
          stringChar = '';
        }
        current += char;
        continue;
      }
    }

    current += char;

    if (!inString && char === ';') {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = '';
    }
  }

  const trimmed = current.trim();
  if (trimmed) {
    statements.push(trimmed);
  }

  return statements;
}

export function RunSqlFileDialog({
  open,
  connectionId,
  database,
  onCancel,
  onSuccess,
}: RunSqlFileDialogProps) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalStatements, setTotalStatements] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setProgress(0);

    try {
      const content = await file.text();
      const statements = splitSqlStatements(content);
      setTotalStatements(statements.length);

      let success = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let i = 0; i < statements.length; i++) {
        const sql = statements[i];
        try {
          await api.executeDDL(connectionId, sql, database);
          success++;
        } catch (err: any) {
          failed++;
          errors.push(`语句 ${i + 1}: ${err.message || err}`);
        }
        setProgress(Math.round(((i + 1) / statements.length) * 100));
      }

      if (failed > 0) {
        message.warning(`执行完毕: 成功 ${success}, 失败 ${failed}`);
        console.error('SQL 执行错误:', errors.slice(0, 10));
      } else {
        message.success(`执行完毕: 成功 ${success} 条语句`);
      }

      onSuccess();
    } catch (err: any) {
      message.error(`执行失败：${err.message || err}`);
    } finally {
      setLoading(false);
      setProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <Modal
      title="运行 SQL 文件"
      open={open}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={loading}>
          取消
        </Button>,
        <Button
          key="select"
          type="primary"
          loading={loading}
          onClick={() => fileInputRef.current?.click()}
        >
          选择 SQL 文件
        </Button>,
      ]}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".sql"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {loading && (
        <div style={{ marginTop: 16 }}>
          <Progress percent={progress} />
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            正在执行 {totalStatements} 条 SQL 语句...
          </p>
        </div>
      )}

      {!loading && (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>
          点击"选择 SQL 文件"按钮，选择要执行的 .sql 文件
        </p>
      )}
    </Modal>
  );
}
