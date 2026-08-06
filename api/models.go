package main

import "time"

// Role constants. Stored on User.Role and carried in JWT claims.
const (
	RoleAdministrator = "Administrator"
	RoleOperator      = "Fleet Operator"
)

// User is the application account. PasswordHash is never JSON-serialized
// (json:"-"), so any handler returning *User omits the hash by construction.
type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Username     string    `gorm:"uniqueIndex;not null" json:"username"`
	PasswordHash string    `gorm:"not null" json:"-"`
	Role         string    `gorm:"not null" json:"role"`
	IsActive     bool      `gorm:"not null;default:true" json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Driver represents a fleet driver.
type Driver struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	FullName  string    `gorm:"not null" json:"full_name"`
	IsActive  bool      `gorm:"not null;default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// PickupSite represents a pickup location for trips.
type PickupSite struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	SiteName   string    `gorm:"not null" json:"site_name"`
	DistanceKm float64   `gorm:"not null" json:"distance_km"`
	IsActive   bool      `gorm:"not null;default:true" json:"is_active"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// Truck represents a cargo vehicle. The usual_driver_id unique index enforces
// the 1:1 rule at the DB level — a driver is the usual driver of at most one
// truck — while allowing multiple NULLs (inactive trucks with no driver).
type Truck struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	PlateNumber   string    `gorm:"uniqueIndex;not null;column:plate_number" json:"plate_number"`
	DisplayName   string    `gorm:"not null;column:display_name" json:"display_name"`
	CapacityKg    int       `gorm:"not null;column:capacity_kg" json:"capacity_kg"`
	IsActive      bool      `gorm:"not null;default:true" json:"is_active"`
	UsualDriverID *uint     `gorm:"uniqueIndex;column:usual_driver_id" json:"usual_driver_id"`
	UsualDriver   *Driver   `gorm:"foreignKey:UsualDriverID" json:"usual_driver"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}
