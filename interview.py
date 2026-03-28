"""
interview.py - Post-fight interview generator.

Calls each AI fighter to produce a short post-fight statement about
the bout and their opponent.
"""
import asyncio
import logging

from config import CONFIG
from models import Fighter
from fighters import get_fighter_move

logger = logging.getLogger(__name__)

_INTERVIEW_TOKENS = 300


def _find_fighter_key(fighter_cfg: dict) -> str | None:
    """Reverse-lookup CONFIG fighter key from a fight log's fighter_config."""
    model = fighter_cfg.get("model", "")
    for key, cfg in CONFIG["fighters"].items():
        if cfg.get("model") == model:
            return key
    return None


def _make_fighter(key: str) -> Fighter:
    cfg = CONFIG["fighters"][key]
    return Fighter(
        name=key,
        display_name=cfg["display_name"],
        provider=cfg["provider"],
        model=cfg["model"],
        personality=cfg.get("personality", ""),
        temperature=cfg.get("temperature", 0.9),
    )


def _build_prompt(fighter_key: str, opponent_key: str, fight_result: dict, fight_stats: dict) -> tuple[str, str]:
    cfg = CONFIG["fighters"][fighter_key]
    opp_cfg = CONFIG["fighters"][opponent_key]

    name = cfg["display_name"]
    opponent_name = opp_cfg["display_name"]
    personality = cfg.get("personality", "")

    winner = fight_result.get("winner")
    method = fight_result.get("method", "Decision")
    rounds_fought = fight_result.get("rounds_fought", 0)

    if winner is None or method == "Draw":
        outcome = f"you drew with {opponent_name}"
    elif winner == name:
        outcome = f"you just defeated {opponent_name} by {method} in {rounds_fought} round{'s' if rounds_fought != 1 else ''}"
    else:
        outcome = f"you just lost to {opponent_name} by {method} in {rounds_fought} round{'s' if rounds_fought != 1 else ''}"

    dmg_dealt = fight_stats.get("total_damage_dealt", 0)
    dmg_taken = fight_stats.get("total_damage_taken", 0)
    dodges = fight_stats.get("successful_dodges", 0)

    system_prompt = (
        f"You are {name}. Your fighter personality: {personality}\n\n"
        "You are being interviewed ringside immediately after a boxing match. "
        "Speak in first person, in character. Be candid, emotional, and direct. "
        "Do NOT use JSON. Just speak naturally as yourself."
    )

    user_prompt = (
        f"Post-fight interview: {outcome}. "
        f"You dealt {dmg_dealt} damage, took {dmg_taken} damage, and landed {dodges} successful dodge(s).\n\n"
        f"In 3-4 sentences: share your honest reaction to how the fight went, "
        f"give your opinion of {opponent_name} as an opponent, "
        f"and say something about what you'd do differently or what's next."
    )

    return system_prompt, user_prompt


async def run_interviews(fight_log_dict: dict) -> dict:
    """
    Given a fight log dict, call both fighters for a post-fight interview.

    Returns:
        {
            "fighter1": {"name": str, "response": str, "error": bool},
            "fighter2": {"name": str, "response": str, "error": bool},
        }
    """
    meta = fight_log_dict.get("metadata", {})
    result = fight_log_dict.get("result", {})

    f1_cfg = meta.get("fighter1_config", {})
    f2_cfg = meta.get("fighter2_config", {})
    f1_key = _find_fighter_key(f1_cfg)
    f2_key = _find_fighter_key(f2_cfg)

    f1_stats = result.get("fighter1_stats", {})
    f2_stats = result.get("fighter2_stats", {})

    if not f1_key or not f2_key:
        return {
            "fighter1": {"name": f1_cfg.get("display_name", "Fighter 1"), "response": "No comment.", "error": True},
            "fighter2": {"name": f2_cfg.get("display_name", "Fighter 2"), "response": "No comment.", "error": True},
        }

    f1 = _make_fighter(f1_key)
    f2 = _make_fighter(f2_key)

    sys1, usr1 = _build_prompt(f1_key, f2_key, result, f1_stats)
    sys2, usr2 = _build_prompt(f2_key, f1_key, result, f2_stats)

    r1, r2 = await asyncio.gather(
        get_fighter_move(f1, sys1, usr1, max_tokens=_INTERVIEW_TOKENS),
        get_fighter_move(f2, sys2, usr2, max_tokens=_INTERVIEW_TOKENS),
    )

    return {
        "fighter1": {
            "name": f1.display_name,
            "response": r1.get("raw", "").strip() or "No comment.",
            "error": r1.get("api_error", False),
        },
        "fighter2": {
            "name": f2.display_name,
            "response": r2.get("raw", "").strip() or "No comment.",
            "error": r2.get("api_error", False),
        },
    }
