package httpapi

import "testing"

func TestValidateInventoryRequest(t *testing.T) {
	expiryDate := "2026-09-02"
	body := createInventoryRequest{
		Name:       " 牛奶 ",
		Location:   "冰箱",
		ExpiryDate: &expiryDate,
	}

	if validation := validateInventoryRequest(&body); validation != nil {
		t.Fatalf("valid inventory request rejected: %v", validation)
	}
	if body.Name != "牛奶" || body.Category != "日用品" || body.QuantityLabel != "1 件" || body.Status != "normal" {
		t.Fatalf("inventory defaults were not normalized: %+v", body)
	}
	if body.ExpiryDate == nil || *body.ExpiryDate != expiryDate {
		t.Fatalf("expiry date was not normalized: %#v", body.ExpiryDate)
	}

	invalidStatus := body
	invalidStatus.Status = "unknown"
	if validation := validateInventoryRequest(&invalidStatus); validation == nil || validation.code != "INVALID_STATUS" {
		t.Fatalf("expected INVALID_STATUS, got %v", validation)
	}

	invalidDate := body
	badDate := "2026-02-30"
	invalidDate.ExpiryDate = &badDate
	if validation := validateInventoryRequest(&invalidDate); validation == nil || validation.code != "INVALID_EXPIRY_DATE" {
		t.Fatalf("expected INVALID_EXPIRY_DATE, got %v", validation)
	}
}

func TestValidateLedgerRequest(t *testing.T) {
	body := createLedgerRequest{
		Type:        " expense ",
		AmountCents: 1234,
		Purpose:     " 买菜 ",
		MemberName:  " 小明 ",
		Date:        " 2026-09-02 ",
		Note:        " 备注 ",
	}

	if validation := validateLedgerRequest(&body); validation != nil {
		t.Fatalf("valid ledger request rejected: %v", validation)
	}
	if body.Type != "expense" || body.Purpose != "买菜" || body.MemberName != "小明" || body.Date != "2026-09-02" || body.NoteVisibility != "shared" {
		t.Fatalf("ledger values were not normalized: %+v", body)
	}

	invalidVisibility := body
	invalidVisibility.NoteVisibility = "everyone"
	if validation := validateLedgerRequest(&invalidVisibility); validation == nil || validation.code != "INVALID_NOTE_VISIBILITY" {
		t.Fatalf("expected INVALID_NOTE_VISIBILITY, got %v", validation)
	}

	invalidDate := body
	invalidDate.Date = "2026/09/02"
	if validation := validateLedgerRequest(&invalidDate); validation == nil || validation.code != "INVALID_DATE" {
		t.Fatalf("expected INVALID_DATE, got %v", validation)
	}
}

func TestValidateOrderItems(t *testing.T) {
	if validation := validateOrderItems(nil); validation == nil || validation.code != "NO_ITEMS" {
		t.Fatalf("expected NO_ITEMS, got %v", validation)
	}

	invalidQuantity := []createOrderItemRequest{{DishID: "dish-1", Quantity: 0}}
	if validation := validateOrderItems(invalidQuantity); validation == nil || validation.code != "INVALID_QUANTITY" {
		t.Fatalf("expected INVALID_QUANTITY, got %v", validation)
	}

	duplicates := []createOrderItemRequest{
		{DishID: "dish-1", Quantity: 1},
		{DishID: " dish-1 ", Quantity: 2},
	}
	if validation := validateOrderItems(duplicates); validation == nil || validation.code != "DUPLICATE_DISH" {
		t.Fatalf("expected DUPLICATE_DISH, got %v", validation)
	}

	valid := []createOrderItemRequest{{DishID: " dish-1 ", Quantity: 2, DishName: "客户端名称"}}
	if validation := validateOrderItems(valid); validation != nil {
		t.Fatalf("valid order request rejected: %v", validation)
	}
	if valid[0].DishID != "dish-1" {
		t.Fatalf("dish ID was not normalized: %q", valid[0].DishID)
	}
}
