package billimport

import (
	"encoding/csv"
	"fmt"
	"strings"
)

// Alipay csv layout (header at a variable offset after a preamble):
//
//	交易时间,交易分类,对方账号,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注
//
// Column order is stable across exports, so we index by header name to be
// resilient to future column additions.
const (
	alipayColTime    = "交易时间"
	alipayColCategry = "交易分类"
	alipayColCounter = "对方账号"
	alipayColDir     = "收/支"
	alipayColAmount  = "金额"
	alipayColStatus  = "交易状态"
	alipayColOrderID = "交易订单号"
)

func parseAlipay(data []byte) (*Result, error) {
	text, err := decodeGBK(data)
	if err != nil {
		return nil, err
	}

	lines := strings.Split(text, "\n")
	headerIdx := -1
	for i, line := range lines {
		if strings.Contains(line, alipayColTime) && strings.Contains(line, alipayColDir) {
			headerIdx = i
			break
		}
	}
	if headerIdx < 0 {
		return nil, fmt.Errorf("未找到支付宝账单表头，请确认文件是支付宝交易明细")
	}

	// Re-join from the header so encoding/csv handles quoted commas correctly.
	body := strings.Join(lines[headerIdx:], "\n")
	reader := csv.NewReader(strings.NewReader(body))
	reader.FieldsPerRecord = -1 // Alipay appends a trailing empty column
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("解析支付宝账单失败: %w", err)
	}
	if len(records) == 0 {
		return &Result{Source: SourceAlipay, Drafts: []Draft{}}, nil
	}

	col := headerColumns(records[0])
	return buildAlipayDrafts(records[1:], col)
}

// headerColumns maps a trimmed header name to its column index so downstream
// lookups are name-based rather than positional.
func headerColumns(header []string) map[string]int {
	col := make(map[string]int, len(header))
	for i, name := range header {
		col[cleanCell(name)] = i
	}
	return col
}

// cleanCell trims whitespace and the trailing tab/spaces Alipay pads into
// order-number cells.
func cleanCell(s string) string {
	return strings.TrimSpace(strings.Trim(s, "\t"))
}

func at(row []string, col map[string]int, name string) string {
	if idx, ok := col[name]; ok && idx < len(row) {
		return cleanCell(row[idx])
	}
	return ""
}

func buildAlipayDrafts(rows [][]string, col map[string]int) (*Result, error) {
	result := &Result{Source: SourceAlipay, Drafts: make([]Draft, 0, len(rows))}
	for _, row := range rows {
		if len(row) == 0 || strings.TrimSpace(strings.Join(row, "")) == "" {
			continue
		}

		// Every row is recorded. classify decides its type and whether it
		// counts toward totals; only genuinely unparseable rows (bad amount or
		// date) are dropped as Invalid.
		cls := classify(at(row, col, alipayColDir), at(row, col, alipayColStatus))

		amountCents, err := parseAmountCents(at(row, col, alipayColAmount))
		if err != nil || amountCents < 0 {
			result.Invalid++
			continue
		}

		occurredAt := at(row, col, alipayColTime)
		date, timeLabel := splitDateTime(occurredAt)
		if date == "" {
			result.Invalid++
			continue
		}

		category := at(row, col, alipayColCategry)
		counter := at(row, col, alipayColCounter)
		orderID := at(row, col, alipayColOrderID)

		result.Drafts = append(result.Drafts, Draft{
			Fingerprint:       makeFingerprint(SourceAlipay, orderID, occurredAt, amountCents),
			Source:            SourceAlipay,
			Type:              cls.entryType,
			AmountCents:       amountCents,
			Purpose:           buildPurpose(category, counter, ""),
			Date:              date,
			TimeLabel:         timeLabel,
			Note:              "支付宝导入",
			CountsTowardTotal: cls.countsTowardTotal,
		})
	}
	return result, nil
}
