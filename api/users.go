package main

import (
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type userCreateInput struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

// Pointers distinguish "omitted" from a zero value: an omitted role leaves it
// unchanged, an omitted is_active leaves status unchanged.
type userUpdateInput struct {
	Role     *string `json:"role"`
	IsActive *bool   `json:"is_active"`
}

type resetPasswordInput struct {
	Password string `json:"password"`
}

// validRole reports whether r is one of the configured account roles.
func validRole(r string) bool {
	return r == RoleAdministrator || r == RoleOperator
}

// PasswordHash has json:"-" (models.go), so any *User returned here omits the
// hash by construction — same guarantee the auth handlers rely on.
func listUsers(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		page, _ := strconv.Atoi(c.Query("page", "1"))
		perPage, _ := strconv.Atoi(c.Query("per_page", "25"))
		if page < 1 {
			page = 1
		}
		if perPage < 1 || perPage > 100 {
			perPage = 25
		}

		q := db.Model(&User{})
		if active := c.Query("is_active"); active != "" {
			if active == "true" {
				q = q.Where("is_active = ?", true)
			} else if active == "false" {
				q = q.Where("is_active = ?", false)
			}
		}

		var total int64
		q.Count(&total)

		var users []User
		if err := q.Order("id DESC").Offset((page - 1) * perPage).Limit(perPage).Find(&users).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "query failed")
		}

		return c.JSON(fiber.Map{
			"data":     users,
			"total":    total,
			"page":     page,
			"per_page": perPage,
		})
	}
}

func getUser(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var user User
		if err := db.First(&user, id).Error; err != nil {
			return fiberErr(c, fiber.StatusNotFound, "user not found")
		}
		return c.JSON(user)
	}
}

func createUser(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body userCreateInput
		if err := c.BodyParser(&body); err != nil {
			return fiberErr(c, fiber.StatusBadRequest, "invalid request body")
		}
		if body.Username == "" {
			return fiberErr(c, fiber.StatusBadRequest, "username is required")
		}
		if body.Password == "" {
			return fiberErr(c, fiber.StatusBadRequest, "password is required")
		}
		if !validRole(body.Role) {
			return fiberErr(c, fiber.StatusBadRequest, "role must be Administrator or Fleet Operator")
		}

		// Friendly pre-check; the DB unique index is the race backstop.
		var existing User
		if err := db.Where("username = ?", body.Username).First(&existing).Error; err == nil {
			return fiberErr(c, fiber.StatusConflict, "username already exists")
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return fiberErr(c, fiber.StatusInternalServerError, "query failed")
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
		if err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "could not hash password")
		}

		user := User{
			Username:     body.Username,
			PasswordHash: string(hash),
			Role:         body.Role,
			IsActive:     true,
		}
		if err := db.Create(&user).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "create failed")
		}
		return c.Status(fiber.StatusCreated).JSON(user)
	}
}

func updateUser(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var user User
		if err := db.First(&user, id).Error; err != nil {
			return fiberErr(c, fiber.StatusNotFound, "user not found")
		}

		var body userUpdateInput
		if err := c.BodyParser(&body); err != nil {
			return fiberErr(c, fiber.StatusBadRequest, "invalid request body")
		}

		if body.Role != nil {
			if !validRole(*body.Role) {
				return fiberErr(c, fiber.StatusBadRequest, "role must be Administrator or Fleet Operator")
			}
			user.Role = *body.Role
		}

		if body.IsActive != nil {
			// ponytail: no last-admin guard; deactivating the only Administrator
			// locks everyone out (fix via DB or reseed). Add a count guard when
			// the product needs self-service protection.
			user.IsActive = *body.IsActive
		}

		if err := db.Save(&user).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "update failed")
		}
		return c.JSON(user)
	}
}

func resetUserPassword(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var user User
		if err := db.First(&user, id).Error; err != nil {
			return fiberErr(c, fiber.StatusNotFound, "user not found")
		}

		var body resetPasswordInput
		if err := c.BodyParser(&body); err != nil {
			return fiberErr(c, fiber.StatusBadRequest, "invalid request body")
		}
		if body.Password == "" {
			return fiberErr(c, fiber.StatusBadRequest, "password is required")
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
		if err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "could not hash password")
		}
		user.PasswordHash = string(hash)
		if err := db.Save(&user).Error; err != nil {
			return fiberErr(c, fiber.StatusInternalServerError, "update failed")
		}
		return c.JSON(fiber.Map{"ok": true})
	}
}
