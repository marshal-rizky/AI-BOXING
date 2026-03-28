"""
tournament.py — Tournament orchestration for the AI Boxing Simulation.

Modes:
  single        — one fight between two fighters
  best-of-3     — first to 2 wins
  best-of-5     — first to 3 wins
  round-robin   — every model vs every other model
"""
import asyncio
import json
import logging
from pathlib import Path

from config import CONFIG
from sim import run_fight

logger = logging.getLogger(__name__)

OUTPUT_DIR = Path("output/fights")


def _save(log_dict: dict, name: str) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / f"{name}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(log_dict, f, indent=2, ensure_ascii=False)
    # Always update the frontend copy
    frontend_copy = Path("static/fight_log.json")
    with open(frontend_copy, "w", encoding="utf-8") as f:
        json.dump(log_dict, f, indent=2, ensure_ascii=False)
    return path


async def single_fight(f1_key: str, f2_key: str, rounds: int = 12,
                        delay: float = 0.5, verbose: bool = True) -> dict:
    """Run a single fight. Returns the fight log dict."""
    log = await run_fight(f1_key, f2_key, max_rounds=rounds,
                          round_delay=delay, verbose=verbose)
    log_dict = log.to_dict()
    path = _save(log_dict, log.metadata.fight_id)
    logger.info(f"Fight log saved to {path}")
    return log_dict


async def best_of(f1_key: str, f2_key: str, n: int, rounds: int = 12,
                   delay: float = 0.5, verbose: bool = True) -> dict:
    """Run a best-of-N series. Returns series summary dict."""
    games_to_win = (n // 2) + 1
    wins = {f1_key: 0, f2_key: 0, "draw": 0}
    fight_logs = []

    f1_name = CONFIG["fighters"][f1_key]["display_name"]
    f2_name = CONFIG["fighters"][f2_key]["display_name"]

    print(f"\n{'='*50}")
    print(f"Best of {n}: {f1_name} vs {f2_name}")
    print(f"{'='*50}")

    game = 0
    while wins[f1_key] < games_to_win and wins[f2_key] < games_to_win and game < n:
        game += 1
        print(f"\n--- Fight {game} ---")
        log = await run_fight(f1_key, f2_key, max_rounds=rounds,
                              round_delay=delay, verbose=verbose)
        log_dict = log.to_dict()
        fight_logs.append(log_dict)

        fight_id = log.metadata.fight_id
        _save(log_dict, f"{fight_id}_game{game}")

        winner = log.result.winner
        if winner == f1_name:
            wins[f1_key] += 1
        elif winner == f2_name:
            wins[f2_key] += 1
        else:
            wins["draw"] += 1

        print(f"Fight {game}: {winner or 'Draw'} by {log.result.method}")
        print(f"Series: {f1_name}={wins[f1_key]}  {f2_name}={wins[f2_key]}  Draws={wins['draw']}")

    series_winner = (
        f1_name if wins[f1_key] >= games_to_win
        else f2_name if wins[f2_key] >= games_to_win
        else "Draw"
    )

    print(f"\nSeries winner: {series_winner}")
    return {
        "series_winner": series_winner,
        "wins": wins,
        "total_games": game,
        "fights": fight_logs,
    }


async def round_robin(rounds: int = 12, delay: float = 0.5,
                       verbose: bool = False) -> dict:
    """Run every available fighter against every other. Returns standings."""
    fighters = [k for k, v in CONFIG["fighters"].items() if v["provider"] != "random"]
    pairs = [
        (fighters[i], fighters[j])
        for i in range(len(fighters))
        for j in range(i + 1, len(fighters))
    ]

    standings = {
        k: {"name": CONFIG["fighters"][k]["display_name"],
            "wins": 0, "losses": 0, "draws": 0, "damage_dealt": 0}
        for k in fighters
    }
    all_logs = []

    print(f"\n{'='*50}")
    print(f"Round Robin: {len(fighters)} fighters, {len(pairs)} matchups")
    print(f"{'='*50}")

    for i, (f1_key, f2_key) in enumerate(pairs, 1):
        f1_name = CONFIG["fighters"][f1_key]["display_name"]
        f2_name = CONFIG["fighters"][f2_key]["display_name"]
        print(f"\n[{i}/{len(pairs)}] {f1_name} vs {f2_name}")

        log = await run_fight(f1_key, f2_key, max_rounds=rounds,
                              round_delay=delay, verbose=verbose)
        log_dict = log.to_dict()
        all_logs.append(log_dict)
        _save(log_dict, log.metadata.fight_id)

        winner = log.result.winner
        s1 = log.result.fighter1_stats
        s2 = log.result.fighter2_stats
        standings[f1_key]["damage_dealt"] += s1.total_damage_dealt
        standings[f2_key]["damage_dealt"] += s2.total_damage_dealt

        if winner == f1_name:
            standings[f1_key]["wins"] += 1
            standings[f2_key]["losses"] += 1
        elif winner == f2_name:
            standings[f2_key]["wins"] += 1
            standings[f1_key]["losses"] += 1
        else:
            standings[f1_key]["draws"] += 1
            standings[f2_key]["draws"] += 1

        print(f"  Result: {winner or 'Draw'} by {log.result.method}")

    # Sort by wins, then damage
    sorted_s = sorted(standings.values(), key=lambda x: (x["wins"], x["damage_dealt"]), reverse=True)

    print(f"\n{'='*50}")
    print("STANDINGS")
    print(f"{'='*50}")
    for rank, s in enumerate(sorted_s, 1):
        print(f"  {rank}. {s['name']}: {s['wins']}W {s['losses']}L {s['draws']}D  ({s['damage_dealt']} total dmg)")

    return {"standings": sorted_s, "fights": all_logs}
