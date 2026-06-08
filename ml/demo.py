#!/usr/bin/env python3
"""
demo.py — Connecti AI/ML Module Demo

Demonstrates all 3 AI features on 3 sample user pairs:
1. High match:   u001 (Aarav) & u003 (Rohan)  — same school + college + workplace
2. Medium match: u002 (Priya) & u007 (Arjun)  — same college, some mutual friends
3. Low match:    u004 (Ananya) & u008 (Ishita) — different backgrounds
"""

import json
import os
import sys
import time

# Add the ml directory to path so imports work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.data_loader import load_users, get_user_pair
from engines.relationship_strength import get_relationship_score
from engines.hint_generator import get_hints
from engines.reunion_probability import get_reunion_probability, calculate_reunion_probability


# ---------------------------------------------------------------------------
# Pretty-print helpers
# ---------------------------------------------------------------------------

def print_header(text: str):
    width = 70
    print("\n" + "=" * width)
    print(f"  {text}")
    print("=" * width)


def print_subheader(text: str):
    print(f"\n{'─' * 50}")
    print(f"  {text}")
    print(f"{'─' * 50}")


def print_score_bar(label: str, value: int, max_val: int = 100):
    """Print a visual score bar."""
    bar_width = 30
    filled = int((value / max_val) * bar_width)
    bar = "█" * filled + "░" * (bar_width - filled)
    print(f"  {label}: [{bar}] {value}/{max_val}")


def print_kv(key: str, value, indent: int = 4):
    """Print a key-value pair."""
    prefix = " " * indent
    if isinstance(value, list):
        if len(value) == 0:
            print(f"{prefix}{key}: (none)")
        else:
            print(f"{prefix}{key}: {', '.join(str(v) for v in value)}")
    elif isinstance(value, bool):
        print(f"{prefix}{key}: {'Yes' if value else 'No'}")
    else:
        print(f"{prefix}{key}: {value}")


def print_hint(hint: dict, indent: int = 6):
    """Print a single hint."""
    prefix = " " * indent
    level_stars = "★" * hint["level"] + "☆" * (5 - hint["level"])
    print(f"{prefix}[{level_stars}] ({hint['category']}) {hint['hint']}")


# ---------------------------------------------------------------------------
# Demo runner for a single user pair
# ---------------------------------------------------------------------------

