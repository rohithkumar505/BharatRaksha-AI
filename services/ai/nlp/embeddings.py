"""Text embeddings for RAG — sentence-transformers with deterministic hash fallback."""

from __future__ import annotations

import hashlib
import math
import re
from typing import List

_MODEL = None
_DIM = 384


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9@._-]+", text.lower())


def hash_embed(text: str, dim: int = _DIM) -> list[float]:
    """Deterministic bag-of-words embedding for offline / lightweight fallback."""
    vec = [0.0] * dim
    for token in _tokenize(text):
        h = int(hashlib.sha256(token.encode()).hexdigest(), 16)
        vec[h % dim] += 1.0
        vec[(h >> 8) % dim] += 0.5
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def get_model():
    global _MODEL
    if _MODEL is None:
        try:
            from sentence_transformers import SentenceTransformer

            _MODEL = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        except Exception:
            _MODEL = False
    return _MODEL


def embed_text(text: str) -> list[float]:
    model = get_model()
    if model and model is not False:
        return model.encode(text, normalize_embeddings=True).tolist()
    return hash_embed(text)


def embed_batch(texts: list[str]) -> list[list[float]]:
    model = get_model()
    if model and model is not False:
        return model.encode(texts, normalize_embeddings=True).tolist()
    return [hash_embed(t) for t in texts]
