# Plan: FastAPI Document Parsing Server wrapping LiteParse

## 1. What is LiteParse?

LiteParse (`@llamaindex/liteparse`, v1.1.0) is an open-source **Node.js/TypeScript** library for PDF parsing with spatial text extraction, OCR, and bounding boxes. It is published on **npm** (not PyPI), runs entirely locally, and provides both a library API and a CLI (`liteparse` / `lit`).

### Key capabilities

| Feature | Details |
|---|---|
| Spatial text extraction | Precise per-character and per-line bounding boxes via grid projection |
| OCR | Built-in Tesseract.js (zero-setup) or pluggable HTTP OCR servers |
| 50+ input formats | PDF (native), Office docs, spreadsheets, presentations, images |
| Output formats | Structured JSON with text items + bounding boxes, or plain text |
| Screenshots | High-quality page-to-image rendering via PDFium |
| Selective OCR | Only OCRs text-sparse regions / embedded images, not entire pages |
| Password support | Encrypted PDFs and password-protected Office documents |

### Supported input formats

- **PDF**: `.pdf` (parsed natively)
- **Office**: `.doc`, `.docx`, `.docm`, `.dot`, `.dotm`, `.dotx`, `.odt`, `.ott`, `.rtf`, `.pages`
- **Presentations**: `.ppt`, `.pptx`, `.pptm`, `.pot`, `.potm`, `.potx`, `.odp`, `.otp`, `.key`
- **Spreadsheets**: `.xls`, `.xlsx`, `.xlsm`, `.xlsb`, `.ods`, `.ots`, `.csv`, `.tsv`, `.numbers`
- **Images**: `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.tiff`, `.tif`, `.webp`, `.svg`

Non-PDF formats require **LibreOffice** (office/spreadsheet/presentation) or **ImageMagick** (images) installed on the system.

### LiteParse CLI interface

The CLI is the bridge we'll use from Python. Key commands:

```bash
# Parse a document → JSON to stdout
liteparse parse document.pdf --format json --quiet

# Parse with options
liteparse parse document.pdf \
  --format json \
  --quiet \
  --ocr-language fra \
  --target-pages "1-5,10" \
  --dpi 300 \
  --no-ocr \
  --password secret \
  --max-pages 100

# Screenshot pages
liteparse screenshot document.pdf \
  --output-dir ./screenshots \
  --target-pages "1,3" \
  --dpi 300 \
  --format png

# Batch parse
liteparse batch-parse ./input-dir ./output-dir \
  --format json \
  --recursive
```

### LiteParse JSON output structure

When `--format json` is used, the CLI writes structured JSON to stdout:

```json
{
  "pages": [
    {
      "page": 1,
      "width": 612,
      "height": 792,
      "text": "Full page text with spatial layout...",
      "textItems": [
        {
          "text": "Hello",
          "x": 72.0,
          "y": 84.5,
          "width": 45.2,
          "height": 12.0,
          "fontName": "Helvetica",
          "fontSize": 12
        }
      ],
      "boundingBoxes": [
        { "x1": 72.0, "y1": 80.0, "x2": 540.0, "y2": 96.0 }
      ]
    }
  ]
}
```

### Key constraint: Node.js only

LiteParse cannot run in-process in Python. It depends on Node.js-specific APIs (`fs`, `child_process`, `Buffer`), native C++ addons (`sharp`, `@hyzyla/pdfium`), and Node worker threads (`tesseract.js`). The most practical integration from Python is **subprocess calls to the CLI**.

---

## 2. API Interface Standard: Unstructured API

### Why Unstructured?