def demo_pair(user_id_a: str, user_id_b: str, pair_label: str, users: list):
    """Run all 3 features on a user pair."""
    user_a, user_b = get_user_pair(user_id_a, user_id_b, users)

    print_header(f"{pair_label}: {user_a['name']} (#{user_id_a}) vs {user_b['name']} (#{user_id_b})")

    # Brief user profiles
    print(f"\n  User A: {user_a['name']}")
    print(f"    School:    {user_a['school']}")
    print(f"    College:   {user_a['college']}")
    print(f"    Workplace: {user_a['workplace']}")
    print(f"    City:      {user_a['city']}")
    print(f"    Interests: {', '.join(user_a['interests'])}")
    print(f"    Skills:    {', '.join(user_a['skills'])}")

    print(f"\n  User B: {user_b['name']}")
    print(f"    School:    {user_b['school']}")
    print(f"    College:   {user_b['college']}")
    print(f"    Workplace: {user_b['workplace']}")
    print(f"    City:      {user_b['city']}")
    print(f"    Interests: {', '.join(user_b['interests'])}")
    print(f"    Skills:    {', '.join(user_b['skills'])}")

    # ── Feature 1: Relationship Strength ──
    print_subheader("Feature 1: Relationship Strength Score")
    t0 = time.time()
    rel_result = get_relationship_score(user_id_a, user_id_b, users)
    t1 = time.time()

    score = rel_result["relationship_score"]
    print_score_bar("Relationship Score", score)
    print(f"\n    Explanation: {rel_result['explanation']}")
    print(f"\n    Score Breakdown:")
    details = rel_result["details"]
    print_kv("Shared School", details["shared_school"])
    print_kv("Shared College", details["shared_college"])
    print_kv("Shared Workplace", details["shared_workplace"])
    print_kv("Mutual Friends", details["mutual_friends"])
    print_kv("Common Interests", details["common_interests"])
    print_kv("Common Skills", details["common_skills"])
    print_kv("Avg Previous Meetups", details["previous_meetups_avg"])
    print_kv("Days Since Last Meeting", details.get("days_since_last_meeting", "N/A"))
    print_kv("Embedding Similarity", f"{details['embedding_similarity']:.4f}")
    print(f"\n    Computed in {t1 - t0:.2f}s")

    # ── Feature 2: Intelligent Hints ──
    print_subheader("Feature 2: Intelligent Hints (Progressive)")
    hints_result = get_hints(user_id_a, user_id_b, max_level=5, users=users)

    if hints_result["total_hints"] == 0:
        print("    No hints available (users share very little).")
    else:
        print(f"    Total hints generated: {hints_result['total_hints']}\n")
        for hint in hints_result["hints"]:
            print_hint(hint)

    # ── Feature 3: Reunion Probability ──
    print_subheader("Feature 3: Reunion Probability")
    t0 = time.time()
    reunion_result = calculate_reunion_probability(user_a, user_b, rel_result)
    t1 = time.time()

    prob = reunion_result["reunion_probability"]
    print_score_bar("Reunion Probability", prob, max_val=100)
    print(f"\n    Explanation: {reunion_result['explanation']}")
    print(f"    Recommendation: {reunion_result['recommendation']}")
    print(f"\n    Factor Details:")
    factors = reunion_result["factors"]
    print_kv("Relationship Score", factors["relationship_score"])
    print_kv("Mutual Friends", factors["mutual_friends"])
    print_kv("Previous Meetups Avg", factors["previous_meetups_avg"])
    print_kv("Profile Similarity", f"{factors['profile_similarity']:.4f}")
    print_kv("Recency Factor", f"{factors['recency_factor']:.3f}")
    print_kv("Weighted Sum", f"{factors['weighted_sum']:.4f}")
    print(f"\n    Computed in {t1 - t0:.2f}s")

    return {
        "pair": pair_label,
        "user_a": user_id_a,
        "user_b": user_id_b,
        "relationship": rel_result,
        "hints": hints_result,
        "reunion": reunion_result,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("\n" + "╔" + "═" * 68 + "╗")
    print("║" + "  CONNECTI — AI/ML MODULE DEMO".center(68) + "║")
    print("║" + "  Privacy-First Social Reconnection Platform".center(68) + "║")
    print("╚" + "═" * 68 + "╝")

    print("\nLoading user data...")
    users = load_users()
    print(f"Loaded {len(users)} users.\n")

    print("Loading sentence-transformer model (first run may download ~80MB)...")
    # Warm up the model with a dummy embedding
    from utils.embeddings import get_profile_embedding
    _ = get_profile_embedding("test warmup")
    print("Model loaded successfully.\n")

    # Define the 3 demo pairs
    pairs = [
        ("u001", "u003", "PAIR 1 — HIGH MATCH"),
        ("u002", "u007", "PAIR 2 — MEDIUM MATCH"),
        ("u004", "u008", "PAIR 3 — LOW MATCH"),
    ]

    all_results = []
    for user_a_id, user_b_id, label in pairs:
        result = demo_pair(user_a_id, user_b_id, label, users)
        all_results.append(result)

    # ── Summary Table ──
    print_header("SUMMARY")
    print(f"\n  {'Pair':<30} {'Rel. Score':>12} {'Reunion Prob':>14} {'Hints':>7}")
    print(f"  {'─' * 30} {'─' * 12} {'─' * 14} {'─' * 7}")
    for r in all_results:
        pair_name = r["pair"]
        rel = r["relationship"]["relationship_score"]
        reu = r["reunion"]["reunion_probability"]
        hints = r["hints"]["total_hints"]
        print(f"  {pair_name:<30} {rel:>10}/100 {reu:>12}% {hints:>7}")

    # ── Save outputs to JSON ──
    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "outputs")
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, "sample_outputs.json")

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(all_results, f, indent=2, default=str)

    print(f"\n  Results saved to: {output_file}")
    print("\n" + "═" * 70)
    print("  Demo complete! All 3 AI features are working.")
    print("═" * 70 + "\n")


if __name__ == "__main__":
    main()
