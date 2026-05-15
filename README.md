# GoPrac

GoPrac is a local-first, LeetCode-style Go practice platform built for studying Go concepts and immediately solving coding exercises in the browser.

The goal is not to dump book text into a UI. The goal is to turn Go learning into a tight loop:

1. Read an intuitive study note
2. Understand the Go idea behind the problem
3. Solve in the Monaco editor
4. Run or submit against local judge tests
5. Track progress locally

The current content is inspired by the topic flow of The Go Programming Language, but the lessons, explanations, problem statements, hints, and tests are original/rephrased content.

## Features

- LeetCode-style two-panel coding interface
- React + Vite + TypeScript frontend
- Monaco editor for Go code
- Go backend API
- Container-sandboxed Go code runner
- Per-problem judge tests on submit
- Run mode for compiling/executing code
- 3 second execution timeout
- Chapter filters
- Search across problems and lessons
- Study / Problem / Explain tabs
- Educational lesson content before each problem
- Hints, examples, pitfalls, and solution explanations
- Local solved-progress tracking
- Local draft saving per problem
- No auth, no Supabase, no database required

## Tech Stack

### Frontend

- React
- Vite
- TypeScript
- Tailwind CSS
- Monaco Editor
- Lucide icons

### Backend

- Go
- Standard library HTTP server
- Local `go run` execution
- JSON-backed problem store

### Data

- Problems live in `data/problems.json`
- No remote database
- No server-side user accounts

## Project Structure

```txt
GoPrac/
├── backend/
│   ├── go.mod
│   ├── main.go
│   └── README.md
├── data/
│   └── problems.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── README.md
└── The Go Programming Language - Donovan, Alan A. A. & Kernigha_6127.pdf
```

## Run Locally

You need:

- Node.js
- npm
- Go
- Docker or Podman for running submitted Go code in a sandbox

### 1. Start the backend

From the project root:

```bash
cd backend
go run .
```

The backend runs on:

```txt
http://localhost:8080
```

By default, the backend binds to `127.0.0.1`, only allows browser requests from `http://localhost:5173` and `http://127.0.0.1:5173`, and runs submitted code inside Docker or Podman with no network, a read-only filesystem, and CPU, memory, process, timeout, body-size, concurrency, and output limits.

Useful backend environment variables:

```txt
GOPRAC_BIND_ADDR=127.0.0.1
GOPRAC_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
GOPRAC_SANDBOX_BIN=docker
GOPRAC_SANDBOX_IMAGE=golang:1.24-alpine
GOPRAC_MAX_BODY_BYTES=131072
GOPRAC_MAX_CODE_BYTES=65536
GOPRAC_MAX_CONCURRENT_RUNS=2
GOPRAC_RUN_TIMEOUT=3s
```

### 2. Start the frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on:

```txt
http://localhost:5173
```

## How the App Works

### Study tab

The Study tab is where you read the concept before solving. Each problem includes:

- A lesson title
- Concept explanation
- Study goal
- Key Go habit
- Strategy for attacking the problem
- Common traps

### Problem tab

The Problem tab contains:

- Task statement
- Examples
- Hints

### Explain tab

The Explain tab contains:

- Detailed solution explanation
- Reference solution code

### Editor panel

The right side contains:

- Monaco Go editor
- Run button
- Submit button
- Output panel

## Run vs Submit

### Run

Run compiles and executes your code in a local container sandbox.

If your code has a `main` function, that function runs. If not, the backend adds an empty `main` so the code can still compile.

Use Run when you want to print debug output or quickly check syntax.

### Submit

Submit injects the problem's local judge tests and runs your `Solve` function against them in the same local container sandbox.

If all tests pass, the verdict is `Accepted` and the problem is marked solved in your browser.

## Where Stuff Is Stored

There is no database right now.

### Problems and lessons

Stored in the repo here:

```txt
data/problems.json
```

This includes:

- chapter metadata
- problem statements
- study lessons
- explanations
- hints
- starter code
- reference solutions
- judge tests

### User progress

Stored in browser `localStorage`.

Current localStorage keys:

```txt
solved
```

This tracks solved problem IDs.

### Code drafts

Also stored in browser `localStorage`.

Each problem uses a key like:

```txt
draft:hello-gopher
draft:temp-table
```

This means drafts and solved progress are local to your browser/device. If you clear browser data, use another browser, or use another machine, that progress will not follow you.

## Local Storage Caveat

Because this is intentionally local-only:

- No login is needed
- Nothing syncs between devices
- Progress is not backed up remotely
- Code drafts are not stored in Git automatically

If we later want cross-device progress, the clean upgrade path is adding SQLite, Supabase, or another small DB layer.

## API Endpoints

Backend base URL:

```txt
http://localhost:8080
```

### Health

```txt
GET /api/health
```

Returns backend health status.

### Problems

```txt
GET /api/problems
```

Returns all chapters and problems.

### Single problem

```txt
GET /api/problems/:id
```

Returns one problem by ID.

### Run code

```txt
POST /api/run
```

Request body:

```json
{
  "problemId": "hello-gopher",
  "code": "package main\nfunc Solve(name string) string { return \"Hello, \" + name + \"!\" }",
  "mode": "submit"
}
```

Modes:

- `run`
- `submit`

## Safety Note

The local runner executes Go code on your machine with a timeout.

This is okay for personal/local use, but do not expose this backend publicly to untrusted users without sandboxing.

Before public hosting, replace the local runner with a proper sandbox such as:

- Judge0
- Docker-based isolated runner
- Firecracker/microVM runner
- Separate execution worker with strict OS-level isolation

## Adding a New Problem

Edit:

```txt
data/problems.json
```

Each problem should include:

- `id`
- `number`
- `title`
- `chapter`
- `difficulty`
- `tags`
- `statement`
- `lessonTitle`
- `lesson`
- `approach`
- `pitfalls`
- `hints`
- `starterCode`
- `solutionCode`
- `testCode`
- `examples`

Then restart the backend.

## Verify Before Pushing

Run:

```bash
cd frontend
npm run build

cd ../backend
go test ./...
go build ./...
```

## Current Roadmap

- Make explanations more intuitive and less bland
- Expand Chapter 1 into a fuller study path
- Add more book-flavored original exercises
- Improve judge output with passed/failed test details
- Add a reveal-solution button instead of always showing solution
- Add difficulty/topic progress stats
- Add import/export progress from localStorage
- Optional future DB support

## License / Content Note

This project is for personal learning. The included educational content is original/rephrased and should not copy large chunks from the source book. The PDF is kept locally as a reference only.
