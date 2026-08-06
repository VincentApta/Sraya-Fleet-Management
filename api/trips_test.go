package main

import "testing"

func TestLoadStatus(t *testing.T) {
	for _, c := range []struct {
		net, cap int
		want     string
	}{
		{699, 800, "Underweight"},
		{800, 800, "At capacity"},
		{801, 800, "Overweight"},
	} {
		if got := loadStatus(c.net, c.cap); got != c.want {
			t.Errorf("loadStatus(%d, %d) = %q, want %q", c.net, c.cap, got, c.want)
		}
	}
}

func TestTripWithCalcs(t *testing.T) {
	pg, pt, fg, ft := 1000, 200, 900, 200
	trip := Trip{
		Status:             TripStatusReturned,
		CapacitySnapshotKg: 800,
		PickupGrossKg:      &pg,
		PickupTareKg:       &pt,
		FactoryGrossKg:     &fg,
		FactoryTareKg:      &ft,
	}
	r := tripWithCalcs(trip)
	if r.PickupNetKg == nil || *r.PickupNetKg != 800 {
		t.Fatalf("pickup_net_kg = %v, want 800", r.PickupNetKg)
	}
	if r.FactoryNetKg == nil || *r.FactoryNetKg != 700 {
		t.Fatalf("factory_net_kg = %v, want 700", r.FactoryNetKg)
	}
	if r.WeightDifferenceKg == nil || *r.WeightDifferenceKg != 100 {
		t.Fatalf("weight_difference_kg = %v, want 100", r.WeightDifferenceKg)
	}
	if r.LoadStatus == nil || *r.LoadStatus != "Underweight" {
		t.Fatalf("load_status = %v, want Underweight", r.LoadStatus)
	}
}

// Dispatched trips and Returned trips missing weights must yield no calcs.
func TestTripWithCalcsOmitted(t *testing.T) {
	for _, trip := range []Trip{
		{Status: TripStatusDispatched},
		{Status: TripStatusReturned}, // no weights recorded
	} {
		if r := tripWithCalcs(trip); r.PickupNetKg != nil || r.LoadStatus != nil {
			t.Fatalf("expected nil computed fields for %+v, got %+v", trip, r)
		}
	}
}
