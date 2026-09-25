package billimport

import (
	"os"
	"testing"
)

func loadSample(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Skipf("sample %s not present: %v", name, err)
	}
	return data
}

func checkDrafts(t *testing.T, drafts []Draft) (counted, neutral int) {
	t.Helper()
	for i, d := range drafts {
		if d.AmountCents < 0 {
			t.Errorf("draft %d has negative amount %d", i, d.AmountCents)
		}
		if d.Type != "expense" && d.Type != "income" {
			t.Errorf("draft %d has bad type %q", i, d.Type)
		}
		if len(d.Date) != 10 || d.Date[:2] != "20" {
			t.Errorf("draft %d has bad date %q", i, d.Date)
		}
		if d.Purpose == "" {
			t.Errorf("draft %d has empty purpose", i)
		}
		if d.Fingerprint == "" {
			t.Errorf("draft %d has empty fingerprint", i)
		}
		if d.CountsTowardTotal {
			counted++
		} else {
			neutral++
		}
	}
	return counted, neutral
}

func TestParseAlipaySample(t *testing.T) {
	result, err := Parse(loadSample(t, "alipay.csv"))
	if err != nil {
		t.Fatalf("parse alipay: %v", err)
	}
	if result.Source != SourceAlipay {
		t.Fatalf("source = %q, want alipay", result.Source)
	}
	if len(result.Drafts) == 0 {
		t.Fatal("no drafts parsed from alipay sample")
	}
	counted, neutral := checkDrafts(t, result.Drafts)
	// The sample has closed/frozen rows, so some drafts must be non-counting.
	if neutral == 0 {
		t.Error("expected some neutral (non-counting) drafts, got none")
	}
	t.Logf("alipay: %d drafts (%d counted, %d neutral), %d invalid",
		len(result.Drafts), counted, neutral, result.Invalid)
}

func TestParseWeChatSample(t *testing.T) {
	result, err := Parse(loadSample(t, "wechat.xlsx"))
	if err != nil {
		t.Fatalf("parse wechat: %v", err)
	}
	if result.Source != SourceWeChat {
		t.Fatalf("source = %q, want wechat", result.Source)
	}
	if len(result.Drafts) == 0 {
		t.Fatal("no drafts parsed from wechat sample")
	}
	counted, neutral := checkDrafts(t, result.Drafts)
	t.Logf("wechat: %d drafts (%d counted, %d neutral), %d invalid",
		len(result.Drafts), counted, neutral, result.Invalid)
}
