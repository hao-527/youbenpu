// TODO: These domain models are not yet wired to any HTTP handler or
// repository. They define the target schema for when the API gains real
// CRUD endpoints backed by a database. Until then, all business data
// lives in the WeChat miniprogram's local storage (see apps/miniprogram/src/store).
//
// Known mismatches with the current frontend types:
// - Frontend LedgerEntry uses `purpose` (free text) instead of `CategoryCode`.
// - Frontend MealOrder stores `requesterName` (display name snapshot) while
//   this model uses `RequesterID` (stable user reference).
// - Frontend InventoryItem.category is a free string (user-extensible);
//   this model uses `CategoryCode` which implies an enum — the API should
//   accept arbitrary strings to match the frontend behavior.

package ledger

import (
	"fmt"
	"time"
)

type EntryID string

type NoteVisibility string

const (
	NotePrivate NoteVisibility = "private"
	NoteShared  NoteVisibility = "shared"

	// MaxClientSafeAmountCents keeps JSON number transport exact in JavaScript clients.
	MaxClientSafeAmountCents int64 = 9_007_199_254_740_991
)

type Entry struct {
	ID             EntryID
	FamilyID       string
	RecorderID     string
	AmountCents    int64
	CategoryCode   string
	OccurredAt     time.Time
	Note           string
	NoteVisibility NoteVisibility
	UndoDeadline   time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// NormalizeAndValidate applies privacy-safe defaults before validating ingress data.
func (entry *Entry) NormalizeAndValidate() error {
	if entry.NoteVisibility == "" {
		entry.NoteVisibility = NotePrivate
	}
	return entry.Validate()
}

func (entry Entry) Validate() error {
	if entry.FamilyID == "" {
		return fmt.Errorf("family ID is required")
	}
	if entry.RecorderID == "" {
		return fmt.Errorf("recorder ID is required")
	}
	if entry.AmountCents <= 0 || entry.AmountCents > MaxClientSafeAmountCents {
		return fmt.Errorf("amount cents must be between 1 and %d", MaxClientSafeAmountCents)
	}
	if entry.NoteVisibility != NotePrivate && entry.NoteVisibility != NoteShared {
		return fmt.Errorf("unsupported note visibility %q", entry.NoteVisibility)
	}
	return nil
}

// EffectiveNoteVisibility fails closed if legacy or malformed data is encountered.
func (entry Entry) EffectiveNoteVisibility() NoteVisibility {
	if entry.NoteVisibility == NoteShared {
		return NoteShared
	}
	return NotePrivate
}

func (entry Entry) CanUndo(now time.Time) bool {
	return !entry.UndoDeadline.IsZero() && now.Before(entry.UndoDeadline)
}
