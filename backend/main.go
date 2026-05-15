package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Store struct {
	Chapters []Chapter `json:"chapters"`
	Problems []Problem `json:"problems"`
}
type Chapter struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}
type Example struct {
	Input  string `json:"input"`
	Output string `json:"output"`
}
type Problem struct {
	ID           string    `json:"id"`
	Number       int       `json:"number"`
	Title        string    `json:"title"`
	Chapter      string    `json:"chapter"`
	Difficulty   string    `json:"difficulty"`
	Tags         []string  `json:"tags"`
	Statement    string    `json:"statement"`
	ProblemText  string    `json:"problemText"`
	Explanation  string    `json:"explanation"`
	HowItWorks   string    `json:"howItWorks"`
	Syntax       string    `json:"syntax"`
	Solve        string    `json:"solve"`
	LessonTitle  string    `json:"lessonTitle"`
	Lesson       string    `json:"lesson"`
	Approach     string    `json:"approach"`
	Pitfalls     []string  `json:"pitfalls"`
	Hints        []string  `json:"hints"`
	StarterCode  string    `json:"starterCode"`
	SolutionCode string    `json:"solutionCode"`
	TestCode     string    `json:"testCode"`
	ExerciseMode string    `json:"exerciseMode"`
	Verifier     string    `json:"verifier"`
	Examples     []Example `json:"examples"`
}
type RunReq struct {
	ProblemID string `json:"problemId"`
	Code      string `json:"code"`
	Mode      string `json:"mode"`
}
type RunResp struct {
	Verdict    string `json:"verdict"`
	Output     string `json:"output"`
	Error      string `json:"error,omitempty"`
	DurationMS int64  `json:"durationMs"`
}
type Config struct {
	BindAddr          string
	Port              string
	AllowedOrigins    map[string]struct{}
	MaxBodyBytes      int64
	MaxCodeBytes      int
	MaxConcurrentRuns int
	RunTimeout        time.Duration
	ImagePullTimeout  time.Duration
	OutputLimit       int
	SandboxRuntime    string
	SandboxImage      string
	SandboxMemory     string
	SandboxCPUs       string
	SandboxPIDs       string
}

var store Store
var config Config
var runSlots chan struct{}

