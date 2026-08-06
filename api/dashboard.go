package main

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// dailyTB is one day of the factory-receipt TBS chart.
type dailyTB struct {
	Date    string `json:"date"`
	TotalKg int64  `json:"total_kg"`
}

// siteCount is the completed-trips-by-pickup-site chart entry.
type siteCount struct {
	SiteName string `json:"site_name"`
	Count    int64  `json:"count"`
}

// parseDateWindow turns start/end "YYYY-MM-DD" strings into a half-open
// [t0, t1) window of server-local time covering the inclusive start..end days.
// now is the default for missing values (today); a lone value spans just that
// day. ok is false when a supplied value is not a valid date.
func parseDateWindow(startRaw, endRaw string, now time.Time) (start, end time.Time, ok bool) {
	parse := func(s string) (time.Time, bool) {
		t, err := time.ParseInLocation("2006-01-02", s, time.Local)
		return t, err == nil
	}

	sStart, hasStart := time.Time{}, false
	if startRaw != "" {
		t, good := parse(startRaw)
		if !good {
			return start, end, false
		}
		sStart, hasStart = t, true
	}
	sEnd, hasEnd := time.Time{}, false
	if endRaw != "" {
		t, good := parse(endRaw)
		if !good {
			return start, end, false
		}
		sEnd, hasEnd = t, true
	}

	switch {
	case hasStart && hasEnd:
		start, end = sStart, sEnd
	case hasStart:
		start, end = sStart, sStart
	case hasEnd:
		start, end = sEnd, sEnd
	default:
		start, end = now, now
	}

	// end is inclusive of the whole day → midnight of the following day.
	end = end.AddDate(0, 0, 1)
	return start, end, true
}

// parseDateRange maps the ?start=&end= query params to a date window, defaulting
// to today.
func parseDateRange(c *fiber.Ctx) (start, end time.Time, ok bool) {
	return parseDateWindow(c.Query("start"), c.Query("end"), time.Now())
}

// dashboardStats returns the live operational KPIs. active_trip_count and
// trucks_out are always current (all DISPATCHED trips); todays_factory_tbs_total
// sums factory_net over trips returned in the selected range (default today).
// The field keeps the "today" name for API compatibility but respects the range.
func dashboardStats(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		start, end, ok := parseDateRange(c)
		if !ok {
			return fiberErr(c, fiber.StatusBadRequest, "start and end must be YYYY-MM-DD")
		}

		var activeTripCount, trucksOut, tbsTotal int64
		if err := db.Model(&Trip{}).Where("status = ?", TripStatusDispatched).Count(&activeTripCount).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "query failed")
		}
		if err := db.Model(&Trip{}).Where("status = ?", TripStatusDispatched).Distinct("truck_id").Count(&trucksOut).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "query failed")
		}
		// Returned trips always carry all four weights (validated on return), so
		// the IS NOT NULL guard is belt-and-braces against partial rows.
		if err := db.Model(&Trip{}).
			Where("status = ? AND factory_gross_kg IS NOT NULL AND factory_tare_kg IS NOT NULL", TripStatusReturned).
			Where("return_time >= ? AND return_time < ?", start, end).
			Select("COALESCE(SUM(factory_gross_kg - factory_tare_kg), 0)::bigint").
			Scan(&tbsTotal).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "query failed")
		}

		return c.JSON(fiber.Map{
			"active_trip_count":        activeTripCount,
			"trucks_out":               trucksOut,
			"todays_factory_tbs_total": tbsTotal,
		})
	}
}

// dashboardChartData returns the two summary series over the selected range:
// daily_tbs (factory_net per return day) and trips_by_site (returned trips
// grouped by pickup site).
func dashboardChartData(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		start, end, ok := parseDateRange(c)
		if !ok {
			return fiberErr(c, fiber.StatusBadRequest, "start and end must be YYYY-MM-DD")
		}

		var daily []dailyTB
		if err := db.Model(&Trip{}).
			Select("TO_CHAR(return_time, 'YYYY-MM-DD') AS date, COALESCE(SUM(factory_gross_kg - factory_tare_kg), 0)::bigint AS total_kg").
			Where("status = ? AND factory_gross_kg IS NOT NULL AND factory_tare_kg IS NOT NULL", TripStatusReturned).
			Where("return_time >= ? AND return_time < ?", start, end).
			Group("TO_CHAR(return_time, 'YYYY-MM-DD')").
			Order("date").
			Scan(&daily).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "query failed")
		}

		var bySite []siteCount
		if err := db.Model(&Trip{}).
			Table("trips").
			Select("pickup_sites.site_name AS site_name, COUNT(*)::bigint AS count").
			Joins("JOIN pickup_sites ON pickup_sites.id = trips.pickup_site_id").
			Where("trips.status = ?", TripStatusReturned).
			Where("trips.return_time >= ? AND trips.return_time < ?", start, end).
			Group("pickup_sites.site_name").
			Order("count DESC").
			Scan(&bySite).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "query failed")
		}

		return c.JSON(fiber.Map{
			"daily_tbs":     daily,
			"trips_by_site": bySite,
		})
	}
}
