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

// returnInput is the body for POST /:id/return and PUT /:id. On return all four
// weights are required; on PUT only the supplied fields are applied. Weights are
// pointers so an omitted field is distinguishable from a zero value.
type returnInput struct {
	PickupGrossKg  *int    `json:"pickup_gross_kg"`
	PickupTareKg   *int    `json:"pickup_tare_kg"`
	FactoryGrossKg *int    `json:"factory_gross_kg"`
	FactoryTareKg  *int    `json:"factory_tare_kg"`
	ReturnTime     *string `json:"return_time"`
}

// tripResponse is a Trip plus the read-time derived fields. The computed fields
// are only set for Returned trips with all four weights present; they are never
// persisted — recalculated on every read so corrections take effect immediately.
type tripResponse struct {
	Trip
	PickupNetKg        *int   `json:"pickup_net_kg,omitempty"`
	FactoryNetKg       *int   `json:"factory_net_kg,omitempty"`
	WeightDifferenceKg *int   `json:"weight_difference_kg,omitempty"`
	LoadStatus         *string `json:"load_status,omitempty"`
}

// tripWithCalcs attaches the derived weight fields to a trip when it is Returned
// and has all four weights. Dispatched or partial trips get a plain response.
func tripWithCalcs(t Trip) tripResponse {
	r := tripResponse{Trip: t}
	if t.Status != TripStatusReturned ||
		t.PickupGrossKg == nil || t.PickupTareKg == nil ||
		t.FactoryGrossKg == nil || t.FactoryTareKg == nil {
		return r
	}
	pickupNet := *t.PickupGrossKg - *t.PickupTareKg
	factoryNet := *t.FactoryGrossKg - *t.FactoryTareKg
	diff := pickupNet - factoryNet
	status := loadStatus(factoryNet, t.CapacitySnapshotKg)
	r.PickupNetKg = &pickupNet
	r.FactoryNetKg = &factoryNet
	r.WeightDifferenceKg = &diff
	r.LoadStatus = &status
	return r
}

// loadStatus classifies the factory net weight against the truck's capacity
// snapshot captured at dispatch time.
func loadStatus(factoryNet, capacityKg int) string {
	switch {
	case factoryNet > capacityKg:
		return "Overweight"
	case factoryNet < capacityKg:
		return "Underweight"
	default:
		return "At capacity"
	}
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
			tripResponse
			ElapsedSeconds int64 `json:"elapsed_seconds"`
		}, len(trips))
		for i, t := range trips {
			views[i].tripResponse = tripWithCalcs(t)
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
		return c.JSON(tripWithCalcs(trip))
	}
}

// returnTrip records the pickup/factory weighbridge readings, flips the trip to
// Returned, and stamps the return time. Only a Dispatched trip can be returned.
func returnTrip(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body returnInput
		if err := c.BodyParser(&body); err != nil {
			return fiberErr(c, fiber.StatusBadRequest, "invalid request body")
		}
		for _, w := range []struct {
			name string
			v    *int
		}{
			{"pickup_gross_kg", body.PickupGrossKg},
			{"pickup_tare_kg", body.PickupTareKg},
			{"factory_gross_kg", body.FactoryGrossKg},
			{"factory_tare_kg", body.FactoryTareKg},
		} {
			if w.v == nil {
				return fiberErr(c, fiber.StatusBadRequest, w.name+" is required")
			}
			if *w.v <= 0 {
				return fiberErr(c, fiber.StatusBadRequest, w.name+" must be a positive integer")
			}
		}
		if *body.PickupGrossKg < *body.PickupTareKg {
			return fiberErr(c, fiber.StatusBadRequest, "pickup_gross_kg must be >= pickup_tare_kg")
		}
		if *body.FactoryGrossKg < *body.FactoryTareKg {
			return fiberErr(c, fiber.StatusBadRequest, "factory_gross_kg must be >= factory_tare_kg")
		}

		id := c.Params("id")
		var trip Trip
		if err := db.First(&trip, id).Error; err != nil {
			return fiberErr(c, fiber.StatusNotFound, "trip not found")
		}
		if trip.Status != TripStatusDispatched {
			return fiberErr(c, fiber.StatusBadRequest, "trip is not dispatched")
		}

		trip.PickupGrossKg = body.PickupGrossKg
		trip.PickupTareKg = body.PickupTareKg
		trip.FactoryGrossKg = body.FactoryGrossKg
		trip.FactoryTareKg = body.FactoryTareKg
		trip.Status = TripStatusReturned

		rt, ok := parseReturnTime(body.ReturnTime)
		if !ok {
			return fiberErr(c, fiber.StatusBadRequest, "return_time must be a valid datetime")
		}
		trip.ReturnTime = &rt

		userID, _ := c.Locals("user_id").(uint)
		trip.UpdatedBy = userID
		if err := db.Save(&trip).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "update failed")
		}
		db.Preload("Truck").Preload("Driver").Preload("PickupSite").First(&trip, trip.ID)
		return c.JSON(tripWithCalcs(trip))
	}
}

