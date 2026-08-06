package main

import (
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const (
	cookieName = "token"
	jwtExpiry  = 24 * time.Hour
	// devJWTSecret is an insecure fallback so local dev works without setup.
	// ponytail: dev-only; set JWT_SECRET in any non-local environment.
	devJWTSecret = "change-me-in-production"
)

// userClaims is the JWT payload: identity fields plus the standard expiry.
type userClaims struct {
	UserID   uint   `json:"user_id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

func jwtSecret() []byte {
	if s := os.Getenv("JWT_SECRET"); s != "" {
		return []byte(s)
	}
	log.Println("warning: JWT_SECRET unset, using insecure dev fallback")
	return []byte(devJWTSecret)
}

func issueToken(user *User) (string, error) {
	now := time.Now()
	claims := userClaims{
		UserID:   user.ID,
		Username: user.Username,
		Role:     user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(jwtExpiry)),
			IssuedAt:  jwt.NewNumericDate(now),
			Subject:   fmt.Sprintf("%d", user.ID),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(jwtSecret())
}

// parseToken validates the signature, algorithm (rejects alg=none etc.) and
// expiry. A valid token yields its claims; anything else is an auth failure.
func parseToken(raw string) (*userClaims, error) {
	var claims userClaims
	tok, err := jwt.ParseWithClaims(raw, &claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return jwtSecret(), nil
	})
	if err != nil || !tok.Valid {
		return nil, errors.New("invalid token")
	}
	return &claims, nil
}

func authCookie(value string, maxAge int) fiber.Cookie {
	return fiber.Cookie{
		Name:     cookieName,
		Value:    value,
		HTTPOnly: true,
		SameSite: "Lax",
		Secure:   strings.EqualFold(os.Getenv("COOKIE_SECURE"), "true"),
		Path:     "/",
		MaxAge:   maxAge,
	}
}

func fiberErr(c *fiber.Ctx, status int, msg string) error {
	return c.Status(status).JSON(fiber.Map{"error": msg})
}

// --- Handlers ---

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func loginHandler(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body loginRequest
		if err := c.BodyParser(&body); err != nil {
			return fiberErr(c, fiber.StatusBadRequest, "invalid request body")
		}
		if body.Username == "" || body.Password == "" {
			return fiberErr(c, fiber.StatusBadRequest, "username and password are required")
		}

		var user User
		err := db.Where("username = ?", body.Username).First(&user).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fiberErr(c, fiber.StatusUnauthorized, "invalid credentials")
		}
		if err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "query failed")
		}

		if !user.IsActive {
			return fiberErr(c, fiber.StatusForbidden, "account is inactive")
		}
		if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.Password)) != nil {
			return fiberErr(c, fiber.StatusUnauthorized, "invalid credentials")
		}

		token, err := issueToken(&user)
		if err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "could not issue token")
		}
		cookie := authCookie(token, int(jwtExpiry.Seconds()))
		c.Cookie(&cookie)
		return c.JSON(fiber.Map{"user": user})
	}
}

func meHandler(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		claims := c.Locals("claims").(*userClaims)
		var user User
		if err := db.First(&user, claims.UserID).Error; err != nil {
			return fiberErr(c, fiber.StatusUnauthorized, "user not found")
		}
		return c.JSON(fiber.Map{"user": user})
	}
}

func logoutHandler(c *fiber.Ctx) error {
	cookie := authCookie("", -1)
	c.Cookie(&cookie)
	return c.JSON(fiber.Map{"ok": true})
}

// --- Middleware ---

// RequireAuth validates the JWT cookie and loads the claims onto the request
// context (c.Locals "claims", "user_id", "role"). Unauthorized otherwise.
func RequireAuth() fiber.Handler {
	return func(c *fiber.Ctx) error {
		raw := c.Cookies(cookieName)
		if raw == "" {
			return fiberErr(c, fiber.StatusUnauthorized, "missing token")
		}
		claims, err := parseToken(raw)
		if err != nil {
			return fiberErr(c, fiber.StatusUnauthorized, "invalid or expired token")
		}
		c.Locals("claims", claims)
		c.Locals("user_id", claims.UserID)
		c.Locals("role", claims.Role)
		return c.Next()
	}
}

// RequireRole allows the request only if the caller's role is in roles.
// Requires RequireAuth to have run first (sets c.Locals "role").
// ponytail: not yet wired to a route; reserved for the admin user-management endpoints.
func RequireRole(roles ...string) fiber.Handler {
	allowed := make(map[string]struct{}, len(roles))
	for _, r := range roles {
		allowed[r] = struct{}{}
	}
	return func(c *fiber.Ctx) error {
		role, _ := c.Locals("role").(string)
		if _, ok := allowed[role]; !ok {
			return fiberErr(c, fiber.StatusForbidden, "insufficient role")
		}
		return c.Next()
	}
}

// --- Seeder ---

// seedAdmin creates the initial administrator account when the user table is
// empty, so a fresh deployment is reachable without manual SQL.
func seedAdmin(db *gorm.DB) {
	var count int64
	if err := db.Model(&User{}).Count(&count).Error; err != nil {
		log.Printf("seeder: cannot count users: %v", err)
		return
	}
	if count > 0 {
		return
	}
	username := envOr("ADMIN_USERNAME", "admin")
	password := envOr("ADMIN_PASSWORD", "admin123")
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("seeder: cannot hash admin password: %v", err)
		return
	}
	if err := db.Create(&User{
		Username:     username,
		PasswordHash: string(hash),
		Role:         RoleAdministrator,
		IsActive:     true,
	}).Error; err != nil {
		log.Printf("seeder: cannot create admin: %v", err)
		return
	}
	log.Printf("seeder: created initial admin %q", username)
}
