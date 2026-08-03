package meal

import "time"

type OrderID string

type OrderStatus string

const (
	OrderPending   OrderStatus = "pending"
	OrderCompleted OrderStatus = "completed"
	OrderCancelled OrderStatus = "cancelled"
)

type Order struct {
	ID          OrderID
	FamilyID    string
	RequesterID string
	Status      OrderStatus
	Items       []OrderItem
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type OrderItem struct {
	DishID   string
	DishName string
	Quantity int
}

// Order deliberately has no spending amount. Completing an order must not
// create a ledger entry unless a member explicitly starts the manual flow.
func (order Order) IsOpen() bool {
	return order.Status == OrderPending
}
