import { describe, it, expect } from 'vitest';
import { escapeSqlValue, escapeSqlIdentifier, splitSqlStatements, getSqlStatementRanges } from '../../utils/sqlUtils';

describe('escapeSqlValue', () => {
  it('escapes backslashes', () => {
    expect(escapeSqlValue('C:\\path')).toBe("'C:\\\\path'");
  });

  it('escapes single quotes', () => {
    expect(escapeSqlValue("it's")).toBe("'it''s'");
  });

  it('escapes both backslashes and quotes', () => {
    expect(escapeSqlValue("C:\\it's")).toBe("'C:\\\\it''s'");
  });

  it('returns NULL for null', () => {
    expect(escapeSqlValue(null)).toBe('NULL');
  });

  it('returns NULL for undefined', () => {
    expect(escapeSqlValue(undefined)).toBe('NULL');
  });

  it('returns empty quoted string for empty string (MySQL default)', () => {
    expect(escapeSqlValue('')).toBe("''");
  });

  it('returns NULL for empty string in Oracle', () => {
    expect(escapeSqlValue('', 'oracle')).toBe('NULL');
  });

  it('handles string with only special chars', () => {
    expect(escapeSqlValue("''")).toBe("''''''");
  });
});

describe('escapeSqlIdentifier', () => {
  it('escapes backticks for MySQL', () => {
    expect(escapeSqlIdentifier('my`table', 'mysql')).toBe('`my``table`');
  });

  it('escapes double quotes for PostgreSQL', () => {
    expect(escapeSqlIdentifier('my"table', 'postgresql')).toBe('"my""table"');
  });

  it('escapes brackets for SQL Server', () => {
    expect(escapeSqlIdentifier('my]table', 'sqlserver')).toBe('[my]]table]');
  });

  it('returns wrapped for safe identifiers', () => {
    expect(escapeSqlIdentifier('my_table', 'mysql')).toBe('`my_table`');
  });

  it('handles empty string', () => {
    expect(escapeSqlIdentifier('')).toBe('``');
  });

  it('uses backticks by default', () => {
    expect(escapeSqlIdentifier('test')).toBe('`test`');
  });
});

describe('splitSqlStatements', () => {
  it('splits multiple statements', () => {
    const sql = 'SELECT * FROM users; INSERT INTO users VALUES (1);';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('SELECT * FROM users');
    expect(result[1]).toBe('INSERT INTO users VALUES (1)');
  });

  it('handles single statement without trailing semicolon', () => {
    const sql = 'SELECT * FROM users';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('SELECT * FROM users');
  });

  it('ignores semicolons inside strings', () => {
    const sql = "SELECT * FROM users WHERE name = 'John;Smith';";
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('John;Smith');
  });

  it('handles both single and double quoted strings', () => {
    const sql = 'SELECT * FROM users WHERE name = "John;Smith";';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(1);
  });

  it('handles backtick quoted strings', () => {
    const sql = 'SELECT * FROM `table`;';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(1);
  });

  it('ignores semicolons in line comments', () => {
    const sql = 'SELECT * FROM users; -- comment; not executed';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('SELECT * FROM users');
    expect(result[1]).toBe('-- comment; not executed');
  });

  it('ignores semicolons in block comments', () => {
    const sql = 'SELECT /* comment; not executed; */ * FROM users; INSERT INTO t VALUES (1);';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('/* comment; not executed; */');
  });

  it('handles escaped characters in strings', () => {
    const sql = "SELECT * FROM users WHERE name = 'it\\'s';";
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(1);
  });

  it('handles empty statements', () => {
    const sql = 'SELECT * FROM users;;;INSERT INTO t VALUES (1);';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
  });

  it('handles whitespace-only statements', () => {
    const sql = 'SELECT * FROM users;   ;INSERT INTO t VALUES (1);';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
  });

  it('handles multiline statements', () => {
    const sql = `SELECT *
FROM users
WHERE id = 1;`;
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('FROM users');
  });

  it('handles nested block comments', () => {
    const sql = 'SELECT /* comment */ * FROM users;';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(1);
  });

  it('returns empty array for empty string', () => {
    const result = splitSqlStatements('');
    expect(result).toHaveLength(0);
  });

  it('preserves semicolons in string values', () => {
    const sql = "INSERT INTO users (name) VALUES ('a;b'); SELECT * FROM users;";
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('a;b');
  });
});

