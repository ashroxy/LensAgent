# LensAgent Privacy-Preserving VLM Backend

A high-performance, privacy-preserving browser automation backend designed for the **LensAgent** Chrome Extension. It leverages a local **Qwen2.5-VL-7B** vision-language model running with CUDA GPU acceleration on `llama-server` to analyze browser states and emit zero-knowledge structured actions.

---

## Architecture Highlights

1. **Zero-Knowledge Autofill with Vault Tokens**:
   - The server never sees raw user PII. The client extension passes available vault tokens (e.g. `<VAULT_FULL_NAME>`, `<VAULT_EMAIL>`).
   - The VLM selects the semantic token for each field.
   - The browser extension detokenizes the value locally using Chrome's secure storage before typing via Chrome DevTools Protocol (CDP).

2. **Tri-Stream Perception Processing**:
   - **Visual Stream**: Redacted screenshot frames processed via Lanczos scaling.
   - **DOM Snapshot**: Interactive input and container hierarchy.
   - **Accessibility (AX) Tree**: ARIA roles, labels, and focus states.
   - **Coordinate Mapping**: Automatically computes pixel-accurate bounding box centers `(x, y)` for CDP clicks and typing.

3. **Multi-Turn Session Store**:
   - Manages prompt history, completed actions, pending fields, and scroll offsets.
   - Modular storage architecture with thread-safe **In-Memory Store** (active) and ready-to-use **Supabase Session Store**.

4. **Hardware Acceleration**:
   - Runs `Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf` with `mmproj-Qwen2.5-VL-7B-Instruct-Q8_0.gguf` on CUDA (`-ngl 99`).

---

## Directory Structure

```
browser_backend/
├── app/
│   ├── api/                # API routes (/api/v1/infer, /api/v1/session, /health)
│   ├── actions/            # Action formatting & coordinate resolution
│   ├── config/             # Settings and environment configuration
│   ├── prompts/            # Tri-Stream prompt builder
│   ├── schemas/            # Pydantic schemas (BrowserState, Action, Session)
│   ├── session/            # Session lifecycle & history manager
│   ├── storage/            # In-memory and Supabase store backends
│   ├── utils/              # Structured logging & state hashing
│   ├── validation/         # Action validation & injection prevention
│   ├── vlm/                # Llama.cpp async engine & robust JSON parser
│   ├── workflow/           # Form completion detection & loop prevention
│   └── main.py             # FastAPI entry point & lifespan
├── scripts/
│   ├── start_llama_server.bat     # Launches llama-server with CUDA & mmproj
│   ├── start_backend.bat          # Launches uvicorn FastAPI server
│   └── simulate_extension_loop.py # End-to-end multi-turn simulation
├── tests/                  # Pytest test suite
├── .env                    # Environment variables
├── requirements.txt
└── README.md
```

---

## Quick Start

### 1. Start the Llama Server (Qwen2.5-VL-7B on CUDA)

Run `scripts/start_llama_server.bat` or launch manually:
```bash
"C:\Users\shinc\Downloads\llama-b10709-bin-win-cuda-13.3-x64\llama-server.exe" ^
  -m "C:\Users\shinc\Qwen2.5-VL-7B\Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf" ^
  --mmproj "C:\Users\shinc\Qwen2.5-VL-7B\mmproj-Qwen2.5-VL-7B-Instruct-Q8_0.gguf" ^
  -ngl 99 ^
  -c 4096 ^
  --port 8081
```

### 2. Start the FastAPI Backend

Run `scripts/start_backend.bat` or run with python:
```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The API docs are available at: `http://127.0.0.1:8000/docs`.

### 3. Run Tests

```bash
python -m pytest tests/ -v
```

### 4. Run Live Multi-Turn Simulation

```bash
python scripts/simulate_extension_loop.py
```

---

## API Contract Reference

### `POST /api/v1/infer`

#### Request:
```json
{
  "session_id": "sess_1725345678",
  "task": "Complete the registration form",
  "browser_state": {
    "page": {
      "title": "Registration",
      "url": "http://localhost:3000/register",
      "viewport": { "width": 1280, "height": 720 },
      "scroll": { "x": 0, "y": 0 }
    },
    "elements": [
      {
        "element_id": "auto_name",
        "role": "textbox",
        "label": "Full Name",
        "value": "",
        "bbox": [100, 150, 300, 40],
        "visible": true,
        "enabled": true
      }
    ]
  },
  "screenshot": {
    "mime_type": "image/jpeg",
    "data": "<base64_redacted_image>"
  },
  "available_keys": ["<VAULT_FULL_NAME>", "<VAULT_EMAIL>", "<VAULT_PHONE>"],
  "execution_results": []
}
```

#### Response:
```json
{
  "session_id": "sess_1725345678",
  "status": "continue",
  "thought": "Fill name using vault key and email, then scroll to see lower fields",
  "actions": [
    {
      "action_id": "a1",
      "type": "TYPE",
      "target": "auto_name",
      "x": 250,
      "y": 170,
      "text": "<VAULT_FULL_NAME>",
      "press_enter": false
    },
    {
      "action_id": "a2",
      "type": "SCROLL",
      "x": 640,
      "y": 360,
      "delta_y": 400,
      "direction": "down"
    }
  ],
  "checkpoint": true,
  "reason": "Filling initial fields"
}
```
