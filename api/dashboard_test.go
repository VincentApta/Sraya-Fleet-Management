package main

import (
	"testing"
	"time"
)

func TestParseDateWindow(t *testing.T) {
	d := func(s string) time.Time {
		pt, err := time.ParseInLocation("2006-01-02", s, time.Local)
		if err != nil {
			t.Fatalf("bad fixture date %q: %v", s, err)
		}
		return pt
	}
	today := d("2026-08-06")

	for _, c := range []struct {
		name       string
		start, end string
		wantStart  time.Time
		wantEnd    time.Time
		wantOk     bool
	}{
		{"both empty default to today", "", "", today, d("2026-08-07"), true},
		{"lone start spans one day", "2026-08-01", "", d("2026-08-01"), d("2026-08-02"), true},
		{"lone end spans one day", "", "2026-08-03", d("2026-08-03"), d("2026-08-04"), true},
		{"range is inclusive of end day", "2026-08-01", "2026-08-03", d("2026-08-01"), d("2026-08-04"), true},
		{"bad start rejected", "not-a-date", "", time.Time{}, time.Time{}, false},
		{"bad end rejected", "2026-08-01", "2026-13-99", time.Time{}, time.Time{}, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			start, end, ok := parseDateWindow(c.start, c.end, today)
			if ok != c.wantOk {
				t.Fatalf("ok = %v, want %v", ok, c.wantOk)
			}
			if ok && (!start.Equal(c.wantStart) || !end.Equal(c.wantEnd)) {
				t.Fatalf("window = [%v, %v), want [%v, %v)", start, end, c.wantStart, c.wantEnd)
			}
		})
	}
}
