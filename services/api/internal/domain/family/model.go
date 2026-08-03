package family

import "time"

type ID string
type MemberID string

type Role string

const (
	RoleOwner  Role = "owner"
	RoleMember Role = "member"
)

type Family struct {
	ID        ID
	Name      string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Member struct {
	ID        MemberID
	FamilyID  ID
	UserID    string
	Role      Role
	JoinedAt  time.Time
	UpdatedAt time.Time
}
