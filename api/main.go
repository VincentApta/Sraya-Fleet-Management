package main

import (
	"fmt"
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	dsn := fmt.Sprintf("host=%s port=5432 user=%s password=%s dbname=%s sslmode=disable",
		envOr("DB_HOST", "db"),
		envOr("POSTGRES_USER", "postgres"),
		envOr("POSTGRES_PASSWORD", "postgres"),
		envOr("POSTGRES_DB", "sraya"),
	)

	db, err := connectWithRetry(dsn, 30, 2*time.Second)
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	log.Println("connected to database")

	if err := db.AutoMigrate(&User{}, &Driver{}, &PickupSite{}, &Truck{}, &Trip{}); err != nil {
		log.Fatalf("auto-migrate failed: %v", err)
	}
	// Partial unique indexes: at most one DISPATCHED trip per truck / driver.
	// They back the application-level checks against concurrent dispatches.
	// IF NOT EXISTS keeps this idempotent across restarts.
	db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_truck_dispatched ON trips (truck_id) WHERE status = 'Dispatched'")
	db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_driver_dispatched ON trips (driver_id) WHERE status = 'Dispatched'")
	seedAdmin(db)

	app := fiber.New()
	app.Use(cors.New(cors.Config{
		AllowOrigins:     envOr("WEB_ORIGIN", "http://localhost:5173"),
		AllowCredentials: true,
		AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders:     "Content-Type",
	}))

	auth := app.Group("/api/auth")
	auth.Post("/login", loginHandler(db))
	auth.Get("/me", RequireAuth(), meHandler(db))
	auth.Post("/logout", logoutHandler)

	// Drivers — all endpoints require auth; write ops are admin-only.
	drivers := app.Group("/api/drivers", RequireAuth())
	drivers.Get("/", listDrivers(db))
	drivers.Get("/:id", getDriver(db))
	drivers.Post("/", RequireRole(RoleAdministrator), createDriver(db))
	drivers.Put("/:id", RequireRole(RoleAdministrator), updateDriver(db))
	drivers.Delete("/:id", RequireRole(RoleAdministrator), deleteDriver(db))

	// Pickup sites — all endpoints require auth; write ops are admin-only.
	sites := app.Group("/api/pickup-sites", RequireAuth())
	sites.Get("/", listPickupSites(db))
	sites.Get("/:id", getPickupSite(db))
	sites.Post("/", RequireRole(RoleAdministrator), createPickupSite(db))
	sites.Put("/:id", RequireRole(RoleAdministrator), updatePickupSite(db))
	sites.Delete("/:id", RequireRole(RoleAdministrator), deletePickupSite(db))

	// Trucks — all endpoints require auth; write ops are admin-only.
	trucks := app.Group("/api/trucks", RequireAuth())
	trucks.Get("/", listTrucks(db))
	trucks.Get("/available", listAvailableTrucks(db))
	trucks.Get("/:id", getTruck(db))
	trucks.Post("/", RequireRole(RoleAdministrator), createTruck(db))
	trucks.Put("/:id", RequireRole(RoleAdministrator), updateTruck(db))
	trucks.Delete("/:id", RequireRole(RoleAdministrator), deleteTruck(db))

	// Trips — dispatch is an operational action available to any authenticated
	// operator; reads are auth-only.
	trips := app.Group("/api/trips", RequireAuth())
	trips.Get("/active", listActiveTrips(db))
	trips.Get("/:id", getTrip(db))
	trips.Post("/", createTrip(db))
	trips.Post("/:id/return", returnTrip(db))
	trips.Put("/:id", updateTrip(db))

	// Users — every endpoint is Administrator-only (group-level RequireRole).
	users := app.Group("/api/users", RequireAuth(), RequireRole(RoleAdministrator))
	users.Get("/", listUsers(db))
	users.Get("/:id", getUser(db))
	users.Post("/", createUser(db))
	users.Put("/:id", updateUser(db))
	users.Put("/:id/reset-password", resetUserPassword(db))

	app.Get("/health", func(c *fiber.Ctx) error {
		sqlDB, err := db.DB()
		if err != nil {
			return c.Status(fiber.StatusServiceUnavailable).SendString("db unavailable")
		}
		if err := sqlDB.Ping(); err != nil {
			return c.Status(fiber.StatusServiceUnavailable).SendString("db unavailable")
		}
		return c.Status(fiber.StatusOK).SendString("ok")
	})

	log.Fatal(app.Listen(":8080"))
}

// connectWithRetry opens the GORM connection and waits until a Ping succeeds,
// so the process does not report healthy until the DB is actually reachable.
func connectWithRetry(dsn string, attempts int, wait time.Duration) (*gorm.DB, error) {
	var (
		db  *gorm.DB
		err error
	)
	for i := 0; i < attempts; i++ {
		db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
		if err == nil {
			if sqlDB, e := db.DB(); e == nil {
				if perr := sqlDB.Ping(); perr == nil {
					return db, nil
				}
			}
		}
		log.Printf("db not ready (%d/%d): %v", i+1, attempts, err)
		time.Sleep(wait)
	}
	if db == nil {
		return nil, err
	}
	return db, err
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
