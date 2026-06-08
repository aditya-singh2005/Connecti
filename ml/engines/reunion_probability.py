"""
reunion_probability.py — Feature 3: Reunion Probability Engine

Predicts how meaningful a reconnection could be between two users.
Uses a weighted linear combination + sigmoid normalization.

Output:
- Reunion probability (0–100%)
- Explanation text
- Tiered recommendation
"""

import math
from typing import Dict, List, Optional

from utils.data_loader import (
    load_users, get_user_pair, jaccard_similarity, days_since, build_profile_text
)
from utils.embeddings import compute_profile_similarity
from engines.relationship_strength import get_relationship_score


# ---------------------------------------------------------------------------
# Weights for the reunion probability model
# ---------------------------------------------------------------------------
WEIGHTS = {
    "relationship_score": 0.40,
    "mutual_friends": 0.20,
    "previous_meetups": 0.20,
    "profile_similarity": 0.10,
    "recency": 0.10,
}

# Recommendation tiers
TIERS = [
    (70, "Highly recommended to reconnect — you have a strong foundation."),
    (40, "Worth reconnecting — there's enough common ground to make it meaningful."),
    (0,  "Light connection — maybe a casual wave for now."),
]


def _sigmoid(x: float) -> float:
    """Sigmoid function mapping any real number to (0, 1)."""
    return 1.0 / (1.0 + math.exp(-x))


def _normalize_mutual_friends(count: int, max_count: int = 10) -> float:
    """Normalize mutual friend count to 0–1 range."""
    return min(count / max_count, 1.0)


def _normalize_meetups(meetups: float, max_meetups: int = 8) -> float:
    """Normalize average meetups to 0–1 range."""
    return min(meetups / max_meetups, 1.0)


def _recency_factor(days: Optional[int]) -> float:
    """
    Convert days-since-last-meeting to a 0–1 factor.
    - Met recently → 1.0
    - Never met → 0.1 (still some base probability)
    """
    if days is None:
        return 0.1
    if days <= 30:
        return 1.0
    elif days <= 180:
        return 0.6 + 0.4 * (1 - (days - 30) / 150)
    elif days <= 365:
        return 0.3 + 0.3 * (1 - (days - 180) / 185)
    else:
        return max(0.1, 0.3 * (1 - (days - 365) / 730))


def _build_explanation(
    probability: float,
    rel_score: int,
    mutual_count: int,
    meetups_avg: float,
    profile_sim: float,
    recency_days: Optional[int],
    common_interests: List[str],
    shared_college: bool,
    shared_workplace: bool,
) -> str:
    """Build a human-readable explanation for the reunion probability."""
    parts = []

    if rel_score >= 70:
        parts.append("strong shared history")
    elif rel_score >= 40:
        parts.append("moderate shared history")
    else:
        parts.append("limited shared history")

    if profile_sim > 0.7:
        parts.append("high profile similarity")
    elif profile_sim > 0.5:
        parts.append("moderate profile similarity")

    if mutual_count >= 3:
        parts.append(f"multiple mutual friends ({mutual_count})")
    elif mutual_count >= 1:
        parts.append(f"{mutual_count} mutual friend(s)")

    if shared_college:
        parts.append("shared college background")
    if shared_workplace:
        parts.append("same workplace")

    if meetups_avg >= 3:
        parts.append("frequent past meetups")
    elif meetups_avg >= 1:
        parts.append("some past meetups")

    if common_interests:
        parts.append(f"shared interests in {', '.join(common_interests[:2])}")

    if recency_days is not None and recency_days <= 90:
        parts.append("recent interaction")

    # Combine
    if parts:
        explanation = parts[0].capitalize()
        if len(parts) > 1:
            explanation += ", " + ", ".join(parts[1:])
        explanation += "."
    else:
        explanation = "Limited data available for prediction."

    return explanation


def _get_recommendation(probability: float) -> str:
    """Get tiered recommendation based on probability."""
    for threshold, message in TIERS:
        if probability >= threshold:
            return message
    return TIERS[-1][1]


