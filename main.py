"""
main.py — CLI entry point for the AI Boxing Simulation.
"""
import asyncio
import json
import logging
import os
import sys
from pathlib import Path


def _load_dotenv():
    """Load .env into os.environ so API keys are available when run as subprocess."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    os.environ[key.strip()] = val.strip()
    except FileNotFoundError:
        pass

_load_dotenv()

from config import CONFIG, parse_args
from sim import run_fight

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

OUTPUT_DIR = Path("output/fights")


def save_fight_log(log_dict: dict, fight_id: str) -> Path:
    """Save fight log to output/fights/<fight_id>.json and copy to fight_log.json."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    named_path = OUTPUT_DIR / f"{fight_id}.json"
    latest_path = Path("static/fight_log.json")

    with open(named_path, "w", encoding="utf-8") as f:
        json.dump(log_dict, f, indent=2, ensure_ascii=False)

    with open(latest_path, "w", encoding="utf-8") as f:
        json.dump(log_dict, f, indent=2, ensure_ascii=False)

    return named_path


async def run_single(args) -> dict:
    """Run a single fight and return the log dict."""
    log = await run_fight(
        fighter1_key=args.fighter1,
        fighter2_key=args.fighter2,
        max_rounds=args.rounds,
        round_delay=args.delay,
        verbose=args.verbose,
    )
    return log.to_dict()


async def run_best_of(args, n: int) -> dict:
    """Run a best-of-N series and return aggregated results."""
    wins = {args.fighter1: 0, args.fighter2: 0, "draw": 0}
    fight_logs = []
    games_needed = (n // 2) + 1

    print(f"\nBest of {n}: {args.fighter1} vs {args.fighter2}")
    for game in range(1, n + 1):
        print(f"\n>>> Fight {game} of {n}")
        log = await run_fight(
            fighter1_key=args.fighter1,
            fighter2_key=args.fighter2,
            max_rounds=args.rounds,
            round_delay=args.delay,
            verbose=args.verbose,
        )
        log_dict = log.to_dict()
        fight_logs.append(log_dict)

        winner = log.result.winner
        f1_name = CONFIG["fighters"][args.fighter1]["display_name"]
        f2_name = CONFIG["fighters"][args.fighter2]["display_name"]

        if winner == f1_name:
            wins[args.fighter1] += 1
        elif winner == f2_name:
            wins[args.fighter2] += 1
        else:
            wins["draw"] += 1

        print(f"  Fight {game} result: {winner or 'Draw'} by {log.result.method}")
        print(f"  Series: {args.fighter1}={wins[args.fighter1]}  {args.fighter2}={wins[args.fighter2]}  draws={wins['draw']}")

        # Save each fight
        fight_id = log.metadata.fight_id
        save_fight_log(log_dict, f"{fight_id}_game{game}")

        # Check if series is decided
        if wins[args.fighter1] >= games_needed or wins[args.fighter2] >= games_needed:
            break

    series_winner = (
        args.fighter1 if wins[args.fighter1] >= games_needed
        else args.fighter2 if wins[args.fighter2] >= games_needed
        else "draw"
    )
    print(f"\nSeries winner: {series_winner}")
    return {"series_winner": series_winner, "wins": wins, "fights": fight_logs}


async def run_round_robin(args) -> dict:
    """Run every fighter against every other fighter."""
    fighters = list(CONFIG["fighters"].keys())
    pairs = [(fighters[i], fighters[j]) for i in range(len(fighters)) for j in range(i+1, len(fighters))]
    standings = {f: {"wins": 0, "losses": 0, "draws": 0} for f in fighters}
    all_logs = []

    print(f"\nRound Robin: {len(pairs)} matchups")
    for i, (f1_key, f2_key) in enumerate(pairs, 1):
        f1_name = CONFIG["fighters"][f1_key]["display_name"]
        f2_name = CONFIG["fighters"][f2_key]["display_name"]
        print(f"\n>>> Matchup {i}/{len(pairs)}: {f1_name} vs {f2_name}")

        log = await run_fight(
            fighter1_key=f1_key,
            fighter2_key=f2_key,
            max_rounds=args.rounds,
            round_delay=args.delay,
            verbose=args.verbose,
        )
        log_dict = log.to_dict()
        all_logs.append(log_dict)

        winner = log.result.winner
        if winner == f1_name:
            standings[f1_key]["wins"] += 1
            standings[f2_key]["losses"] += 1
        elif winner == f2_name:
            standings[f2_key]["wins"] += 1
            standings[f1_key]["losses"] += 1
        else:
            standings[f1_key]["draws"] += 1
            standings[f2_key]["draws"] += 1

        save_fight_log(log_dict, log.metadata.fight_id)

    print("\n=== STANDINGS ===")
    sorted_standings = sorted(standings.items(), key=lambda x: x[1]["wins"], reverse=True)
    for rank, (fighter_key, record) in enumerate(sorted_standings, 1):
        name = CONFIG["fighters"][fighter_key]["display_name"]
        print(f"  {rank}. {name}: {record['wins']}W {record['losses']}L {record['draws']}D")

    return {"standings": standings, "fights": all_logs}


async def main():
    args = parse_args()

    try:
        if args.tournament == "single":
            log_dict = await run_single(args)
            fight_id = log_dict["metadata"]["fight_id"]
            path = save_fight_log(log_dict, fight_id)
            result = log_dict["result"]
            winner = result["winner"] or "Draw"
            method = result["method"]
            print(f"\nResult: {winner} wins by {method}")
            print(f"Log saved to: {path}")
            print(f"Frontend log: static/fight_log.json")

        elif args.tournament in ("best-of-3", "best-of-5"):
            n = int(args.tournament.split("-")[-1])
            result = await run_best_of(args, n)
            print(f"\nSeries complete. Winner: {result['series_winner']}")

        elif args.tournament == "round-robin":
            result = await run_round_robin(args)

    except PermissionError as e:
        print(f"\nERROR: {e}", file=sys.stderr)
        print("Check your API keys are set correctly.", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nFight interrupted.")
        sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
