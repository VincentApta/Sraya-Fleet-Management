package main

import (
	"strconv"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// TripStatus constants live in models.go; referenced by the active-trip guard.

type driverInput struct {
	FullName string `json:"full_name"`
	IsActive *bool  `json:"is_active"` // pointer to distinguish omitted from false
}

// hasActiveTrip checks whether the driver is on a dispatched trip.
func hasActiveTrip(db *gorm.DB, driverID uint) bool {
	var count int64
	db.Model(&Trip{}).Where("driver_id = ? AND status = ?", driverID, TripStatusDispatched).Count(&count)
	return count > 0
}

// hasAnyTrip checks whether the driver has ever been used in any trip.
func hasAnyTrip(db *gorm.DB, driverID uint) bool {
	var count int64
	db.Model(&Trip{}).Where("driver_id = ?", driverID).Count(&count)
	return count > 0
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
