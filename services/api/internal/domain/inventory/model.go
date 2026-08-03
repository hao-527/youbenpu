package inventory

import "time"

type ItemID string

type Status string

const (
	StatusNormal    Status = "normal"
	StatusExpiring  Status = "expiring"
	StatusExpired   Status = "expired"
	StatusFinished  Status = "finished"
	StatusDiscarded Status = "discarded"
)

type Item struct {
	ID           ItemID
	FamilyID     string
	Name         string
	CategoryCode string
	Quantity     int64
	UnitCode     string
	LocationCode string
	ExpiresAt    *time.Time
	Status       Status
	Version      int64
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
