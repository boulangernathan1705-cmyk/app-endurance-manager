package main

// Live data: while the pilot drives, LMU publishes its state in the shared memory "LMU_Data" (header
// SharedMemoryInterface.hpp in the game's Support folder; offsets from pyLMUSharedMemory, pack 4). The program
// reads the player's car ten times a second and keeps, per lap, what the results file does not have: tyre wear and
// temperatures, compound, top speed, fuel in litres, track temperature; and each pit stop broken down.

import (
	"bytes"
	"encoding/binary"
	"math"
	"strings"
	"time"
)

const (
	memoryName   = "LMU_Data"
	memorySize   = 324820
	scoringInfo  = 1632 // SharedMemoryObjectOut.scoring.scoringInfo
	vehScoring   = 2192
	vehSize      = 584
	telemetryOff = 128464
	telemInfo    = 128468
	telemSize    = 1888
	maxVehicles  = 104
)

type wheel struct {
	Temp, Wear, Pressure, Brake float64
	Compound                    uint8
}

type sample struct {
	ET                          float64
	Realtime                    bool
	Session                     int32
	Track, Car, Class, Driver   string
	TrackTemp, AirTemp, Rain    float64
	LapsDone                    int16
	LastLap                     float64
	InPits                      bool
	PitState                    uint8
	Pitstops                    int16
	Speed                       float64
	Fuel, FuelCapacity, Energy  float64
	Damage                      int
	Invalid                     bool
	TrackLimits                 uint8
	FrontCompound, RearCompound string
	Wheels                      [4]wheel
}

func f64(b []byte, at int) float64 { return math.Float64frombits(binary.LittleEndian.Uint64(b[at:])) }
func f32(b []byte, at int) float64 {
	return float64(math.Float32frombits(binary.LittleEndian.Uint32(b[at:])))
}
func text(b []byte, at, size int) string {
	raw := b[at : at+size]
	if end := bytes.IndexByte(raw, 0); end >= 0 {
		raw = raw[:end]
	}
	return strings.TrimSpace(string(raw))
}

// readSample decodes the player's car from a copy of the shared memory; ok is false when nobody drives.
func readSample(b []byte) (s sample, ok bool) {
	if len(b) < memorySize || b[telemetryOff+2] == 0 {
		return s, false
	}
	t := telemInfo + int(b[telemetryOff+1])*telemSize
	id := int32(binary.LittleEndian.Uint32(b[t:]))
	count := int(int32(binary.LittleEndian.Uint32(b[scoringInfo+104:])))
	v := -1
	for i := 0; i < count && i < maxVehicles; i++ {
		at := vehScoring + i*vehSize
		if b[at+196] != 0 || int32(binary.LittleEndian.Uint32(b[at:])) == id {
			v = at
			break
		}
	}
	if v < 0 {
		return s, false
	}
	s = sample{ET: f64(b, t+12), Realtime: b[scoringInfo+115] != 0, Session: int32(binary.LittleEndian.Uint32(b[scoringInfo+64:])),
		Track: text(b, scoringInfo, 64), Driver: text(b, v+4, 32), Car: text(b, v+36, 64), Class: text(b, v+200, 32),
		TrackTemp: f64(b, scoringInfo+236), AirTemp: f64(b, scoringInfo+228), Rain: f64(b, scoringInfo+220),
		LapsDone: int16(binary.LittleEndian.Uint16(b[v+100:])), LastLap: f64(b, v+168), InPits: b[v+198] != 0, PitState: b[v+457],
		Pitstops: int16(binary.LittleEndian.Uint16(b[v+192:])),
		Speed:    math.Sqrt(f64(b, t+184)*f64(b, t+184)+f64(b, t+192)*f64(b, t+192)+f64(b, t+200)*f64(b, t+200)) * 3.6,
		Fuel:     f64(b, t+524), FuelCapacity: f64(b, t+608), Energy: f32(b, t+776) * 100,
		Invalid: b[t+745] != 0, TrackLimits: b[t+767], FrontCompound: text(b, t+620, 18), RearCompound: text(b, t+638, 18)}
	if model := text(b, t+796, 30); model != "" {
		s.Car = model
	}
	for i := 0; i < 8; i++ {
		s.Damage += int(b[t+544+i])
	}
	for i := range s.Wheels {
		w := t + 848 + i*260
		// The tyre's carcass temperature, the one the game shows (the surface swings by 20 °C a corner); kelvin, as the brakes.
		s.Wheels[i] = wheel{Temp: f64(b, w+204) - 273.15, Wear: f64(b, w+152), Pressure: f64(b, w+120),
			Brake: f64(b, w+24) - 273.15, Compound: b[w+241]}
	}
	return s, true
}

