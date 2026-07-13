import React, { useState, useRef, useEffect } from 'react';
import { Button, Select, Input, Space, Tooltip, message } from 'antd';
import {
  RobotOutlined,
  TranslationOutlined,
  BulbOutlined,
  CodeOutlined,
  LoadingOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAIStore } from '../stores/aiStore';
import { streamAITask } from '../services/aiService';
import type { DatabaseType } from '../types/api';

const { TextArea } = Input;

// 可选的 SQL 方言目标
const DIALECT_OPTIONS = [
  { label: 'MySQL', value: 'MySQL' },
  { label: 'PostgreSQL', value: 'PostgreSQL' },
  { label: 'Oracle', value: 'Oracle' },
  { label: 'SQL Server', value: 'SQL Server' },
  { label: 'SQLite', value: 'SQLite' },
  { label: '达梦 (DM)', value: 'DM' },
];

export interface AIPanelProps {
  /** 当前 SQL 文本（从编辑器获取） */
  sql: string;
  /** 当前数据库类型 */
  dbType?: DatabaseType;
  /** 将 AI 生成的 SQL 插入到编辑器 */
  onInsertSQL: (sql: string) => void;
  /** 替换编辑器全部内容 */
  onReplaceSQL: (sql: string) => void;
  /** 获取当前表结构信息（可选，用于 NL→SQL） */
  getTableInfo?: () => string;
}

type AITask = 'convert' | 'explain' | 'generate';

