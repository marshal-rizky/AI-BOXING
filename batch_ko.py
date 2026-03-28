"""
batch_ko.py - Run repeated AI-vs-AI KO-focused fights and produce a report.

This runner intentionally enables the real LLM build phase so missing perks
remain a useful debug signal for provider failures.
"""
import argparse
import asyncio
import json
import os
from datetime import UTC, datetime
from itertools import combinations
from pathlib import Path

from config import CONFIG
from sim import run_fight

OUTPUT_DIR = Path("output/fights")
REPORT_DIR = Path("output/reports")


def _load_dotenv():
    path = Path(__file__).with_name(".env")
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    os.environ[key.strip()] = val.strip()
    except FileNotFoundError:
        pass


def _fighter_pool(include_random: bool) -> list[str]:
    fighters = list(CONFIG["fighters"].keys())
    if not include_random:
        fighters = [f for f in fighters if CONFIG["fighters"][f]["provider"] != "random"]
    return fighters


def _pairings(fighters: list[str], include_mirrors: bool, include_self: bool) -> list[tuple[str, str]]:
    pairs = list(combinations(fighters, 2))
    if include_mirrors:
        pairs.extend((b, a) for a, b in list(pairs))
    if include_self:
        pairs.extend((f, f) for f in fighters)
    return pairs


def _save_fight_log(log_dict: dict, fight_id: str) -> str:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    path = OUTPUT_DIR / f"{fight_id}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(log_dict, f, indent=2, ensure_ascii=False)
    return str(path)


def _build_status(build: dict) -> dict:
    perks = build.get("perks", [])
    return {
        "perks": perks,
        "missing_perks": len(perks) == 0,
        "reasoning": build.get("reasoning", ""),
    }


def _leaderboard_entry():
    return {
        "wins": 0,
        "losses": 0,
        "draws": 0,
        "ko_wins": 0,
        "tko_wins": 0,
        "decisions": 0,
        "double_ko_draws": 0,
        "double_tko_draws": 0,
        "api_error_rounds": 0,
        "missing_perk_builds": 0,
        "timeouts": 0,
    }


async def _run_single(f1: str, f2: str, rounds: int, timeout_seconds: int) -> dict:
    log = await asyncio.wait_for(
        run_fight(
            fighter1_key=f1,
            fighter2_key=f2,
            max_rounds=rounds,
            round_delay=0,
            verbose=False,
        ),
        timeout=timeout_seconds,
    )

    log_dict = log.to_dict()
    save_path = _save_fight_log(log_dict, log.metadata.fight_id)
    result = log_dict["result"]
    meta = log_dict["metadata"]

    return {
        "status": "completed",
        "fight_id": meta["fight_id"],
        "fighters": [f1, f2],
        "display_names": [
            meta["fighter1_config"]["display_name"],
            meta["fighter2_config"]["display_name"],
        ],
        "winner": result["winner"],
        "method": result["method"],
        "rounds_fought": result["rounds_fought"],
        "fight_log_path": save_path,
        "fighter1_api_errors": result["fighter1_stats"]["api_errors"],
        "fighter2_api_errors": result["fighter2_stats"]["api_errors"],
        "fighter1_build": _build_status(meta.get("fighter1_build", {})),
        "fighter2_build": _build_status(meta.get("fighter2_build", {})),
    }


async def _run_with_retries(f1: str, f2: str, rounds: int, timeout_seconds: int, retries: int) -> dict:
    last_error = None
    for attempt in range(1, retries + 2):
        try:
            result = await _run_single(f1, f2, rounds, timeout_seconds)
            result["attempts"] = attempt
            return result
        except asyncio.TimeoutError:
            last_error = f"Timed out after {timeout_seconds}s"
        except PermissionError as e:
            return {
                "status": "auth_error",
                "fighters": [f1, f2],
                "display_names": [
                    CONFIG["fighters"][f1]["display_name"],
                    CONFIG["fighters"][f2]["display_name"],
                ],
                "error": str(e),
                "attempts": attempt,
            }
        except Exception as e:
            last_error = str(e)

    return {
        "status": "failed",
        "fighters": [f1, f2],
        "display_names": [
            CONFIG["fighters"][f1]["display_name"],
            CONFIG["fighters"][f2]["display_name"],
        ],
        "error": last_error or "Unknown failure",
        "attempts": retries + 1,
    }


def _update_leaderboard(board: dict, item: dict) -> None:
    names = item["display_names"]
    for name in names:
        board.setdefault(name, _leaderboard_entry())

    if item["status"] != "completed":
        for name in names:
            board[name]["timeouts"] += 1
        return

    name1, name2 = names
    method = item["method"]
    winner = item["winner"]

    board[name1]["api_error_rounds"] += item["fighter1_api_errors"]
    board[name2]["api_error_rounds"] += item["fighter2_api_errors"]
    board[name1]["missing_perk_builds"] += int(item["fighter1_build"]["missing_perks"])
    board[name2]["missing_perk_builds"] += int(item["fighter2_build"]["missing_perks"])

    if winner == name1:
        board[name1]["wins"] += 1
        board[name2]["losses"] += 1
    elif winner == name2:
        board[name2]["wins"] += 1
        board[name1]["losses"] += 1
    else:
        board[name1]["draws"] += 1
        board[name2]["draws"] += 1

    if method == "KO":
        if winner == name1:
            board[name1]["ko_wins"] += 1
        elif winner == name2:
            board[name2]["ko_wins"] += 1
    elif method == "TKO":
        if winner == name1:
            board[name1]["tko_wins"] += 1
        elif winner == name2:
            board[name2]["tko_wins"] += 1
    elif method == "Decision":
        board[name1]["decisions"] += 1
        board[name2]["decisions"] += 1
    elif method == "Draw (Double KO)":
        board[name1]["double_ko_draws"] += 1
        board[name2]["double_ko_draws"] += 1
    elif method == "Draw (Double TKO)":
        board[name1]["double_tko_draws"] += 1
        board[name2]["double_tko_draws"] += 1


