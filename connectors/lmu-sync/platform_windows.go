//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

var (
	user32      = syscall.NewLazyDLL("user32.dll")
	kernel32    = syscall.NewLazyDLL("kernel32.dll")
	messageBox  = user32.NewProc("MessageBoxW")
	createMutex = kernel32.NewProc("CreateMutexW")
)

func message(text string) {
	body, _ := syscall.UTF16PtrFromString(text)
	title, _ := syscall.UTF16PtrFromString("Endurance Manager")
	messageBox.Call(0, uintptr(unsafe.Pointer(body)), uintptr(unsafe.Pointer(title)), 0x40)
}

// singleInstance keeps one synchroniser running per Windows session.
func singleInstance() bool {
	name, _ := syscall.UTF16PtrFromString("Local\\EnduranceManagerSync")
	handle, _, err := createMutex.Call(0, 0, uintptr(unsafe.Pointer(name)))
	return handle != 0 && err != syscall.ERROR_ALREADY_EXISTS
}

func start(path string) {
	command := exec.Command(path)
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = command.Start()
}

func localAppData() string { return os.Getenv("LOCALAPPDATA") }

func startupDir() string {
	return filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
}

// steamRoots: where Steam says it is installed, then its usual folders.
func steamRoots() []string {
	roots := []string{}
	var key syscall.Handle
	subkey, _ := syscall.UTF16PtrFromString(`Software\Valve\Steam`)
	if syscall.RegOpenKeyEx(syscall.HKEY_CURRENT_USER, subkey, 0, syscall.KEY_READ, &key) == nil {
		defer syscall.RegCloseKey(key)
		value, _ := syscall.UTF16PtrFromString("SteamPath")
		buffer := make([]uint16, 520)
		size := uint32(len(buffer) * 2)
		if syscall.RegQueryValueEx(key, value, nil, nil, (*byte)(unsafe.Pointer(&buffer[0])), &size) == nil {
			roots = append(roots, filepath.FromSlash(syscall.UTF16ToString(buffer)))
		}
	}
	return append(roots, `C:\Program Files (x86)\Steam`, `C:\Program Files\Steam`)
}