def calculate_reunion_probability(user_a: Dict, user_b: Dict, rel_result: Optional[Dict] = None) -> Dict:
    """
    Calculate reunion probability between two users.

    Args:
        user_a: First user dict.
        user_b: Second user dict.
        rel_result: Optional pre-computed relationship score result.
                    If None, it will be computed.

    Returns:
        Dict with probability, explanation, and recommendation.
    """
    # --- Get relationship score ---
    if rel_result is None:
        from engines.relationship_strength import calculate_relationship_score
        rel_result = calculate_relationship_score(user_a, user_b)

    rel_score = rel_result["relationship_score"]

    # --- Extract features ---
    mutual_a = set(user_a.get("mutual_friends", []))
    mutual_b = set(user_b.get("mutual_friends", []))
    mutual_count = len(mutual_a & mutual_b)

    meetups_a = user_a.get("previous_meetups", 0)
    meetups_b = user_b.get("previous_meetups", 0)
    meetups_avg = (meetups_a + meetups_b) / 2.0

    # Profile similarity
    profile_text_a = build_profile_text(user_a)
    profile_text_b = build_profile_text(user_b)
    profile_sim = compute_profile_similarity(profile_text_a, profile_text_b)

    # Recency
    days_a = days_since(user_a.get("last_meeting_date"))
    days_b = days_since(user_b.get("last_meeting_date"))
    if days_a is not None and days_b is not None:
        most_recent_days = min(days_a, days_b)
    elif days_a is not None:
        most_recent_days = days_a
    elif days_b is not None:
        most_recent_days = days_b
    else:
        most_recent_days = None

    recency = _recency_factor(most_recent_days)

    # --- Compute weighted sum ---
    normalized_rel = rel_score / 100.0
    normalized_mutual = _normalize_mutual_friends(mutual_count)
    normalized_meetups = _normalize_meetups(meetups_avg)

    weighted_sum = (
        WEIGHTS["relationship_score"] * normalized_rel +
        WEIGHTS["mutual_friends"] * normalized_mutual +
        WEIGHTS["previous_meetups"] * normalized_meetups +
        WEIGHTS["profile_similarity"] * profile_sim +
        WEIGHTS["recency"] * recency
    )

    # Scale weighted_sum (0–1) through a sigmoid to get a more spread-out distribution
    # We shift and scale to make sigmoid output meaningful: sigmoid((x - 0.3) * 8)
    # This maps ~0.3 → 50%, higher → 70-95%, lower → 10-40%
    sigmoid_input = (weighted_sum - 0.3) * 8
    probability = _sigmoid(sigmoid_input) * 100.0
    probability = round(min(max(probability, 1.0), 99.0))  # Clamp to 1–99%

    # --- Details from relationship result ---
    details = rel_result.get("details", {})
    common_interests = details.get("common_interests", [])
    shared_college = details.get("shared_college", False)
    shared_workplace = details.get("shared_workplace", False)

    # --- Build explanation ---
    explanation = _build_explanation(
        probability, rel_score, mutual_count, meetups_avg,
        profile_sim, most_recent_days, common_interests,
        shared_college, shared_workplace
    )

    recommendation = _get_recommendation(probability)

    return {
        "user_a": user_a["user_id"],
        "user_b": user_b["user_id"],
        "reunion_probability": probability,
        "explanation": explanation,
        "recommendation": recommendation,
        "factors": {
            "relationship_score": rel_score,
            "mutual_friends": mutual_count,
            "previous_meetups_avg": meetups_avg,
            "profile_similarity": round(profile_sim, 4),
            "recency_factor": round(recency, 3),
            "weighted_sum": round(weighted_sum, 4),
        }
    }


def get_reunion_probability(user_id_a: str, user_id_b: str, users=None) -> Dict:
    """
    Public API: Calculate reunion probability between two user IDs.
    """
    if users is None:
        users = load_users()
    user_a, user_b = get_user_pair(user_id_a, user_id_b, users)
    return calculate_reunion_probability(user_a, user_b)
