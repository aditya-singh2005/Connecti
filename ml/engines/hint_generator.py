"""
hint_generator.py — Feature 2: Intelligent Hint Generator

Generates progressive hints (level 1–5, vague → specific) for two users
before identity reveal. Hints are generated programmatically from
relationship data — no LLM needed.

IMPORTANT: User names are NEVER included in hints.
"""

from typing import Dict, List, Optional
from utils.data_loader import load_users, get_user_pair, common_elements


# ---------------------------------------------------------------------------
# Hint templates per category — each key maps to 5 levels (vague → specific)
# The templates use {placeholder} tokens that get filled at runtime.
# ---------------------------------------------------------------------------

def _education_hints(user_a: Dict, user_b: Dict) -> List[Dict]:
    """Generate education-related hints (school + college)."""
    hints = []

    # --- School hints ---
    school_a = user_a.get("school", "").strip()
    school_b = user_b.get("school", "").strip()
    if school_a and school_b and school_a.lower() == school_b.lower():
        city_hint = ""
        if "," in school_a:
            city_hint = school_a.split(",")[-1].strip()

        hints.append({"level": 1, "category": "education", "hint": "You share an educational background."})
        hints.append({"level": 2, "category": "education", "hint": "You both went to the same school."})
        if city_hint:
            hints.append({"level": 3, "category": "education", "hint": f"You both went to a school in {city_hint}."})
        else:
            hints.append({"level": 3, "category": "education", "hint": "You both went to the same well-known school."})
        hints.append({"level": 4, "category": "education", "hint": f"Your school name starts with '{school_a[0]}'."})
        hints.append({"level": 5, "category": "education", "hint": f"You both attended {school_a}."})

    # --- College hints ---
    college_a = user_a.get("college", "").strip()
    college_b = user_b.get("college", "").strip()
    if college_a and college_b and college_a.lower() == college_b.lower():
        # Determine college type
        college_type = "a university"
        college_lower = college_a.lower()
        if "iit" in college_lower:
            college_type = "an IIT"
        elif "nit" in college_lower:
            college_type = "an NIT"
        elif "bits" in college_lower:
            college_type = "a top private engineering college"
        elif "university" in college_lower or "dtu" in college_lower:
            college_type = "a top engineering university"

        hints.append({"level": 1, "category": "college", "hint": "You share a higher-education connection."})
        hints.append({"level": 2, "category": "college", "hint": f"You both studied at {college_type}."})
        hints.append({"level": 3, "category": "college", "hint": "You attended the same college."})
        hints.append({"level": 4, "category": "college", "hint": f"Your college name starts with '{college_a[:3]}'."})
        hints.append({"level": 5, "category": "college", "hint": f"You both attended {college_a}."})

    return hints


def _workplace_hints(user_a: Dict, user_b: Dict) -> List[Dict]:
    """Generate workplace-related hints."""
    hints = []
    wp_a = user_a.get("workplace", "").strip()
    wp_b = user_b.get("workplace", "").strip()

    if wp_a and wp_b and wp_a.lower() == wp_b.lower():
        # Determine company category
        big_tech = ["google", "microsoft", "amazon", "meta", "apple"]
        fintech = ["goldman sachs", "jpmorgan", "razorpay"]
        startup = ["flipkart", "zomato", "freshworks", "zoho"]

        wp_lower = wp_a.lower()
        if any(t in wp_lower for t in big_tech):
            category = "a major tech company"
        elif any(t in wp_lower for t in fintech):
            category = "a leading financial institution"
        elif any(t in wp_lower for t in startup):
            category = "a well-known Indian tech company"
        else:
            category = "the same organization"

        hints.append({"level": 1, "category": "workplace", "hint": "You have a professional connection."})
        hints.append({"level": 2, "category": "workplace", "hint": f"You both work at {category}."})
        hints.append({"level": 3, "category": "workplace", "hint": "You are currently colleagues."})
        hints.append({"level": 4, "category": "workplace", "hint": f"Your company name starts with '{wp_a[0]}'."})
        hints.append({"level": 5, "category": "workplace", "hint": f"You both work at {wp_a}."})

    return hints


def _location_hints(user_a: Dict, user_b: Dict) -> List[Dict]:
    """Generate city/location-related hints."""
    hints = []
    city_a = user_a.get("city", "").strip()
    city_b = user_b.get("city", "").strip()

    if city_a and city_b and city_a.lower() == city_b.lower():
        # Determine region
        north = ["delhi", "noida", "gurgaon", "chandigarh", "jaipur"]
        south = ["chennai", "bangalore", "hyderabad", "kochi"]
        west = ["mumbai", "pune", "ahmedabad"]
        east = ["kolkata", "bhubaneswar"]

        city_lower = city_a.lower()
        if city_lower in north:
            region = "North India"
        elif city_lower in south:
            region = "South India"
        elif city_lower in west:
            region = "West India"
        elif city_lower in east:
            region = "East India"
        else:
            region = "the same region"

        hints.append({"level": 1, "category": "location", "hint": "You are in the same part of the country."})
        hints.append({"level": 2, "category": "location", "hint": f"You're both based in {region}."})
        hints.append({"level": 3, "category": "location", "hint": "You live in the same city."})
        hints.append({"level": 4, "category": "location", "hint": f"Your city starts with the letter '{city_a[0]}'."})
        hints.append({"level": 5, "category": "location", "hint": f"You're both in {city_a}."})

    return hints


