"""
db.py - Thin Supabase REST client for the AI Boxing leaderboard.

Uses only urllib.request (no external dependencies).
Requires SUPABASE_URL and SUPABASE_ANON_KEY environment variables.
"""
import json
import logging
import os
import urllib.request
import urllib.error
import urllib.parse

logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_ANON_KEY", "")


def _headers(*, prefer=None):
    h = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h


def _request(method, path, *, data=None, prefer=None, params=None):
    """Make an HTTP request to Supabase REST API."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.warning("Supabase not configured (missing SUPABASE_URL or SUPABASE_ANON_KEY)")
        return None

    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)

    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=_headers(prefer=prefer), method=method)

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        logger.error("Supabase %s %s → %s: %s", method, path, e.code, body_text)
        return None
    except Exception as e:
        logger.error("Supabase request failed: %s", e)
        return None


def _rpc(fn_name, params):
    """Call a Supabase RPC (stored function)."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None

    url = f"{SUPABASE_URL}/rest/v1/rpc/{fn_name}"
    body = json.dumps(params).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=_headers(), method="POST")

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        logger.error("Supabase RPC %s → %s: %s", fn_name, e.code, body_text)
        return None
    except Exception as e:
        logger.error("Supabase RPC %s failed: %s", fn_name, e)
        return None


# ── Public API ──


def seed_fighters(config):
    """Upsert all fighters from config.py into the fighters + fighter_stats tables."""
    fighters = config.get("fighters", {})
    rows = []
    for key, f in fighters.items():
        rows.append({
            "id": key,
            "display_name": f.get("display_name", key),
            "provider": f.get("provider", "unknown"),
            "model": f.get("model"),
            "personality": f.get("personality", ""),
            "style": f.get("style"),
            "inner_voice": f.get("inner_voice", ""),
        })

    # Upsert fighters
    result = _request("POST", "fighters", data=rows,
                      prefer="resolution=merge-duplicates,return=minimal")
    if result is not None:
        logger.info("Seeded %d fighters into Supabase", len(rows))

    # Ensure fighter_stats rows exist (insert with ON CONFLICT DO NOTHING)
    stat_rows = [{"fighter_id": key} for key in fighters]
    _request("POST", "fighter_stats", data=stat_rows,
             prefer="resolution=ignore-duplicates,return=minimal")


def _find_fighter_key(config, fighter_cfg):
    """Reverse-lookup the config key for a fighter from its config dict."""
    model = fighter_cfg.get("model", "")
    display = fighter_cfg.get("display_name", "")
    for key, f in config.get("fighters", {}).items():
        if f.get("model") == model and f.get("display_name") == display:
            return key
    # Fallback: match by display_name only
    for key, f in config.get("fighters", {}).items():
        if f.get("display_name") == display:
            return key
    return None


def record_fight(fight_log):
    """Record a completed fight into Supabase. Fire-and-forget."""
    try:
        metadata = fight_log.get("metadata", {})
        result = fight_log.get("result")
        if not result:
            return

        from config import CONFIG

        f1_cfg = metadata.get("fighter1_config", {})
        f2_cfg = metadata.get("fighter2_config", {})
        f1_key = _find_fighter_key(CONFIG, f1_cfg)
        f2_key = _find_fighter_key(CONFIG, f2_cfg)
        if not f1_key or not f2_key:
            logger.warning("Could not resolve fighter keys for DB recording")
            return

        winner_name = result.get("winner")
        if winner_name is None:
            winner_key = None
        elif winner_name == f1_cfg.get("display_name"):
            winner_key = f1_key
        elif winner_name == f2_cfg.get("display_name"):
            winner_key = f2_key
        else:
            winner_key = None

        f1_stats = result.get("fighter1_stats", {})
        f2_stats = result.get("fighter2_stats", {})

        _rpc("record_fight_result", {
            "p_fight_id": metadata.get("fight_id", ""),
            "p_fighter1": f1_key,
            "p_fighter2": f2_key,
            "p_winner": winner_key,
            "p_method": result.get("method", "Unknown"),
            "p_rounds": result.get("rounds_fought", 0),
            "p_f1_damage": f1_stats.get("total_damage_dealt", 0),
            "p_f2_damage": f2_stats.get("total_damage_dealt", 0),
            "p_f1_dodges": f1_stats.get("successful_dodges", 0),
            "p_f2_dodges": f2_stats.get("successful_dodges", 0),
        })
        logger.info("Recorded fight %s to Supabase", metadata.get("fight_id"))
    except Exception as e:
        logger.error("Failed to record fight: %s", e)


