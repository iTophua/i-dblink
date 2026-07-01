/**
 * SQL 方言检测引擎
 *
 * 通过多特征加权打分识别 SQL 语句的源方言。
 * 置信度 >= 0.6 时返回检测结果，否则返回 null。
 */

import type { DatabaseType } from '../../types/api';

// ── 类型定义 ──────────────────────────────────────────────────────────────

export interface DialectDetection {
  /** 识别出的源方言 */
  dialect: DatabaseType;
  /** 0-1 归一化置信度 */
  confidence: number;
  /** 匹配到的特征列表 */
  matchedFeatures: string[];
}

// ── 特征定义 ──────────────────────────────────────────────────────────────

type Weight = 'high' | 'medium' | 'low';

const WEIGHTS: Record<Weight, number> = { high: 3, medium: 2, low: 1 };

interface DialectFeature {
  id: string;
  label: string;
  /** 指向的方言（取置信度最高的） */
  dialects: DatabaseType[];
  weight: Weight;
  /** 检测正则 */
  pattern: RegExp;
}

/**
 * 特征表 — 每条规则检测一个 SQL 方言特征。
 * 按特征区分度从高到低排列。
 */
const FEATURES: DialectFeature[] = [
  // ── 高权重：标识符引号 ──────────────────────────────────────────────────
  {
    id: 'backtick-identifier',
    label: '反引号标识符',
    dialects: ['mysql', 'mariadb'],
    weight: 'high',
    pattern: /`[a-zA-Z_]\w*`/,
  },
  {
    id: 'bracket-identifier',
    label: '方括号标识符',
    dialects: ['sqlserver'],
    weight: 'high',
    pattern: /\[[a-zA-Z_]\w*\]/,
  },
  {
    id: 'dollar-type-cast',
    label: '::type 类型转换',
    dialects: ['postgresql'],
    weight: 'high',
    pattern: /::\w+/,
  },

  // ── 高权重：分页语法 ────────────────────────────────────────────────────
  {
    id: 'limit-offset',
    label: 'LIMIT/OFFSET 分页',
    dialects: ['mysql', 'mariadb', 'postgresql', 'sqlite'],
    weight: 'high',
    pattern: /\bLIMIT\s+\d+/i,
  },
  {
    id: 'top-n',
    label: 'TOP n 查询',
    dialects: ['sqlserver'],
    weight: 'high',
    pattern: /\bSELECT\s+TOP\s+\d+/i,
  },
  {
    id: 'rownum',
    label: 'ROWNUM 分页',
    dialects: ['oracle', 'dameng'],
    weight: 'high',
    pattern: /\bROWNUM\b/i,
  },
  {
    id: 'offset-fetch',
    label: 'OFFSET/FETCH 分页',
    dialects: ['oracle', 'dameng', 'sqlserver', 'postgresql'],
    weight: 'high',
    pattern: /\bOFFSET\s+\d+\s+ROWS\b/i,
  },

  // ── 高权重：自增语法 ────────────────────────────────────────────────────
  {
    id: 'auto-increment',
    label: 'AUTO_INCREMENT',
    dialects: ['mysql', 'mariadb'],
    weight: 'high',
    pattern: /\bAUTO_INCREMENT\b/i,
  },
  {
    id: 'serial-type',
    label: 'SERIAL/BIGSERIAL',
    dialects: ['postgresql'],
    weight: 'high',
    pattern: /\b(BIG)?SERIAL\b/i,
  },
  {
    id: 'identity-column',
    label: 'IDENTITY 列',
    dialects: ['sqlserver'],
    weight: 'high',
    pattern: /\bIDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)/i,
  },
  {
    id: 'generated-identity',
    label: 'GENERATED AS IDENTITY',
    dialects: ['postgresql', 'oracle', 'dameng'],
    weight: 'medium',
    pattern: /\bGENERATED\s+(ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i,
  },

  // ── 高权重：引擎/存储 ───────────────────────────────────────────────────
  {
    id: 'engine-innodb',
    label: 'ENGINE=InnoDB',
    dialects: ['mysql', 'mariadb'],
    weight: 'high',
    pattern: /\bENGINE\s*=\s*InnoDB\b/i,
  },

  // ── 高权重：字符串函数 ──────────────────────────────────────────────────
  {
    id: 'getdate',
    label: 'GETDATE()',
    dialects: ['sqlserver'],
    weight: 'high',
    pattern: /\bGETDATE\s*\(\s*\)/i,
  },
  {
    id: 'sysdate',
    label: 'SYSDATE',
    dialects: ['oracle', 'dameng'],
    weight: 'high',
    pattern: /\bSYSDATE\b/i,
  },

  // ── 高权重：特殊语法 ────────────────────────────────────────────────────
  {
    id: 'go-batch',
    label: 'GO 批分隔符',
    dialects: ['sqlserver'],
    weight: 'high',
    pattern: /^\s*GO\s*$/m,
  },
  {
    id: 'dollar-quote',
    label: '$$ 函数体',
    dialects: ['postgresql'],
    weight: 'high',
    pattern: /\$\$/,
  },
  // pg-type-cast 已合并到 dollar-type-cast，避免双倍计分
  {
    id: 'double-pipe-concat',
    label: '|| 字符串连接',
    dialects: ['postgresql', 'oracle', 'dameng', 'sqlite'],
    weight: 'medium',
    pattern: /\|\|/,
  },

  // ── 中权重：函数 ────────────────────────────────────────────────────────
  {
    id: 'ifnull',
    label: 'IFNULL()',
    dialects: ['mysql', 'mariadb', 'sqlite'],
    weight: 'medium',
    pattern: /\bIFNULL\s*\(/i,
  },
  {
    id: 'nvl',
    label: 'NVL()',
    dialects: ['oracle', 'dameng'],
    weight: 'medium',
    pattern: /\bNVL\s*\(/i,
  },
  {
    id: 'isnull-func',
    label: 'ISNULL()',
    dialects: ['sqlserver'],
    weight: 'medium',
    pattern: /\bISNULL\s*\(/i,
  },
  {
    id: 'now-func',
    label: 'NOW()',
    dialects: ['mysql', 'mariadb', 'postgresql'],
    weight: 'medium',
    pattern: /\bNOW\s*\(\s*\)/i,
  },
  {
    id: 'concat-func',
    label: 'CONCAT()',
    dialects: ['mysql', 'mariadb', 'sqlserver'],
    weight: 'medium',
    pattern: /\bCONCAT\s*\(/i,
  },
  {
    id: 'group-concat',
    label: 'GROUP_CONCAT()',
    dialects: ['mysql', 'mariadb'],
    weight: 'medium',
    pattern: /\bGROUP_CONCAT\s*\(/i,
  },
  {
    id: 'string-agg',
    label: 'STRING_AGG()',
    dialects: ['postgresql'],
    weight: 'medium',
    pattern: /\bSTRING_AGG\s*\(/i,
  },
  {
    id: 'if-func',
    label: 'IF() 函数',
    dialects: ['mysql', 'mariadb'],
    weight: 'medium',
    pattern: /\bIF\s*\([^)]+,\s*[^)]+,\s*[^)]+\)/i,
  },
  {
    id: 'decode-func',
    label: 'DECODE()',
    dialects: ['oracle', 'dameng'],
    weight: 'medium',
    pattern: /\bDECODE\s*\(/i,
  },

  // ── 中权重：数据类型 ────────────────────────────────────────────────────
  {
    id: 'nchar-nvarchar',
    label: 'NVARCHAR/NVARCHAR2',
    dialects: ['sqlserver', 'oracle', 'dameng'],
    weight: 'medium',
    pattern: /\bN?VARCHAR2?\b/i,
  },
  {
    id: 'clob-type',
    label: 'CLOB 数据类型',
    dialects: ['oracle', 'dameng'],
    weight: 'medium',
    pattern: /\bCLOB\b/i,
  },
  {
    id: 'number-type',
    label: 'NUMBER 数据类型',
    dialects: ['oracle', 'dameng'],
    weight: 'medium',
    pattern: /\bNUMBER\s*\(/i,
  },

  // ── 中权重：INSERT 语法 ─────────────────────────────────────────────────
  {
    id: 'insert-ignore',
    label: 'INSERT IGNORE',
    dialects: ['mysql', 'mariadb'],
    weight: 'medium',
    pattern: /\bINSERT\s+IGNORE\b/i,
  },
  {
    id: 'replace-into',
    label: 'REPLACE INTO',
    dialects: ['mysql', 'mariadb'],
    weight: 'medium',
    pattern: /\bREPLACE\s+INTO\b/i,
  },
  {
    id: 'on-conflict',
    label: 'ON CONFLICT',
    dialects: ['postgresql'],
    weight: 'medium',
    pattern: /\bON\s+CONFLICT\b/i,
  },
  {
    id: 'merge-into',
    label: 'MERGE INTO',
    dialects: ['oracle', 'dameng', 'sqlserver'],
    weight: 'medium',
    pattern: /\bMERGE\s+INTO\b/i,
  },

  // ── 中权重：注释语法 ────────────────────────────────────────────────────
  {
    id: 'hash-comment',
    label: '# 单行注释',
    dialects: ['mysql', 'mariadb'],
    weight: 'medium',
    pattern: /(?<=^|\s)#[^!]/m,
  },

  // ── 低权重：SHOW/DESCRIBE ───────────────────────────────────────────────
  {
    id: 'show-tables',
    label: 'SHOW TABLES',
    dialects: ['mysql', 'mariadb'],
    weight: 'low',
    pattern: /\bSHOW\s+TABLES\b/i,
  },
  {
    id: 'describe-table',
    label: 'DESCRIBE 表',
    dialects: ['mysql', 'mariadb'],
    weight: 'low',
    pattern: /\bDESCRIBE\s+\w+/i,
  },
];

// ── 检测引擎 ──────────────────────────────────────────────────────────────

/** 置信度阈值 */
const CONFIDENCE_THRESHOLD = 0.6;

/**
 * 检测 SQL 语句的源方言。
 * 置信度 >= 0.6 时返回结果，否则返回 null。
 */
export function detectSqlDialect(sql: string): DialectDetection | null {
  if (!sql || sql.trim().length < 5) {
    return null;
  }

  const matchedFeatures: string[] = [];
  const scoreMap = new Map<DatabaseType, number>();

  // 初始化所有方言分数
  const allDialects: DatabaseType[] = [
    'mysql',
    'mariadb',
    'postgresql',
    'sqlite',
    'sqlserver',
    'oracle',
    'dameng',
    'kingbase',
    'highgo',
    'vastbase',
  ];
  for (const d of allDialects) {
    scoreMap.set(d, 0);
  }

  // 遍历特征表，匹配则加分
  for (const feature of FEATURES) {
    if (feature.pattern.test(sql)) {
      matchedFeatures.push(feature.label);
      const w = WEIGHTS[feature.weight];
      for (const dialect of feature.dialects) {
        scoreMap.set(dialect, (scoreMap.get(dialect) ?? 0) + w);
      }
    }
  }

  if (matchedFeatures.length === 0) {
    return null;
  }

  // 找到最高分的方言
  let bestDialect: DatabaseType = 'mysql';
  let bestScore = 0;
  for (const [dialect, score] of scoreMap) {
    if (score > bestScore) {
      bestScore = score;
      bestDialect = dialect;
    }
  }

  // 兼容方言合并：mariadb 归入 mysql，dameng 归入 oracle，kingbase/highgo/vastbase 归入 postgresql
  const mergedDialect = mergeCompatibleDialect(bestDialect);
  const maxPossibleScore = FEATURES.reduce((sum, f) => sum + WEIGHTS[f.weight], 0);
  const confidence = Math.min(bestScore / (maxPossibleScore * 0.15), 1);

  if (confidence < CONFIDENCE_THRESHOLD) {
    return null;
  }

  return {
    dialect: mergedDialect,
    confidence: Math.round(confidence * 100) / 100,
    matchedFeatures,
  };
}

/**
 * 将兼容方言合并为主方言
 */
function mergeCompatibleDialect(dialect: DatabaseType): DatabaseType {
  switch (dialect) {
    case 'mariadb':
      return 'mysql';
    case 'dameng':
      return 'oracle';
    case 'kingbase':
    case 'highgo':
    case 'vastbase':
      return 'postgresql';
    default:
      return dialect;
  }
}

/**
 * 数据库版本映射
 */
export const DB_VERSIONS: Record<DatabaseType, string[]> = {
  mysql: ['5.7', '8.0', '8.4', '9.0'],
  mariadb: ['10.5', '10.6', '10.11', '11.0', '11.4'],
  postgresql: ['12', '13', '14', '15', '16', '17'],
  sqlite: ['3.35', '3.36', '3.37', '3.38', '3.39', '3.40', '3.45', '3.46'],
  sqlserver: ['2016', '2017', '2019', '2022'],
  oracle: ['12c', '19c', '21c', '23c'],
  dameng: ['DM8', 'DM16'],
  kingbase: ['V8R3', 'V8R6'],
  highgo: ['HG5', 'HG6'],
  vastbase: ['VB3', 'VB5'],
};
