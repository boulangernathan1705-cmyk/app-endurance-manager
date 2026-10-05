package main

import (
	"testing"
	"time"
)

func drive(r *recorder, from sample, steps int, change func(*sample, int)) sample {
	s := from
	for i := 0; i < steps; i++ {
		change(&s, i)
		s.ET += 0.1
		r.feed(s, true)
	}
	return s
}

func TestLapsAndStops(t *testing.T) {
	var sessions []liveSession
	r := &recorder{now: func() time.Time { return time.UnixMilli(1_790_000_000_000) }, done: func(s liveSession) { sessions = append(sessions, s) }}
	s := sample{Realtime: true, Track: "Spa", Car: "Alpine A424", Class: "Hypercar", TrackTemp: 30, Fuel: 90, FuelCapacity: 90, Energy: 100, Speed: 200}
	for i := range s.Wheels {
		s.Wheels[i] = wheel{Temp: 85, Wear: 1, Brake: 500}
	}
	// Out of the garage first: not a stop.
	s = drive(r, s, 300, func(s *sample, i int) { s.InPits, s.PitState, s.Speed = i < 299, 5, float64(i%2)*0.5 })
	s.PitState, s.Speed = 0, 200
	s = drive(r, s, 600, func(s *sample, i int) {})
	// The out lap has no time: it is not kept.
	s.LapsDone = 1
	s.ET += 0.1
	r.feed(s, true)
	// Two laps on track: fuel, energy and tyres go down, top speed 310 km/h.
	for lap := 1; lap <= 2; lap++ {
		s = drive(r, s, 1200, func(s *sample, i int) {
			s.Fuel -= 0.003
			s.Energy -= 0.003
			for w := range s.Wheels {
				s.Wheels[w].Wear -= 0.00001
			}
			s.Speed = 200 + float64(i%110)
		})
		s.LapsDone, s.LastLap = int16(lap+1), 120+float64(lap)
		s.ET += 0.1
		r.feed(s, true)
	}
	// A stop: 20 s in the lane, 12 s stopped, 30 l of fuel and four new tyres (LMU's pit state: 2, 4 when serviced, 5).
	s = drive(r, s, 40, func(s *sample, i int) { s.InPits, s.PitState, s.Speed = true, 2, 60 })
	s = drive(r, s, 120, func(s *sample, i int) {
		s.PitState, s.Speed = 4, 0
		if i == 60 {
			s.Fuel += 30
			for w := range s.Wheels {
				s.Wheels[w].Wear = 1
			}
		}
	})
	s = drive(r, s, 40, func(s *sample, i int) { s.PitState, s.Speed = 5, 60 })
	s = drive(r, s, 1, func(s *sample, i int) { s.InPits, s.PitState, s.Speed = false, 0, 200 })
	s.LapsDone, s.LastLap = 4, 140
	r.feed(s, true)
	// A lap on track LMU counts without a time (-1): kept for its fuel, without the time.
	s = drive(r, s, 1200, func(s *sample, i int) { s.Fuel -= 0.003 })
	s.LapsDone, s.LastLap = 5, -1
	r.feed(s, true)
	// Back to the menus: the session is sent.
	for i := 0; i < 1300; i++ {
		r.feed(sample{}, false)
	}
	if len(sessions) != 1 {
		t.Fatalf("sessions: %d", len(sessions))
	}
	got := sessions[0]
	if got.Laps[0].Time != 121 || got.Laps[1].Top < 300 || got.Laps[0].Fuel < 3.5 || got.Laps[0].Fuel > 3.7 {
		t.Fatalf("laps: %+v", got.Laps)
	}
	if got.Laps[0].Wear[0] < 1.1 || got.Laps[0].Wear[0] > 1.3 || got.Laps[0].Temp[0] != 85 || got.Laps[0].TrackTemp != 30 {
		t.Fatalf("tyres: %+v", got.Laps[0])
	}
	if !got.Laps[2].Pit || got.Laps[2].Fuel != 0 {
		t.Fatalf("pit lap: %+v", got.Laps[2])
	}
	if len(got.Laps) != 4 || got.Laps[3].Time != 0 || got.Laps[3].Fuel < 3.5 {
		t.Fatalf("untimed lap: %+v", got.Laps)
	}
	if len(got.Stops) != 1 {
		t.Fatalf("stops: %+v", got.Stops)
	}
	stop := got.Stops[0]
	if stop.Lane < 19 || stop.Lane > 21 || stop.Stationary < 11.5 || stop.Stationary > 12.5 || stop.Tyres != 4 || stop.Fuel < 29.9 {
		t.Fatalf("stop: %+v", stop)
	}
}
