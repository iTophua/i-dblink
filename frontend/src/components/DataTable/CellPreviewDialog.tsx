import { useState, useCallback } from 'react';
import { Modal, Tabs, Input, Image, Button, Space, message } from 'antd';
import { CopyOutlined, SaveOutlined, EyeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { MenuItemConfig, MenuContext } from '../ContextMenu/types';

interface CellPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  value: unknown;
  columnName: string;
  onSave?: (newValue: string) => void;
}

function toHex(str: string): string {
  const lines: string[] = [];
  for (let i = 0; i < str.length; i += 16) {
    const chunk = str.slice(i, i + 16);
    const hex = Array.from(chunk)
      .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join(' ');
    const ascii = Array.from(chunk)
      .map((c) => {
        const code = c.charCodeAt(0);
        return code >= 32 && code <= 126 ? c : '.';
      })
      .join('');
    const offset = i.toString(16).padStart(8, '0');
    lines.push(`${offset}  ${hex.padEnd(47)}  ${ascii}`);
  }
  return lines.join('\n');
}

function isBase64Image(val: string): boolean {
  if (val.startsWith('data:image/')) return true;
  if (val.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(val.replace(/\s/g, ''))) return true;
  return false;
}

function getImageSrc(val: string): string | null {
  if (val.startsWith('data:image/')) return val;
  if (val.length > 100) return `data:image/png;base64,${val.replace(/\s/g, '')}`;
  return null;
}

export function CellPreviewDialog({ open, onClose, value, columnName, onSave }: CellPreviewDialogProps) {
  const { t } = useTranslation();
  const strVal = value == null ? '' : String(value);
  const [editVal, setEditVal] = useState(strVal);
  const isImage = isBase64Image(strVal);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(editVal);
    message.success(t('common.cellPreview.copied'));
  }, [editVal, t]);

  const handleSave = useCallback(() => {
    onSave?.(editVal);
    onClose();
  }, [editVal, onSave, onClose]);

  const tabItems = [
    {
      key: 'text',
      label: t('common.cellPreview.text'),
      children: (
        <Input.TextArea
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          autoSize={{ minRows: 8, maxRows: 20 }}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
      ),
    },
    {
      key: 'hex',
      label: t('common.cellPreview.hex'),
      children: (
        <Input.TextArea
          value={toHex(editVal)}
          readOnly
          autoSize={{ minRows: 8, maxRows: 20 }}
          style={{ fontFamily: 'monospace', fontSize: 11 }}
        />
      ),
    },
    {
      key: 'image',
      label: t('common.cellPreview.image'),
      children: isImage ? (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <Image
            src={getImageSrc(strVal) || ''}
            alt={t('common.cellPreview.alt')}
            style={{ maxWidth: '100%', maxHeight: 400 }}
            fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjE0Ij5Ob3QgYSB2YWxpZCBpbWFnZTwvdGV4dD48L3N2Zz4="
          />
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
          {t('common.cellPreview.notRecognized')}
        </div>
      ),
    },
  ];

  return (
    <Modal
      title={t('common.cellPreview.title', { columnName })}
      open={open}
      onCancel={onClose}
      footer={
        <Space>
          <Button icon={<CopyOutlined />} size="small" onClick={handleCopy}>
            {t('common.cellPreview.copy')}
          </Button>
          <Button type="primary" icon={<SaveOutlined />} size="small" onClick={handleSave}>
            {t('common.cellPreview.save')}
          </Button>
        </Space>
      }
      width={600}
      transitionName=""
      maskTransitionName=""
    >
      <Tabs items={tabItems} />
    </Modal>
  );
}

export function createPreviewCellItem(
  ctx: MenuContext & { onPreviewCell?: (value: unknown, colName: string, row?: number, col?: number) => void },
  t: (key: string) => string,
  onClose: () => void,
): MenuItemConfig {
  return {
    key: 'preview-cell',
    icon: <EyeOutlined />,
    label: t('common.contextMenu.previewCell'),
    onClick: () => {
      ctx.onPreviewCell?.(ctx.cellValue, ctx.colName || '', ctx.row, ctx.col);
      onClose();
    },
  };
}
