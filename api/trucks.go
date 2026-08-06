package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

type truckInput struct {
	PlateNumber   *string `json:"plate_number"`
	DisplayName   *string `json:"display_name"`
	CapacityKg    *int    `json:"capacity_kg"`
	IsActive      *bool   `json:"is_active"`
	UsualDriverID *uint   `json:"usual_driver_id"`

	// Cross-truck reassignment: how to resolve the new driver's former truck.
	// If the chosen driver already drives another truck, the admin must either
	// mark that former truck inactive or give it a replacement driver in this
	// same request — the system never auto-deactivates silently.
	// ponytail: not surfaced in the v1 UI; the API supports it, the form just shows errors.
	FormerTruckInactive            *bool `json:"former_truck_set_inactive"`
	FormerTruckReplacementDriverID *uint `json:"former_truck_replacement_driver_id"`
}

// truckHasActiveTrip reports whether the truck is on a dispatched trip.
func truckHasActiveTrip(db *gorm.DB, truckID uint) bool {
	var count int64
	db.Model(&Trip{}).Where("truck_id = ? AND status = ?", truckID, TripStatusDispatched).Count(&count)
	return count > 0
}

// truckHasAnyTrip reports whether the truck has ever been used in any trip.
func truckHasAnyTrip(db *gorm.DB, truckID uint) bool {
	var count int64
	db.Model(&Trip{}).Where("truck_id = ?", truckID).Count(&count)
	return count > 0
}

// sameDriverPtr reports whether two driver pointers refer to the same driver
// (both nil counts as equal; nil vs non-nil does not).
func sameDriverPtr(a, b *uint) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

// ptrString dereferences a string pointer, returning "" for nil.
func ptrString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// loadUsableDriver returns the driver only if they exist and are active,
// otherwise a fiber-ready error. Used to validate a usual-driver assignment.
func loadUsableDriver(c *fiber.Ctx, db *gorm.DB, driverID uint) (*Driver, error) {
	var driver Driver
	if err := db.First(&driver, driverID).Error; err != nil {
		return nil, fiberErr(c, fiber.StatusBadRequest, "usual_driver_id does not refer to a valid driver")
	}
	if !driver.IsActive {
		return nil, fiberErr(c, fiber.StatusBadRequest, "usual driver must be an active driver")
	}
	return &driver, nil
}

// findTruckByDriver returns the truck whose usual driver is driverID (excluding
// excludeTruckID), or nil if the driver is free.
func findTruckByDriver(db *gorm.DB, driverID, excludeTruckID uint) (*Truck, error) {
	var t Truck
	err := db.Where("usual_driver_id = ? AND id <> ?", driverID, excludeTruckID).First(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// keyPresent reports whether a top-level key appears in the JSON request body,
// so "usual_driver_id": null (clear) is distinct from omission (leave as-is).
func keyPresent(rawBody []byte, key string) bool {
	var m map[string]json.RawMessage
	if err := json.Unmarshal(rawBody, &m); err != nil {
		return false
	}
	_, ok := m[key]
	return ok
}

func listTrucks(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		page, _ := strconv.Atoi(c.Query("page", "1"))
		perPage, _ := strconv.Atoi(c.Query("per_page", "25"))
		if page < 1 {
			page = 1
		}
		if perPage < 1 || perPage > 100 {
			perPage = 25
		}

		q := db.Model(&Truck{})
		if active := c.Query("is_active"); active != "" {
			if active == "true" {
				q = q.Where("is_active = ?", true)
			} else if active == "false" {
				q = q.Where("is_active = ?", false)
			}
		}

		var total int64
		q.Count(&total)

		var trucks []Truck
		if err := q.Preload("UsualDriver").Order("id DESC").Offset((page - 1) * perPage).Limit(perPage).Find(&trucks).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "query failed")
		}

		return c.JSON(fiber.Map{
			"data":     trucks,
			"total":    total,
			"page":     page,
			"per_page": perPage,
		})
	}
}

