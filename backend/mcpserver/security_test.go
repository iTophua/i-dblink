package mcpserver

import "testing"

func TestIsReadOnlyQuery(t *testing.T) {
	tests := []struct {
		name string
		sql  string
		want bool
	}{
		// 正例
		{"simple select", "SELECT * FROM users", true},
		{"select with semicolon", "SELECT * FROM users;", true},
		{"select lowercase", "select id, name from users where id = 1", true},
		{"with cte", "WITH t AS (SELECT 1) SELECT * FROM t", true},
		{"explain", "EXPLAIN SELECT * FROM users", true},
		{"show tables", "SHOW TABLES", true},
		{"describe", "DESCRIBE users", true},
		{"desc", "DESC users", true},
		{"show databases", "SHOW DATABASES", true},
		{"pragma", "PRAGMA table_info(users)", true},
		{"use database", "USE mydb", true},
		{"table keyword", "TABLE users", true},
		{"complex select", "SELECT u.name, COUNT(*) FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.name HAVING COUNT(*) > 5", true},
		// 注释前缀（剥离后再判定）
		{"line comment then select", "-- 查用户\nSELECT * FROM users", true},
		{"multiple line comments then select", "-- note\n-- note2\nSELECT 1", true},
		{"block comment then select", "/* header */ SELECT * FROM users", true},
		{"multiline block comment", "/*\n * header\n */\nSELECT 1", true},
		{"comment inside select", "SELECT * -- trailing comment\nFROM users", true},
		{"block comment inside select", "SELECT /* cols */ * FROM users", true},
		{"dashes in string literal not comment", "SELECT * FROM t WHERE c = 'a--b' AND d = '/*x*/'", true},
		{"comment hides semicolon", "SELECT 1 -- ; DROP\nFROM t", true},
		{"block comment hides semicolon", "SELECT 1 /* ; */ FROM t", true},

		// 反例
		{"insert", "INSERT INTO users VALUES (1)", false},
		{"update", "UPDATE users SET name = 'a'", false},
		{"delete", "DELETE FROM users WHERE id = 1", false},
		{"drop", "DROP TABLE users", false},
		{"create", "CREATE TABLE t (id INT)", false},
		{"truncate", "TRUNCATE TABLE users", false},
		{"alter", "ALTER TABLE users ADD COLUMN x INT", false},
		{"select into", "SELECT * INTO outfile FROM users", false},
		{"select into var", "SELECT id INTO @var FROM users", false},
		{"multiple statements", "SELECT 1; DROP TABLE users;", false},
		{"semicolon in middle", "SELECT 1; SELECT 2", false},
		{"empty", "", false},
		{"call procedure", "CALL my_proc()", false},
		{"comment hides drop is still rejected", "/* SELECT */ DROP TABLE users", false},
		{"comment only", "-- just a comment\n", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsReadOnlyQuery(tt.sql)
			if got != tt.want {
				t.Errorf("IsReadOnlyQuery(%q) = %v, want %v", tt.sql, got, tt.want)
			}
		})
	}
}

func TestIsDMLStatement(t *testing.T) {
	tests := []struct {
		name string
		sql  string
		want bool
	}{
		// 正例
		{"insert", "INSERT INTO users VALUES (1)", true},
		{"insert into select", "INSERT INTO t SELECT * FROM t2", true},
		{"update", "UPDATE users SET name = 'a' WHERE id = 1", true},
		{"delete", "DELETE FROM users WHERE id = 1", true},
		{"merge", "MERGE INTO target USING source ON ...", true},
		{"lowercase", "insert into users values (1)", true},

		// 反例
		{"select", "SELECT * FROM users", false},
		{"drop", "DROP TABLE users", false},
		{"create", "CREATE TABLE t (id INT)", false},
		{"alter", "ALTER TABLE users ADD COLUMN x INT", false},
		{"truncate", "TRUNCATE TABLE users", false},
		{"with insert", "WITH t AS (SELECT 1) INSERT INTO t2 SELECT * FROM t", false},
		{"empty", "", false},
		{"call", "CALL my_proc()", false},
		// 安全：多语句注入防护
		{"insert with drop", "INSERT INTO t VALUES(1); DROP TABLE users; --", false},
		{"insert with select", "INSERT INTO t VALUES(1); SELECT * FROM users", false},
		{"insert trailing semicolon ok", "INSERT INTO t VALUES(1);", true},
		{"comment then insert", "-- insert more\nINSERT INTO t VALUES(1)", true},
		{"block comment then insert", "/* x */ INSERT INTO t VALUES(1)", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsDMLStatement(tt.sql)
			if got != tt.want {
				t.Errorf("IsDMLStatement(%q) = %v, want %v", tt.sql, got, tt.want)
			}
		})
	}
}

func TestIsDDLStatement(t *testing.T) {
	tests := []struct {
		name string
		sql  string
		want bool
	}{
		{"create", "CREATE TABLE t (id INT)", true},
		{"drop", "DROP TABLE users", true},
		{"alter", "ALTER TABLE users ADD x INT", true},
		{"truncate", "TRUNCATE TABLE users", true},
		{"rename", "RENAME TABLE a TO b", true},
		{"comment then create", "-- init\nCREATE TABLE t (id INT)", true},
		{"select", "SELECT * FROM users", false},
		{"insert", "INSERT INTO users VALUES (1)", false},
		{"empty", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsDDLStatement(tt.sql)
			if got != tt.want {
				t.Errorf("IsDDLStatement(%q) = %v, want %v", tt.sql, got, tt.want)
			}
		})
	}
}
