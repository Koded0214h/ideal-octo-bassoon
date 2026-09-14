import io
import os
from typing import List, Optional

import docx
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import APIError, AuthenticationError, OpenAI
from pydantic import BaseModel
from pypdf import PdfReader

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise RuntimeError(
        "OPENAI_API_KEY is not set. Copy backend/.env.example to backend/.env "
        "and fill in your key."
    )

client = OpenAI(api_key=api_key)

app = FastAPI(title="Prompt-to-Image API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://ideal-octo-bassoon.vercel.app",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

SIZES = {"square", "landscape", "portrait"}
SIZE_MAP = {
    "square": "1024x1024",
    "landscape": "1536x1024",
    "portrait": "1024x1536",
}

MODELS = {
    "gpt-image-1-mini": "GPT Image 1 Mini",
    "gpt-image-1": "GPT Image 1",
    "gpt-image-1.5": "GPT Image 1.5",
    "gpt-image-2": "GPT Image 2",
    "gpt-image-2.5-flare": "GPT Image 2.5 Flare",
    "gpt-image-2.5-sunburst": "GPT Image 2.5 Sunburst",
    "chatgpt-image-latest": "ChatGPT Image (latest)",
}
DEFAULT_MODEL = "gpt-image-1-mini"

MAX_UPLOAD_IMAGES = 4
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB per image
ALLOWED_UPLOAD_TYPES = {"image/png", "image/jpeg", "image/webp"}

MAX_UPLOAD_DOCS = 4
MAX_DOC_BYTES = 15 * 1024 * 1024  # 15 MB per document
MAX_DOC_CHARS = 6000  # extracted chars kept per document
ALLOWED_DOC_TYPES = {
    "application/pdf": "pdf",
    "text/plain": "text",
    "text/markdown": "text",
    "text/csv": "text",
    "application/json": "text",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}
DOC_EXT_FALLBACK = {
    ".pdf": "pdf",
    ".txt": "text",
    ".md": "text",
    ".csv": "text",
    ".json": "text",
    ".docx": "docx",
}


def extract_doc_text(filename: str, content_type: str, data: bytes) -> str:
    kind = ALLOWED_DOC_TYPES.get(content_type)
    if kind is None:
        ext = os.path.splitext(filename)[1].lower()
        kind = DOC_EXT_FALLBACK.get(ext)

    if kind is None:
        raise HTTPException(status_code=400, detail=f"Unsupported document type: {filename}")

    try:
        if kind == "text":
            text = data.decode("utf-8", errors="ignore")
        elif kind == "pdf":
            reader = PdfReader(io.BytesIO(data))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        elif kind == "docx":
            document = docx.Document(io.BytesIO(data))
            text = "\n".join(p.text for p in document.paragraphs)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Could not read {filename}.")

    return text.strip()[:MAX_DOC_CHARS]


class GenerateResponse(BaseModel):
    image_base64: str


@app.post("/api/generate", response_model=GenerateResponse)
async def generate_image(
    prompt: str = Form(..., min_length=1, max_length=4000),
    size: str = Form("square"),
    model: str = Form(DEFAULT_MODEL),
    images: Optional[List[UploadFile]] = File(None),
    documents: Optional[List[UploadFile]] = File(None),
):
    size_key = size if size in SIZES else "square"
    model = model if model in MODELS else DEFAULT_MODEL
    images = [img for img in (images or []) if img.filename]
    documents = [doc for doc in (documents or []) if doc.filename]

    if len(images) > MAX_UPLOAD_IMAGES:
        raise HTTPException(
            status_code=400, detail=f"Upload at most {MAX_UPLOAD_IMAGES} images."
        )
    if len(documents) > MAX_UPLOAD_DOCS:
        raise HTTPException(
            status_code=400, detail=f"Upload at most {MAX_UPLOAD_DOCS} documents."
        )

    for img in images:
        if img.content_type not in ALLOWED_UPLOAD_TYPES:
            raise HTTPException(
                status_code=400, detail=f"Unsupported file type: {img.content_type}"
            )

    effective_prompt = prompt
    for doc in documents:
        data = await doc.read()
        if len(data) > MAX_DOC_BYTES:
            raise HTTPException(
                status_code=400, detail=f"{doc.filename} exceeds 15 MB limit."
            )
        text = extract_doc_text(doc.filename, doc.content_type, data)
        if text:
            effective_prompt += f"\n\n--- Reference document: {doc.filename} ---\n{text}"

    try:
        if images:
            files = []
            for img in images:
                data = await img.read()
                if len(data) > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=400, detail=f"{img.filename} exceeds 10 MB limit."
                    )
                files.append((img.filename, data, img.content_type))

            result = client.images.edit(
                model=model,
                image=files,
                prompt=effective_prompt,
                size=SIZE_MAP[size_key],
                n=1,
            )
        else:
            result = client.images.generate(
                model=model,
                prompt=effective_prompt,
                size=SIZE_MAP[size_key],
                n=1,
            )
    except AuthenticationError:
        raise HTTPException(status_code=500, detail="Invalid OpenAI API key on server.")
    except APIError as e:
        raise HTTPException(status_code=502, detail=f"OpenAI API error: {e.message}")

    image_b64 = result.data[0].b64_json
    return GenerateResponse(image_base64=image_b64)


@app.get("/api/models")
def list_models():
    return {"models": [{"id": k, "label": v} for k, v in MODELS.items()], "default": DEFAULT_MODEL}


@app.get("/api/health")
def health():
    return {"status": "ok"}
