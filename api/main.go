package main

import (
	"fmt"
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
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

	app := fiber.New()
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
