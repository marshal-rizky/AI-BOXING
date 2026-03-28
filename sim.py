"""
sim.py — Core async fight loop for the AI Boxing Simulation.
"""
import asyncio
import logging
import time
import uuid
from datetime import datetime

import json as _json

from config import CONFIG
from commentary import generate_commentary
from fighters import get_fighter_move, get_fighter_build
from models import (
    Fighter, FightLog, FightMetadata, FightResult, FightStats,
    RoundFighterResult, RoundResult,
)
from parser import parse_move, sanitize_model_output
from prompt import build_prompt, build_build_prompt
from resolution import (
    apply_rest_recovery, apply_stamina_cost, enforce_stamina,
    resolve_distance, resolve_moves, score_round,
)

logger = logging.getLogger(__name__)

MAX_ROUNDS = CONFIG["max_rounds"]

_COOLDOWNS      = CONFIG.get("move_cooldowns", {})
_DMG_SCALE      = CONFIG.get("diminishing_returns", [1.0, 0.75, 0.50])
_STAM_SCALE     = CONFIG.get("stamina_repeat_scale", [1.0, 1.25, 1.50])
_MOVE_COSTS     = {m: v["stamina_cost"] for m, v in CONFIG["moves"].items()}


def _enforce_cooldown(move: str, fighter: Fighter) -> str:
    """If move is on cooldown, substitute the best available uncooled move."""
    if fighter.move_cooldowns.get(move, 0) <= 0:
        return move
    # Priority order for substitution: more interesting moves first
    for alt in ("hook", "uppercut", "dodge", "clinch", "jab", "rest"):
        if fighter.move_cooldowns.get(alt, 0) <= 0:
            if _MOVE_COSTS[alt] <= fighter.stamina or alt == "rest":
                return alt
    return "rest"


def _scaled_stamina_cost(move: str, fighter: Fighter) -> int:
    """Base stamina cost multiplied by repeat-use penalty."""
    base = _MOVE_COSTS[move]
    if base == 0:           # rest — no cost ever
        return 0
    if move == fighter.consecutive_move and fighter.consecutive_count > 0:
        idx = min(fighter.consecutive_count, len(_STAM_SCALE) - 1)
        return int(base * _STAM_SCALE[idx])
    return base


def _apply_diminishing(damage: int, move: str, fighter: Fighter) -> int:
    """Scale damage down if fighter is repeating the same move."""
    if move != fighter.consecutive_move or fighter.consecutive_count == 0:
        return damage
    idx = min(fighter.consecutive_count, len(_DMG_SCALE) - 1)
    return int(damage * _DMG_SCALE[idx])


def _update_antispam(fighter: Fighter, move_executed: str) -> None:
    """Tick down cooldowns and update consecutive-move tracking."""
    # Decrement all active cooldowns
    to_remove = []
    for m in fighter.move_cooldowns:
        fighter.move_cooldowns[m] -= 1
        if fighter.move_cooldowns[m] <= 0:
            to_remove.append(m)
    for m in to_remove:
        del fighter.move_cooldowns[m]
    # Set cooldown for the move just used
    cd = _COOLDOWNS.get(move_executed, 0)
    if cd > 0:
        fighter.move_cooldowns[move_executed] = cd
    # Track consecutive use
    if move_executed == fighter.consecutive_move:
        fighter.consecutive_count += 1
    else:
        fighter.consecutive_move = move_executed
        fighter.consecutive_count = 1
TKO_THRESHOLD = CONFIG["consecutive_rest_tko_threshold"]
STARTING_HP = CONFIG["starting_hp"]
STARTING_STAMINA = CONFIG["starting_stamina"]

_BUILD_POINTS    = CONFIG["build_points"]
_POINT_EFFECTS   = CONFIG["point_effects"]
_AVAILABLE_PERKS = CONFIG["available_perks"]
_PERKS_ALLOWED   = CONFIG["perks_allowed"]
_SEQUENTIAL_CALLS = CONFIG.get("sequential_fighter_calls", True)
_INTER_FIGHTER_DELAY = CONFIG.get("inter_fighter_call_delay_seconds", 0.75)


