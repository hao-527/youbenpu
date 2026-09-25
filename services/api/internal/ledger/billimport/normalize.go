package billimport

import "strings"

// splitDateTime splits "2026-09-20 18:04:24" into an ISO date and an HH:MM
// label matching the ledger's time_label convention.
func splitDateTime(raw string) (date, timeLabel string) {
	raw = strings.TrimSpace(raw)
	parts := strings.SplitN(raw, " ", 2)
	if len(parts) == 0 || len(parts[0]) < 10 {
		return "", ""
	}
	date = parts[0][:10]
	if len(parts) == 2 && len(parts[1]) >= 5 {
		timeLabel = parts[1][:5]
	}
	return date, timeLabel
}

// buildPurpose composes the ledger "purpose" text from the bill's own fields,
// keeping the original information (no category mapping). It joins the parts
// that are present with " · " and drops Alipay's "/" placeholder counterparty.
// The ledger purpose column is capped at 80 runes, so we truncate defensively.
func buildPurpose(category, counterparty, product string) string {
	parts := make([]string, 0, 3)
	for _, p := range []string{category, counterparty, product} {
		p = strings.TrimSpace(p)
		if p == "" || p == "/" {
			continue
		}
		if !contains(parts, p) {
			parts = append(parts, p)
		}
	}
	purpose := strings.Join(parts, " · ")
	if purpose == "" {
		purpose = "未分类支出"
	}
	return truncateRunes(purpose, 80)
}

func contains(list []string, v string) bool {
	for _, item := range list {
		if item == v {
			return true
		}
	}
	return false
}

func truncateRunes(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}
