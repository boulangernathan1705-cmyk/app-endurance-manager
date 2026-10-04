// Endurance Manager · synchroniseur LMU.
//
// Lit les fichiers de résultats que Le Mans Ultimate écrit après chaque séance
// (UserData\Log\Results\*.xml) et les envoie à la page « Mon entraînement ».
// Il ne lit rien d'autre, ne modifie rien dans le jeu et n'ouvre aucune fenêtre.
// Le site écrit l'adresse et la clé personnelle du pilote à la fin du fichier
// téléchargé ; la clé ne permet que d'envoyer des séances et se retire depuis le site.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

const (
	marker    = "EMSYNC1"
	keepDays  = 60
	scanEvery = time.Minute
	maxFile   = 3_000_000
)

type config struct {
	Origin string `json:"origin"`
	Token  string `json:"token"`
}

var trailerPattern = regexp.MustCompile(`EMSYNC1 (https://[A-Za-z0-9.-]+(?::\d+)?) ([a-f0-9]{64}) EMSYNC1`)

// readTrailer finds the site's address and the pilot key written at the end of the program.
func readTrailer(program []byte) (config, bool) {
	tail := program
	if len(tail) > 1024 {
		tail = tail[len(tail)-1024:]
	}
	match := trailerPattern.FindSubmatch(tail)
	if match == nil {
		return config{}, false
	}
	return config{Origin: string(match[1]), Token: string(match[2])}, true
}

// libraryPaths reads the Steam libraries listed in libraryfolders.vdf.
func libraryPaths(vdf string) []string {
	var paths []string
	for _, match := range regexp.MustCompile(`"path"\s+"([^"]+)"`).FindAllStringSubmatch(vdf, -1) {
		paths = append(paths, strings.ReplaceAll(match[1], `\\`, `\`))
	}
	return paths
}

// resultsDirs lists the LMU results folders found in the Steam libraries.
func resultsDirs(steamRoots []string) []string {
	seen := map[string]bool{}
	var dirs []string
	for _, root := range steamRoots {
		libraries := []string{root}
		if vdf, err := os.ReadFile(filepath.Join(root, "steamapps", "libraryfolders.vdf")); err == nil {
			libraries = append(libraries, libraryPaths(string(vdf))...)
		}
		for _, library := range libraries {
			dir := filepath.Join(library, "steamapps", "common", "Le Mans Ultimate", "UserData", "Log", "Results")
			key := strings.ToLower(filepath.Clean(dir))
			if info, err := os.Stat(dir); err == nil && info.IsDir() && !seen[key] {
				seen[key] = true
				dirs = append(dirs, dir)
			}
		}
	}
	return dirs
}

type state struct {
	Sent map[string]bool `json:"sent"`
}

// pending lists the results files not sent yet: recent, finished (unchanged for 15 s), oldest first.
func pending(dirs []string, sent map[string]bool, now time.Time) []string {
	type item struct {
		path string
		at   time.Time
	}
	var items []item
	for _, dir := range dirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if entry.IsDir() || !strings.EqualFold(filepath.Ext(entry.Name()), ".xml") {
				continue
			}
			info, err := entry.Info()
			if err != nil || info.Size() == 0 || info.Size() > maxFile {
				continue
			}
			age := now.Sub(info.ModTime())
			if age < 15*time.Second || age > keepDays*24*time.Hour || sent[fileKey(filepath.Join(dir, entry.Name()), info)] {
				continue
			}
			items = append(items, item{filepath.Join(dir, entry.Name()), info.ModTime()})
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].at.Before(items[j].at) })
	paths := make([]string, len(items))
	for i, it := range items {
		paths[i] = it.path
	}
	return paths
}

func fileKey(path string, info os.FileInfo) string {
	return strings.ToLower(filepath.Base(path)) + "|" + info.ModTime().UTC().Format(time.RFC3339)
}

var errRevoked = errors.New("liaison retirée")

// send posts one file. A file the site refuses (not a session of the pilot) is never sent again.
func send(client *http.Client, cfg config, path string) (done bool, err error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}
	request, err := http.NewRequest(http.MethodPost, cfg.Origin+"/api/training/collector", bytes.NewReader(data))
	if err != nil {
		return false, err
	}
	request.Header.Set("Authorization", "Bearer "+cfg.Token)
	request.Header.Set("Content-Type", "application/xml")
	request.Header.Set("User-Agent", "EnduranceManagerSync/1")
	response, err := client.Do(request)
	if err != nil {
		return false, err
	}
	response.Body.Close()
	switch {
	case response.StatusCode == http.StatusUnauthorized:
		return false, errRevoked
	case response.StatusCode < 300, response.StatusCode == 400, response.StatusCode == 413:
		return true, nil
	default:
		return false, errors.New(response.Status)
	}
}

// syncOnce sends what is pending; it stops at the first network error and tries again at the next scan.
func syncOnce(client *http.Client, cfg config, dirs []string, st *state, now time.Time) error {
	for _, path := range pending(dirs, st.Sent, now) {
		info, err := os.Stat(path)
		if err != nil {
			continue
		}
		done, err := send(client, cfg, path)
		if err != nil {
			return err
		}
		if done {
			st.Sent[fileKey(path, info)] = true
		}
	}
	return nil
}

func loadJSON(path string, value any) {
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, value)
	}
}

func saveJSON(path string, value any) {
	if data, err := json.Marshal(value); err == nil {
		_ = os.WriteFile(path, data, 0o600)
	}
}

// run is the background loop of the copy that starts with Windows.
func run(home string, steamRoots func() []string) {
	client := &http.Client{Timeout: 60 * time.Second}
	st := state{Sent: map[string]bool{}}
	loadJSON(filepath.Join(home, "sent.json"), &st)
	if st.Sent == nil {
		st.Sent = map[string]bool{}
	}
	revoked := ""
	for {
		var cfg config
		loadJSON(filepath.Join(home, "config.json"), &cfg)
		if cfg.Token != "" && cfg.Token != revoked {
			err := syncOnce(client, cfg, resultsDirs(steamRoots()), &st, time.Now())
			if errors.Is(err, errRevoked) {
				revoked = cfg.Token
			}
			saveJSON(filepath.Join(home, "sent.json"), st)
		}
		time.Sleep(scanEvery)
	}
}

func main() {
	home := filepath.Join(localAppData(), "EnduranceManager")
	_ = os.MkdirAll(home, 0o700)
	self, _ := os.Executable()
	program, _ := os.ReadFile(self)
	cfg, ok := readTrailer(program)
	target := filepath.Join(startupDir(), "EnduranceManagerSync.exe")
	if !strings.EqualFold(filepath.Clean(self), filepath.Clean(target)) {
		// Double-clicked after the download: keep the key, start with Windows from now on, start now.
		if !ok {
			message("Ce programme se télécharge depuis la page « Mon entraînement » du site Endurance Manager : il contient ta liaison personnelle.")
			return
		}
		saveJSON(filepath.Join(home, "config.json"), cfg)
		_ = os.WriteFile(target, program, 0o755)
		start(target)
		message("C'est prêt ! Tes séances Le Mans Ultimate seront envoyées toutes seules sur « Mon entraînement », à chaque fin de séance.\n\nLe synchroniseur démarre avec Windows, sans fenêtre. Pour l'arrêter, retire la liaison sur le site.")
		return
	}
	if ok {
		var saved config
		loadJSON(filepath.Join(home, "config.json"), &saved)
		if saved.Token == "" {
			saveJSON(filepath.Join(home, "config.json"), cfg)
		}
	}
	if !singleInstance() {
		return
	}
	run(home, steamRoots)
}
