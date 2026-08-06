package main

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

type tripInput struct {
	TruckID      *uint   `json:"truck_id"`
	DriverID     *uint   `json:"driver_id"`
	PickupSiteID *uint   `json:"pickup_site_id"`
	TripMoneyIDR *int    `json:"trip_money_idr"`
	Notes        *string `json:"notes"`
	// DispatchTime accepts a datetime-local value ("2006-01-02T15:04") or
	// RFC3339. Omitted/empty means "now". Parsed in the server's local time —
	// single-region deployment assumes browser and server share a timezone.
	DispatchTime *string `json:"dispatch_time"`
}

// listAvailableTrucks returns active trucks not currently on a DISPATCHED trip,
// with their usual driver preloaded so the dispatch form can prefill it.
func listAvailableTrucks(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var trucks []Truck
		err := db.Preload("UsualDriver").
			Where("is_active = ? AND id NOT IN (?)", true,
				db.Model(&Trip{}).Select("truck_id").Where("status = ?", TripStatusDispatched)).
			Order("id DESC").Find(&trucks).Error
		if err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "query failed")
		}
		return c.JSON(fiber.Map{"data": trucks})
	}
}

// parseDispatchTime parses a dispatch_time string in server-local time across
// the datetime-local and RFC3339 layouts. ok is false if none match.
func parseDispatchTime(s string) (time.Time, bool) {
	for _, layout := range []string{"2006-01-02T15:04", "2006-01-02T15:04:05", time.RFC3339} {
		if t, err := time.ParseInLocation(layout, s, time.Local); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func createTrip(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body tripInput
		if err := c.BodyParser(&body); err != nil {
			return fiberErr(c, fiber.StatusBadRequest, "invalid request body")
		}
		if body.TruckID == nil {
			return fiberErr(c, fiber.StatusBadRequest, "truck_id is required")
		}
		if body.DriverID == nil {
			return fiberErr(c, fiber.StatusBadRequest, "driver_id is required")
		}
		if body.PickupSiteID == nil {
			return fiberErr(c, fiber.StatusBadRequest, "pickup_site_id is required")
		}
		if body.TripMoneyIDR == nil || *body.TripMoneyIDR < 0 {
			return fiberErr(c, fiber.StatusBadRequest, "trip_money_idr is required and must be >= 0")
		}

		// Truck must exist, be active, and have no active trip.
		var truck Truck
		if err := db.First(&truck, *body.TruckID).Error; err != nil {
			return fiberErr(c, fiber.StatusBadRequest, "truck_id does not refer to a valid truck")
		}
		if !truck.IsActive {
			return fiberErr(c, fiber.StatusBadRequest, "truck must be active")
		}
		if truckHasActiveTrip(db, truck.ID) {
			return fiberErr(c, fiber.StatusBadRequest, "truck already has an active trip")
		}

		// Driver must exist, be active, and have no active trip.
		var driver Driver
		if err := db.First(&driver, *body.DriverID).Error; err != nil {
			return fiberErr(c, fiber.StatusBadRequest, "driver_id does not refer to a valid driver")
		}
		if !driver.IsActive {
			return fiberErr(c, fiber.StatusBadRequest, "driver must be active")
		}
		if hasActiveTrip(db, driver.ID) {
			return fiberErr(c, fiber.StatusBadRequest, "driver already has an active trip")
		}

		// Pickup site must exist and be active.
		var site PickupSite
		if err := db.First(&site, *body.PickupSiteID).Error; err != nil {
			return fiberErr(c, fiber.StatusBadRequest, "pickup_site_id does not refer to a valid pickup site")
		}
		if !site.IsActive {
			return fiberErr(c, fiber.StatusBadRequest, "pickup site must be active")
		}

		dispatchTime := time.Now()
		if body.DispatchTime != nil && *body.DispatchTime != "" {
			t, ok := parseDispatchTime(*body.DispatchTime)
			if !ok {
				return fiberErr(c, fiber.StatusBadRequest, "dispatch_time must be a valid datetime")
			}
			dispatchTime = t
		}

		userID, _ := c.Locals("user_id").(uint)

		trip := Trip{
			TruckID:            truck.ID,
			DriverID:           driver.ID,
			PickupSiteID:       site.ID,
			CapacitySnapshotKg: truck.CapacityKg,
			DispatchTime:       dispatchTime,
			TripMoneyIDR:       *body.TripMoneyIDR,
			Notes:              ptrString(body.Notes),
			Status:             TripStatusDispatched,
			CreatedBy:          userID,
			UpdatedBy:          userID,
		}
		// The partial unique indexes are the last line of defence against two
		// concurrent dispatches claiming the same truck or driver.
		if err := db.Create(&trip).Error; err != nil {
			return fiberErr(c, fiber.StatusBadRequest, "create failed (truck or driver already dispatched)")
		}

		db.Preload("Truck").Preload("Driver").Preload("PickupSite").First(&trip, trip.ID)
		return c.Status(fiber.StatusCreated).JSON(trip)
	}
}

// listActiveTrips lists all DISPATCHED trips with associations preloaded and
// the elapsed seconds since dispatch_time.
func listActiveTrips(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var trips []Trip
		if err := db.Preload("Truck").Preload("Driver").Preload("PickupSite").
			Where("status = ?", TripStatusDispatched).
			Order("dispatch_time DESC").Find(&trips).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "query failed")
		}

		now := time.Now()
		views := make([]struct {
			Trip
			ElapsedSeconds int64 `json:"elapsed_seconds"`
		}, len(trips))
		for i, t := range trips {
			views[i].Trip = t
			views[i].ElapsedSeconds = int64(now.Sub(t.DispatchTime).Seconds())
		}
		return c.JSON(fiber.Map{"data": views})
	}
}

func getTrip(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var trip Trip
		if err := db.Preload("Truck").Preload("Driver").Preload("PickupSite").First(&trip, id).Error; err != nil {
			return fiberErr(c, fiber.StatusNotFound, "trip not found")
		}
		return c.JSON(trip)
	}
}
