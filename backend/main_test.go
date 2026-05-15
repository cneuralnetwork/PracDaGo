package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestProblemPreservesLearningFlowFields(t *testing.T) {
	body, err := json.Marshal(Problem{
		ProblemText: "problem copy",
		HowItWorks:  "how copy",
		Syntax:      "syntax copy",
		Solve:       "solve copy",
	})
	if err != nil {
		t.Fatal(err)
	}

	for _, want := range []string{
		`"problemText":"problem copy"`,
		`"howItWorks":"how copy"`,
		`"syntax":"syntax copy"`,
		`"solve":"solve copy"`,
	} {
		if !strings.Contains(string(body), want) {
			t.Fatalf("marshaled problem missing %s in %s", want, body)
		}
	}
}

func TestDefaultConfigIsLocalAndCorsRestricted(t *testing.T) {
	t.Setenv("GOPRAC_BIND_ADDR", "")
	t.Setenv("GOPRAC_ALLOWED_ORIGINS", "")

	cfg := loadConfig()
	if cfg.BindAddr != "127.0.0.1" {
		t.Fatalf("default bind address = %q, want 127.0.0.1", cfg.BindAddr)
	}
	if _, ok := cfg.AllowedOrigins["*"]; ok {
		t.Fatal("wildcard origin should never be allowed")
	}
	if _, ok := cfg.AllowedOrigins["http://localhost:5173"]; !ok {
		t.Fatal("default localhost frontend origin missing")
	}
}

func TestCorsRejectsUnknownOrigin(t *testing.T) {
	config = Config{AllowedOrigins: parseOrigins("http://localhost:5173")}
	handler := cors(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodPost, "/api/run", nil)
	req.Header.Set("Origin", "https://example.test")
	rr := httptest.NewRecorder()

	handler(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusForbidden)
	}
}

func TestRunCodeRejectsOversizedBody(t *testing.T) {
	config = Config{MaxBodyBytes: 16, MaxCodeBytes: 1024, RunTimeout: time.Second}
	runSlots = make(chan struct{}, 1)
	store = Store{Problems: []Problem{{ID: "hello"}}}

	req := httptest.NewRequest(http.MethodPost, "/api/run", strings.NewReader(`{"problemId":"hello","code":"package main"}`))
	rr := httptest.NewRecorder()

	runCode(rr, req)

	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusRequestEntityTooLarge)
	}
}

func TestRunCodeRejectsProjectSubmit(t *testing.T) {
	config = Config{MaxBodyBytes: 1024, MaxCodeBytes: 1024}
	store = Store{Problems: []Problem{{
		ID:           "exercise-1-3",
		ExerciseMode: "project",
		Verifier:     "manual",
		TestCode:     `func main(){ panic("should not execute") }`,
	}}}

	req := httptest.NewRequest(http.MethodPost, "/api/run", strings.NewReader(`{"problemId":"exercise-1-3","code":"package main","mode":"submit"}`))
	rr := httptest.NewRecorder()

	runCode(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadRequest)
	}
	if !strings.Contains(rr.Body.String(), "judgeable local-test") {
		t.Fatalf("response %q does not explain the submit restriction", rr.Body.String())
	}
}

func TestRunCodeLimitsConcurrentRuns(t *testing.T) {
	config = Config{MaxBodyBytes: 1024, MaxCodeBytes: 1024, RunTimeout: time.Second}
	runSlots = make(chan struct{}, 1)
	runSlots <- struct{}{}
	store = Store{Problems: []Problem{{ID: "hello"}}}

	req := httptest.NewRequest(http.MethodPost, "/api/run", strings.NewReader(`{"problemId":"hello","code":"package main","mode":"run"}`))
	rr := httptest.NewRecorder()

	runCode(rr, req)

	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusTooManyRequests)
	}
}

func TestSandboxRuntimeFallsBackWhenDockerUnusable(t *testing.T) {
	binDir := t.TempDir()
	writeFakeRuntime(t, binDir, "docker", "info", 1, 0)
	writeFakeRuntime(t, binDir, "podman", "info", 0, 0)
	t.Setenv("PATH", binDir)
	config = Config{}

	runtime, err := sandboxRuntime()
	if err != nil {
		t.Fatalf("sandboxRuntime returned error: %v", err)
	}
	if filepath.Base(runtime) != "podman" {
		t.Fatalf("runtime = %q, want podman", runtime)
	}
}

func TestImagePullDoesNotConsumeRunTimeout(t *testing.T) {
	binDir := t.TempDir()
	logPath := filepath.Join(t.TempDir(), "runtime.log")
	writeFakeRuntime(t, binDir, "docker", "", 0, 150*time.Millisecond, logPath)
	t.Setenv("PATH", binDir)
	config = Config{
		RunTimeout:       100 * time.Millisecond,
		ImagePullTimeout: time.Second,
		SandboxImage:     "example.test/goprac:latest",
		OutputLimit:      1024,
	}

	dir := t.TempDir()
	file := filepath.Join(dir, "main.go")
	if err := os.WriteFile(file, []byte("package main\nfunc main(){}\n"), 0644); err != nil {
		t.Fatal(err)
	}

	out, err := runInSandbox(dir, []string{file}, "run")
	if err != nil {
		t.Fatalf("runInSandbox returned error: %v", err)
	}
	if !strings.Contains(out, "Compiled and ran successfully") {
		t.Fatalf("output = %q", out)
	}
	logData, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatal(err)
	}
	log := string(logData)
	if !strings.Contains(log, "image inspect example.test/goprac:latest") || !strings.Contains(log, "pull example.test/goprac:latest") || !strings.Contains(log, "run --rm") {
		t.Fatalf("runtime log missing expected commands: %s", log)
	}
}

func writeFakeRuntime(t *testing.T, dir, name, failingCommand string, failingExit int, sleep time.Duration, extraLog ...string) {
	t.Helper()
	logPath := ""
	if len(extraLog) > 0 {
		logPath = extraLog[0]
	}
	script := "#!/bin/sh\n"
	if logPath != "" {
		script += "echo \"$@\" >> " + shellQuote(logPath) + "\n"
	}
	if sleep > 0 {
		script += "if [ \"$1\" = \"pull\" ]; then sleep " + strconv.FormatFloat(sleep.Seconds(), 'f', 3, 64) + "; fi\n"
	}
	if failingCommand != "" {
		script += "if [ \"$1\" = " + shellQuote(failingCommand) + " ]; then exit " + strconv.Itoa(failingExit) + "; fi\n"
	}
	script += "if [ \"$1\" = \"image\" ] && [ \"$2\" = \"inspect\" ]; then exit 1; fi\n"
	script += "exit 0\n"
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(script), 0755); err != nil {
		t.Fatal(err)
	}
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}
