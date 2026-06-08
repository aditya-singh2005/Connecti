"""
embeddings.py — Generates sentence-transformer embeddings for user profiles.
Uses 'all-MiniLM-L6-v2' (fast, ~80 MB) for semantic similarity.
Falls back to a deterministic offline mock generator if Hugging Face is unreachable.
"""

import numpy as np
import hashlib
from typing import Dict, List, Optional
from sklearn.metrics.pairwise import cosine_similarity

# Lazy-loaded model (only initialized on first use)
_model = None
_offline_fallback = False


def _get_model():
    """Lazy-load the sentence-transformer model."""
    global _model, _offline_fallback
    if _model is None and not _offline_fallback:
        try:
            from sentence_transformers import SentenceTransformer
            _model = SentenceTransformer("all-MiniLM-L6-v2")
        except Exception as e:
            print("\n⚠️  [WARNING] Hugging Face is unreachable. Switching to offline mock embeddings...")
            _offline_fallback = True
    return _model


def get_mock_embedding(text: str) -> np.ndarray:
    """Generate a deterministic mock embedding of 384 dimensions based on text hash."""
    seed = int(hashlib.md5(text.encode('utf-8')).hexdigest(), 16) % (2**32)
    rng = np.random.default_rng(seed)
    embedding = rng.random(384)
    # Normalize the vector to unit length
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm
    return embedding


def get_profile_embedding(profile_text: str) -> np.ndarray:
    """
    Generate an embedding for a profile text.
    """
    model = _get_model()
    if model is None:
        return get_mock_embedding(profile_text)
    
    try:
        return model.encode(profile_text, convert_to_numpy=True)
    except Exception:
        return get_mock_embedding(profile_text)


def get_batch_embeddings(profile_texts: List[str]) -> np.ndarray:
    """
    Generate embeddings for multiple profile texts in a single batch.
    """
    model = _get_model()
    if model is None:
        return np.array([get_mock_embedding(txt) for txt in profile_texts])
    
    try:
        return model.encode(profile_texts, convert_to_numpy=True, show_progress_bar=False)
    except Exception:
        return np.array([get_mock_embedding(txt) for txt in profile_texts])


def compute_cosine_similarity(embedding_a: np.ndarray, embedding_b: np.ndarray) -> float:
    """
    Compute cosine similarity between two embeddings.
    """
    a = embedding_a.reshape(1, -1)
    b = embedding_b.reshape(1, -1)
    sim = cosine_similarity(a, b)[0][0]
    return float(sim)


def compute_profile_similarity(profile_text_a: str, profile_text_b: str) -> float:
    """
    End-to-end: build embeddings and compute cosine similarity.
    """
    embeddings = get_batch_embeddings([profile_text_a, profile_text_b])
    sim = compute_cosine_similarity(embeddings[0], embeddings[1])
    return max(0.0, sim)  # Clamp to non-negative
