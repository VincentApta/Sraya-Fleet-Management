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

// TripStatus constants. Stored on Trip.Status.
const (
	TripStatusDispatched = "Dispatched"
	TripStatusReturned   = "Returned"
)

// Trip represents a dispatch of a truck+driver to a pickup site. While
// Status == "Dispatched" the truck and driver are each exclusive — enforced by
// partial unique indexes (truck_id, driver_id) WHERE status = 'Dispatched'.
type Trip struct {
	ID                 uint        `gorm:"primaryKey" json:"id"`
	TruckID            uint        `gorm:"not null;column:truck_id" json:"truck_id"`
	Truck              *Truck      `gorm:"foreignKey:TruckID" json:"truck"`
	DriverID           uint        `gorm:"not null;column:driver_id" json:"driver_id"`
	Driver             *Driver     `gorm:"foreignKey:DriverID" json:"driver"`
	PickupSiteID       uint        `gorm:"not null;column:pickup_site_id" json:"pickup_site_id"`
	PickupSite         *PickupSite `gorm:"foreignKey:PickupSiteID" json:"pickup_site"`
	CapacitySnapshotKg int         `gorm:"not null;column:capacity_snapshot_kg" json:"capacity_snapshot_kg"`
	DispatchTime       time.Time   `gorm:"not null;column:dispatch_time" json:"dispatch_time"`
	TripMoneyIDR       int         `gorm:"not null;column:trip_money_idr" json:"trip_money_idr"`
	Notes              string      `gorm:"column:notes" json:"notes"`
	Status             string      `gorm:"not null;column:status" json:"status"`
	PickupGrossKg      *int        `gorm:"column:pickup_gross_kg" json:"pickup_gross_kg"`
	PickupTareKg       *int        `gorm:"column:pickup_tare_kg" json:"pickup_tare_kg"`
	FactoryGrossKg     *int        `gorm:"column:factory_gross_kg" json:"factory_gross_kg"`
	FactoryTareKg      *int        `gorm:"column:factory_tare_kg" json:"factory_tare_kg"`
	ReturnTime         *time.Time  `gorm:"column:return_time" json:"return_time"`
	CreatedBy          uint        `gorm:"column:created_by" json:"created_by"`
	UpdatedBy          uint        `gorm:"column:updated_by" json:"updated_by"`
	CreatedAt          time.Time   `json:"created_at"`
	UpdatedAt          time.Time   `json:"updated_at"`
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
