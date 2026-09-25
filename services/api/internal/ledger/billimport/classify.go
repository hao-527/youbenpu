package billimport

import "strings"

// classification is the result of interpreting a bill row's direction + status:
// what ledger type to record it as, and whether it should affect income/expense
// totals. No row is ever dropped — traceability is the priority — so even money
// that never moved is recorded, just flagged as not counting toward totals.
type classification struct {
	entryType         string // "income" | "expense"
	countsTowardTotal bool
	valid             bool // false only when the row is genuinely unusable
}

// neutralStatuses cover money that did not actually move: an order that was
// created but closed/unpaid, or a deposit that was only frozen/unfrozen. These
// rows are recorded for traceability but excluded from totals.
var neutralStatuses = map[string]struct{}{
	"交易关闭":   {}, // Alipay/WeChat: order closed without payment
	"已关闭":    {},
	"交易超时关闭": {},
	"冻结成功":   {}, // deposit frozen (not spent)
	"解冻成功":   {}, // deposit released
	"已全额退款":  {}, // WeChat: whole order refunded (net zero, but keep as neutral record)
}

// refundStatuses mark money flowing back to the user. We record these as income
// so they cancel the original expense in the totals.
var refundStatuses = map[string]struct{}{
	"退款成功":       {},
	"退款成功（部分退款）": {},
	"部分退款":       {},
	"已退款":        {},
}

// classify interprets a row's 收/支 direction and transaction status. Priority:
// refunds first (money returned), then statuses where no money moved, then the
// plain direction. A refund is recorded as income so it offsets the original
// expense; neutral rows keep their natural type but do not count toward totals.
func classify(direction, status string) classification {
	direction = strings.TrimSpace(direction)
	status = strings.TrimSpace(status)

	if _, ok := refundStatuses[status]; ok {
		return classification{entryType: "income", countsTowardTotal: true, valid: true}
	}
	if _, ok := neutralStatuses[status]; ok {
		return classification{entryType: directionType(direction), countsTowardTotal: false, valid: true}
	}

	switch direction {
	case "支出":
		return classification{entryType: "expense", countsTowardTotal: true, valid: true}
	case "收入":
		return classification{entryType: "income", countsTowardTotal: true, valid: true}
	default: // 不计收支 / 中性交易 / empty — record but do not count
		return classification{entryType: "expense", countsTowardTotal: false, valid: true}
	}
}

// directionType maps a direction to a ledger type, defaulting to expense for
// neutral/unknown directions so a recorded-but-uncounted row still has a type.
func directionType(direction string) string {
	if strings.TrimSpace(direction) == "收入" {
		return "income"
	}
	return "expense"
}