async def _main(args):
    _load_dotenv()

    fighters = args.fighters or _fighter_pool(include_random=args.include_random)
    pairs = _pairings(fighters, include_mirrors=args.include_mirrors, include_self=args.include_self)

    original_build_phase = CONFIG.get("use_llm_build_phase", True)
    original_serialize_requests = CONFIG.get("serialize_provider_requests", False)
    CONFIG["use_llm_build_phase"] = True
    if args.profile == "stable":
        CONFIG["serialize_provider_requests"] = True

    started_at = datetime.now(UTC).isoformat()
    results = []
    board = {}

    try:
        for index, (f1, f2) in enumerate(pairs, 1):
            print(f"[{index}/{len(pairs)}] {CONFIG['fighters'][f1]['display_name']} vs {CONFIG['fighters'][f2]['display_name']}")
            result = await _run_with_retries(
                f1=f1,
                f2=f2,
                rounds=args.rounds,
                timeout_seconds=args.timeout,
                retries=args.retries,
            )
            results.append(result)
            _update_leaderboard(board, result)

            if result["status"] == "completed":
                print(
                    f"  -> {result['method']} in {result['rounds_fought']} rounds | "
                    f"winner: {result['winner'] or 'Draw'} | "
                    f"api_errors: {result['fighter1_api_errors']}/{result['fighter2_api_errors']} | "
                    f"missing_perks: {int(result['fighter1_build']['missing_perks'])}/{int(result['fighter2_build']['missing_perks'])}"
                )
            else:
                print(f"  -> {result['status']}: {result['error']}")
    finally:
        CONFIG["use_llm_build_phase"] = original_build_phase
        CONFIG["serialize_provider_requests"] = original_serialize_requests

    finished_at = datetime.now(UTC).isoformat()
    report = {
        "started_at": started_at,
        "finished_at": finished_at,
        "rounds_limit": args.rounds,
        "timeout_seconds": args.timeout,
        "retries": args.retries,
        "profile": args.profile,
        "fighters": fighters,
        "pairs": pairs,
        "results": results,
        "leaderboard": board,
    }

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    report_path = REPORT_DIR / f"ko-batch-{stamp}.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    summary_path = REPORT_DIR / f"ko-batch-{stamp}.md"
    with open(summary_path, "w", encoding="utf-8") as f:
        f.write(f"# KO Batch Report\n\n")
        f.write(f"- Profile: `{args.profile}`\n")
        f.write(f"- Started: `{started_at}`\n")
        f.write(f"- Finished: `{finished_at}`\n")
        f.write(f"- Timeout per fight: `{args.timeout}s`\n")
        f.write(f"- Retries: `{args.retries}`\n\n")
        f.write("## Results\n\n")
        for item in results:
            matchup = " vs ".join(item["display_names"])
            if item["status"] == "completed":
                f.write(
                    f"- `{matchup}`: `{item['method']}` in `{item['rounds_fought']}` rounds, "
                    f"winner `{item['winner'] or 'Draw'}`, "
                    f"api errors `{item['fighter1_api_errors']}/{item['fighter2_api_errors']}`, "
                    f"missing perks `{int(item['fighter1_build']['missing_perks'])}/{int(item['fighter2_build']['missing_perks'])}`\n"
                )
            else:
                f.write(f"- `{matchup}`: `{item['status']}` - `{item['error']}`\n")

        f.write("\n## Leaderboard\n\n")
        for name, stats in sorted(board.items()):
            f.write(
                f"- `{name}`: wins `{stats['wins']}`, losses `{stats['losses']}`, draws `{stats['draws']}`, "
                f"KO wins `{stats['ko_wins']}`, TKO wins `{stats['tko_wins']}`, "
                f"api error rounds `{stats['api_error_rounds']}`, missing perk builds `{stats['missing_perk_builds']}`, "
                f"timeouts `{stats['timeouts']}`\n"
            )

    print(f"\nReport saved to {report_path}")
    print(f"Summary saved to {summary_path}")


def parse_args():
    parser = argparse.ArgumentParser(description="Run KO-focused AI boxing batches")
    parser.add_argument("--fighters", nargs="*", help="Optional fighter keys to include")
    parser.add_argument("--include-random", action="store_true", help="Include the random fighter")
    parser.add_argument("--include-mirrors", action="store_true", help="Run A vs B and B vs A")
    parser.add_argument("--include-self", action="store_true", help="Run self-matchups like llama vs llama")
    parser.add_argument("--rounds", type=int, default=999, help="Max rounds per fight (default: 999)")
    parser.add_argument("--timeout", type=int, default=180, help="Per-fight timeout in seconds (default: 180)")
    parser.add_argument("--retries", type=int, default=1, help="Retries after a timeout/failure (default: 1)")
    parser.add_argument("--profile", choices=["stable", "stress"], default="stable",
                        help="stable serializes same-provider requests to reduce rate-limit failures")
    return parser.parse_args()


if __name__ == "__main__":
    asyncio.run(_main(parse_args()))
