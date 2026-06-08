"""
relationship_strength.py — Feature 1: Relationship Strength Engine

Calculates a relationship score (0–100) between two users based on:
- Shared education, workplace, city
- Mutual friends count
- Common interests & skills (Jaccard similarity)
- Previous meetups & recency
- Semantic profile similarity via sentence-transformer embeddings
"""

from typing import Dict, List, Optional
from utils.data_loader import (
    load_users, get_user_pair, jaccard_similarity,
    common_elements, days_since, build_profile_text
)
from utils.embeddings import compute_profile_similarity


def _recency_score(days: Optional[int], max_points: float = 5.0) -> float:
    """
    Calculate recency score. More recent meetings score higher.
    - Met within 30 days  → full points
    - Met within 180 days → 60–100% of points
    - Met within 365 days → 30–60% of points
    - Met over a year ago → 0–30% of points
    - Never met (None)    → 0 points
    """
    if days is None:
        return 0.0
    if days <= 30:
        return max_points
    elif days <= 180:
        return max_points * (0.6 + 0.4 * (1 - (days - 30) / 150))
    elif days <= 365:
        return max_points * (0.3 + 0.3 * (1 - (days - 180) / 185))
    else:
        # Slowly decay to 0 over 3 years
        decay = max(0.0, 1 - (days - 365) / 730)
        return max_points * 0.3 * decay


