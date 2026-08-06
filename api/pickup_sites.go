package main

import (
	"strconv"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

type pickupSiteInput struct {
	SiteName   string   `json:"site_name"`
	DistanceKm *float64 `json:"distance_km"` // pointer to distinguish omitted from 0
	IsActive   *bool    `json:"is_active"`   // pointer to distinguish omitted from false
}

// siteHasActiveTrip checks whether the pickup site is on a dispatched trip.
func siteHasActiveTrip(db *gorm.DB, siteID uint) bool {
	var count int64
	db.Model(&Trip{}).Where("pickup_site_id = ? AND status = ?", siteID, TripStatusDispatched).Count(&count)
	return count > 0
}

// siteHasAnyTrip checks whether the pickup site has ever been used in any trip.
func siteHasAnyTrip(db *gorm.DB, siteID uint) bool {
	var count int64
	db.Model(&Trip{}).Where("pickup_site_id = ?", siteID).Count(&count)
	return count > 0
}

func listPickupSites(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		page, _ := strconv.Atoi(c.Query("page", "1"))
		perPage, _ := strconv.Atoi(c.Query("per_page", "25"))
		if page < 1 {
			page = 1
		}
		if perPage < 1 || perPage > 100 {
			perPage = 25
		}

		q := db.Model(&PickupSite{})
		if active := c.Query("is_active"); active != "" {
			if active == "true" {
				q = q.Where("is_active = ?", true)
			} else if active == "false" {
				q = q.Where("is_active = ?", false)
			}
		}

		var total int64
		q.Count(&total)

		var sites []PickupSite
		if err := q.Order("id DESC").Offset((page - 1) * perPage).Limit(perPage).Find(&sites).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "query failed")
		}

		return c.JSON(fiber.Map{
			"data":     sites,
			"total":    total,
			"page":     page,
			"per_page": perPage,
		})
	}
}

func getPickupSite(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var site PickupSite
		if err := db.First(&site, id).Error; err != nil {
			return fiberErr(c, fiber.StatusNotFound, "pickup site not found")
		}
		return c.JSON(site)
	}
}

func createPickupSite(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body pickupSiteInput
		if err := c.BodyParser(&body); err != nil {
			return fiberErr(c, fiber.StatusBadRequest, "invalid request body")
		}
		if body.SiteName == "" {
			return fiberErr(c, fiber.StatusBadRequest, "site_name is required")
		}
		if body.DistanceKm == nil || *body.DistanceKm <= 0 {
			return fiberErr(c, fiber.StatusBadRequest, "distance_km is required and must be greater than 0")
		}

		site := PickupSite{SiteName: body.SiteName, DistanceKm: *body.DistanceKm, IsActive: true}
		if err := db.Create(&site).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "create failed")
		}
		return c.Status(fiber.StatusCreated).JSON(site)
	}
}

func updatePickupSite(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var site PickupSite
		if err := db.First(&site, id).Error; err != nil {
			return fiberErr(c, fiber.StatusNotFound, "pickup site not found")
		}

		var body pickupSiteInput
		if err := c.BodyParser(&body); err != nil {
			return fiberErr(c, fiber.StatusBadRequest, "invalid request body")
		}

		if body.SiteName != "" {
			site.SiteName = body.SiteName
		}

		if body.DistanceKm != nil {
			// distance_km must remain strictly positive.
			if *body.DistanceKm <= 0 {
				return fiberErr(c, fiber.StatusBadRequest, "distance_km must be greater than 0")
			}
			site.DistanceKm = *body.DistanceKm
		}

		if body.IsActive != nil {
			// Prevent deactivation while on an active trip.
			if !*body.IsActive && site.IsActive && siteHasActiveTrip(db, site.ID) {
				return fiberErr(c, fiber.StatusBadRequest, "cannot deactivate pickup site on an active trip")
			}
			site.IsActive = *body.IsActive
		}

		if err := db.Save(&site).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "update failed")
		}
		return c.JSON(site)
	}
}

func deletePickupSite(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var site PickupSite
		if err := db.First(&site, id).Error; err != nil {
			return fiberErr(c, fiber.StatusNotFound, "pickup site not found")
		}

		if siteHasAnyTrip(db, site.ID) {
			return fiberErr(c, fiber.StatusBadRequest, "pickup site has trip history; deactivate instead of deleting")
		}

		if err := db.Delete(&site).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "delete failed")
		}
		return c.JSON(fiber.Map{"ok": true})
	}
}