def _local_build_for(fighter: Fighter) -> dict:
    """Generate a deterministic style-based build without extra API calls."""
    fighter_cfg = CONFIG["fighters"].get(fighter.name, {})
    style = fighter_cfg.get("style", {})

    points = {key: 1 for key in _POINT_EFFECTS}
    priorities = []

    preferred = style.get("preferred_distance", "mid")
    if preferred == "inside":
        priorities.extend(["power", "hp", "power"])
    elif preferred == "outside":
        priorities.extend(["stamina", "endurance", "stamina"])
    else:
        priorities.extend(["power", "stamina", "endurance"])

    if style.get("reads_opponent"):
        priorities.extend(["endurance", "stamina"])

    low_stamina = style.get("low_stamina", "rest_and_wait")
    if low_stamina == "rest_and_wait":
        priorities.extend(["stamina", "endurance"])
    elif low_stamina == "push_through":
        priorities.extend(["hp", "power"])

    when_ahead = style.get("when_ahead", "")
    when_behind = style.get("when_behind", "")
    if when_ahead == "protect":
        priorities.extend(["hp", "endurance"])
    elif when_ahead == "pressure":
        priorities.extend(["power", "hp"])

    if when_behind == "gamble":
        priorities.extend(["power", "power"])
    elif when_behind == "survive":
        priorities.extend(["endurance", "hp"])

    priorities.extend(["hp", "stamina", "power", "endurance"])

    remaining = _BUILD_POINTS - sum(points.values())
    for i in range(remaining):
        points[priorities[i % len(priorities)]] += 1

    perk_candidates = []
    if style.get("reads_opponent"):
        perk_candidates.append("Counter Puncher")
    if preferred == "inside":
        perk_candidates.append("Clinch Master")
    if low_stamina == "rest_and_wait":
        perk_candidates.append("Marathon Runner")
    if when_ahead == "protect" or when_behind == "survive":
        perk_candidates.append("Iron Chin")
    if when_behind == "gamble":
        perk_candidates.append("First Strike")
    if preferred == "inside" and when_behind == "gamble":
        perk_candidates.append("Glass Cannon")

    perks = []
    for perk in perk_candidates:
        if perk in _AVAILABLE_PERKS and perk not in perks:
            perks.append(perk)
        if len(perks) >= _PERKS_ALLOWED:
            break

    fallback_perks = [
        "Iron Chin",
        "Marathon Runner",
        "Counter Puncher",
        "First Strike",
        "Clinch Master",
        "Second Wind",
        "Glass Cannon",
        "Rope-a-Dope",
    ]
    for perk in fallback_perks:
        if len(perks) >= _PERKS_ALLOWED:
            break
        if perk in _AVAILABLE_PERKS and perk not in perks:
            perks.append(perk)

    return {
        "points": points,
        "perks": perks,
        "reasoning": "Local build generated from fighter style to avoid extra pre-fight API latency.",
    }


async def _resolve_api_calls_sequentially(call_specs: list[tuple], cache: dict) -> list[dict]:
    """Run fighter API calls one after another with a small delay and per-turn caching."""
    responses = []
    total_calls = len(call_specs)

    for index, (cache_key, request_factory) in enumerate(call_specs):
        response = cache.get(cache_key)
        if response is None:
            response = await request_factory()
            cache[cache_key] = response
        responses.append(response)

        if (
            _SEQUENTIAL_CALLS
            and index < total_calls - 1
            and _INTER_FIGHTER_DELAY > 0
        ):
            await asyncio.sleep(_INTER_FIGHTER_DELAY)

    return responses


