package main

import (
	"bytes"
	"encoding/csv"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// historySort maps each allowed sort key to its SQL expression over the trips
// table. Computed columns are real SQL so the database sorts before pagination
// rather than us loading every row. ponytail: assumes a Returned trip always has
// all four weights (enforced by the return endpoint); a partial row's NULLs would
// sort last in ASC, first in DESC — acceptable since none are expected.
var historySort = map[string]string{
	"return_time":          "return_time",
	"factory_net_kg":       "(factory_gross_kg - factory_tare_kg)",
	"weight_difference_kg": "((pickup_gross_kg - pickup_tare_kg) - (factory_gross_kg - factory_tare_kg))",
	"trip_money_idr":       "trip_money_idr",
}

// historyOrder turns the sort query param into a safe ORDER BY clause. A "-"
// prefix is descending; default is "-return_time". Unknown keys fall back to the
// default, so the whitelist can never be bypassed by user input.
func historyOrder(sortParam string) string {
	desc := false
	if strings.HasPrefix(sortParam, "-") {
		desc = true
		sortParam = sortParam[1:]
	} else if strings.HasPrefix(sortParam, "+") {
		sortParam = sortParam[1:]
	}
	expr, ok := historySort[sortParam]
	if !ok {
		expr = historySort["return_time"]
		desc = true
	}
	if desc {
		return expr + " DESC"
	}
	return expr + " ASC"
}

// parseHistoryDate parses a YYYY-MM-DD value in server-local time.
func parseHistoryDate(s string) (time.Time, bool) {
	t, err := time.ParseInLocation("2006-01-02", s, time.Local)
	return t, err == nil
}

// historyQuery builds the filtered RETURNED-trips scope shared by the list and
// export endpoints. The caller is responsible for Count / Order / Preload / Find.
func historyQuery(c *fiber.Ctx, db *gorm.DB) *gorm.DB {
	q := db.Model(&Trip{}).Where("status = ?", TripStatusReturned)

	if s := c.Query("start"); s != "" {
		if t, ok := parseHistoryDate(s); ok {
			q = q.Where("return_time >= ?", t)
		}
	}
	if e := c.Query("end"); e != "" {
		if t, ok := parseHistoryDate(e); ok {
			// t is start-of-day; add a day so the whole end day is included.
			q = q.Where("return_time < ?", t.AddDate(0, 0, 1))
		}
	}
	for _, p := range []struct{ query, col string }{
		{"truck_id", "truck_id"},
		{"driver_id", "driver_id"},
		{"pickup_site_id", "pickup_site_id"},
	} {
		if v := c.Query(p.query); v != "" {
			if id, err := strconv.Atoi(v); err == nil && id > 0 {
				q = q.Where(p.col+" = ?", id)
			}
		}
	}
	if search := strings.TrimSpace(c.Query("q")); search != "" {
		like := "%" + search + "%"
		// Match across the related tables via subqueries — keeps the trips
		// query free of JOIN column ambiguity. ILIKE is case-insensitive.
		q = q.Where(
			"truck_id IN (SELECT id FROM trucks WHERE plate_number ILIKE ?) OR "+
				"driver_id IN (SELECT id FROM drivers WHERE full_name ILIKE ?) OR "+
				"pickup_site_id IN (SELECT id FROM pickup_sites WHERE site_name ILIKE ?)",
			like, like, like,
		)
	}
	return q
}

// listTripHistory — GET /api/trips/history. Paginated, filterable, sortable list
// of RETURNED trips with associations preloaded and the read-time calcs.
func listTripHistory(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		page, _ := strconv.Atoi(c.Query("page", "1"))
		perPage, _ := strconv.Atoi(c.Query("per_page", "25"))
		if page < 1 {
			page = 1
		}
		if perPage < 1 || perPage > 100 {
			perPage = 25
		}

		q := historyQuery(c, db)

		var total int64
		q.Count(&total)

		var trips []Trip
		if err := q.Preload("Truck").Preload("Driver").Preload("PickupSite").
			Order(historyOrder(c.Query("sort", "-return_time"))).
			Offset((page - 1) * perPage).Limit(perPage).Find(&trips).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "query failed")
		}

		views := make([]tripResponse, len(trips))
		for i, t := range trips {
			views[i] = tripWithCalcs(t)
		}
		return c.JSON(fiber.Map{
			"data":     views,
			"total":    total,
			"page":     page,
			"per_page": perPage,
		})
	}
}

// exportTripHistory — GET /api/trips/history/export. Same filters as the list,
// rendered as a CSV download (no pagination, all matching rows).
func exportTripHistory(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		q := historyQuery(c, db)

		var trips []Trip
		if err := q.Preload("Truck").Preload("Driver").Preload("PickupSite").
			Order(historyOrder(c.Query("sort", "-return_time"))).
			Find(&trips).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "query failed")
		}

		var buf bytes.Buffer
		w := csv.NewWriter(&buf)
		w.Write([]string{
			"return_time", "truck_plate", "driver_name", "site_name",
			"dispatch_time", "trip_money_idr",
			"pickup_gross_kg", "pickup_tare_kg", "factory_gross_kg", "factory_tare_kg",
			"pickup_net_kg", "factory_net_kg", "weight_difference_kg",
			"capacity_snapshot_kg", "load_status",
		})
		for _, t := range trips {
			r := tripWithCalcs(t)
			w.Write([]string{
				ptrTimeFormat(r.ReturnTime, "2006-01-02 15:04:05"),
				plateOf(r.Truck),
				driverName(r.Driver),
				siteName(r.PickupSite),
				r.DispatchTime.Format("2006-01-02 15:04:05"),
				strconv.Itoa(r.TripMoneyIDR),
				intOrBlank(r.PickupGrossKg),
				intOrBlank(r.PickupTareKg),
				intOrBlank(r.FactoryGrossKg),
				intOrBlank(r.FactoryTareKg),
				intOrBlank(r.PickupNetKg),
				intOrBlank(r.FactoryNetKg),
				intOrBlank(r.WeightDifferenceKg),
				strconv.Itoa(r.CapacitySnapshotKg),
				ptrString(r.LoadStatus),
			})
		}
		w.Flush()

		c.Set("Content-Type", "text/csv")
		c.Set("Content-Disposition", `attachment; filename="trips_history.csv"`)
		return c.Status(fiber.StatusOK).Send(buf.Bytes())
	}
}

// intOrBlank renders a nil-sentinel int as "" (nil weights in a Returned row).
func intOrBlank(v *int) string {
	if v == nil {
		return ""
	}
	return strconv.Itoa(*v)
}

// ptrTimeFormat formats an optional time; nil → "".
func ptrTimeFormat(t *time.Time, layout string) string {
	if t == nil {
		return ""
	}
	return t.Format(layout)
}

func plateOf(t *Truck) string {
	if t == nil {
		return ""
	}
	return t.PlateNumber
}

func driverName(d *Driver) string {
	if d == nil {
		return ""
	}
	return d.FullName
}

func siteName(s *PickupSite) string {
	if s == nil {
		return ""
	}
	return s.SiteName
}