export function AIPanel({ sql, dbType, onInsertSQL, onReplaceSQL, getTableInfo }: AIPanelProps) {
  const { t } = useTranslation();
  const ready = useAIStore((s) => s.ready);
  const enabled = useAIStore((s) => s.enabled);
  const checkStatus = useAIStore((s) => s.checkStatus);

  const [activeTask, setActiveTask] = useState<AITask | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [output, setOutput] = useState('');
  const [targetDialect, setTargetDialect] = useState('MySQL');
  const [naturalInput, setNaturalInput] = useState('');
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);

  // 应用启动时检查 AI 状态
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // 流式输出时自动滚动到底部
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const dbTypeStr = dbType || 'MySQL';

  const handleTask = async (task: AITask) => {
    if (!ready) {
      message.warning(t('common.aiSettings.notConfigured'));
      return;
    }

    // 输入校验
    if (task === 'convert' && !sql.trim()) {
      message.warning(t('common.aiTask.sqlEmpty'));
      return;
    }
    if (task === 'explain' && !sql.trim()) {
      message.warning(t('common.aiTask.sqlEmpty'));
      return;
    }
    if (task === 'generate' && !naturalInput.trim()) {
      message.warning(t('common.aiTask.inputEmpty'));
      return;
    }
    if (task === 'convert' && !targetDialect) {
      message.warning(t('common.aiTask.targetEmpty'));
      return;
    }

    setActiveTask(task);
    setStreaming(true);
    setOutput('');
    setCopied(false);

    try {
      let taskId: string;
      let req: Parameters<typeof streamAITask>[0];

      if (task === 'convert') {
        taskId = 'sql-convert';
        req = {
          taskId,
          sql,
          sourceDialect: dbTypeStr,
          targetDialect,
        };
      } else if (task === 'explain') {
        taskId = 'sql-explain';
        req = {
          taskId,
          sql,
          databaseType: dbTypeStr,
        };
      } else {
        taskId = 'sql-generate';
        req = {
          taskId,
          naturalInput,
          databaseType: dbTypeStr,
          tableInfo: getTableInfo?.(),
        };
      }

      await streamAITask(req, (chunk) => {
        setOutput((prev) => prev + chunk);
      });
    } catch (err) {
      setOutput((prev) => prev + `\n\n[Error] ${String(err)}`);
    } finally {
      setStreaming(false);
    }
  };

  const extractSQL = (text: string): string => {
    // 提取第一个 sql 代码块
    const match = text.match(/```(?:sql)?\s*\n([\s\S]*?)\n```/);
    return match ? match[1].trim() : text.trim();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canInsert = activeTask === 'convert' || activeTask === 'generate';

  // 未启用时显示提示 + 去设置按钮
  if (!enabled || !ready) {
    return (
      <div
        style={{
          padding: 24,
          color: 'var(--text-secondary)',
          fontSize: 12,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <RobotOutlined style={{ fontSize: 32, color: 'var(--text-tertiary)' }} />
        <div>{t('common.aiSettings.notConfigured')}</div>
        <Button
          type="primary"
          ghost
          size="small"
          icon={<SettingOutlined />}
          onClick={() => window.dispatchEvent(new CustomEvent('menu-action', { detail: { action: 'options' } }))}
        >
          {t('common.aiSettings.goToSettings')}
        </Button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 操作区 */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        {/* 方言转换 */}
        <div style={{ marginBottom: 8 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Select
              value={targetDialect}
              onChange={setTargetDialect}
              options={DIALECT_OPTIONS}
              style={{ flex: 1, minWidth: 0 }}
              size="small"
            />
            <Button
              icon={streaming && activeTask === 'convert' ? <LoadingOutlined /> : <TranslationOutlined />}
              onClick={() => handleTask('convert')}
              disabled={streaming}
              size="small"
            >
              {t('common.aiTask.convertDialect')}
            </Button>
          </Space.Compact>
        </div>

        {/* 解释/优化 */}
        <div style={{ marginBottom: 8 }}>
          <Button
            icon={streaming && activeTask === 'explain' ? <LoadingOutlined /> : <BulbOutlined />}
            onClick={() => handleTask('explain')}
            disabled={streaming}
            size="small"
            block
          >
            {t('common.aiTask.explain')}
          </Button>
        </div>

        {/* NL → SQL */}
        <div>
          <TextArea
            value={naturalInput}
            onChange={(e) => setNaturalInput(e.target.value)}
            placeholder={t('common.aiTask.naturalInputPlaceholder')}
            autoSize={{ minRows: 2, maxRows: 4 }}
            size="small"
            style={{ marginBottom: 4 }}
          />
          <Button
            type="primary"
            icon={streaming && activeTask === 'generate' ? <LoadingOutlined /> : <CodeOutlined />}
            onClick={() => handleTask('generate')}
            disabled={streaming}
            size="small"
            block
          >
            {t('common.aiTask.generateBtn')}
          </Button>
        </div>
      </div>

      {/* 输出区 */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {output && (
          <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>
            <Space size="small">
              {streaming && (
                <span style={{ fontSize: 11, color: 'var(--color-primary)' }}>
                  <LoadingOutlined /> {t('common.aiTask.streaming')}
                </span>
              )}
              <Tooltip title={t('common.copy')}>
                <Button size="small" type="text" icon={copied ? <CheckCircleOutlined /> : <CopyOutlined />} onClick={handleCopy} />
              </Tooltip>
              {canInsert && !streaming && (
                <>
                  <Button
                    size="small"
                    type="link"
                    onClick={() => onInsertSQL('\n' + extractSQL(output) + '\n')}
                  >
                    {t('common.aiTask.insertToEditor')}
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    onClick={() => onReplaceSQL(extractSQL(output))}
                  >
                    {t('common.replace')}
                  </Button>
                </>
              )}
            </Space>
          </div>
        )}
        <pre
          ref={outputRef}
          style={{
            flex: 1,
            margin: 0,
            padding: '8px 12px',
            overflow: 'auto',
            fontSize: 12,
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--text-primary)',
            background: 'var(--background-card)',
          }}
        >
          {output || <span style={{ color: 'var(--text-tertiary)' }}>{t('common.aiTask.outputPlaceholder')}</span>}
        </pre>
      </div>
    </div>
  );
}
