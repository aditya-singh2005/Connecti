"""
data_loader.py — Loads users.json and provides helper functions for the ML engines.
"""

import json
import os
from typing import Dict, List, Optional

# Path to the shared dataset
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
USERS_FILE = os.path.join(DATA_DIR, "users.json")


def load_users() -> List[Dict]:
    """Load all users from users.json."""
    with open(USERS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def get_user_by_id(user_id: str, users: Optional[List[Dict]] = None) -> Optional[Dict]:
    """Get a single user by their user_id."""
    if users is None:
        users = load_users()
    for user in users:
        if user["user_id"] == user_id:
            return user
    return None


def get_user_pair(user_id_a: str, user_id_b: str, users: Optional[List[Dict]] = None) -> tuple:
    """Get two users by their IDs. Returns (user_a, user_b)."""
    if users is None:
        users = load_users()
    user_a = get_user_by_id(user_id_a, users)
    user_b = get_user_by_id(user_id_b, users)
    if user_a is None:
        raise ValueError(f"User '{user_id_a}' not found in dataset.")
    if user_b is None:
        raise ValueError(f"User '{user_id_b}' not found in dataset.")
    return user_a, user_b


def jaccard_similarity(set_a: set, set_b: set) -> float:
    """Compute Jaccard similarity between two sets. Returns 0.0 if both are empty."""
    if not set_a and not set_b:
        return 0.0
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union)


def common_elements(list_a: List[str], list_b: List[str]) -> List[str]:
    """Return the common elements between two lists (case-insensitive)."""
    set_a = {item.lower().strip() for item in list_a}
    set_b = {item.lower().strip() for item in list_b}
    # Return original-cased items from list_a that match
    return [item for item in list_a if item.lower().strip() in set_b]


def days_since(date_str: Optional[str]) -> Optional[int]:
    """Calculate days since a given ISO date string. Returns None if date is None."""
    if date_str is None:
        return None
    from datetime import datetime, date
    try:
        past_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        today = date.today()
        return (today - past_date).days
    except ValueError:
        return None


def build_profile_text(user: Dict) -> str:
    """
    Build a text representation of a user's profile for embedding.
    Combines interests, skills, city, college, and workplace.
    Does NOT include name to maintain privacy.
    """
    parts = []
    if user.get("interests"):
        parts.append("Interests: " + ", ".join(user["interests"]))
    if user.get("skills"):
        parts.append("Skills: " + ", ".join(user["skills"]))
    if user.get("city"):
        parts.append("City: " + user["city"])
    if user.get("college"):
        parts.append("College: " + user["college"])
    if user.get("workplace"):
        parts.append("Workplace: " + user["workplace"])
    return ". ".join(parts)