func main() {
	config = loadConfig()
	runSlots = make(chan struct{}, config.MaxConcurrentRuns)

	if err := loadStore(); err != nil {
		panic(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", cors(health))
	mux.HandleFunc("/api/problems", cors(problems))
	mux.HandleFunc("/api/problems/", cors(problem))
	mux.HandleFunc("/api/run", cors(runCode))

	addr := net.JoinHostPort(config.BindAddr, config.Port)
	fmt.Println("GoPrac backend on http://" + addr)

	server := http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		panic(err)
	}
}
func loadConfig() Config {
	return Config{
		BindAddr:          env("GOPRAC_BIND_ADDR", "127.0.0.1"),
		Port:              env("PORT", "8080"),
		AllowedOrigins:    parseOrigins(env("GOPRAC_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")),
		MaxBodyBytes:      int64(envInt("GOPRAC_MAX_BODY_BYTES", 128*1024)),
		MaxCodeBytes:      envInt("GOPRAC_MAX_CODE_BYTES", 64*1024),
		MaxConcurrentRuns: envInt("GOPRAC_MAX_CONCURRENT_RUNS", 2),
		RunTimeout:        envDuration("GOPRAC_RUN_TIMEOUT", 3*time.Second),
		ImagePullTimeout:  envDuration("GOPRAC_SANDBOX_PULL_TIMEOUT", 2*time.Minute),
		OutputLimit:       envInt("GOPRAC_OUTPUT_LIMIT_BYTES", 64*1024),
		SandboxRuntime:    os.Getenv("GOPRAC_SANDBOX_BIN"),
		SandboxImage:      env("GOPRAC_SANDBOX_IMAGE", "golang:1.24-alpine"),
		SandboxMemory:     env("GOPRAC_SANDBOX_MEMORY", "256m"),
		SandboxCPUs:       env("GOPRAC_SANDBOX_CPUS", "1"),
		SandboxPIDs:       env("GOPRAC_SANDBOX_PIDS", "64"),
	}
}
func parseOrigins(value string) map[string]struct{} {
	origins := make(map[string]struct{})
	for _, origin := range strings.Split(value, ",") {
		origin = strings.TrimSpace(origin)
		if origin != "" && origin != "*" {
			origins[origin] = struct{}{}
		}
	}
	return origins
}
func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
func envInt(k string, d int) int {
	v := strings.TrimSpace(os.Getenv(k))
	if v == "" {
		return d
	}
	i, err := strconv.Atoi(v)
	if err != nil || i <= 0 {
		return d
	}
	return i
}
func envDuration(k string, d time.Duration) time.Duration {
	v := strings.TrimSpace(os.Getenv(k))
	if v == "" {
		return d
	}
	if duration, err := time.ParseDuration(v); err == nil && duration > 0 {
		return duration
	}
	if seconds, err := strconv.Atoi(v); err == nil && seconds > 0 {
		return time.Duration(seconds) * time.Second
	}
	return d
}
func loadStore() error {
	b, err := os.ReadFile("../data/problems.json")
	if err != nil {
		b, err = os.ReadFile("data/problems.json")
	}
	if err != nil {
		return err
	}
	return json.Unmarshal(b, &store)
}
func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
func cors(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if _, ok := config.AllowedOrigins[origin]; !ok {
				http.Error(w, "origin not allowed", http.StatusForbidden)
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Add("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h(w, r)
	}
}
func health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"ok": "true"})
}
func problems(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/api/problems" {
		http.NotFound(w, r)
		return
	}
	writeJSON(w, store)
}
func problem(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/problems/")
	for _, p := range store.Problems {
		if p.ID == id {
			writeJSON(w, p)
			return
		}
	}
	http.NotFound(w, r)
}
func runCode(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "method", http.StatusMethodNotAllowed)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, config.MaxBodyBytes)
	defer r.Body.Close()

	var req RunReq
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.ProblemID == "" {
		http.Error(w, "problemId is required", http.StatusBadRequest)
		return
	}
	if req.Mode != "" && req.Mode != "run" && req.Mode != "submit" {
		http.Error(w, "mode must be run or submit", http.StatusBadRequest)
		return
	}
	if len(req.Code) > config.MaxCodeBytes {
		http.Error(w, "code too large", http.StatusRequestEntityTooLarge)
		return
	}

	var p *Problem
	for i := range store.Problems {
		if store.Problems[i].ID == req.ProblemID {
			p = &store.Problems[i]
			break
		}
	}
	if p == nil {
		http.Error(w, "unknown problem", http.StatusNotFound)
		return
	}
	if req.Mode == "submit" && !canSubmit(p) {
		http.Error(w, "submit is only available for judgeable local-test exercises", http.StatusBadRequest)
		return
	}

	select {
	case runSlots <- struct{}{}:
		defer func() { <-runSlots }()
	default:
		http.Error(w, "too many concurrent runs", http.StatusTooManyRequests)
		return
	}

	start := time.Now()
	out, verr := execute(req.Code, p.TestCode, req.Mode)
	resp := RunResp{Verdict: "Accepted", Output: out, DurationMS: time.Since(start).Milliseconds()}
	if verr != nil {
		resp.Verdict = "Error"
		resp.Error = verr.Error()
	}
	writeJSON(w, resp)
}
func canSubmit(p *Problem) bool {
	return p != nil && p.ExerciseMode == "judge" && p.Verifier == "local-tests"
}
func execute(code, tests, mode string) (string, error) {
	if !strings.Contains(code, "package main") {
		code = "package main\n" + code
	}
	if mode != "submit" && !strings.Contains(code, "func main()") {
		code += "\nfunc main(){}\n"
	}

	dir, err := os.MkdirTemp("", "goprac-*")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(dir)
	if err := os.Chmod(dir, 0755); err != nil {
		return "", err
	}

	file := filepath.Join(dir, "main.go")
	if err := os.WriteFile(file, []byte(code), 0644); err != nil {
		return "", err
	}
	files := []string{file}
	if mode == "submit" {
		judge := "package main\nimport (\"fmt\"; \"reflect\")\nfunc assertEqual(got, want any){ if !reflect.DeepEqual(got,want){ panic(fmt.Sprintf(\"got %#v, want %#v\", got, want)) } }\n" + tests
		judgeFile := filepath.Join(dir, "judge.go")
		if err := os.WriteFile(judgeFile, []byte(judge), 0644); err != nil {
			return "", err
		}
		files = append(files, judgeFile)
	}

	return runInSandbox(dir, files, mode)
}
func runInSandbox(dir string, files []string, mode string) (string, error) {
	runtime, err := sandboxRuntime()
	if err != nil {
		return "", err
	}
	if err := ensureSandboxImage(runtime); err != nil {
		return "", err
	}

	ctx, cancel := context.WithTimeout(context.Background(), config.RunTimeout)
	defer cancel()

	args := []string{
		"run", "--rm",
		"--network", "none",
		"--cpus", config.SandboxCPUs,
		"--memory", config.SandboxMemory,
		"--pids-limit", config.SandboxPIDs,
		"--read-only",
		"--tmpfs", "/tmp:rw,nosuid,nodev,size=64m",
		"--security-opt", "no-new-privileges",
		"--cap-drop", "ALL",
		"--user", "65532:65532",
		"-e", "GOCACHE=/tmp/gocache",
		"-e", "GOMODCACHE=/tmp/gomodcache",
		"-e", "GOTMPDIR=/tmp",
		"-e", "HOME=/tmp",
		"-v", dir + ":/workspace:ro",
		"-w", "/workspace",
		config.SandboxImage,
		"go", "run",
	}
	for _, file := range files {
		args = append(args, filepath.ToSlash(filepath.Join("/workspace", filepath.Base(file))))
	}

	cmd := exec.CommandContext(ctx, runtime, args...)
	cmd.Dir = dir

	var buf cappedBuffer
	buf.limit = config.OutputLimit
	cmd.Stdout = &buf
	cmd.Stderr = &buf

	err = cmd.Run()
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return buf.String(), fmt.Errorf("time limit exceeded")
	}
	if err != nil {
		message := strings.TrimSpace(buf.String())
		if message == "" {
			message = err.Error()
		}
		return buf.String(), fmt.Errorf("%s", message)
	}
	if buf.Len() == 0 {
		if mode == "submit" {
			io.WriteString(&buf, "All tests passed.")
		} else {
			io.WriteString(&buf, "Compiled and ran successfully. Add fmt.Println calls to inspect sample behavior in Run mode.")
		}
	}
	return buf.String(), nil
}
func sandboxRuntime() (string, error) {
	if config.SandboxRuntime != "" {
		path, err := exec.LookPath(config.SandboxRuntime)
		if err != nil {
			return "", fmt.Errorf("sandbox runtime %q not found", config.SandboxRuntime)
		}
		return path, nil
	}
	for _, bin := range []string{"docker", "podman"} {
		if path, err := exec.LookPath(bin); err == nil && runtimeUsable(path) {
			return path, nil
		}
	}
	return "", fmt.Errorf("sandbox runtime unavailable: install Docker or Podman, or set GOPRAC_SANDBOX_BIN")
}
func runtimeUsable(runtime string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return exec.CommandContext(ctx, runtime, "info").Run() == nil
}
func ensureSandboxImage(runtime string) error {
	if imageAvailable(runtime) {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), config.ImagePullTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, runtime, "pull", config.SandboxImage)
	var buf cappedBuffer
	buf.limit = config.OutputLimit
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	if err := cmd.Run(); err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return fmt.Errorf("sandbox image pull timed out")
		}
		message := strings.TrimSpace(buf.String())
		if message == "" {
			message = err.Error()
		}
		return fmt.Errorf("sandbox image pull failed: %s", message)
	}
	return nil
}
func imageAvailable(runtime string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return exec.CommandContext(ctx, runtime, "image", "inspect", config.SandboxImage).Run() == nil
}

type cappedBuffer struct {
	bytes.Buffer
	limit     int
	truncated bool
}

func (b *cappedBuffer) Write(p []byte) (int, error) {
	if b.limit <= 0 {
		return len(p), nil
	}
	remaining := b.limit - b.Len()
	if remaining > 0 {
		if len(p) < remaining {
			remaining = len(p)
		}
		_, _ = b.Buffer.Write(p[:remaining])
	}
	if len(p) > remaining {
		b.truncated = true
	}
	return len(p), nil
}
func (b *cappedBuffer) String() string {
	s := b.Buffer.String()
	if b.truncated {
		s += "\n... output truncated ..."
	}
	return s
}
