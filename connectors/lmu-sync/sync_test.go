package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestTrailer(t *testing.T) {
	key := strings.Repeat("ab", 32)
	cfg, ok := readTrailer(append(make([]byte, 5000), []byte("\nEMSYNC1 https://endurance-manager.app "+key+" EMSYNC1\n")...))
	if !ok || cfg.Origin != "https://endurance-manager.app" || cfg.Token != key {
		t.Fatalf("trailer not read: %+v", cfg)
	}
	if _, ok := readTrailer([]byte("EMSYNC1 http://evil " + key + " EMSYNC1")); ok {
		t.Fatal("plain http accepted")
	}
}

func TestFindsAndSendsResults(t *testing.T) {
	steam := t.TempDir()
	library := t.TempDir()
	os.MkdirAll(filepath.Join(steam, "steamapps"), 0o755)
	os.WriteFile(filepath.Join(steam, "steamapps", "libraryfolders.vdf"), []byte(`"libraryfolders" { "1" { "path" "`+strings.ReplaceAll(library, `\`, `\\`)+`" } }`), 0o644)
	results := filepath.Join(library, "steamapps", "common", "Le Mans Ultimate", "UserData", "Log", "Results")
	os.MkdirAll(results, 0o755)
	// The pilot's name in LMU's settings goes with each file (online, every driver is marked as the player).
	player := filepath.Join(library, "steamapps", "common", "Le Mans Ultimate", "UserData", "player")
	os.MkdirAll(player, 0o755)
	os.WriteFile(filepath.Join(player, "Settings.JSON"), []byte(`{"DRIVER":{"Player Name":"Nathan Boulanger","Player Nick":""}}`), 0o644)
	old := time.Now().Add(-time.Minute)
	for _, name := range []string{"a.xml", "b.xml", "notes.txt"} {
		path := filepath.Join(results, name)
		os.WriteFile(path, []byte("<rFactorXML/>"), 0o644)
		os.Chtimes(path, old, old)
	}
	os.WriteFile(filepath.Join(results, "writing.xml"), []byte("<r"), 0o644)
	dirs := resultsDirs([]string{steam})
	if len(dirs) != 1 {
		t.Fatalf("dirs: %v", dirs)
	}
	calls, status := 0, http.StatusOK
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/api/training/collector" || r.Header.Get("Authorization") != "Bearer key" {
			t.Errorf("bad request %s %s", r.URL.Path, r.Header.Get("Authorization"))
		}
		if r.Header.Get("X-LMU-Name") != "Nathan%20Boulanger" {
			t.Errorf("player name: %q", r.Header.Get("X-LMU-Name"))
		}
		w.WriteHeader(status)
	}))
	defer server.Close()
	cfg := config{Origin: server.URL, Token: "key"}
	st := state{Sent: map[string]bool{}}
	if err := syncOnce(server.Client(), cfg, dirs, &st, time.Now()); err != nil || calls != 2 {
		t.Fatalf("first sync: %v, %d calls", err, calls)
	}
	if err := syncOnce(server.Client(), cfg, dirs, &st, time.Now()); err != nil || calls != 2 {
		t.Fatalf("files sent twice: %d calls", calls)
	}
	path := filepath.Join(results, "c.xml")
	os.WriteFile(path, []byte("<rFactorXML/>"), 0o644)
	os.Chtimes(path, old, old)
	status = http.StatusUnauthorized
	if err := syncOnce(server.Client(), cfg, dirs, &st, time.Now()); err != errRevoked {
		t.Fatalf("revoked link not seen: %v", err)
	}
}