def _interest_hints(user_a: Dict, user_b: Dict) -> List[Dict]:
    """Generate interest-related hints."""
    hints = []
    common = common_elements(user_a.get("interests", []), user_b.get("interests", []))

    if len(common) >= 1:
        hints.append({"level": 1, "category": "interests", "hint": "You share some hobbies."})
        hints.append({"level": 2, "category": "interests", "hint": f"You have {len(common)} interest(s) in common."})

        # Categorize interests
        outdoor = ["hiking", "cricket", "fitness"]
        creative = ["photography", "painting", "music", "poetry", "dance"]
        intellectual = ["chess", "reading", "open-source", "gaming"]
        lifestyle = ["travel", "cooking", "yoga", "food"]

        categories_found = set()
        for interest in common:
            il = interest.lower()
            if il in outdoor:
                categories_found.add("outdoor activities")
            if il in creative:
                categories_found.add("creative pursuits")
            if il in intellectual:
                categories_found.add("intellectual hobbies")
            if il in lifestyle:
                categories_found.add("lifestyle interests")

        if categories_found:
            hints.append({"level": 3, "category": "interests", "hint": f"You both enjoy {list(categories_found)[0]}."})
        else:
            hints.append({"level": 3, "category": "interests", "hint": "You enjoy similar types of activities."})

        hints.append({"level": 4, "category": "interests", "hint": f"One shared interest starts with '{common[0][0].upper()}'."})
        if len(common) == 1:
            hints.append({"level": 5, "category": "interests", "hint": f"You both enjoy {common[0]}."})
        else:
            hints.append({"level": 5, "category": "interests", "hint": f"You both enjoy {', '.join(common[:3])}."})

    return hints


def _skill_hints(user_a: Dict, user_b: Dict) -> List[Dict]:
    """Generate skill-related hints."""
    hints = []
    common = common_elements(user_a.get("skills", []), user_b.get("skills", []))

    if len(common) >= 1:
        # Categorize skills
        ai_ml = ["machine learning", "data science", "tensorflow", "r"]
        web = ["react", "node.js", "javascript", "typescript", "django"]
        backend = ["python", "java", "c++", "c#", "go"]
        infra = ["kubernetes", "docker", "aws", "azure", "linux"]

        domain = "technology"
        for s in common:
            sl = s.lower()
            if sl in [x.lower() for x in ai_ml]:
                domain = "AI/ML"
                break
            if sl in [x.lower() for x in web]:
                domain = "web development"
                break
            if sl in [x.lower() for x in infra]:
                domain = "infrastructure & cloud"
                break

        hints.append({"level": 1, "category": "skills", "hint": "You have overlapping professional skills."})
        hints.append({"level": 2, "category": "skills", "hint": f"You both work in {domain}."})
        hints.append({"level": 3, "category": "skills", "hint": f"You share {len(common)} technical skill(s)."})
        hints.append({"level": 4, "category": "skills", "hint": f"One shared skill starts with '{common[0][0].upper()}'."})
        hints.append({"level": 5, "category": "skills", "hint": f"You both know {', '.join(common[:3])}."})

    return hints


def _mutual_friend_hints(user_a: Dict, user_b: Dict) -> List[Dict]:
    """Generate mutual-friends-related hints."""
    hints = []
    mutual_a = set(user_a.get("mutual_friends", []))
    mutual_b = set(user_b.get("mutual_friends", []))
    shared = mutual_a & mutual_b

    if len(shared) >= 1:
        hints.append({"level": 1, "category": "social", "hint": "You move in similar social circles."})
        hints.append({"level": 2, "category": "social", "hint": "You have friends in common."})
        hints.append({"level": 3, "category": "social", "hint": f"You share {len(shared)} mutual friend(s)."})

    return hints


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_hints(user_a: Dict, user_b: Dict, max_level: int = 5) -> Dict:
    """
    Generate progressive hints for two users.

    Args:
        user_a: First user dict.
        user_b: Second user dict.
        max_level: Maximum hint level to include (1–5). Default 5.

    Returns:
        Dict with user IDs and a list of hints, filtered by max_level.
    """
    all_hints = []
    all_hints.extend(_education_hints(user_a, user_b))
    all_hints.extend(_workplace_hints(user_a, user_b))
    all_hints.extend(_location_hints(user_a, user_b))
    all_hints.extend(_interest_hints(user_a, user_b))
    all_hints.extend(_skill_hints(user_a, user_b))
    all_hints.extend(_mutual_friend_hints(user_a, user_b))

    # Filter to max_level
    filtered = [h for h in all_hints if h["level"] <= max_level]

    # Sort by level, then by category
    filtered.sort(key=lambda h: (h["level"], h["category"]))

    return {
        "user_a": user_a["user_id"],
        "user_b": user_b["user_id"],
        "max_level": max_level,
        "total_hints": len(filtered),
        "hints": filtered
    }


def get_hints(user_id_a: str, user_id_b: str, max_level: int = 5, users=None) -> Dict:
    """
    Public API: Generate hints between two user IDs.
    """
    if users is None:
        users = load_users()
    user_a, user_b = get_user_pair(user_id_a, user_id_b, users)
    return generate_hints(user_a, user_b, max_level)