func getTruck(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var truck Truck
		if err := db.Preload("UsualDriver").First(&truck, id).Error; err != nil {
			return fiberErr(c, fiber.StatusNotFound, "truck not found")
		}
		return c.JSON(truck)
	}
}

func createTruck(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body truckInput
		if err := c.BodyParser(&body); err != nil {
			return fiberErr(c, fiber.StatusBadRequest, "invalid request body")
		}

		plate := strings.TrimSpace(ptrString(body.PlateNumber))
		if plate == "" {
			return fiberErr(c, fiber.StatusBadRequest, "plate_number is required")
		}
		name := strings.TrimSpace(ptrString(body.DisplayName))
		if name == "" {
			return fiberErr(c, fiber.StatusBadRequest, "display_name is required")
		}
		if body.CapacityKg == nil || *body.CapacityKg <= 0 {
			return fiberErr(c, fiber.StatusBadRequest, "capacity_kg is required and must be greater than 0")
		}

		isActive := true
		if body.IsActive != nil {
			isActive = *body.IsActive
		}

		// Active trucks must have a usual driver; inactive trucks may have none.
		if isActive && body.UsualDriverID == nil {
			return fiberErr(c, fiber.StatusBadRequest, "an active truck must have a usual_driver_id")
		}
		if body.UsualDriverID != nil {
			if _, err := loadUsableDriver(c, db, *body.UsualDriverID); err != nil {
				return err
			}
			// 1:1 rule: a new truck cannot claim another truck's usual driver.
			if t, err := findTruckByDriver(db, *body.UsualDriverID, 0); err != nil {
				return fiberErr(c, fiber.StatusInternalServerError, "query failed")
			} else if t != nil {
				return fiberErr(c, fiber.StatusBadRequest, fmt.Sprintf("driver is already the usual driver of truck %d", t.ID))
			}
		}

		truck := Truck{
			PlateNumber:   plate,
			DisplayName:   name,
			CapacityKg:    *body.CapacityKg,
			IsActive:      isActive,
			UsualDriverID: body.UsualDriverID,
		}
		if err := db.Create(&truck).Error; err != nil {
			return fiberErr(c, fiber.StatusBadRequest, "create failed (check plate_number and usual_driver_id uniqueness)")
		}
		db.Preload("UsualDriver").First(&truck, truck.ID)
		return c.Status(fiber.StatusCreated).JSON(truck)
	}
}