def get_leaderboard():
    """Get all fighters with their stats, sorted by wins descending."""
    # Join fighter_stats with fighters using PostgREST embedded resource
    url = "fighter_stats?select=*,fighters(*)"
    params = {"order": "wins.desc,total_fights.desc"}
    rows = _request("GET", url, params=params)
    if not rows:
        return []

    leaderboard = []
    for row in rows:
        fighter = row.get("fighters", {}) or {}
        total_fights = row.get("total_fights", 0)
        wins = row.get("wins", 0)
        leaderboard.append({
            "id": row.get("fighter_id"),
            "display_name": fighter.get("display_name", row.get("fighter_id", "")),
            "provider": fighter.get("provider", ""),
            "model": fighter.get("model", ""),
            "wins": wins,
            "losses": row.get("losses", 0),
            "draws": row.get("draws", 0),
            "ko_wins": row.get("ko_wins", 0),
            "tko_wins": row.get("tko_wins", 0),
            "decision_wins": row.get("decision_wins", 0),
            "total_fights": total_fights,
            "total_damage_dealt": row.get("total_damage_dealt", 0),
            "total_damage_taken": row.get("total_damage_taken", 0),
            "total_dodges": row.get("total_dodges", 0),
            "total_rounds": row.get("total_rounds", 0),
            "win_rate": round(wins / total_fights, 3) if total_fights else 0,
            "ko_rate": round(row.get("ko_wins", 0) / wins, 3) if wins else 0,
            "avg_damage": round(row.get("total_damage_dealt", 0) / total_fights) if total_fights else 0,
        })

    return leaderboard


def get_fighter_profile(fighter_id):
    """Get a single fighter's full profile: config + stats + recent fights."""
    # Get fighter info
    fighter_rows = _request("GET", "fighters", params={
        "id": f"eq.{fighter_id}",
        "select": "*",
    })
    if not fighter_rows:
        return None
    fighter = fighter_rows[0]

    # Get stats
    stat_rows = _request("GET", "fighter_stats", params={
        "fighter_id": f"eq.{fighter_id}",
        "select": "*",
    })
    stats = stat_rows[0] if stat_rows else {}

    # Get recent fights (last 10)
    history_rows = _request("GET", "fight_history", params={
        "or": f"(fighter1_id.eq.{fighter_id},fighter2_id.eq.{fighter_id})",
        "order": "fought_at.desc",
        "limit": "10",
        "select": "*",
    })

    total_fights = stats.get("total_fights", 0)
    wins = stats.get("wins", 0)

    # Build recent fights with opponent names
    recent = []
    for h in (history_rows or []):
        is_f1 = h.get("fighter1_id") == fighter_id
        opponent_id = h.get("fighter2_id") if is_f1 else h.get("fighter1_id")
        winner_id = h.get("winner_id")
        if winner_id is None:
            outcome = "draw"
        elif winner_id == fighter_id:
            outcome = "win"
        else:
            outcome = "loss"
        recent.append({
            "fight_id": h.get("fight_id"),
            "opponent_id": opponent_id,
            "outcome": outcome,
            "method": h.get("method"),
            "rounds": h.get("rounds_fought"),
            "damage_dealt": h.get("fighter1_damage") if is_f1 else h.get("fighter2_damage"),
            "damage_taken": h.get("fighter2_damage") if is_f1 else h.get("fighter1_damage"),
            "fought_at": h.get("fought_at"),
        })

    return {
        "id": fighter_id,
        "display_name": fighter.get("display_name", fighter_id),
        "provider": fighter.get("provider", ""),
        "model": fighter.get("model", ""),
        "personality": fighter.get("personality", ""),
        "style": fighter.get("style"),
        "inner_voice": fighter.get("inner_voice", ""),
        "stats": {
            "wins": wins,
            "losses": stats.get("losses", 0),
            "draws": stats.get("draws", 0),
            "ko_wins": stats.get("ko_wins", 0),
            "tko_wins": stats.get("tko_wins", 0),
            "decision_wins": stats.get("decision_wins", 0),
            "total_fights": total_fights,
            "total_damage_dealt": stats.get("total_damage_dealt", 0),
            "total_damage_taken": stats.get("total_damage_taken", 0),
            "total_dodges": stats.get("total_dodges", 0),
            "total_rounds": stats.get("total_rounds", 0),
            "win_rate": round(wins / total_fights, 3) if total_fights else 0,
            "ko_rate": round(stats.get("ko_wins", 0) / wins, 3) if wins else 0,
            "avg_damage": round(stats.get("total_damage_dealt", 0) / total_fights) if total_fights else 0,
        },
        "recent_fights": recent,
    }