// updateTrip corrects weights and return_time on a Returned trip. Only the
// supplied fields are applied; recalculations happen on read.
func updateTrip(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var trip Trip
		if err := db.First(&trip, id).Error; err != nil {
			return fiberErr(c, fiber.StatusNotFound, "trip not found")
		}

		var body returnInput
		if err := c.BodyParser(&body); err != nil {
			return fiberErr(c, fiber.StatusBadRequest, "invalid request body")
		}
		for _, w := range []struct {
			name string
			v    *int
		}{
			{"pickup_gross_kg", body.PickupGrossKg},
			{"pickup_tare_kg", body.PickupTareKg},
			{"factory_gross_kg", body.FactoryGrossKg},
			{"factory_tare_kg", body.FactoryTareKg},
		} {
			if w.v != nil && *w.v <= 0 {
				return fiberErr(c, fiber.StatusBadRequest, w.name+" must be a positive integer")
			}
		}
		if body.PickupGrossKg != nil {
			trip.PickupGrossKg = body.PickupGrossKg
		}
		if body.PickupTareKg != nil {
			trip.PickupTareKg = body.PickupTareKg
		}
		if body.FactoryGrossKg != nil {
			trip.FactoryGrossKg = body.FactoryGrossKg
		}
		if body.FactoryTareKg != nil {
			trip.FactoryTareKg = body.FactoryTareKg
		}
		// Validate gross >= tare across the merged set, not just the patch.
		if trip.PickupGrossKg != nil && trip.PickupTareKg != nil && *trip.PickupGrossKg < *trip.PickupTareKg {
			return fiberErr(c, fiber.StatusBadRequest, "pickup_gross_kg must be >= pickup_tare_kg")
		}
		if trip.FactoryGrossKg != nil && trip.FactoryTareKg != nil && *trip.FactoryGrossKg < *trip.FactoryTareKg {
			return fiberErr(c, fiber.StatusBadRequest, "factory_gross_kg must be >= factory_tare_kg")
		}
		if body.ReturnTime != nil {
			rt, ok := parseReturnTime(body.ReturnTime)
			if !ok {
				return fiberErr(c, fiber.StatusBadRequest, "return_time must be a valid datetime")
			}
			trip.ReturnTime = &rt
		}

		userID, _ := c.Locals("user_id").(uint)
		trip.UpdatedBy = userID
		if err := db.Save(&trip).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "update failed")
		}
		db.Preload("Truck").Preload("Driver").Preload("PickupSite").First(&trip, trip.ID)
		return c.JSON(tripWithCalcs(trip))
	}
}

// parseReturnTime parses an optional return_time string in server-local time.
// Omitted/empty means "now". ok is false only when a non-empty value fails to parse.
func parseReturnTime(s *string) (time.Time, bool) {
	if s == nil || *s == "" {
		return time.Now(), true
	}
	return parseDispatchTime(*s)
}
