# GoPrac

Local-only LeetCode-style Go practice site inspired by the topics/exercises of *The Go Programming Language*. Content is rewritten/original and stored as JSON, not pasted from book pages/images.

## Run locally

Terminal 1:
```bash
cd backend
go run .
```

Terminal 2:
```bash
cd frontend
npm run dev
```

Open http://localhost:5173

## Structure
- `frontend/` React + Vite + TypeScript + Monaco editor
- `backend/` Go HTTP API and local Go code runner
- `data/problems.json` seed problem/chapter content
- PDF remains in project root for reference only

## Current limitations
- No Supabase/auth by request.
- Submit injects per-problem local judge tests with a 3s timeout.
- Local runner is for personal/local use only, not safe for public untrusted users.
