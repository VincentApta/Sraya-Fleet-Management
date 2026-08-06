package main

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

func TestIssueAndParseToken(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")
	u := &User{ID: 7, Username: "alice", Role: RoleAdministrator}
	tok, err := issueToken(u)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	claims, err := parseToken(tok)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if claims.UserID != 7 || claims.Username != "alice" || claims.Role != RoleAdministrator {
		t.Fatalf("claims mismatch: %+v", claims)
	}
	if !claims.ExpiresAt.After(time.Now()) {
		t.Fatalf("token already expired: %v", claims.ExpiresAt)
	}
}

func TestParseTokenRejectsTampered(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")
	tok, _ := issueToken(&User{ID: 1, Username: "x", Role: RoleOperator})
	if _, err := parseToken(tok + "x"); err == nil {
		t.Fatal("expected error for tampered token")
	}
}

// alg=none must never be accepted, even though it is a syntactically valid JWT.
func TestParseTokenRejectsAlgNone(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")
	none := jwt.NewWithClaims(jwt.SigningMethodNone, &userClaims{UserID: 1})
	tok, _ := none.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if _, err := parseToken(tok); err == nil {
		t.Fatal("expected alg=none to be rejected")
	}
}

func TestBcryptRoundTrip(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("hunter2"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if bcrypt.CompareHashAndPassword(hash, []byte("hunter2")) != nil {
		t.Fatal("valid password rejected")
	}
	if bcrypt.CompareHashAndPassword(hash, []byte("nope")) == nil {
		t.Fatal("wrong password accepted")
	}
}