// What is sent for one lap and one stop (percent of the tyre worn, °C, km/h, litres, seconds).
type liveLap struct {
	N           int        `json:"n"`
	Time        float64    `json:"t"`
	Top         float64    `json:"top"`
	Fuel        float64    `json:"fuel"`
	Energy      float64    `json:"ve"`
	Wear        [4]float64 `json:"wear"`
	Temp        [4]float64 `json:"temp"`
	Brake       [4]float64 `json:"brake"`
	Pressure    [4]float64 `json:"kpa"`
	Compound    string     `json:"compound"`
	TrackTemp   float64    `json:"track"`
	AirTemp     float64    `json:"air"`
	Rain        float64    `json:"rain"`
	Invalid     bool       `json:"invalid,omitempty"`
	Pit         bool       `json:"pit,omitempty"`
	TrackLimits int        `json:"limits,omitempty"`
}

type liveStop struct {
	Lap        int     `json:"lap"`
	Lane       float64 `json:"lane"`
	Stationary float64 `json:"stopped"`
	Fuel       float64 `json:"fuel"`
	Energy     float64 `json:"ve"`
	Tyres      int     `json:"tyres"`
	Repair     bool    `json:"repair,omitempty"`
}

type liveSession struct {
	At           int64      `json:"at"`
	Track        string     `json:"track"`
	Car          string     `json:"car"`
	Class        string     `json:"class"`
	Driver       string     `json:"driver,omitempty"`
	Session      int32      `json:"session"`
	FuelCapacity float64    `json:"capacity"`
	Laps         []liveLap  `json:"laps"`
	Stops        []liveStop `json:"stops"`
}

type lapState struct {
	start                     sample
	top, tSum, bSum, trackSum float64
	temps, brakes             [4]float64
	count, trackCount         int
	pit                       bool
	limits                    uint8
}

type stopState struct {
	enter, stopStart, stopEnd float64
	before, after             sample
	stopped                   bool
}

// recorder turns the samples into laps and stops; done is called with each finished session.
type recorder struct {
	now     func() time.Time
	done    func(liveSession)
	session *liveSession
	last    sample
	lap     *lapState
	stop    *stopState
	idle    int
	onTrack bool // out of the pit lane at least once in this session
}

func (r *recorder) flush() {
	if r.session != nil && len(r.session.Laps) > 0 {
		r.done(*r.session)
	}
	r.session, r.lap, r.stop, r.onTrack = nil, nil, nil, false
}

// feed takes one sample (ok=false when the game is closed or nobody drives).
func (r *recorder) feed(s sample, ok bool) {
	if !ok || !s.Realtime {
		// Back to the menus for a while (about 2 minutes): the session is over.
		if r.idle++; r.idle > 1200 {
			r.flush()
			r.idle = 0
		}
		return
	}
	r.idle = 0
	if r.session != nil && (s.Session != r.last.Session || s.Track != r.last.Track || s.Car != r.last.Car || s.ET+5 < r.last.ET) {
		r.flush()
	}
	if r.session == nil {
		r.session = &liveSession{At: r.now().UnixMilli(), Track: s.Track, Car: s.Car, Class: s.Class, Driver: s.Driver, Session: s.Session}
		r.lap = &lapState{start: s}
	}
	r.session.FuelCapacity = s.FuelCapacity
	lap := r.lap
	if s.Speed > lap.top && !s.InPits {
		lap.top = s.Speed
	}
	if s.InPits {
		lap.pit = true
	} else if s.Speed > 60 {
		for i, w := range s.Wheels {
			lap.temps[i] += w.Temp
			lap.brakes[i] += w.Brake
		}
		lap.count++
	}
	lap.trackSum += s.TrackTemp
	lap.trackCount++
	if s.TrackLimits > lap.limits {
		lap.limits = s.TrackLimits
	}
	r.pitStop(s)
	if !s.InPits {
		r.onTrack = true
	}
	if s.LapsDone > r.last.LapsDone && r.last.Realtime {
		r.closeLap(s)
	}
	r.last = s
}

