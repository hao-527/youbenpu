package billimport

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

// Source identifies which platform a bill came from.
type Source string

const (
	SourceWeChat Source = "wechat"
	SourceAlipay Source = "alipay"
)

// Draft is one parsed transaction ready for user review. It mirrors the fields
// the ledger create endpoint expects, plus a Fingerprint used to skip rows the
// family has already imported. Amounts are in cents to match ledger_entries.
type Draft struct {
	Fingerprint string `json:"fingerprint"`
	Source      Source `json:"source"`
	Type        string `json:"type"` // "income" | "expense"
	AmountCents int64  `json:"amount_cents"`
	Purpose     string `json:"purpose"`
	Date        string `json:"date"`       // YYYY-MM-DD
	TimeLabel   string `json:"time_label"` // HH:MM
	Note        string `json:"note"`
	// CountsTowardTotal is false for rows that must be recorded for traceability
	// but must not affect the ledger's income/expense totals: closed/unpaid
	// orders, deposit freezes/unfreezes, and platform transfers. Refunds set
	// this true with Type=income so they cancel the original expense.
	CountsTowardTotal bool `json:"counts_toward_total"`
}

// Result is the outcome of parsing an uploaded bill file. Every parseable row
// becomes a Draft (nothing is silently dropped); Invalid counts rows that could
// not be parsed at all (bad amount/date), which are genuinely unusable.
type Result struct {
	Source  Source  `json:"source"`
	Drafts  []Draft `json:"drafts"`
	Invalid int     `json:"invalid"`
}

// makeFingerprint derives a stable identifier from the immutable parts of a
// transaction so the same row imported twice is recognised and skipped. The
// platform order number is globally unique per platform, so source + order id
// is enough; we fall back to time+amount when an order id is absent.
func makeFingerprint(source Source, orderID, occurredAt string, amountCents int64) string {
	key := orderID
	if key == "" {
		key = fmt.Sprintf("%s|%d", occurredAt, amountCents)
	}
	sum := sha256.Sum256([]byte(string(source) + "|" + key))
	return hex.EncodeToString(sum[:16])
}

// parseAmountCents converts a yuan string like "43.80" or "1,142.87" to cents.
// It rounds to the nearest cent to absorb float representation noise.
func parseAmountCents(raw string) (int64, error) {
	clean := strings.ReplaceAll(strings.TrimSpace(raw), ",", "")
	clean = strings.TrimPrefix(clean, "¥")
	clean = strings.TrimPrefix(clean, "￥")
	if clean == "" {
		return 0, fmt.Errorf("empty amount")
	}
	yuan, err := strconv.ParseFloat(clean, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid amount %q: %w", raw, err)
	}
	return int64(math.Round(yuan * 100)), nil
}

// excelSerialToTime converts an Excel date serial (days since 1899-12-30, with
// the fractional part as time of day) to a time.Time. WeChat's xlsx stores the
// transaction time this way rather than as a string.
func excelSerialToTime(serial float64) time.Time {
	base := time.Date(1899, 12, 30, 0, 0, 0, 0, time.UTC)
	days := int(serial)
	frac := serial - float64(days)
	seconds := int(math.Round(frac * 24 * 60 * 60))
	return base.AddDate(0, 0, days).Add(time.Duration(seconds) * time.Second)
}
