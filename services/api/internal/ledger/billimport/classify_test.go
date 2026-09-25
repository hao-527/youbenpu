package billimport

import "testing"

func TestClassify(t *testing.T) {
	cases := []struct {
		name       string
		direction  string
		status     string
		wantType   string
		wantCounts bool
	}{
		{"normal expense", "支出", "交易成功", "expense", true},
		{"paid awaiting receipt", "支出", "等待确认收货", "expense", true},
		{"refund becomes income", "不计收支", "退款成功", "income", true},
		{"partial refund", "支出", "部分退款", "income", true},
		{"closed order not counted", "支出", "交易关闭", "expense", false},
		{"deposit frozen not counted", "不计收支", "冻结成功", "expense", false},
		{"deposit released not counted", "不计收支", "解冻成功", "expense", false},
		{"neutral transfer not counted", "不计收支", "交易成功", "expense", false},
		{"plain income", "收入", "交易成功", "income", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := classify(tc.direction, tc.status)
			if !got.valid {
				t.Fatalf("classify returned invalid")
			}
			if got.entryType != tc.wantType {
				t.Errorf("type = %q, want %q", got.entryType, tc.wantType)
			}
			if got.countsTowardTotal != tc.wantCounts {
				t.Errorf("countsTowardTotal = %v, want %v", got.countsTowardTotal, tc.wantCounts)
			}
		})
	}
}