def calculate_relationship_score(user_a: Dict, user_b: Dict) -> Dict:
    """
    Calculate the relationship strength score between two users.

    Returns a dictionary with:
    - relationship_score (int, 0–100)
    - explanation (dict with all scoring details)
    """
    breakdown = {}
    total = 0.0

    # --- 1. Shared school (max 10) ---
    shared_school = (user_a.get("school", "").lower().strip() ==
                     user_b.get("school", "").lower().strip() and
                     user_a.get("school", "") != "")
    school_score = 10.0 if shared_school else 0.0
    breakdown["shared_school"] = school_score
    total += school_score

    # --- 2. Shared college (max 15) ---
    shared_college = (user_a.get("college", "").lower().strip() ==
                      user_b.get("college", "").lower().strip() and
                      user_a.get("college", "") != "")
    college_score = 15.0 if shared_college else 0.0
    breakdown["shared_college"] = college_score
    total += college_score

    # --- 3. Shared workplace (max 15) ---
    shared_workplace = (user_a.get("workplace", "").lower().strip() ==
                        user_b.get("workplace", "").lower().strip() and
                        user_a.get("workplace", "") != "")
    workplace_score = 15.0 if shared_workplace else 0.0
    breakdown["shared_workplace"] = workplace_score
    total += workplace_score

    # --- 4. Mutual friends (max 20) ---
    mutual_a = set(user_a.get("mutual_friends", []))
    mutual_b = set(user_b.get("mutual_friends", []))
    shared_mutual_friends = list(mutual_a & mutual_b)
    mutual_count = len(shared_mutual_friends)
    mutual_score = min(mutual_count, 10) * 2.0
    breakdown["mutual_friends_count"] = mutual_count
    breakdown["mutual_friends_score"] = mutual_score
    total += mutual_score

    # --- 5. Common interests (max 15) ---
    interests_a = set(i.lower().strip() for i in user_a.get("interests", []))
    interests_b = set(i.lower().strip() for i in user_b.get("interests", []))
    common_interests = common_elements(user_a.get("interests", []), user_b.get("interests", []))
    interest_jaccard = jaccard_similarity(interests_a, interests_b)
    interest_score = interest_jaccard * 15.0
    breakdown["common_interests"] = common_interests
    breakdown["interest_jaccard"] = round(interest_jaccard, 3)
    breakdown["interest_score"] = round(interest_score, 2)
    total += interest_score

    # --- 6. Common skills (max 10) ---
    skills_a = set(s.lower().strip() for s in user_a.get("skills", []))
    skills_b = set(s.lower().strip() for s in user_b.get("skills", []))
    common_skills = common_elements(user_a.get("skills", []), user_b.get("skills", []))
    skill_jaccard = jaccard_similarity(skills_a, skills_b)
    skill_score = skill_jaccard * 10.0
    breakdown["common_skills"] = common_skills
    breakdown["skill_jaccard"] = round(skill_jaccard, 3)
    breakdown["skill_score"] = round(skill_score, 2)
    total += skill_score

    # --- 7. Previous meetups (max 10) ---
    meetups_a = user_a.get("previous_meetups", 0)
    meetups_b = user_b.get("previous_meetups", 0)
    avg_meetups = (meetups_a + meetups_b) / 2.0
    meetup_score = min(avg_meetups, 5) * 2.0
    breakdown["previous_meetups_avg"] = avg_meetups
    breakdown["meetup_score"] = round(meetup_score, 2)
    total += meetup_score

    # --- 8. Recency (max 5) ---
    days_a = days_since(user_a.get("last_meeting_date"))
    days_b = days_since(user_b.get("last_meeting_date"))
    # Use the more recent meeting between the two
    if days_a is not None and days_b is not None:
        most_recent_days = min(days_a, days_b)
    elif days_a is not None:
        most_recent_days = days_a
    elif days_b is not None:
        most_recent_days = days_b
    else:
        most_recent_days = None
    recency = _recency_score(most_recent_days)
    breakdown["days_since_last_meeting"] = most_recent_days
    breakdown["recency_score"] = round(recency, 2)
    total += recency

    # --- 9. Embedding similarity (bonus, 0–10, added after capping base at 90) ---
    profile_text_a = build_profile_text(user_a)
    profile_text_b = build_profile_text(user_b)
    embedding_sim = compute_profile_similarity(profile_text_a, profile_text_b)
    embedding_bonus = embedding_sim * 10.0
    breakdown["embedding_similarity"] = round(embedding_sim, 4)
    breakdown["embedding_bonus"] = round(embedding_bonus, 2)

    # Cap base score at 90, then add embedding bonus
    base_score = min(total, 90.0)
    final_score = min(base_score + embedding_bonus, 100.0)
    final_score_int = int(round(final_score))

    # --- Build explanation text ---
    explanation_parts = []
    if shared_school:
        explanation_parts.append(f"both attended {user_a['school']}")
    if shared_college:
        explanation_parts.append(f"both studied at {user_a['college']}")
    if shared_workplace:
        explanation_parts.append(f"both work at {user_a['workplace']}")
    if mutual_count > 0:
        explanation_parts.append(f"{mutual_count} mutual friend(s)")
    if common_interests:
        explanation_parts.append(f"share interests in {', '.join(common_interests[:3])}")
    if common_skills:
        explanation_parts.append(f"share skills in {', '.join(common_skills[:3])}")
    if avg_meetups > 0:
        explanation_parts.append(f"met ~{avg_meetups:.0f} times before")
    if embedding_sim > 0.7:
        explanation_parts.append("very similar profiles")
    elif embedding_sim > 0.5:
        explanation_parts.append("moderately similar profiles")

    explanation_text = "Relationship based on: " + "; ".join(explanation_parts) + "." if explanation_parts else "Weak or no known connection."

    return {
        "user_a": user_a["user_id"],
        "user_b": user_b["user_id"],
        "relationship_score": final_score_int,
        "explanation": explanation_text,
        "details": {
            "shared_school": shared_school,
            "shared_college": shared_college,
            "shared_workplace": shared_workplace,
            "mutual_friends": shared_mutual_friends,
            "common_interests": common_interests,
            "common_skills": common_skills,
            "previous_meetups_avg": avg_meetups,
            "days_since_last_meeting": most_recent_days,
            "embedding_similarity": round(embedding_sim, 4),
            "score_breakdown": breakdown
        }
    }


def get_relationship_score(user_id_a: str, user_id_b: str, users: List[Dict] = None) -> Dict:
    """
    Public API: Calculate relationship score between two user IDs.
    """
    if users is None:
        users = load_users()
    user_a, user_b = get_user_pair(user_id_a, user_id_b, users)
    return calculate_relationship_score(user_a, user_b)
