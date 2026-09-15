package httpapi

import (
	"fmt"
	"strings"
	"time"
)

// requestValidationError is a client-correctable input error. Keeping the
// error code and message together makes handler validation consistent and
// prevents database constraint errors from leaking as generic 500 responses.
type requestValidationError struct {
	code    string
	message string
}

func (e *requestValidationError) Error() string {
	return e.code + ": " + e.message
}

func isValidISODate(value string) bool {
	parsed, err := time.Parse("2006-01-02", value)
	return err == nil && parsed.Format("2006-01-02") == value
}

func validateDate(value string) *requestValidationError {
	if value == "" {
		return &requestValidationError{code: "MISSING_DATE", message: "日期不能为空"}
	}
	if !isValidISODate(value) {
		return &requestValidationError{code: "INVALID_DATE", message: "日期格式应为 YYYY-MM-DD"}
	}
	return nil
}

func validateMaxRunes(value, field, code string, max int) *requestValidationError {
	if len([]rune(value)) > max {
		return &requestValidationError{code: code, message: fmt.Sprintf("%s最多 %d 个字", field, max)}
	}
	return nil
}

var validInventoryStatuses = map[string]struct{}{
	"normal":    {},
	"expiring":  {},
	"expired":   {},
	"finished":  {},
	"discarded": {},
	"deleted":   {},
}

func validateInventoryRequest(body *createInventoryRequest) *requestValidationError {
	body.Name = strings.TrimSpace(body.Name)
	body.Category = strings.TrimSpace(body.Category)
	body.Location = strings.TrimSpace(body.Location)
	body.QuantityLabel = strings.TrimSpace(body.QuantityLabel)
	body.Status = strings.TrimSpace(body.Status)

	if body.Name == "" {
		return &requestValidationError{code: "MISSING_NAME", message: "物品名称不能为空"}
	}
	if err := validateMaxRunes(body.Name, "物品名称", "NAME_TOO_LONG", 80); err != nil {
		return err
	}
	if body.Location == "" {
		return &requestValidationError{code: "MISSING_LOCATION", message: "存放位置不能为空"}
	}
	if err := validateMaxRunes(body.Location, "存放位置", "LOCATION_TOO_LONG", 40); err != nil {
		return err
	}
	if body.Category == "" {
		body.Category = "日用品"
	}
	if err := validateMaxRunes(body.Category, "分类", "CATEGORY_TOO_LONG", 20); err != nil {
		return err
	}
	if body.QuantityLabel == "" {
		body.QuantityLabel = "1 件"
	}
	if err := validateMaxRunes(body.QuantityLabel, "数量描述", "QUANTITY_TOO_LONG", 60); err != nil {
		return err
	}
	if body.Status == "" {
		body.Status = "normal"
	}
	if _, ok := validInventoryStatuses[body.Status]; !ok {
		return &requestValidationError{code: "INVALID_STATUS", message: "无效的状态值"}
	}

	if body.ExpiryDate != nil {
		value := strings.TrimSpace(*body.ExpiryDate)
		if value == "" {
			body.ExpiryDate = nil
		} else {
			if !isValidISODate(value) {
				return &requestValidationError{code: "INVALID_EXPIRY_DATE", message: "到期日期格式应为 YYYY-MM-DD"}
			}
			body.ExpiryDate = &value
		}
	}
	if body.PhotoURL != nil {
		value := strings.TrimSpace(*body.PhotoURL)
		if value == "" {
			body.PhotoURL = nil
		} else {
			if len(value) > 512 {
				return &requestValidationError{code: "PHOTO_URL_TOO_LONG", message: "图片地址过长"}
			}
			body.PhotoURL = &value
		}
	}
	return nil
}

