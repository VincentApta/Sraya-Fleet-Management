package main

import (
	"strconv"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// TripStatus constants — referenced by the active-trip guard on deactivation.
// ponytail: Trip model arrives in issue #6; until then the guard is a no-op.
const TripStatusDispatched = "Dispatched"

type driverInput struct {
	FullName string `json:"full_name"`
	IsActive *bool  `json:"is_active"` // pointer to distinguish omitted from false
}

// hasActiveTrip checks whether the driver is on a dispatched trip.
// Returns false until the Trip model exists (issue #6); then it will query trips.
// ponytail: wire to real Trip table when #6 lands.
func hasActiveTrip(db *gorm.DB, driverID uint) bool {
	return false
}

// hasAnyTrip checks whether the driver has ever been used in any trip.
// ponytail: wire to real Trip table when #6 lands.
func hasAnyTrip(db *gorm.DB, driverID uint) bool {
	return false
}

func listDrivers(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		page, _ := strconv.Atoi(c.Query("page", "1"))
		perPage, _ := strconv.Atoi(c.Query("per_page", "25"))
		if page < 1 {
			page = 1
		}
		if perPage < 1 || perPage > 100 {
			perPage = 25
		}

		q := db.Model(&Driver{})
		if active := c.Query("is_active"); active != "" {
			if active == "true" {
				q = q.Where("is_active = ?", true)
			} else if active == "false" {
				q = q.Where("is_active = ?", false)
			}
		}

		var total int64
		q.Count(&total)

		var drivers []Driver
		if err := q.Order("id DESC").Offset((page - 1) * perPage).Limit(perPage).Find(&drivers).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "query failed")
		}

		return c.JSON(fiber.Map{
			"data":     drivers,
			"total":    total,
			"page":     page,
			"per_page": perPage,
		})
	}
}

func getDriver(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var driver Driver
		if err := db.First(&driver, id).Error; err != nil {
			return fiberErr(c, fiber.StatusNotFound, "driver not found")
		}
		return c.JSON(driver)
	}
}

func createDriver(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body driverInput
		if err := c.BodyParser(&body); err != nil {
			return fiberErr(c, fiber.StatusBadRequest, "invalid request body")
		}
		if body.FullName == "" {
			return fiberErr(c, fiber.StatusBadRequest, "full_name is required")
		}

		driver := Driver{FullName: body.FullName, IsActive: true}
		if err := db.Create(&driver).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "create failed")
		}
		return c.Status(fiber.StatusCreated).JSON(driver)
	}
}

func updateDriver(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var driver Driver
		if err := db.First(&driver, id).Error; err != nil {
			return fiberErr(c, fiber.StatusNotFound, "driver not found")
		}

		var body driverInput
		if err := c.BodyParser(&body); err != nil {
			return fiberErr(c, fiber.StatusBadRequest, "invalid request body")
		}

		if body.FullName != "" {
			driver.FullName = body.FullName
		}

		if body.IsActive != nil {
			// Prevent deactivation while on an active trip.
			if !*body.IsActive && driver.IsActive && hasActiveTrip(db, driver.ID) {
				return fiberErr(c, fiber.StatusBadRequest, "cannot deactivate driver with an active trip")
			}
			driver.IsActive = *body.IsActive
		}

		if err := db.Save(&driver).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "update failed")
		}
		return c.JSON(driver)
	}
}

func deleteDriver(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var driver Driver
		if err := db.First(&driver, id).Error; err != nil {
			return fiberErr(c, fiber.StatusNotFound, "driver not found")
		}

		if hasAnyTrip(db, driver.ID) {
			return fiberErr(c, fiber.StatusBadRequest, "driver has trip history; deactivate instead of deleting")
		}

		if err := db.Delete(&driver).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "delete failed")
		}
		return c.JSON(fiber.Map{"ok": true})
	}
}
