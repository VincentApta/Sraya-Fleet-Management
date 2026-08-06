package main

import "testing"

// validRole is the allowlist guarding create/update role assignment; pin its
// accepted set so a changed role constant can't silently widen or narrow it.
func TestValidRole(t *testing.T) {
	for _, r := range []string{RoleAdministrator, RoleOperator} {
		if !validRole(r) {
			t.Errorf("expected %q to be valid", r)
		}
	}
	for _, r := range []string{"", "admin", "Admin", "operator", "Fleet"} {
		if validRole(r) {
			t.Errorf("expected %q to be invalid", r)
		}
	}
}