describe('splitSqlStatements - DELIMITER 指令', () => {
  it('delimiter // 下存储过程体作为单条语句，体内分号不切分', () => {
    const script = [
      'drop procedure if exists upg;',
      'delimiter //',
      'create procedure upg()',
      'BEGIN',
      '    if NOT exists(select 1) then',
      "        alter table t add column c int comment '含;分号';",
      '    end if;',
      'end;//',
      'delimiter ;',
      'call upg();',
      'drop procedure if exists upg;',
    ].join('\n');
    const result = splitSqlStatements(script);
    expect(result).toHaveLength(4);
    expect(result[0]).toBe('drop procedure if exists upg');
    expect(result[1].startsWith('create procedure upg()')).toBe(true);
    expect(result[1].endsWith('end;')); // 结束符前的分号按 mysql CLI 语义保留
    expect(result[1]).toContain('end if;');
    expect(result[2]).toBe('call upg()');
    expect(result[3]).toBe('drop procedure if exists upg');
  });

  it('结束符可紧贴语句结尾（END$$，无空白分隔）', () => {
    const script = 'DELIMITER $$\ncreate trigger trg before insert on t for each row begin set new.a = 1; end$$\nDELIMITER ;\nselect 1;';
    const result = splitSqlStatements(script);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('create trigger trg before insert on t for each row begin set new.a = 1; end');
    expect(result[1]).toBe('select 1');
  });

  it('指令大小写不敏感，$$ 与 // 均支持', () => {
    const script = 'DELIMITER $$\ncreate function f() returns int begin return 1; end$$\ndelimiter ;\nselect f();';
    const result = splitSqlStatements(script);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('return 1;');
    expect(result[1]).toBe('select f()');
  });

  it('指令行不产生语句，可连续出现', () => {
    const script = 'delimiter //\ndelimiter $$\nselect 1$$\ndelimiter ;\nselect 2;';
    const result = splitSqlStatements(script);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('select 1');
    expect(result[1]).toBe('select 2');
  });

  it('语句中间出现 delimiter 单词不触发指令（仅语句边界识别）', () => {
    const sql = "select 'delimiter //' as v from t where col = 'x';\ninsert into t values (1);";
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("'delimiter //'");
  });

  it('语句边界后的注释与空白之后仍能识别指令', () => {
    const script = 'select 1;\n-- 切换结束符\ndelimiter //\ncreate procedure p() begin select 2; end//\ndelimiter ;';
    const result = splitSqlStatements(script);
    expect(result).toHaveLength(2);
    // 边界注释随下一条语句携带（与默认模式下注释保留在语句内的行为一致，执行无害）
    expect(result[1]).toContain('create procedure p()');
    expect(result[1]).toContain('-- 切换结束符');
  });

  it('自定义结束符不匹配字符串与注释内的同名文本', () => {
    const script = 'delimiter //\ncreate procedure p() begin -- 注释里有 // 网址\n select "a//b" as v; end//\ndelimiter ;';
    const result = splitSqlStatements(script);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('"a//b"');
  });

  it('最后一个未以结束符收尾的语句仍被保留', () => {
    const script = 'delimiter //\ncreate procedure p() begin select 1; end//\nselect 2';
    const result = splitSqlStatements(script);
    expect(result).toHaveLength(2);
    expect(result[1]).toBe('select 2');
  });
});

describe('getSqlStatementRanges - 带偏移的语句切分', () => {
  it('偏移指向原文中 trim 后的语句体', () => {
    const sql = '  select 1;  \n\n  select 2;  ';
    const ranges = getSqlStatementRanges(sql);
    expect(ranges).toHaveLength(2);
    expect(sql.slice(ranges[0].startOffset, ranges[0].endOffset)).toBe('select 1');
    expect(sql.slice(ranges[1].startOffset, ranges[1].endOffset)).toBe('select 2');
  });

  it('字符串内的分号不产生切分偏移', () => {
    const sql = "insert into t values ('a;b');\nselect 2";
    const ranges = getSqlStatementRanges(sql);
    expect(ranges).toHaveLength(2);
    expect(ranges[0].text).toContain("'a;b'");
    expect(ranges[1].text).toBe('select 2');
  });

  it('与 splitSqlStatements 结果保持一致（同一扫描器）', () => {
    const script = "-- header\nselect 1;\ndelimiter //\ncreate procedure p() begin select 1; end//\ndelimiter ;\ncall p()//".replace(
      /\/\/$/m,
      ';//'
    );
    const a = splitSqlStatements(script);
    const b = getSqlStatementRanges(script).map((r) => r.text);
    expect(b).toEqual(a);
  });

  it('DELIMITER 过程脚本：gutter 偏移落在 create 和 call 的起始处', () => {
    const script = 'drop procedure if exists p;\ndelimiter //\ncreate procedure p() begin\n  select 1;\nend//\ndelimiter ;\ncall p();';
    const ranges = getSqlStatementRanges(script);
    expect(ranges).toHaveLength(3);
    expect(script.startsWith('create procedure', ranges[1].startOffset)).toBe(true);
    expect(script.startsWith('call', ranges[2].startOffset)).toBe(true);
  });
});
