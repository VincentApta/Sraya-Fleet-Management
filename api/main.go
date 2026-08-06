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

	if err := db.AutoMigrate(&User{}, &Driver{}); err != nil {
		log.Fatalf("auto-migrate failed: %v", err)
	}
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
