import { describe, it, expect, vi } from 'vitest';

const downloadBlobMock = vi.fn();

vi.mock('../utils/exportUtils', () => ({
  exportToExcel: vi.fn((data: any[], columns?: any[], options?: any) => {
    if (data.length === 0) throw new Error('没有数据可导出');
    return {
      filename: options?.filename || 'export.xlsx',
      sheetName: options?.sheetName || 'Sheet1',
    };
  }),
  exportToCSV: vi.fn((data: any[], columns?: any[], options?: any) => {
    if (data.length === 0) throw new Error('没有数据可导出');
    return { filename: options?.filename || 'export.csv' };
  }),
  exportToJSON: vi.fn((data: any[], options?: any) => {
    if (data.length === 0) throw new Error('没有数据可导出');
    return { filename: options?.filename || 'export.json' };
  }),
  exportToTXT: vi.fn((data: any[], columns?: any[], options?: any) => {
    if (data.length === 0) throw new Error('没有数据可导出');
    return { filename: options?.filename || 'export.txt' };
  }),
  exportToXML: vi.fn((data: any[], columns?: any[], options?: any) => {
    if (data.length === 0) throw new Error('没有数据可导出');
    return { filename: options?.filename || 'export.xml' };
  }),
  exportToMarkdown: vi.fn((data: any[], columns?: any[], options?: any) => {
    if (data.length === 0) throw new Error('没有数据可导出');
    return { filename: options?.filename || 'export.md' };
  }),
}));

const escapeTxt = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes('\t') || str.includes('\n') || str.includes('\r')) {
    return str.replace(/\t/g, ' ').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  }
  return str;
};

const escapeXml = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const sanitizeXmlTag = (name: string): string => name.replace(/[^a-zA-Z0-9_\u4e00-\u9fff.-]/g, '_');

const escapeMd = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
};

describe('escapeTxt', () => {
  it('handles null and undefined', () => {
    expect(escapeTxt(null)).toBe('');
    expect(escapeTxt(undefined)).toBe('');
  });

  it('replaces tabs with spaces', () => {
    expect(escapeTxt('a\tb')).toBe('a b');
  });

  it('replaces newlines with \\n', () => {
    expect(escapeTxt('a\nb')).toBe('a\\nb');
  });

  it('replaces carriage returns with \\r', () => {
    expect(escapeTxt('a\r\nb')).toBe('a\\r\\nb');
  });

  it('returns unchanged for safe strings', () => {
    expect(escapeTxt('hello world')).toBe('hello world');
  });
});

describe('escapeXml', () => {
  it('escapes ampersand', () => {
    expect(escapeXml('a&b')).toBe('a&amp;b');
  });

  it('escapes less-than', () => {
    expect(escapeXml('a<b')).toBe('a&lt;b');
  });

  it('escapes greater-than', () => {
    expect(escapeXml('a>b')).toBe('a&gt;b');
  });

  it('escapes double quotes', () => {
    expect(escapeXml('a"b')).toBe('a&quot;b');
  });

  it('escapes single quotes', () => {
    expect(escapeXml("a'b")).toBe('a&apos;b');
  });

  it('handles null and undefined', () => {
    expect(escapeXml(null)).toBe('');
    expect(escapeXml(undefined)).toBe('');
  });
});

describe('sanitizeXmlTag', () => {
  it('keeps valid characters', () => {
    expect(sanitizeXmlTag('valid_tag-1')).toBe('valid_tag-1');
  });

  it('replaces invalid characters with underscore', () => {
    expect(sanitizeXmlTag('my tag!')).toBe('my_tag_');
  });

  it('handles special XML characters', () => {
    expect(sanitizeXmlTag('<tag>')).toBe('_tag_');
  });

  it('preserves hyphens and dots in XML tags', () => {
    expect(sanitizeXmlTag('my-tag.1')).toBe('my-tag.1');
  });

  it('preserves Chinese characters', () => {
    expect(sanitizeXmlTag('用户')).toBe('用户');
  });
});

describe('escapeMd', () => {
  it('escapes pipes', () => {
    expect(escapeMd('a|b')).toBe('a\\|b');
  });

  it('replaces newlines with <br>', () => {
    expect(escapeMd('a\nb')).toBe('a<br>b');
  });

  it('handles null and undefined', () => {
    expect(escapeMd(null)).toBe('');
    expect(escapeMd(undefined)).toBe('');
  });

  it('returns unchanged for safe strings', () => {
    expect(escapeMd('hello')).toBe('hello');
  });
});