func round(value float64, digits int) float64 {
	scale := math.Pow(10, float64(digits))
	return math.Round(value*scale) / scale
}

func (r *recorder) closeLap(s sample) {
	lap, start := r.lap, r.lap.start
	out := liveLap{N: int(s.LapsDone), Time: round(s.LastLap, 3), Top: round(lap.top, 1), Compound: s.FrontCompound,
		Rain: round(s.Rain, 2), AirTemp: round(s.AirTemp, 1), Invalid: s.Invalid, Pit: lap.pit, TrackLimits: int(lap.limits)}
	if s.RearCompound != "" && s.RearCompound != s.FrontCompound {
		out.Compound += " / " + s.RearCompound
	}
	if lap.trackCount > 0 {
		out.TrackTemp = round(lap.trackSum/float64(lap.trackCount), 1)
	}
	// Used during the lap; nothing when a stop refilled or changed it.
	if used := start.Fuel - s.Fuel; used > 0 && !lap.pit {
		out.Fuel = round(used, 3)
	}
	if used := start.Energy - s.Energy; used > 0 && !lap.pit {
		out.Energy = round(used, 3)
	}
	for i := range s.Wheels {
		if used := start.Wheels[i].Wear - s.Wheels[i].Wear; used >= 0 && !lap.pit {
			out.Wear[i] = round(used*100, 3)
		}
		if lap.count > 0 {
			out.Temp[i] = round(lap.temps[i]/float64(lap.count), 1)
			out.Brake[i] = round(lap.brakes[i]/float64(lap.count), 0)
		}
		out.Pressure[i] = round(s.Wheels[i].Pressure, 1)
	}
	if out.Time > 0 {
		r.session.Laps = append(r.session.Laps, out)
	}
	r.lap = &lapState{start: s}
}

// A stop: from the pit lane entry to its exit, with the time stopped in the box and what changed meanwhile.
func (r *recorder) pitStop(s sample) {
	switch {
	case s.InPits && r.stop == nil:
		// Only a lane entered from the track: leaving the garage is not a stop.
		if r.onTrack {
			r.stop = &stopState{enter: s.ET, before: s}
		}
	case s.InPits && r.stop != nil:
		// Stopped in the box (LMU's pit state is not reliable: 4, not 3, while serviced).
		if s.Speed < 1 {
			// What changed is counted from the lane entry: the game may serve as soon as the car stops.
			if !r.stop.stopped {
				r.stop.stopped, r.stop.stopStart = true, s.ET
			}
			r.stop.stopEnd, r.stop.after = s.ET, s
		}
	case !s.InPits && r.stop != nil:
		stop := r.stop
		r.stop = nil
		if !stop.stopped || stop.stopEnd <= stop.stopStart || s.ET-stop.enter > 600 {
			return
		}
		out := liveStop{Lap: int(s.LapsDone), Lane: round(s.ET-stop.enter, 2), Stationary: round(stop.stopEnd-stop.stopStart, 2),
			Fuel: round(math.Max(0, stop.after.Fuel-stop.before.Fuel), 2), Energy: round(math.Max(0, stop.after.Energy-stop.before.Energy), 2),
			Repair: stop.after.Damage < stop.before.Damage}
		for i := range s.Wheels {
			if stop.after.Wheels[i].Wear > stop.before.Wheels[i].Wear+0.01 {
				out.Tyres++
			}
		}
		r.session.Stops = append(r.session.Stops, out)
	}
}