func validateLedgerRequest(body *createLedgerRequest) *requestValidationError {
	body.Type = strings.TrimSpace(body.Type)
	body.Purpose = strings.TrimSpace(body.Purpose)
	body.MemberName = strings.TrimSpace(body.MemberName)
	body.Date = strings.TrimSpace(body.Date)
	body.TimeLabel = strings.TrimSpace(body.TimeLabel)
	body.Note = strings.TrimSpace(body.Note)
	body.NoteVisibility = strings.TrimSpace(body.NoteVisibility)

	if body.Type != "income" && body.Type != "expense" {
		return &requestValidationError{code: "INVALID_TYPE", message: "类型只能是 income 或 expense"}
	}
	if body.AmountCents <= 0 || body.AmountCents > 9_999_999_999 {
		return &requestValidationError{code: "INVALID_AMOUNT", message: "金额无效"}
	}
	if body.Purpose == "" {
		return &requestValidationError{code: "MISSING_PURPOSE", message: "用途不能为空"}
	}
	if err := validateMaxRunes(body.Purpose, "用途", "PURPOSE_TOO_LONG", 80); err != nil {
		return err
	}
	if body.MemberName == "" {
		return &requestValidationError{code: "MISSING_MEMBER", message: "成员名称不能为空"}
	}
	if err := validateMaxRunes(body.MemberName, "成员名称", "MEMBER_TOO_LONG", 40); err != nil {
		return err
	}
	if err := validateDate(body.Date); err != nil {
		return err
	}
	if err := validateMaxRunes(body.TimeLabel, "时间描述", "TIME_LABEL_TOO_LONG", 60); err != nil {
		return err
	}
	if err := validateMaxRunes(body.Note, "备注", "NOTE_TOO_LONG", 300); err != nil {
		return err
	}
	if body.NoteVisibility == "" {
		body.NoteVisibility = "shared"
	}
	if body.NoteVisibility != "private" && body.NoteVisibility != "shared" {
		return &requestValidationError{code: "INVALID_NOTE_VISIBILITY", message: "备注可见范围只能是 private 或 shared"}
	}
	return nil
}

func validateOrderItems(items []createOrderItemRequest) *requestValidationError {
	if len(items) == 0 {
		return &requestValidationError{code: "NO_ITEMS", message: "至少选择一道菜"}
	}
	if len(items) > 50 {
		return &requestValidationError{code: "TOO_MANY_ITEMS", message: "一次最多选择 50 道菜"}
	}

	seen := make(map[string]struct{}, len(items))
	for index := range items {
		items[index].DishID = strings.TrimSpace(items[index].DishID)
		if items[index].DishID == "" {
			return &requestValidationError{code: "MISSING_DISH_ID", message: "菜品 ID 不能为空"}
		}
		if items[index].Quantity < 1 || items[index].Quantity > 99 {
			return &requestValidationError{code: "INVALID_QUANTITY", message: "每道菜数量应为 1 到 99"}
		}
		if _, exists := seen[items[index].DishID]; exists {
			return &requestValidationError{code: "DUPLICATE_DISH", message: "同一道菜不能重复添加"}
		}
		seen[items[index].DishID] = struct{}{}
	}
	return nil
}

func validateDishRequest(body *createDishRequest) *requestValidationError {
	body.Name = strings.TrimSpace(body.Name)
	body.Category = strings.TrimSpace(body.Category)
	body.Method = strings.TrimSpace(body.Method)
	if body.Name == "" {
		return &requestValidationError{code: "MISSING_NAME", message: "菜品名称不能为空"}
	}
	if err := validateMaxRunes(body.Name, "菜品名称", "NAME_TOO_LONG", 40); err != nil {
		return err
	}
	if body.Category == "" {
		body.Category = "其他"
	}
	if err := validateMaxRunes(body.Category, "分类", "CATEGORY_TOO_LONG", 20); err != nil {
		return err
	}
	if err := validateMaxRunes(body.Method, "做法", "METHOD_TOO_LONG", 2000); err != nil {
		return err
	}
	if len(body.Ingredients) > 50 {
		return &requestValidationError{code: "TOO_MANY_INGREDIENTS", message: "食材最多 50 项"}
	}
	for index, ingredient := range body.Ingredients {
		body.Ingredients[index] = strings.TrimSpace(ingredient)
		if body.Ingredients[index] == "" {
			return &requestValidationError{code: "INVALID_INGREDIENT", message: "食材名称不能为空"}
		}
		if err := validateMaxRunes(body.Ingredients[index], "食材名称", "INGREDIENT_TOO_LONG", 50); err != nil {
			return err
		}
	}
	if body.PhotoURL != nil {
		value := strings.TrimSpace(*body.PhotoURL)
		if value == "" {
			body.PhotoURL = nil
		} else if len(value) > 512 {
			return &requestValidationError{code: "PHOTO_URL_TOO_LONG", message: "图片地址过长"}
		} else {
			body.PhotoURL = &value
		}
	}
	return nil
}
