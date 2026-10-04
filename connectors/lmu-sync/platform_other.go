//go:build !windows

package main

import (
	"fmt"
	"os"
	"path/filepath"
)

// Outside Windows: only for the tests.
func message(text string)   { fmt.Println(text) }
func singleInstance() bool  { return true }
func start(path string)     {}
func localAppData() string  { return os.TempDir() }
func startupDir() string    { return filepath.Join(os.TempDir(), "startup") }
func steamRoots() []string  { return nil }
func watchGame(r *recorder) {}
