# GoPrac backend

Local Go HTTP API. Run with `go run .` from backend.

The server binds to `127.0.0.1:8080` by default and only allows browser requests from the local Vite frontend origins. Submitted code is not executed with host `go run`; `/api/run` requires Docker or Podman and runs code in a locked-down container with no network, read-only root filesystem, limited writable tmpfs, dropped capabilities, and CPU, memory, process, timeout, body-size, concurrency, and output limits.

Configuration:

```txt
GOPRAC_BIND_ADDR=127.0.0.1
PORT=8080
GOPRAC_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
GOPRAC_SANDBOX_BIN=docker
GOPRAC_SANDBOX_IMAGE=golang:1.24-alpine
GOPRAC_SANDBOX_MEMORY=256m
GOPRAC_SANDBOX_CPUS=1
GOPRAC_SANDBOX_PIDS=64
GOPRAC_MAX_BODY_BYTES=131072
GOPRAC_MAX_CODE_BYTES=65536
GOPRAC_MAX_CONCURRENT_RUNS=2
GOPRAC_RUN_TIMEOUT=3s
GOPRAC_SANDBOX_PULL_TIMEOUT=2m
GOPRAC_OUTPUT_LIMIT_BYTES=65536
```

The image pull timeout is separate from `GOPRAC_RUN_TIMEOUT`; first-time pulls do not consume the user-code execution budget.