def _parse_build(raw: str, fighter_name: str) -> dict:
    """Parse and validate the AI's build response. Returns a safe build dict."""
    default = {"points": {"hp": 3, "stamina": 3, "power": 2, "endurance": 2}, "perks": [], "reasoning": "default build"}
    try:
        import re as _re
        # Strip markdown code fences and think tags without trimming to last }
        text = raw.strip()
        text = _re.sub(r"```(?:json)?", "", text, flags=_re.IGNORECASE).strip()
        text = _re.sub(r"<think>.*?</think>", "", text, flags=_re.DOTALL | _re.IGNORECASE).strip()
        start = text.find("{")
        if start == -1:
            logger.warning(f"[{fighter_name}] Build response has no JSON, using default")
            return default
        # Take everything from first { to end; try successively wider closes
        # to handle models that forget the trailing } or }}
        candidate = text[start:]
        data = None
        for extra in ("", "}", "}}"):
            try:
                data = _json.loads(candidate + extra)
                if isinstance(data, dict):
                    break
            except _json.JSONDecodeError:
                continue
        if data is None:
            logger.warning(f"[{fighter_name}] Build JSON parse failed, using default")
            return default
    except Exception:
        logger.warning(f"[{fighter_name}] Build JSON parse failed, using default")
        return default

    # Validate points
    points = data.get("points", {})
    valid_cats = set(_POINT_EFFECTS.keys())
    clean_points = {}
    for cat in valid_cats:
        val = points.get(cat, 0)
        clean_points[cat] = max(0, int(val)) if isinstance(val, (int, float)) else 0

    total = sum(clean_points.values())
    if total != _BUILD_POINTS:
        # Scale to fit budget
        if total > 0:
            scale = _BUILD_POINTS / total
            for cat in clean_points:
                clean_points[cat] = int(clean_points[cat] * scale)
            # Distribute remainder to first category
            remainder = _BUILD_POINTS - sum(clean_points.values())
            if remainder != 0:
                first_cat = list(clean_points.keys())[0]
                clean_points[first_cat] += remainder
        else:
            clean_points = default["points"].copy()
        logger.warning(f"[{fighter_name}] Build points didn't sum to {_BUILD_POINTS} (was {total}), adjusted")

    # Validate perks — case-insensitive so "iron chin" matches "Iron Chin"
    perk_lookup = {k.lower(): k for k in _AVAILABLE_PERKS}
    perks = data.get("perks", [])
    valid_perks = []
    for p in perks:
        if not isinstance(p, str):
            continue
        canonical = perk_lookup.get(p.strip().lower())
        if canonical and canonical not in valid_perks:
            valid_perks.append(canonical)
    valid_perks = valid_perks[:_PERKS_ALLOWED]

    # If model returned fewer perks than allowed, fill randomly from remaining pool
    if len(valid_perks) < _PERKS_ALLOWED:
        import random as _random
        available = [p for p in _AVAILABLE_PERKS if p not in valid_perks]
        needed = _PERKS_ALLOWED - len(valid_perks)
        fill = _random.sample(available, min(needed, len(available)))
        if fill:
            logger.warning(f"[{fighter_name}] Only {len(valid_perks)} perk(s) chosen, filling {fill} randomly")
            valid_perks.extend(fill)

    reasoning = data.get("reasoning", "")

    return {"points": clean_points, "perks": valid_perks, "reasoning": str(reasoning)}


def _apply_build(fighter: Fighter, build: dict) -> None:
    """Apply the parsed build to a Fighter's stats."""
    points = build.get("points", {})
    perks = build.get("perks", [])

    # Apply stat points
    fighter.hp += points.get("hp", 0) * _POINT_EFFECTS["hp"]
    fighter.stamina += points.get("stamina", 0) * _POINT_EFFECTS["stamina"]
    fighter.power_modifier = 1.0 + points.get("power", 0) * _POINT_EFFECTS["power"]
    fighter.endurance_modifier = 1.0 - points.get("endurance", 0) * _POINT_EFFECTS["endurance"]

    # Apply perk static effects
    fighter.active_perks = perks
    fighter.build = build

    for perk in perks:
        perk_cfg = _AVAILABLE_PERKS.get(perk, {})
        effect = perk_cfg.get("effect", "")
        if effect == "damage_dealt_mult_and_hp_penalty":
            fighter.power_modifier *= perk_cfg.get("damage_mult", 1.0)
            fighter.hp -= perk_cfg.get("hp_penalty", 0)


def _perk_damage_dealt(fighter: Fighter, base_damage: int, round_num: int) -> int:
    """Apply attacker perks that modify outgoing damage."""
    damage = float(base_damage)

    # Power modifier from stat points (and Glass Cannon)
    damage *= fighter.power_modifier

    for perk in fighter.active_perks:
        perk_cfg = _AVAILABLE_PERKS.get(perk, {})
        effect = perk_cfg.get("effect", "")

        if effect == "post_dodge_damage_mult" and fighter.last_move_was_dodge:
            damage *= perk_cfg["value"]

        if effect == "cumulative_damage_per_hit":
            damage *= (1.0 + fighter.hits_taken_count * perk_cfg["value"])

        if effect == "early_round_damage_mult" and round_num <= perk_cfg.get("rounds", 3):
            damage *= perk_cfg["value"]

    return int(damage)


