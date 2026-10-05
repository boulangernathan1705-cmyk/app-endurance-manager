//go:build windows

package main

import (
	"syscall"
	"time"
	"unsafe"
)

var (
	openFileMapping = kernel32.NewProc("OpenFileMappingW")
	mapViewOfFile   = kernel32.NewProc("MapViewOfFile")
	unmapView       = kernel32.NewProc("UnmapViewOfFile")
	moveMemory      = kernel32.NewProc("RtlMoveMemory")
)

// watchGame reads LMU's shared memory ten times a second while the game runs, and waits for it otherwise.
func watchGame(r *recorder) {
	name, _ := syscall.UTF16PtrFromString(memoryName)
	buffer := make([]byte, memorySize)
	for {
		handle, _, _ := openFileMapping.Call(0x0004, 0, uintptr(unsafe.Pointer(name)))
		if handle == 0 {
			// The game is closed: the session is over, send it now.
			r.flush()
			time.Sleep(5 * time.Second)
			continue
		}
		view, _, _ := mapViewOfFile.Call(handle, 0x0004, 0, 0, memorySize)
		if view == 0 {
			syscall.CloseHandle(syscall.Handle(handle))
			time.Sleep(5 * time.Second)
			continue
		}
		for misses := 0; misses < 600; {
			moveMemory.Call(uintptr(unsafe.Pointer(&buffer[0])), view, memorySize)
			s, ok := readSample(buffer)
			r.feed(s, ok)
			if ok && s.Realtime {
				misses = 0
			} else {
				misses++
			}
			time.Sleep(100 * time.Millisecond)
		}
		// A minute without driving: the session is over, and the memory is let go so the game can close cleanly.
		r.flush()
		unmapView.Call(view)
		syscall.CloseHandle(syscall.Handle(handle))
	}
}
