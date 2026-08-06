package main

import "testing"

func TestHistoryOrder(t *testing.T) {
	for _, c := range []struct {
		in   string
		want string
	}{
		{"", "return_time DESC"},                       // default
		{"-return_time", "return_time DESC"},           // explicit desc
		{"return_time", "return_time ASC"},             // explicit asc
		{"+trip_money_idr", "trip_money_idr ASC"},      // + prefix asc
		{"factory_net_kg", "(factory_gross_kg - factory_tare_kg) ASC"},
		{"-weight_difference_kg", "((pickup_gross_kg - pickup_tare_kg) - (factory_gross_kg - factory_tare_kg)) DESC"},
		{"evil; DROP TABLE--", "return_time DESC"},     // unknown → default, never injected
		{"truck_plate", "return_time DESC"},            // not a whitelisted key
	} {
		if got := historyOrder(c.in); got != c.want {
			t.Errorf("historyOrder(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
