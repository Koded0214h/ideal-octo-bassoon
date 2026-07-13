import base64
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import APIError, AuthenticationError, OpenAI
from pydantic import BaseModel, Field

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
    allow_origins=["http://localhost:5173"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

SIZES = {"square", "landscape", "portrait"}
SIZE_MAP = {
    "square": "1024x1024",
    "landscape": "1536x1024",
    "portrait": "1024x1536",
}


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    size: str = "square"


class GenerateResponse(BaseModel):
    image_base64: str


@app.post("/api/generate", response_model=GenerateResponse)
def generate_image(req: GenerateRequest):
    size_key = req.size if req.size in SIZES else "square"

    try:
        result = client.images.generate(
            model="gpt-image-1-mini",
            prompt=req.prompt,
            size=SIZE_MAP[size_key],
            n=1,
        )
    except AuthenticationError:
        raise HTTPException(status_code=500, detail="Invalid OpenAI API key on server.")
    except APIError as e:
        raise HTTPException(status_code=502, detail=f"OpenAI API error: {e.message}")

    image_b64 = result.data[0].b64_json
    return GenerateResponse(image_base64=image_b64)


@app.get("/api/health")
def health():
    return {"status": "ok"}
