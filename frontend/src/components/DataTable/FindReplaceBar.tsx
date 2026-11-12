/**
 * FindReplaceBar — Compact find/replace bar for data grids
 *
 * Appears above the data grid with search input, replace input (toggleable),
 * prev/next navigation, match count, and options for case sensitivity, regex, and whole word.
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Input, Button, Tooltip, Space } from 'antd';
import type { InputRef } from 'antd';
import {
  UpOutlined,
  DownOutlined,
  CloseOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../hooks/useThemeColors';

export interface FindMatch {
  row: number;
  col: number;
}

export interface FindReplaceBarProps {
  visible: boolean;
  onClose: () => void;
  matches: FindMatch[];
  currentMatchIndex: number;
  onNavigate: (direction: 'next' | 'prev') => void;
  onSearchChange: (searchText: string, options: FindOptions) => void;
  onReplace?: (match: FindMatch, replacement: string) => void;
  onReplaceAll?: (replacement: string) => void;
}

export interface FindOptions {
  caseSensitive: boolean;
  useRegex: boolean;
  wholeWord: boolean;
}

export function FindReplaceBar({
  visible,
  onClose,
  matches,
  currentMatchIndex,
  onNavigate,
  onSearchChange,
  onReplace,
  onReplaceAll,
}: FindReplaceBarProps) {
  const tc = useThemeColors();
  const { t } = useTranslation();
  const searchRef = useRef<InputRef>(null);
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [replaceVisible, setReplaceVisible] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);

  // Focus search input when bar becomes visible
  useEffect(() => {
    if (visible) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [visible]);

  // Notify parent of search changes
  const options: FindOptions = useMemo(
    () => ({ caseSensitive, useRegex, wholeWord }),
    [caseSensitive, useRegex, wholeWord]
  );

  const lastNotifiedRef = useRef<{ text: string; opts: string }>({ text: '', opts: '' });

  useEffect(() => {
    const optsStr = JSON.stringify(options);
    if (searchText !== lastNotifiedRef.current.text || optsStr !== lastNotifiedRef.current.opts) {
      lastNotifiedRef.current = { text: searchText, opts: optsStr };
      onSearchChange(searchText, options);
    }
  }, [searchText, options, onSearchChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          onNavigate('prev');
        } else {
          onNavigate('next');
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [onNavigate, onClose]
  );

  const toggleButton = (active: boolean, label: string, title: string, onClick: () => void) => (
    <Tooltip title={title} placement="bottom">
      <Button
        size="small"
        type={active ? 'primary' : 'text'}
        onClick={onClick}
        style={{
          height: 22,
          minWidth: 22,
          padding: '0 4px',
          fontSize: 11,
          fontWeight: active ? 600 : 400,
        }}
      >
        {label}
      </Button>
    </Tooltip>
  );

  if (!visible) return null;

  const matchCount = matches.length;
  const matchLabel = matchCount > 0 ? `${currentMatchIndex + 1}/${matchCount}` : t('common.findReplaceBar.noResults', 'No results');

  return (
    <div
      style={{
        height: 'auto',
        padding: '6px 8px',
        background: tc.backgroundCard,
        border: `1px solid ${tc.border}`,
        borderRadius: 8,
        boxShadow: tc.isDark
          ? '0 12px 32px rgba(0, 0, 0, 0.55)'
          : '0 8px 24px rgba(0, 0, 0, 0.12)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Find row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Input
          ref={searchRef}
          size="small"
          placeholder={t('common.findReplaceBar.find', 'Find...')}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            height: 24,
            fontSize: 12,
            flex: 1,
            maxWidth: 260,
          }}
          suffix={
            <span style={{ fontSize: 11, color: matchCount > 0 ? tc.textSecondary : tc.error, whiteSpace: 'nowrap' }}>
              {matchLabel}
            </span>
          }
        />
        <Space size={2} style={{ flexShrink: 0 }}>
          <Tooltip title={t('common.findReplaceBar.previous', 'Previous (Shift+Enter)')} placement="bottom">
            <Button
              size="small"
              type="text"
              icon={<UpOutlined />}
              onClick={() => onNavigate('prev')}
              disabled={matchCount === 0}
              style={{ height: 22, width: 22, padding: 0, fontSize: 10 }}
            />
          </Tooltip>
          <Tooltip title={t('common.findReplaceBar.next', 'Next (Enter)')} placement="bottom">
            <Button
              size="small"
              type="text"
              icon={<DownOutlined />}
              onClick={() => onNavigate('next')}
              disabled={matchCount === 0}
              style={{ height: 22, width: 22, padding: 0, fontSize: 10 }}
            />
          </Tooltip>
        </Space>
        <div style={{ width: 1, height: 16, background: tc.borderLight, margin: '0 2px' }} />
        <Space size={2} style={{ flexShrink: 0 }}>
          {toggleButton(caseSensitive, 'Aa', t('common.findReplaceBar.caseSensitive', 'Case Sensitive'), () => setCaseSensitive(!caseSensitive))}
          {toggleButton(useRegex, '.*', t('common.findReplaceBar.useRegex', 'Use Regex'), () => setUseRegex(!useRegex))}
          {toggleButton(wholeWord, 'W', t('common.findReplaceBar.wholeWord', 'Whole Word'), () => setWholeWord(!wholeWord))}
        </Space>
        <div style={{ width: 1, height: 16, background: tc.borderLight, margin: '0 2px' }} />
        <Tooltip title={replaceVisible ? t('common.findReplaceBar.hideReplace', 'Hide Replace') : t('common.findReplaceBar.showReplace', 'Show Replace')} placement="bottom">
          <Button
            size="small"
            type="text"
            icon={<SwapOutlined />}
            onClick={() => setReplaceVisible(!replaceVisible)}
            style={{ height: 22, width: 22, padding: 0, fontSize: 10 }}
          />
        </Tooltip>
        <Tooltip title={t('common.findReplaceBar.close', 'Close (Escape)')} placement="bottom">
          <Button
            size="small"
            type="text"
            icon={<CloseOutlined />}
            onClick={onClose}
            style={{ height: 22, width: 22, padding: 0, fontSize: 10 }}
          />
        </Tooltip>
      </div>

      {/* Replace row */}
      {replaceVisible && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Input
            size="small"
            placeholder={t('common.findReplaceBar.replace', 'Replace...')}
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              height: 24,
              fontSize: 12,
              flex: 1,
              maxWidth: 260,
            }}
          />
          <Space size={2} style={{ flexShrink: 0 }}>
            <Tooltip title={t('common.findReplaceBar.replaceCurrent', 'Replace Current Match')} placement="bottom">
              <Button
                size="small"
                type="text"
                onClick={() => {
                  if (matchCount > 0 && onReplace) {
                    onReplace(matches[currentMatchIndex], replaceText);
                  }
                }}
                disabled={matchCount === 0}
                style={{ height: 22, fontSize: 11, padding: '0 6px' }}
              >
                {t('common.findReplaceBar.replaceBtn', 'Replace')}
              </Button>
            </Tooltip>
            <Tooltip title={t('common.findReplaceBar.replaceAll', 'Replace All Matches')} placement="bottom">
              <Button
                size="small"
                type="text"
                onClick={() => onReplaceAll?.(replaceText)}
                disabled={matchCount === 0}
                style={{ height: 22, fontSize: 11, padding: '0 6px' }}
              >
                {t('common.findReplaceBar.all', 'All')}
              </Button>
            </Tooltip>
          </Space>
        </div>
      )}
    </div>
  );
}

export default FindReplaceBar;
