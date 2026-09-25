package billimport

import (
	"fmt"
	"strconv"
	"strings"
)

// WeChat xlsx layout (header after a preamble of note rows):
//
//	交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注
//
// Unlike Alipay, WeChat has a 商品 (product) column and stores 交易时间 as an
// Excel date serial number.
const (
	wechatColTime    = "交易时间"
	wechatColType    = "交易类型"
	wechatColCounter = "交易对方"
	wechatColProduct = "商品"
	wechatColDir     = "收/支"
	wechatColAmount  = "金额(元)"
	wechatColStatus  = "当前状态"
	wechatColOrderID = "交易单号"
)

func parseWeChat(data []byte) (*Result, error) {
	sheet, err := parseXLSX(data)
	if err != nil {
		return nil, fmt.Errorf("解析微信账单失败: %w", err)
	}

	headerIdx := -1
	for i, row := range sheet.rows {
		if rowContains(row, wechatColTime) && rowContains(row, wechatColDir) {
			headerIdx = i
			break
		}
	}
	if headerIdx < 0 {
		return nil, fmt.Errorf("未找到微信账单表头，请确认文件是微信支付账单")
	}

	col := headerColumns(sheet.rows[headerIdx])
	return buildWeChatDrafts(sheet.rows[headerIdx+1:], col)
}

func rowContains(row []string, target string) bool {
	for _, cell := range row {
		if cleanCell(cell) == target {
			return true
		}
	}
	return false
}

func buildWeChatDrafts(rows [][]string, col map[string]int) (*Result, error) {
	result := &Result{Source: SourceWeChat, Drafts: make([]Draft, 0, len(rows))}
	for _, row := range rows {
		if len(row) == 0 || strings.TrimSpace(strings.Join(row, "")) == "" {
			continue
		}

		// Every row is recorded; classify sets type + whether it counts.
		cls := classify(at(row, col, wechatColDir), at(row, col, wechatColStatus))

		amountCents, err := parseAmountCents(at(row, col, wechatColAmount))
		if err != nil || amountCents < 0 {
			result.Invalid++
			continue
		}

		occurredAt := wechatTime(at(row, col, wechatColTime))
		date, timeLabel := splitDateTime(occurredAt)
		if date == "" {
			result.Invalid++
			continue
		}

		orderID := at(row, col, wechatColOrderID)
		result.Drafts = append(result.Drafts, Draft{
			Fingerprint: makeFingerprint(SourceWeChat, orderID, occurredAt, amountCents),
			Source:      SourceWeChat,
			Type:        cls.entryType,
			AmountCents: amountCents,
			Purpose: buildPurpose(
				at(row, col, wechatColType),
				at(row, col, wechatColCounter),
				at(row, col, wechatColProduct),
			),
			Date:              date,
			TimeLabel:         timeLabel,
			Note:              "微信导入",
			CountsTowardTotal: cls.countsTowardTotal,
		})
	}
	return result, nil
}

// wechatTime normalizes the 交易时间 cell. WeChat stores it as an Excel date
// serial (e.g. "46285.709"), but a UTF-8/string export could also give a
// literal timestamp, so we pass through non-numeric values unchanged.
func wechatTime(raw string) string {
	raw = strings.TrimSpace(raw)
	if serial, err := strconv.ParseFloat(raw, 64); err == nil && serial > 1 {
		return excelSerialToTime(serial).Format("2006-01-02 15:04:05")
	}
	return raw
}