def _perk_damage_taken(fighter: Fighter, base_damage: int) -> int:
    """Apply defender perks that modify incoming damage."""
    damage = float(base_damage)

    for perk in fighter.active_perks:
        perk_cfg = _AVAILABLE_PERKS.get(perk, {})
        effect = perk_cfg.get("effect", "")

        if effect == "damage_taken_mult":
            damage *= perk_cfg["value"]

    return int(damage)


def _perk_rest_recovery(fighter: Fighter, base_recovery: int) -> int:
    """Apply perks that modify rest stamina recovery."""
    recovery = float(base_recovery)

    for perk in fighter.active_perks:
        perk_cfg = _AVAILABLE_PERKS.get(perk, {})
        if perk_cfg.get("effect") == "rest_recovery_mult":
            recovery *= perk_cfg["value"]

    return int(recovery)


def _perk_clinch_damage(fighter: Fighter) -> int:
    """Return bonus damage from Clinch Master perk."""
    for perk in fighter.active_perks:
        perk_cfg = _AVAILABLE_PERKS.get(perk, {})
        if perk_cfg.get("effect") == "clinch_damage":
            return perk_cfg["value"]
    return 0


def _check_second_wind(fighter: Fighter) -> None:
    """Trigger Second Wind perk if applicable."""
    if fighter.second_wind_used:
        return
    for perk in fighter.active_perks:
        perk_cfg = _AVAILABLE_PERKS.get(perk, {})
        if perk_cfg.get("effect") == "low_hp_stamina_recovery":
            if fighter.hp <= perk_cfg["hp_threshold"] and fighter.hp > 0:
                fighter.stamina = min(fighter.stamina + perk_cfg["stamina_recovery"],
                                     STARTING_STAMINA + 50)  # cap at max possible
                fighter.second_wind_used = True
                logger.info(f"[{fighter.display_name}] Second Wind triggered! +{perk_cfg['stamina_recovery']} stamina")


def make_fighter(key: str) -> Fighter:
    """Create a Fighter dataclass instance from a config key (e.g. 'claude')."""
    cfg = CONFIG["fighters"][key]
    return Fighter(
        name=key,
        display_name=cfg["display_name"],
        provider=cfg["provider"],
        model=cfg["model"],
        personality=cfg["personality"],
        temperature=cfg.get("temperature", 0.7),
        hp=STARTING_HP,
        stamina=STARTING_STAMINA,
    )


def _check_win(f1: Fighter, f2: Fighter, round_num: int) -> FightResult | None:
    """Check KO/TKO conditions. Returns FightResult if fight is over, else None."""
    f1_ko = f1.hp <= 0
    f2_ko = f2.hp <= 0
    f1_tko = f1.consecutive_rests >= TKO_THRESHOLD
    f2_tko = f2.consecutive_rests >= TKO_THRESHOLD

    if f1_ko and f2_ko:
        return FightResult(winner=None, method="Draw (Double KO)", rounds_fought=round_num)
    if f1_ko:
        return FightResult(winner=f2.display_name, method="KO", rounds_fought=round_num)
    if f2_ko:
        return FightResult(winner=f1.display_name, method="KO", rounds_fought=round_num)
    if f1_tko and f2_tko:
        return FightResult(winner=None, method="Draw (Double TKO)", rounds_fought=round_num)
    if f1_tko:
        return FightResult(winner=f2.display_name, method="TKO", rounds_fought=round_num)
    if f2_tko:
        return FightResult(winner=f1.display_name, method="TKO", rounds_fought=round_num)
    return None


