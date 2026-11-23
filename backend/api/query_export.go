package api

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"

	"idblink/backend/db"
)

// ==================== 查询结果全量服务端导出 ====================
// 场景：SQL 编辑器受「最大行数」限制只取回前 N 行，用户需要导出实际
// 匹配的全部数据（可能几十万行）。这里在服务端单次执行 SQL（不设
// MaxRows），逐行流式写入用户选择的文件，全程不积累结果集内存。
// xlsx 不支持（Excel 本身约 104 万行上限，大数据请用 CSV/JSON）。

// valueToString 导出用的确定性字符串化（与前端结果网格展示语义一致）
func valueToString(v interface{}) string {
	switch cv := convertValue(v).(type) {
	case nil:
		return ""
	case string:
		return cv
	default:
		return fmt.Sprintf("%v", cv)
	}
}

// exportStreamWriter 按格式边写边刷；返回错误即中断
type exportStreamWriter interface {
	writeHeader(cols []string) error
	writeRow(cols []string, row []interface{}) error
	writeFooter() error
}

type csvStreamWriter struct {
	w         *bufio.Writer
	delimiter rune
	first     bool
}

func (s *csvStreamWriter) writeHeader(cols []string) error {
	s.first = true
	return s.writeCsvLine(cols, nil)
}

func (s *csvStreamWriter) writeRow(cols []string, row []interface{}) error {
	return s.writeCsvLine(cols, row)
}

func (s *csvStreamWriter) writeFooter() error { return nil }

func (s *csvStreamWriter) writeCsvLine(cols []string, row []interface{}) error {
	var b strings.Builder
	for i := range cols {
		if i > 0 {
			b.WriteRune(s.delimiter)
		}
		var v interface{}
		if row != nil {
			v = row[i]
		}
		str := valueToString(v)
		// 含分隔符/引号/换行时 CSV 转义
		if strings.ContainsAny(str, fmt.Sprintf("%c\"\n\r", s.delimiter)) {
			str = "\"" + strings.ReplaceAll(str, "\"", "\"\"") + "\""
		}
		b.WriteString(str)
	}
	b.WriteString("\r\n")
	_, err := s.w.WriteString(b.String())
	return err
}

type jsonStreamWriter struct {
	w     *bufio.Writer
	cols  []string
	first bool
}

func (s *jsonStreamWriter) writeHeader(cols []string) error {
	s.cols = cols
	s.first = true
	_, err := s.w.WriteString("[\n")
	return err
}

func (s *jsonStreamWriter) writeRow(_ []string, row []interface{}) error {
	if !s.first {
		if _, err := s.w.WriteString(",\n"); err != nil {
			return err
		}
	}
	s.first = false
	obj := make(map[string]interface{}, len(s.cols))
	for i, c := range s.cols {
		if i < len(row) {
			obj[c] = convertValue(row[i])
		}
	}
	b, err := json.Marshal(obj)
	if err != nil {
		return err
	}
	_, err = s.w.Write(b)
	return err
}

func (s *jsonStreamWriter) writeFooter() error {
	_, err := s.w.WriteString("\n]\n")
	return err
}

type txtStreamWriter struct {
	w    *bufio.Writer
	head bool
}

func (s *txtStreamWriter) writeHeader(cols []string) error {
	s.head = true
	_, err := s.w.WriteString(strings.Join(cols, "\t") + "\n")
	return err
}

func (s *txtStreamWriter) writeRow(_ []string, row []interface{}) error {
	vals := make([]string, len(row))
	for i, v := range row {
		vals[i] = strings.ReplaceAll(strings.ReplaceAll(valueToString(v), "\t", " "), "\n", "\\n")
	}
	_, err := s.w.WriteString(strings.Join(vals, "\t") + "\n")
	return err
}

func (s *txtStreamWriter) writeFooter() error { return nil }

type xmlStreamWriter struct {
	w *bufio.Writer
}

func (s *xmlStreamWriter) writeHeader(cols []string) error {
	_, err := s.w.WriteString("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<data>\n")
	return err
}

func xmlEscape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;")
	return r.Replace(s)
}

func xmlTag(name string) string {
	// 与前端导出一致：非安全字符替换为下划线
	var b strings.Builder
	for _, ch := range name {
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') ||
			ch == '_' || ch == '-' || ch == '.' || (ch >= 0x4e00 && ch <= 0x9fff) {
			b.WriteRune(ch)
		} else {
			b.WriteByte('_')
		}
	}
	return b.String()
}

func (s *xmlStreamWriter) writeRow(cols []string, row []interface{}) error {
	if _, err := s.w.WriteString("  <row>\n"); err != nil {
		return err
	}
	for i, c := range cols {
		if i >= len(row) {
			break
		}
		if _, err := fmt.Fprintf(s.w, "    <%s>%s</%s>\n", xmlTag(c), xmlEscape(valueToString(row[i])), xmlTag(c)); err != nil {
			return err
		}
	}
	_, err := s.w.WriteString("  </row>\n")
	return err
}

func (s *xmlStreamWriter) writeFooter() error {
	_, err := s.w.WriteString("</data>\n")
	return err
}

type mdStreamWriter struct {
	w    *bufio.Writer
	cols []string
	head bool
}

func mdEscape(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "|", "\\|"), "\n", "<br>")
}

func (s *mdStreamWriter) writeHeader(cols []string) error {
	s.cols = cols
	s.head = true
	quoted := make([]string, len(cols))
	for i, c := range cols {
		quoted[i] = mdEscape(c)
	}
	_, err := s.w.WriteString("| " + strings.Join(quoted, " | ") + " |\n| " +
		strings.TrimSuffix(strings.Repeat("--- | ", len(cols)), " ") + "\n")
	return err
}