func updateTruck(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var truck Truck
		if err := db.First(&truck, id).Error; err != nil {
			return fiberErr(c, fiber.StatusNotFound, "truck not found")
		}

		var body truckInput
		if err := c.BodyParser(&body); err != nil {
			return fiberErr(c, fiber.StatusBadRequest, "invalid request body")
		}

		// Scalar patches.
		if body.PlateNumber != nil {
			plate := strings.TrimSpace(*body.PlateNumber)
			if plate == "" {
				return fiberErr(c, fiber.StatusBadRequest, "plate_number is required")
			}
			if plate != truck.PlateNumber {
				var dup int64
				db.Model(&Truck{}).Where("plate_number = ? AND id <> ?", plate, truck.ID).Count(&dup)
				if dup > 0 {
					return fiberErr(c, fiber.StatusBadRequest, "plate_number already in use")
				}
				truck.PlateNumber = plate
			}
		}
		if body.DisplayName != nil {
			name := strings.TrimSpace(*body.DisplayName)
			if name == "" {
				return fiberErr(c, fiber.StatusBadRequest, "display_name is required")
			}
			truck.DisplayName = name
		}
		if body.CapacityKg != nil {
			if *body.CapacityKg <= 0 {
				return fiberErr(c, fiber.StatusBadRequest, "capacity_kg must be greater than 0")
			}
			truck.CapacityKg = *body.CapacityKg
		}

		// Effective active state; prevent deactivation while on an active trip.
		effectiveActive := truck.IsActive
		if body.IsActive != nil {
			effectiveActive = *body.IsActive
		}
		if body.IsActive != nil && !*body.IsActive && truck.IsActive && truckHasActiveTrip(db, truck.ID) {
			return fiberErr(c, fiber.StatusBadRequest, "cannot deactivate truck on an active trip")
		}

		// Effective usual driver for THIS truck. Presence matters: an explicit
		// null clears the driver; an omitted key leaves it untouched (e.g. the
		// list's toggle-active button only sends is_active).
		newDriverID := truck.UsualDriverID
		if keyPresent(c.Body(), "usual_driver_id") {
			newDriverID = body.UsualDriverID
		}

		// Cross-truck reassignment: only when the driver is actually changing.
		var (
			formerTruck     *Truck
			resolveInactive bool
			resolveReplace  *uint
		)
		if !sameDriverPtr(newDriverID, truck.UsualDriverID) && newDriverID != nil {
			if _, err := loadUsableDriver(c, db, *newDriverID); err != nil {
				return err
			}
			ft, err := findTruckByDriver(db, *newDriverID, truck.ID)
			if err != nil {
				return fiberErr(c, fiber.StatusInternalServerError, "query failed")
			}
			if ft != nil {
				// The new driver already has a truck — the admin must resolve it
				// in this same request. Never silently auto-deactivate.
				switch {
				case body.FormerTruckInactive != nil && *body.FormerTruckInactive:
					if truckHasActiveTrip(db, ft.ID) {
						return fiberErr(c, fiber.StatusBadRequest, fmt.Sprintf("cannot deactivate truck %d on an active trip", ft.ID))
					}
					resolveInactive = true
				case body.FormerTruckReplacementDriverID != nil:
					r := *body.FormerTruckReplacementDriverID
					if r == *newDriverID {
						return fiberErr(c, fiber.StatusBadRequest, "former_truck_replacement_driver_id must be a different driver")
					}
					if _, err := loadUsableDriver(c, db, r); err != nil {
						return err
					}
					if conflict, err := findTruckByDriver(db, r, ft.ID); err != nil {
						return fiberErr(c, fiber.StatusInternalServerError, "query failed")
					} else if conflict != nil {
						return fiberErr(c, fiber.StatusBadRequest, "former_truck_replacement_driver_id is already another truck's usual driver")
					}
					resolveReplace = &r
				default:
					return fiberErr(c, fiber.StatusBadRequest, fmt.Sprintf(
						"driver %d is the usual driver of truck %d; set former_truck_set_inactive=true or provide former_truck_replacement_driver_id",
						*newDriverID, ft.ID))
				}
				formerTruck = ft
			}
		}

		// Active truck must end up with a driver — no silent deactivation.
		if effectiveActive && newDriverID == nil {
			return fiberErr(c, fiber.StatusBadRequest, "an active truck must have a usual driver; assign a driver or set is_active=false")
		}

		// Apply atomically: resolve the former truck first (frees the driver),
		// then save this truck — avoids transient unique-index collisions.
		err := db.Transaction(func(tx *gorm.DB) error {
			if formerTruck != nil {
				if resolveInactive {
					if e := tx.Model(&Truck{}).Where("id = ?", formerTruck.ID).
						Updates(map[string]any{"is_active": false, "usual_driver_id": nil}).Error; e != nil {
						return e
					}
				} else if resolveReplace != nil {
					if e := tx.Model(&Truck{}).Where("id = ?", formerTruck.ID).
						Update("usual_driver_id", *resolveReplace).Error; e != nil {
						return e
					}
				}
			}
			truck.UsualDriverID = newDriverID
			truck.IsActive = effectiveActive
			return tx.Save(&truck).Error
		})
		if err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "update failed")
		}

		db.Preload("UsualDriver").First(&truck, truck.ID)
		return c.JSON(truck)
	}
}

func deleteTruck(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var truck Truck
		if err := db.First(&truck, id).Error; err != nil {
			return fiberErr(c, fiber.StatusNotFound, "truck not found")
		}

		if truckHasAnyTrip(db, truck.ID) {
			return fiberErr(c, fiber.StatusBadRequest, "truck has trip history; deactivate instead of deleting")
		}

		if err := db.Delete(&truck).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "delete failed")
		}
		return c.JSON(fiber.Map{"ok": true})
	}
}