def _decision(f1: Fighter, f2: Fighter, rounds: list[RoundResult], round_num: int) -> FightResult:
    """Scorecard decision after max rounds."""
    total1 = sum(r.scorecard.get("fighter1", 10) for r in rounds)
    total2 = sum(r.scorecard.get("fighter2", 10) for r in rounds)
    if total1 > total2:
        winner = f1.display_name
    elif total2 > total1:
        winner = f2.display_name
    else:
        winner = None
    method = "Decision" if winner else "Draw"
    return FightResult(
        winner=winner,
        method=method,
        final_score={"fighter1": total1, "fighter2": total2},
        rounds_fought=round_num,
    )


def _build_stats(rounds: list[RoundResult], is_fighter1: bool) -> FightStats:
    stats = FightStats()
    for r in rounds:
        fr = r.fighter1 if is_fighter1 else r.fighter2
        stats.total_damage_dealt += fr.damage_dealt
        stats.total_damage_taken += fr.damage_taken
        move = fr.move_executed
        stats.moves_used[move] = stats.moves_used.get(move, 0) + 1
        if move == "dodge" and fr.damage_taken == 0:
            stats.successful_dodges += 1
        # Count range misses: attack that dealt 0 damage and wasn't dodged/clinched
        opp_fr = r.fighter2 if is_fighter1 else r.fighter1
        if move in ("jab", "hook", "uppercut") and fr.damage_dealt == 0:
            opp_move = opp_fr.move_executed
            if opp_move not in ("dodge",) and not (opp_move == "clinch" and move in ("hook", "uppercut")):
                stats.range_misses += 1
        if fr.api_error:
            stats.api_errors += 1
    return stats