func (s *mdStreamWriter) writeRow(_ []string, row []interface{}) error {
	vals := make([]string, len(s.cols))
	for i := range s.cols {
		if i < len(row) {
			vals[i] = mdEscape(valueToString(row[i]))
		}
	}
	_, err := s.w.WriteString("| " + strings.Join(vals, " | ") + " |\n")
	return err
}

func (s *mdStreamWriter) writeFooter() error { return nil }

// xlsxStreamWriter excelize 流式写：恒定内存支持大数据量；
// 超过 Excel 单表 1,048,576 行时报错中止，此时 SaveAs 尚未执行、
// 不会产生半截文件
type xlsxStreamWriter struct {
	f      *excelize.File
	sw     *excelize.StreamWriter
	row    int
	maxRow int
}

func newXlsxStreamWriter() (*xlsxStreamWriter, error) {
	f := excelize.NewFile()
	sw, err := f.NewStreamWriter("Sheet1")
	if err != nil {
		_ = f.Close()
		return nil, err
	}
	return &xlsxStreamWriter{f: f, sw: sw, maxRow: excelize.TotalRows}, nil
}

// cellValue 驱动原始值 → Excel 单元格类型（数字/布尔/时间保持原生类型）
func cellValue(v interface{}) interface{} {
	switch t := v.(type) {
	case nil, bool, int64, float64, string, time.Time:
		return t
	case []byte:
		return string(t)
	case int:
		return int64(t)
	case int32:
		return int64(t)
	case float32:
		return float64(t)
	default:
		return fmt.Sprintf("%v", t)
	}
}

func (x *xlsxStreamWriter) writeHeader(cols []string) error {
	x.row = 1
	cell, _ := excelize.CoordinatesToCellName(1, 1)
	vals := make([]interface{}, len(cols))
	for i, c := range cols {
		vals[i] = c
	}
	return x.sw.SetRow(cell, vals)
}

func (x *xlsxStreamWriter) writeRow(_ []string, row []interface{}) error {
	x.row++
	if x.row > x.maxRow {
		return fmt.Errorf("结果超过 Excel 单表行数上限（%d 行），请改用 CSV/JSON 导出", x.maxRow)
	}
	cell, _ := excelize.CoordinatesToCellName(1, x.row)
	vals := make([]interface{}, len(row))
	for i, v := range row {
		vals[i] = cellValue(v)
	}
	return x.sw.SetRow(cell, vals)
}

func (x *xlsxStreamWriter) writeFooter() error { return x.sw.Flush() }

func (x *xlsxStreamWriter) finalize(path string) error { return x.f.SaveAs(path) }

// StreamQueryResultToFile 执行 SQL（无行数上限）并把全部结果流式写入 path。
// 返回导出总行数。单次执行 + 逐行迭代：不在内存积累结果集；
// xlsx 经 excelize StreamWriter 流式生成（超 Excel 行上限时报错，不产半截文件）。
func StreamQueryResultToFile(ctx context.Context, exec db.Executor, dbType, querySQL, format, path string) (int64, error) {
	switch format {
	case "csv", "json", "txt", "xml", "md", "xlsx":
	default:
		return 0, fmt.Errorf("format %q is not supported for server-side export (use csv/json/txt/xml/md/xlsx)", format)
	}

	// 去掉尾分号
	q := strings.TrimSpace(querySQL)
	q = strings.TrimSuffix(q, ";")

	rows, err := exec.QueryContext(ctx, q)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return 0, err
	}

	dir := filepath.Dir(path)
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		return 0, fmt.Errorf("目录不存在：%s", dir)
	}

	// 文本族：直接落盘逐行写；xlsx：excelize 流式（SaveAs 在收尾才执行）
	var sw exportStreamWriter
	var finalize func(path string) error
	if format == "xlsx" {
		xw, err := newXlsxStreamWriter()
		if err != nil {
			return 0, err
		}
		sw = xw
		finalize = xw.finalize
	} else {
		f, err := os.Create(path)
		if err != nil {
			return 0, err
		}
		defer f.Close()
		bw := bufio.NewWriterSize(f, 256*1024)
		switch format {
		case "csv":
			sw = &csvStreamWriter{w: bw, delimiter: ','}
		case "json":
			sw = &jsonStreamWriter{w: bw}
		case "txt":
			sw = &txtStreamWriter{w: bw}
		case "xml":
			sw = &xmlStreamWriter{w: bw}
		case "md":
			sw = &mdStreamWriter{w: bw}
		}
		finalize = func(string) error {
			if err := bw.Flush(); err != nil {
				return err
			}
			return f.Sync()
		}
	}
	if err := sw.writeHeader(cols); err != nil {
		return 0, err
	}

	var total int64
	vals := make([]interface{}, len(cols))
	ptrs := make([]interface{}, len(cols))
	for i := range ptrs {
		ptrs[i] = &vals[i]
	}
	for rows.Next() {
		if err := ctx.Err(); err != nil {
			return total, err
		}
		if err := rows.Scan(ptrs...); err != nil {
			return total, err
		}
		if err := sw.writeRow(cols, vals); err != nil {
			return total, err
		}
		total++
	}
	if err := rows.Err(); err != nil {
		return total, err
	}
	if err := sw.writeFooter(); err != nil {
		return total, err
	}
	if err := finalize(path); err != nil {
		return total, err
	}
	return total, nil
}