The [Unstructured API](https://docs.unstructured.io/api-reference/api-services/api-parameters) is the de facto standard for document parsing REST APIs. Choosing it gives us:

- **LangChain integration** out of the box (`UnstructuredAPIFileLoader`, `UnstructuredFileLoader`)
- **LlamaIndex integration** (`UnstructuredElementNodeParser`)
- **Haystack, Dify, and other framework support**
- A well-documented, versioned contract that third parties already know

### Core endpoint

```
POST /general/v0/general
Content-Type: multipart/form-data
```

**Request fields** (multipart form):

| Field | Type | Required | Description |
|---|---|---|---|
| `files` | file | Yes | The document file to parse |
| `strategy` | string | No | Parsing strategy: `"auto"`, `"fast"`, `"hi_res"`, `"ocr_only"` |
| `ocr_languages` | string[] | No | OCR language codes (e.g., `["eng"]`) |
| `coordinates` | bool | No | Include bounding box coordinates (default: `true`) |
| `encoding` | string | No | Text encoding |
| `output_format` | string | No | `"application/json"` (default) or `"text/csv"` |

**Response** (JSON array of Elements):

```json
[
  {
    "type": "NarrativeText",
    "element_id": "a1b2c3d4-...",
    "text": "This is a paragraph of text from the document.",
    "metadata": {
      "page_number": 1,
      "filename": "document.pdf",
      "coordinates": {
        "points": [[72.0, 80.0], [540.0, 80.0], [540.0, 96.0], [72.0, 96.0]],
        "system": {
          "width": 612,
          "height": 792,
          "layout_width": 612,
          "layout_height": 792
        }
      },
      "languages": ["eng"]
    }
  }
]
```

### Mapping LiteParse output to Unstructured Elements

LiteParse's `boundingBoxes` map naturally to Unstructured's coordinate system:

| LiteParse field | Unstructured field |
|---|---|
| `page` | `metadata.page_number` |
| `text` (from bounding box line) | `element.text` |
| `x1, y1, x2, y2` | `metadata.coordinates.points` (4-corner rectangle) |
| `width, height` | `metadata.coordinates.system.width/height` |
| `textItems[].fontName` | `metadata.font_name` (custom extension) |
| `textItems[].fontSize` | `metadata.font_size` (custom extension) |

Element type classification (simplified):
- Lines with large font size → `"Title"`
- Multi-line contiguous text → `"NarrativeText"`
- Short standalone lines → `"UncategorizedText"`
- Lines matching list patterns (`^[\d•\-\*]`) → `"ListItem"`

---

## 3. Repository Structure

```
liteparse-server/
├── pyproject.toml              # Python project config (dependencies, metadata)
├── Dockerfile                  # Production container (Node.js + Python + system deps)
├── docker-compose.yml          # Easy local startup
├── .env.example                # Environment variable documentation
├── README.md                   # Setup and usage guide
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI application, CORS, lifespan
│   ├── config.py               # Settings via pydantic-settings (env vars)
│   ├── models.py               # Pydantic models (Unstructured-compatible)
│   ├── parser.py               # LiteParse CLI subprocess wrapper
│   ├── element_mapper.py       # LiteParse JSON → Unstructured Element conversion
│   └── routes/
│       ├── __init__.py
│       ├── general.py          # POST /general/v0/general (Unstructured-compatible)
│       ├── health.py           # GET /healthcheck
│       └── liteparse.py        # POST /v1/parse (native LiteParse format, optional)
└── tests/
    ├── __init__.py
    ├── test_parser.py
    ├── test_element_mapper.py
    └── test_routes.py
```

---

## 4. Implementation Details

### 4.1 `pyproject.toml`

```toml
[project]
name = "liteparse-server"
version = "0.1.0"
description = "FastAPI document parsing server powered by LiteParse"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "python-multipart>=0.0.18",
    "pydantic-settings>=2.7",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "httpx>=0.28",        # For TestClient
    "pytest-asyncio>=0.25",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

### 4.2 `app/config.py`

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # LiteParse CLI path (auto-detected if on PATH)
    liteparse_bin: str = "liteparse"

    # Defaults for parsing
    default_ocr_enabled: bool = True
    default_ocr_language: str = "en"
    default_dpi: int = 150
    default_max_pages: int = 1000

    # Server config
    max_file_size_mb: int = 100
    request_timeout_seconds: int = 300

    # Optional: external OCR server URL
    ocr_server_url: str | None = None

    model_config = {"env_prefix": "LITEPARSE_"}
```

### 4.3 `app/models.py` — Unstructured-compatible Pydantic models

```python
from pydantic import BaseModel, Field
import uuid

class CoordinateSystem(BaseModel):
    width: float
    height: float
    layout_width: float
    layout_height: float

class Coordinates(BaseModel):
    points: list[list[float]]     # 4 corners: TL, TR, BR, BL
    system: CoordinateSystem

class ElementMetadata(BaseModel):
    page_number: int
    filename: str
    coordinates: Coordinates | None = None
    languages: list[str] | None = None
    # LiteParse extensions
    font_name: str | None = None
    font_size: float | None = None

class Element(BaseModel):
    type: str                                          # NarrativeText, Title, ListItem, etc.
    element_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    metadata: ElementMetadata
```

### 4.4 `app/parser.py` — Subprocess wrapper

```python
import asyncio
import json
import tempfile
import os
from pathlib import Path
from app.config import Settings

async def parse_document(
    file_bytes: bytes,
    filename: str,
    settings: Settings,
    *,
    ocr: bool = True,
    ocr_language: str = "en",
    target_pages: str | None = None,
    dpi: int = 150,
    max_pages: int = 1000,
    password: str | None = None,
) -> dict:
    """Run liteparse CLI as a subprocess and return parsed JSON."""
    suffix = Path(filename).suffix or ".pdf"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        cmd = [
            settings.liteparse_bin, "parse", tmp_path,
            "--format", "json",
            "--quiet",
            "--dpi", str(dpi),
            "--max-pages", str(max_pages),
            "--ocr-language", ocr_language,
        ]

        if not ocr:
            cmd.append("--no-ocr")

        if target_pages:
            cmd.extend(["--target-pages", target_pages])

        if password:
            cmd.extend(["--password", password])

        if settings.ocr_server_url:
            cmd.extend(["--ocr-server-url", settings.ocr_server_url])

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(),
            timeout=settings.request_timeout_seconds,
        )

        if proc.returncode != 0:
            raise RuntimeError(
                f"liteparse exited with code {proc.returncode}: {stderr.decode()}"
            )

        return json.loads(stdout.decode())
    finally:
        os.unlink(tmp_path)
```

### 4.5 `app/element_mapper.py` — LiteParse → Unstructured conversion

```python
import re
import uuid
from app.models import Element, ElementMetadata, Coordinates, CoordinateSystem

def classify_element(text: str, font_size: float | None) -> str:
    """Heuristic element type classification."""
    stripped = text.strip()
    if not stripped:
        return "UncategorizedText"
    if font_size and font_size >= 16:
        return "Title"
    if re.match(r"^(\d+[\.\)]\s|[•\-\*]\s)", stripped):
        return "ListItem"
    if len(stripped) > 60:
        return "NarrativeText"
    return "UncategorizedText"

def map_liteparse_to_elements(
    liteparse_json: dict,
    filename: str,
    languages: list[str] | None = None,
) -> list[Element]:
    """Convert liteparse JSON output to Unstructured Element format."""
    elements: list[Element] = []

    for page in liteparse_json.get("pages", []):
        page_num = page["page"]
        page_w = page["width"]
        page_h = page["height"]

        coord_system = CoordinateSystem(
            width=page_w, height=page_h,
            layout_width=page_w, layout_height=page_h,
        )

        # Group textItems by bounding box line for richer elements
        bboxes = page.get("boundingBoxes", [])
        text_items = page.get("textItems", [])

        if bboxes:
            # Use bounding boxes as element boundaries
            for bbox in bboxes:
                x1, y1, x2, y2 = bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"]

                # Find textItems within this bbox
                items_in_bbox = [
                    ti for ti in text_items
                    if ti["x"] >= x1 - 1 and ti["y"] >= y1 - 1
                    and ti["x"] + ti["width"] <= x2 + 1
                    and ti["y"] + ti["height"] <= y2 + 1
                ]

                line_text = " ".join(ti["text"] for ti in items_in_bbox).strip()
                if not line_text:
                    continue

                font_size = items_in_bbox[0].get("fontSize") if items_in_bbox else None
                font_name = items_in_bbox[0].get("fontName") if items_in_bbox else None

                coords = Coordinates(
                    points=[
                        [x1, y1], [x2, y1],
                        [x2, y2], [x1, y2],
                    ],
                    system=coord_system,
                )

                elements.append(Element(
                    type=classify_element(line_text, font_size),
                    element_id=str(uuid.uuid4()),
                    text=line_text,
                    metadata=ElementMetadata(
                        page_number=page_num,
                        filename=filename,
                        coordinates=coords,
                        languages=languages,
                        font_name=font_name,
                        font_size=font_size,
                    ),
                ))
        else:
            # Fallback: use full page text as a single element
            page_text = page.get("text", "").strip()
            if page_text:
                elements.append(Element(
                    type="NarrativeText",
                    element_id=str(uuid.uuid4()),
                    text=page_text,
                    metadata=ElementMetadata(
                        page_number=page_num,
                        filename=filename,
                        languages=languages,
                    ),
                ))

    return elements
```

### 4.6 `app/routes/general.py` — Unstructured-compatible endpoint

```python
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.config import Settings
from app.parser import parse_document
from app.element_mapper import map_liteparse_to_elements
from app.models import Element

router = APIRouter()

def get_settings() -> Settings:
    return Settings()

@router.post("/general/v0/general", response_model=list[Element])
async def parse_general(
    files: UploadFile = File(..., description="Document file to parse"),
    strategy: str = Form("auto", description="Parsing strategy"),
    ocr_languages: str | None = Form(None, description="OCR languages (comma-separated)"),
    coordinates: bool = Form(True, description="Include bounding boxes"),
    # LiteParse extensions
    target_pages: str | None = Form(None, description='Pages to parse (e.g. "1-5,10")'),
    dpi: int = Form(150, description="DPI for OCR rendering"),
    max_pages: int = Form(1000, description="Maximum pages to parse"),
    password: str | None = Form(None, description="Document password"),
):
    settings = get_settings()

    # Map strategy to OCR config
    ocr_enabled = strategy != "fast"
    ocr_lang = ocr_languages.replace(",", " ") if ocr_languages else settings.default_ocr_language

    # Validate file size
    content = await files.read()
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(413, f"File exceeds {settings.max_file_size_mb}MB limit")

    try:
        liteparse_result = await parse_document(
            file_bytes=content,
            filename=files.filename or "document.pdf",
            settings=settings,
            ocr=ocr_enabled,
            ocr_language=ocr_lang,
            target_pages=target_pages,
            dpi=dpi,
            max_pages=max_pages,
            password=password,
        )
    except RuntimeError as e:
        raise HTTPException(500, detail=str(e))

    languages = ocr_lang.split() if ocr_lang else None

    return map_liteparse_to_elements(
        liteparse_result,
        filename=files.filename or "document.pdf",
        languages=languages,
    )
```

### 4.7 `app/routes/liteparse.py` — Native format endpoint (optional)

For users who want the raw LiteParse output without Unstructured mapping:

```python
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.config import Settings
from app.parser import parse_document

router = APIRouter()

@router.post("/v1/parse")
async def parse_native(
    files: UploadFile = File(...),
    ocr: bool = Form(True),
    ocr_language: str = Form("en"),
    target_pages: str | None = Form(None),
    dpi: int = Form(150),
    max_pages: int = Form(1000),
    password: str | None = Form(None),
    output_format: str = Form("json"),  # "json" or "text"
):
    settings = Settings()
    content = await files.read()

    try:
        result = await parse_document(
            file_bytes=content,
            filename=files.filename or "document.pdf",
            settings=settings,
            ocr=ocr,
            ocr_language=ocr_language,
            target_pages=target_pages,
            dpi=dpi,
            max_pages=max_pages,
            password=password,
        )
    except RuntimeError as e:
        raise HTTPException(500, detail=str(e))

    return result
```

### 4.8 `app/main.py` — Application entrypoint

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import logging

from app.routes import general, health, liteparse
from app.config import Settings

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Verify liteparse is installed
    settings = Settings()
    proc = await asyncio.create_subprocess_exec(
        settings.liteparse_bin, "--version",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(
            f"liteparse CLI not found at '{settings.liteparse_bin}'. "
            "Install it with: npm install -g @llamaindex/liteparse"
        )
    logger.info(f"LiteParse ready: {stdout.decode().strip()}")
    yield

app = FastAPI(
    title="LiteParse Server",
    description="Document parsing API powered by LiteParse, Unstructured-compatible",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(general.router, tags=["Unstructured-compatible"])
app.include_router(liteparse.router, tags=["LiteParse native"])
app.include_router(health.router, tags=["Health"])
```

### 4.9 `app/routes/health.py`

```python
from fastapi import APIRouter

router = APIRouter()

@router.get("/healthcheck")
async def healthcheck():
    return {"status": "healthy"}
```

---

## 5. Dockerfile

```dockerfile
FROM python:3.12-slim

# Install Node.js 20 LTS
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install liteparse globally
RUN npm install -g @llamaindex/liteparse

# (Optional) Install system tools for non-PDF format support
# Uncomment the formats you need:
# RUN apt-get update && apt-get install -y --no-install-recommends \
#     libreoffice-common libreoffice-writer libreoffice-calc libreoffice-impress \
#     imagemagick \
#     && rm -rf /var/lib/apt/lists/*

# Install Python app
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .
COPY app/ app/

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### `docker-compose.yml`

```yaml
services:
  liteparse-server:
    build: .
    ports:
      - "8000:8000"
    environment:
      - LITEPARSE_MAX_FILE_SIZE_MB=200
      - LITEPARSE_DEFAULT_OCR_LANGUAGE=en
      # - LITEPARSE_OCR_SERVER_URL=http://ocr:5000  # Optional external OCR
    volumes:
      - /tmp/liteparse:/tmp  # Persist temp files for debugging
    restart: unless-stopped
```

---

## 6. Usage Examples

### Basic parsing (Unstructured-compatible)

```bash
curl -X POST http://localhost:8000/general/v0/general \
  -F "files=@invoice.pdf" \
  -F "strategy=auto" \
  -F "coordinates=true"
```

### Parse with OCR in French

```bash
curl -X POST http://localhost:8000/general/v0/general \
  -F "files=@document.pdf" \
  -F "ocr_languages=fra" \
  -F "dpi=300"
```

### Fast mode (no OCR)

```bash
curl -X POST http://localhost:8000/general/v0/general \
  -F "files=@spreadsheet.xlsx" \
  -F "strategy=fast"
```

### Parse specific pages

```bash
curl -X POST http://localhost:8000/general/v0/general \
  -F "files=@report.pdf" \
  -F "target_pages=1-3,10"
```

### Native LiteParse format

```bash
curl -X POST http://localhost:8000/v1/parse \
  -F "files=@document.pdf" \
  -F "ocr=true"
```

### LangChain integration

```python
from langchain_community.document_loaders import UnstructuredAPIFileLoader

loader = UnstructuredAPIFileLoader(
    file_path="report.pdf",
    url="http://localhost:8000/general/v0/general",
)
documents = loader.load()
```

### LlamaIndex integration

```python
from llama_index.readers.unstructured import UnstructuredReader

reader = UnstructuredReader(api_url="http://localhost:8000")
documents = reader.load_data(file_path="report.pdf")
```

### Python `requests`

```python
import requests

with open("document.pdf", "rb") as f:
    response = requests.post(
        "http://localhost:8000/general/v0/general",
        files={"files": ("document.pdf", f, "application/pdf")},
        data={"strategy": "auto", "coordinates": "true"},
    )
elements = response.json()
for el in elements:
    print(f"[{el['type']}] {el['text'][:80]}...")
```

---

## 7. Performance Considerations

| Concern | Mitigation |
|---|---|
| Subprocess overhead per request | Negligible (~10ms) vs. parsing time (seconds). Use `asyncio.create_subprocess_exec` to avoid blocking the event loop. |
| Concurrent requests | Uvicorn workers handle concurrency. Each request spawns its own liteparse process. Node.js processes are independent. |
| Large files | Enforce `max_file_size_mb` via settings. Use streaming file upload. Set `--max-pages` to cap processing time. |
| Temp file cleanup | Use `try/finally` with `os.unlink()`. The `tempfile` module handles OS-level cleanup on crash. |
| OCR memory | Tesseract.js workers consume ~200MB each. Control via `--num-workers`. Default is CPU cores - 1. |
| Cold start | First OCR request downloads Tesseract language data (~15MB). Pre-warm by parsing a small PDF on startup, or pre-download tessdata in the Dockerfile. |

---

## 8. Optional Enhancements

### 8.1 Screenshot endpoint

```
POST /v1/screenshot
→ Returns page images as multipart response or ZIP
```

### 8.2 Async job queue

For very large documents, accept the upload, return a job ID, and poll for results:

```
POST /v1/jobs → { "job_id": "abc123" }
GET  /v1/jobs/abc123 → { "status": "processing", "progress": 45 }
GET  /v1/jobs/abc123/result → [Element, ...]
```

Implement with `asyncio.Task` for simplicity, or Redis + Celery/ARQ for production scale.

### 8.3 Webhook callbacks

```
POST /v1/parse?webhook_url=https://example.com/callback
→ 202 Accepted, result POSTed to webhook when done
```

### 8.4 API key authentication

```python
from fastapi import Security, HTTPException
from fastapi.security import APIKeyHeader

api_key_header = APIKeyHeader(name="unstructured-api-key", auto_error=False)

async def verify_api_key(key: str = Security(api_key_header)):
    if key != settings.api_key:
        raise HTTPException(401, "Invalid API key")
```

This matches Unstructured's own auth header convention.

### 8.5 OpenAPI spec export

FastAPI auto-generates OpenAPI 3.1 at `/docs` (Swagger UI) and `/openapi.json`. No extra work needed. Clients can generate SDKs from it.

---

## 9. Quickstart (for development)

```bash
# 1. Prerequisites
node --version   # >= 18
npm install -g @llamaindex/liteparse

# 2. Create project
mkdir liteparse-server && cd liteparse-server
# ... create files as described above ...

# 3. Install Python deps
pip install -e ".[dev]"

# 4. Run
uvicorn app.main:app --reload

# 5. Test
curl -X POST http://localhost:8000/general/v0/general \
  -F "files=@test.pdf"
```

---

## 10. Summary

| Decision | Choice | Rationale |
|---|---|---|
| Integration method | CLI subprocess | No Python bindings exist; subprocess overhead is negligible vs. parse time |
| API standard | Unstructured API | Most widely adopted; LangChain/LlamaIndex integrations exist |
| Framework | FastAPI | Async, auto-docs, Pydantic validation, production-ready |
| Containerization | Docker with Node.js + Python | Single container, simple deployment |
| Auth (optional) | `unstructured-api-key` header | Matches Unstructured convention |
| Native endpoint | `/v1/parse` | Exposes full LiteParse JSON for power users |