async def run_fight(
    fighter1_key: str,
    fighter2_key: str,
    max_rounds: int = MAX_ROUNDS,
    round_delay: float = 0.5,
    verbose: bool = False,
) -> FightLog:
    """Run a complete fight and return a FightLog."""

    f1 = make_fighter(fighter1_key)
    f2 = make_fighter(fighter2_key)

    # ── Pre-fight build phase ──────────────────────────────────────────────────
    if CONFIG.get("use_llm_build_phase", False):
        build_sys1, build_usr1 = build_build_prompt(f1)
        build_sys2, build_usr2 = build_build_prompt(f2)
        try:
            build_resp1, build_resp2 = await _resolve_api_calls_sequentially(
                [
                    ((f1.name, "build", build_usr1), lambda: get_fighter_build(f1, build_sys1, build_usr1)),
                    ((f2.name, "build", build_usr2), lambda: get_fighter_build(f2, build_sys2, build_usr2)),
                ],
                cache={},
            )
        except PermissionError:
            raise

        build1 = _parse_build(build_resp1["raw"], f1.display_name)
        build2 = _parse_build(build_resp2["raw"], f2.display_name)
    else:
        build1 = _local_build_for(f1)
        build2 = _local_build_for(f2)

    _apply_build(f1, build1)
    _apply_build(f2, build2)

    if verbose:
        print(f"\n[BUILD] {f1.display_name}: points={build1['points']}, perks={build1['perks']}")
        print(f"[BUILD] {f2.display_name}: points={build2['points']}, perks={build2['perks']}")

    fight_id = str(uuid.uuid4())[:8]
    metadata = FightMetadata(
        fight_id=fight_id,
        date=datetime.utcnow().isoformat() + "Z",
        fighter1_config=CONFIG["fighters"][fighter1_key],
        fighter2_config=CONFIG["fighters"][fighter2_key],
        config={k: v for k, v in CONFIG.items() if k != "fighters"},
        fighter1_build=build1,
        fighter2_build=build2,
    )
    log = FightLog(metadata=metadata)

    if verbose:
        print(f"\n{'='*60}")
        print(f"  {f1.display_name} (HP:{f1.hp} ST:{f1.stamina} PWR:{f1.power_modifier:.0%} END:{f1.endurance_modifier:.0%})")
        print(f"  Perks: {', '.join(f1.active_perks) or 'none'}")
        print(f"  vs")
        print(f"  {f2.display_name} (HP:{f2.hp} ST:{f2.stamina} PWR:{f2.power_modifier:.0%} END:{f2.endurance_modifier:.0%})")
        print(f"  Perks: {', '.join(f2.active_perks) or 'none'}")
        print(f"{'='*60}\n")

    result = None
    distance = CONFIG.get("starting_distance", 1)
    consecutive_outside = 0
    stalemate_limit = CONFIG.get("outside_stalemate_rounds", 2)
    dist_labels = CONFIG.get("distance_labels", {0: "outside", 1: "mid", 2: "inside"})

    for round_num in range(1, max_rounds + 1):
        if verbose:
            print(f"--- Round {round_num} (distance: {dist_labels.get(distance, distance)}) ---")

        # Build prompts (system + user split)
        sys1, usr1 = build_prompt(f1, f2, round_num, max_rounds, log.rounds, is_fighter1=True, distance=distance)
        sys2, usr2 = build_prompt(f2, f1, round_num, max_rounds, log.rounds, is_fighter1=False, distance=distance)

        turn_cache = {}
        try:
            resp1, resp2 = await _resolve_api_calls_sequentially(
                [
                    ((round_num, f1.name, usr1), lambda: get_fighter_move(f1, sys1, usr1)),
                    ((round_num, f2.name, usr2), lambda: get_fighter_move(f2, sys2, usr2)),
                ],
                cache=turn_cache,
            )
        except PermissionError as e:
            logger.error(f"Auth error, aborting fight: {e}")
            raise

        # Parse responses
        move1_chosen, reasoning1, clean1 = parse_move(resp1["raw"])
        move2_chosen, reasoning2, clean2 = parse_move(resp2["raw"])

        # Stamina enforcement → cooldown enforcement
        move1_executed = _enforce_cooldown(enforce_stamina(move1_chosen, f1.stamina), f1)
        move2_executed = _enforce_cooldown(enforce_stamina(move2_chosen, f2.stamina), f2)

        # Snapshot HP/stamina before applying
        hp1_before, stam1_before = f1.hp, f1.stamina
        hp2_before, stam2_before = f2.hp, f2.stamina

        # Resolve damage (distance-aware), then apply diminishing returns
        raw_dmg_f1, raw_dmg_f2 = resolve_moves(move1_executed, move2_executed, distance)
        dmg_to_f1 = _apply_diminishing(raw_dmg_f1, move2_executed, f2)
        dmg_to_f2 = _apply_diminishing(raw_dmg_f2, move1_executed, f1)

        # Clinch Master perk: clinch deals bonus damage
        if move1_executed == "clinch":
            dmg_to_f2 += _perk_clinch_damage(f1)
        if move2_executed == "clinch":
            dmg_to_f1 += _perk_clinch_damage(f2)

        # Apply attacker perks (power modifier, Counter Puncher, Rope-a-Dope, First Strike)
        dmg_to_f2 = _perk_damage_dealt(f1, dmg_to_f2, round_num)
        dmg_to_f1 = _perk_damage_dealt(f2, dmg_to_f1, round_num)

        # Apply defender perks (Iron Chin)
        dmg_to_f1 = _perk_damage_taken(f1, dmg_to_f1)
        dmg_to_f2 = _perk_damage_taken(f2, dmg_to_f2)

        # Apply scaled stamina costs (with endurance modifier) and recovery
        stam_cost1 = int(_scaled_stamina_cost(move1_executed, f1) * f1.endurance_modifier)
        stam_cost2 = int(_scaled_stamina_cost(move2_executed, f2) * f2.endurance_modifier)
        new_stam1 = max(0, f1.stamina - stam_cost1)
        new_stam2 = max(0, f2.stamina - stam_cost2)

        # Rest recovery (with Marathon Runner perk)
        max_stam = CONFIG["max_stamina"]
        if move1_executed == "rest":
            base_recovery = CONFIG["stamina_recovery_on_rest"]
            new_stam1 = min(max_stam, new_stam1 + _perk_rest_recovery(f1, base_recovery))
        if move2_executed == "rest":
            base_recovery = CONFIG["stamina_recovery_on_rest"]
            new_stam2 = min(max_stam, new_stam2 + _perk_rest_recovery(f2, base_recovery))

        # Apply damage
        f1.hp = max(0, f1.hp - dmg_to_f1)
        f2.hp = max(0, f2.hp - dmg_to_f2)
        f1.stamina = new_stam1
        f2.stamina = new_stam2

        # Track hits taken for Rope-a-Dope
        if dmg_to_f1 > 0:
            f1.hits_taken_count += 1
        if dmg_to_f2 > 0:
            f2.hits_taken_count += 1

        # Check Second Wind perk
        _check_second_wind(f1)
        _check_second_wind(f2)

        # Track dodge state for Counter Puncher
        f1.last_move_was_dodge = (move1_executed == "dodge" and dmg_to_f1 == 0)
        f2.last_move_was_dodge = (move2_executed == "dodge" and dmg_to_f2 == 0)

        # Track consecutive rests (for TKO)
        if move1_executed == "rest":
            f1.consecutive_rests += 1
        else:
            f1.consecutive_rests = 0
        if move2_executed == "rest":
            f2.consecutive_rests += 1
        else:
            f2.consecutive_rests = 0

        # Update last move + anti-spam state
        f1.last_move = move1_executed
        f2.last_move = move2_executed
        _update_antispam(f1, move1_executed)
        _update_antispam(f2, move2_executed)

        # Resolve distance for next round
        distance_before = distance
        new_distance = resolve_distance(move1_executed, move2_executed, distance)

        # Anti-stalemate: if outside for too long, referee resets to mid
        if new_distance == 0:
            consecutive_outside += 1
            if consecutive_outside >= stalemate_limit:
                new_distance = 1
                consecutive_outside = 0
        else:
            consecutive_outside = 0

        # Build round result
        fr1 = RoundFighterResult(
            move_chosen=move1_chosen,
            move_executed=move1_executed,
            reasoning=reasoning1,
            damage_dealt=dmg_to_f2,
            damage_taken=dmg_to_f1,
            hp_before=hp1_before,
            hp_after=f1.hp,
            stamina_before=stam1_before,
            stamina_after=f1.stamina,
            api_latency_ms=resp1["latency_ms"],
            api_error=resp1["api_error"],
            parse_clean=clean1,
        )
        fr2 = RoundFighterResult(
            move_chosen=move2_chosen,
            move_executed=move2_executed,
            reasoning=reasoning2,
            damage_dealt=dmg_to_f1,
            damage_taken=dmg_to_f2,
            hp_before=hp2_before,
            hp_after=f2.hp,
            stamina_before=stam2_before,
            stamina_after=f2.stamina,
            api_latency_ms=resp2["latency_ms"],
            api_error=resp2["api_error"],
            parse_clean=clean2,
        )

        scorecard = score_round(dmg_to_f1, dmg_to_f2)
        commentary = generate_commentary(
            f1, f2, fr1, fr2, round_num,
            distance_before=distance_before,
            distance_after=new_distance,
        )

        round_result = RoundResult(
            round_number=round_num,
            fighter1=fr1,
            fighter2=fr2,
            commentary=commentary,
            scorecard=scorecard,
            distance_before=distance_before,
            distance_after=new_distance,
        )
        log.rounds.append(round_result)

        if verbose:
            print(f"  {f1.display_name}: {move1_executed} | {f2.display_name}: {move2_executed}")
            print(f"  Damage: {f1.display_name} took {dmg_to_f1}, {f2.display_name} took {dmg_to_f2}")
            print(f"  HP: {f1.display_name}={f1.hp}  {f2.display_name}={f2.hp}")
            print(f"  Distance: {dist_labels.get(distance_before, distance_before)} -> {dist_labels.get(new_distance, new_distance)}")
            print(f"  {commentary}")

        # Update distance for next round
        distance = new_distance

        # Check KO/TKO
        result = _check_win(f1, f2, round_num)
        if result:
            break

        if round_delay > 0:
            await asyncio.sleep(round_delay)

    # Decision if no KO/TKO
    if result is None:
        result = _decision(f1, f2, log.rounds, max_rounds)

    result.rounds_fought = len(log.rounds)
    result.fighter1_stats = _build_stats(log.rounds, is_fighter1=True)
    result.fighter2_stats = _build_stats(log.rounds, is_fighter1=False)
    log.result = result

    if verbose:
        print(f"\n{'='*60}")
        print(f"  RESULT: {result.winner or 'Draw'} wins by {result.method}")
        print(f"  Rounds fought: {result.rounds_fought}")
        print(f"{'='*60}\n")

    return log
