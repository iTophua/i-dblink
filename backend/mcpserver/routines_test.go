package mcpserver

import (
	"errors"
	"strings"
	"testing"
)

func TestQualifiedRoutineName(t *testing.T) {
	cases := map[string]struct {
		dbType, schema, name, want string
	}{
		"pg with schema param":        {"postgresql", "sales", "calc_total", "sales.calc_total"},
		"pg without schema":           {"kingbase", "", "calc_total", "calc_total"},
		"pg name already qualified":   {"postgresql", "sales", "hr.calc_total", "hr.calc_total"},
		"mysql ignores schema param":  {"mysql", "sales", "calc_total", "calc_total"},
		"oracle ignores schema param": {"oracle", "sales", "calc_total", "calc_total"},
	}
	for name, c := range cases {
		if got := qualifiedRoutineName(c.dbType, c.schema, c.name); got != c.want {
			t.Errorf("%s: got %q, want %q", name, got, c.want)
		}
	}
}

// 后端找不到例程时返回空串而不是报错：对调用方来说这和「没有定义」分不清
func TestRoutineBodyResult(t *testing.T) {
	missing, _ := routineBodyResult("function", "nope", "postgresql", "", nil)
	if !missing.IsError || !strings.Contains(resultText(missing), `no function named "nope" was found`) ||
		!strings.Contains(resultText(missing), "Call list_functions") || !strings.Contains(resultText(missing), "schema.name") {
		t.Errorf("an empty body must be reported as not found with hints: isError=%v %q", missing.IsError, resultText(missing))
	}
	missingMySQL, _ := routineBodyResult("procedure", "nope", "mysql", "", nil)
	if strings.Contains(resultText(missingMySQL), "PostgreSQL") {
		t.Errorf("the schema hint only applies to the PostgreSQL family: %q", resultText(missingMySQL))
	}

	found, _ := routineBodyResult("function", "f", "postgresql", "CREATE FUNCTION f() RETURNS int AS 'SELECT 1'", nil)
	if found.IsError || !strings.Contains(resultText(found), `"body":"CREATE FUNCTION f() RETURNS int AS 'SELECT 1'"`) {
		t.Errorf("a found body must come back as JSON: isError=%v %q", found.IsError, resultText(found))
	}

	failed, _ := routineBodyResult("function", "f", "postgresql", "", errors.New("connection lost"))
	if !failed.IsError || !strings.Contains(resultText(failed), "connection lost") {
		t.Errorf("a backend error must be reported: %q", resultText(failed))
	}
}
