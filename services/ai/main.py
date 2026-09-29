from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from nlp.ner import extract_entities_from_text
from nlp.normalize import normalize_entity, detect_language
from nlp.ocr_engine import extract_text_from_bytes
from nlp.embeddings import embed_text, embed_batch

app = FastAPI(title="Bharat Raksha AI — NLP Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class TextRequest(BaseModel):
    text: str


class NormalizeRequest(BaseModel):
    type: str
    value: str


class Entity(BaseModel):
    type: str
    value: str
    confidence: float


class ExtractResponse(BaseModel):
    entities: list[Entity]
    language: str = "en"


class NormalizeResponse(BaseModel):
    type: str
    value: str
    normalized: str
    metadata: dict = Field(default_factory=dict)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "bharat-raksha-ai-nlp",
        "version": "2.0.0",
        "endpoints": ["/ocr", "/extract-entities", "/normalize", "/detect-language", "/embed", "/embed-batch"],
        "entity_types": 17,
    }


@app.post("/detect-language")
def detect_lang(req: TextRequest):
    return {"language": detect_language(req.text)}


@app.post("/normalize", response_model=NormalizeResponse)
def normalize(req: NormalizeRequest):
    result = normalize_entity(req.type, req.value)
    metadata = {k: v for k, v in result.items() if k not in ("type", "value", "normalized")}
    return NormalizeResponse(
        type=result["type"],
        value=result["value"],
        normalized=result["normalized"],
        metadata=metadata,
    )


@app.post("/extract-entities", response_model=ExtractResponse)
def extract_entities(req: TextRequest):
    raw = extract_entities_from_text(req.text)
    entities = [Entity(type=e.type, value=e.value, confidence=e.confidence) for e in raw]
    return ExtractResponse(entities=entities, language=detect_language(req.text))


@app.post("/ocr")
async def ocr(
    file: UploadFile = File(...),
    mime_type: str | None = Form(None),
):
    content = await file.read()
    text = extract_text_from_bytes(
        content,
        mime_type or file.content_type,
        file.filename,
    )
    entities = extract_entities_from_text(text)
    return {
        "text": text,
        "textLength": len(text),
        "language": detect_language(text),
        "entities": [{"type": e.type, "value": e.value, "confidence": e.confidence} for e in entities],
    }


class EmbedRequest(BaseModel):
    text: str


class EmbedBatchRequest(BaseModel):
    texts: list[str]


@app.post("/embed")
def embed(req: EmbedRequest):
    vec = embed_text(req.text)
    return {"embedding": vec, "dimensions": len(vec), "model": "all-MiniLM-L6-v2-or-hash-fallback"}


@app.post("/embed-batch")
def embed_many(req: EmbedBatchRequest):
    vectors = embed_batch(req.texts)
    return {"embeddings": vectors, "count": len(vectors), "dimensions": len(vectors[0]) if vectors else 0}
