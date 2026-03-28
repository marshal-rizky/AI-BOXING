"""Prompt template builder for the AI Boxing Simulation."""

import random

from config import CONFIG
from models import Fighter, RoundResult

_DIST_LABELS = CONFIG.get("distance_labels", {0: "outside", 1: "mid", 2: "inside"})

_SEED_PHRASES = [
    "Trust your gut this round.",
    "The crowd is getting restless.",
    "Your corner is yelling something, focus.",
    "You feel a surge of energy.",
    "This round matters more than the last.",
    "Something feels different about your opponent's stance.",
    "The ring feels smaller now.",
    "You notice your opponent breathing hard.",
    "A flash of doubt crosses your mind, ignore it.",
    "You remember why you're here.",
    "The lights feel brighter this round.",
    "Your opponent's eyes tell a story.",
    "Muscle memory kicks in.",
    "The ref is watching closely.",
    "You can taste the sweat.",
]


def _corner_coaching(
    style: dict,
    fighter: Fighter,
    opponent: Fighter,
    distance: int,
    round_number: int,
    max_rounds: int,
    is_fighter1: bool,
    history: list,
) -> str:
    """Generate personality-driven situational coaching."""
    lines = []

    hp_diff = fighter.hp - opponent.hp
    stamina = fighter.stamina
    dist_label = _DIST_LABELS.get(distance, "mid")
    preferred = style.get("preferred_distance", "mid")
    at_preferred = dist_label == preferred
    rounds_left = max_rounds - round_number

    if not at_preferred:
        dist_map = {"outside": 0, "mid": 1, "inside": 2}
        want = dist_map.get(preferred, 1)
        if want > distance:
            lines.append("You want to be closer. This range is not yours.")
        else:
            lines.append("You want space. This range is too tight for your game.")
    else:
        lines.append("You are at your preferred range. Work from here.")

    when_key = "when_ahead" if hp_diff > 0 else "when_behind"
    situation = style.get(when_key, "pressure")
    if hp_diff > 15:
        if situation == "protect":
            lines.append("You are up. Do not take unnecessary risks. Make them come to you.")
        else:
            lines.append("You are winning. Keep the pressure on and do not let them recover.")
    elif hp_diff < -15:
        if situation == "gamble":
            lines.append("You are behind. Playing it safe loses. Take the risk.")
        else:
            lines.append("You are behind. Do not panic. One clean exchange changes everything.")
    else:
        lines.append("It is close. Every exchange matters.")

    low_stamina = style.get("low_stamina", "rest_and_wait")
    if stamina < 25:
        if low_stamina == "push_through":
            lines.append("You are gassing. But sitting still is death. Keep moving.")
        else:
            lines.append("You are low on gas. Conserve. One big shot, then breathe.")
    elif stamina > 70:
        lines.append("You have energy to spend. Do not waste it.")

    reads_opponent = style.get("reads_opponent", False)
    if reads_opponent and opponent.last_move:
        opp_move = opponent.last_move
        if opp_move == "rest":
            lines.append("They just rested. They showed weakness. Make them pay for that.")
        elif opp_move == "dodge":
            lines.append("They are running. They are afraid. Close the gap.")
        elif opp_move in ("hook", "uppercut"):
            lines.append("They are swinging big. Be ready for it again, or make them miss.")

    if rounds_left <= 2 and hp_diff < 0:
        lines.append("Time is running out. You need a finish.")
    elif rounds_left <= 2 and hp_diff >= 0:
        lines.append("Almost there. Do not blow it now.")

    return "\n".join(f"  {line}" for line in lines)


def _move_preference_text(move_weights: dict) -> str:
    """Translate move_weights into natural language for the system prompt."""
    if not move_weights:
        return ""
    lines = [f"- {move}: {feeling}" for move, feeling in move_weights.items()]
    return "YOUR MOVE INSTINCTS:\n" + "\n".join(lines)


def build_prompt(
    fighter: Fighter,
    opponent: Fighter,
    round_number: int,
    max_rounds: int,
    history: list[RoundResult],
    is_fighter1: bool,
    distance: int = 1,
) -> tuple[str, str]:
    """Build the system prompt and user prompt sent to an LLM fighter each round."""

    fighter_cfg = CONFIG["fighters"].get(fighter.name, {})
    style = fighter_cfg.get("style", {})
    decision_frame = style.get("decision_frame", "Before choosing, ask: what is the best move right now?")
    inner_voice = fighter_cfg.get("inner_voice", "")
    move_weights = fighter_cfg.get("move_weights", {})
    output_rules = 'Respond ONLY with a JSON object: {"move": "<move_name>", "reasoning": "<brief_strategy>"}'
    if fighter_cfg.get("disable_thinking"):
        output_rules += ". Do not output <think> tags, markdown, or any extra text."

    move_pref = _move_preference_text(move_weights)
    inner_voice_section = f"\nYOUR INNER VOICE: {inner_voice}" if inner_voice else ""

    system_prompt = f"""You are {fighter.display_name}, an AI boxer in a turn-based boxing match.

PERSONALITY: {fighter.personality}
{inner_voice_section}

{move_pref}

YOUR DECISION APPROACH:
{decision_frame}

CRITICAL: {output_rules}
Valid move values: jab, hook, uppercut, dodge, clinch, rest"""

    history_text = "No previous rounds."
    if history:
        recent = history[-3:]
        lines = []
        for r in recent:
            my_result = r.fighter1 if is_fighter1 else r.fighter2
            opp_result = r.fighter2 if is_fighter1 else r.fighter1
            dist_str = _DIST_LABELS.get(r.distance_before, "mid")
            lines.append(
                f"  Round {r.round_number} ({dist_str}): "
                f"You used {my_result.move_executed}, "
                f"opponent used {opp_result.move_executed}. "
                f"You dealt {my_result.damage_dealt} dmg, took {my_result.damage_taken} dmg."
            )
        history_text = "\n".join(lines)

    my_moves_seq = [
        (r.fighter1 if is_fighter1 else r.fighter2).move_executed
        for r in history[-3:]
    ]
    move_seq_str = " -> ".join(my_moves_seq) if my_moves_seq else "none yet"

    cooled_moves = [m for m, remaining in fighter.move_cooldowns.items() if remaining > 0]
    cooldown_str = (
        f"\nMOVES ON COOLDOWN (you cannot use these): {', '.join(cooled_moves)}"
        if cooled_moves else ""
    )

    last_move_text = fighter.last_move or "None (first round)"
    opp_last_move_text = opponent.last_move or "None (first round)"
    dist_label = _DIST_LABELS.get(distance, "mid").upper()
    coaching = _corner_coaching(style, fighter, opponent, distance, round_number, max_rounds, is_fighter1, history)
    seed = random.choice(_SEED_PHRASES)

    user_prompt = f"""CURRENT STATE (Round {round_number} of {max_rounds}):
- Your HP: {fighter.hp}/100  |  Opponent HP: {opponent.hp}/100
- Your Stamina: {fighter.stamina}/100  |  Opponent Stamina: {opponent.stamina}/100
- Distance: {dist_label} ({distance}/2)

YOUR LAST 3 MOVES: {move_seq_str}
- Your last move: {last_move_text}
- Opponent's last move: {opp_last_move_text}
{cooldown_str}

FIGHT HISTORY (last 3 rounds):
{history_text}

CORNER ADVICE:
{coaching}

MOMENT: {seed}

AVAILABLE MOVES:
- "jab": Costs 5 stamina. Deals 10 damage at mid/inside and lands through clinch. Blocked by dodge.
- "hook": Costs 15 stamina. Deals 28 damage at mid/inside. Blocked by dodge and clinch.
- "uppercut": Costs 20 stamina. Deals 36 damage at inside only. Blocked by dodge and clinch. CLOSES distance by 1.
- "dodge": Costs 10 stamina, 0 damage. Avoids ALL incoming attacks. OPENS distance by 1.
- "clinch": Costs 5 stamina, 0 damage. Nullifies hook and uppercut. CLOSES distance by 1.
- "rest": Costs 0 stamina, 0 damage. Recovers 20 stamina. NO defense.

ANTI-SPAM RULES (CRITICAL):
- Each move has a COOLDOWN after use: jab=2 rounds, hook=1 round, uppercut=2 rounds, dodge=1 round, clinch=1 round.
- Moves on cooldown are blocked - you will be forced to use a random alternative.
- Using the same move consecutively: damage drops to 75% (2nd use), then 50% (3rd+ use).
- Stamina cost for repeating the same move: +25% (2nd use), +50% (3rd+ use).

DISTANCE SYSTEM (current: {dist_label}):
  - OUTSIDE (0): Only jab lands (7 dmg). Hook/uppercut miss.
  - MID (1): Jab (10 dmg) and hook (28 dmg) land. Uppercut misses.
  - INSIDE (2): All attacks land. Uppercut deals 36 dmg.
  - To land uppercut: first close range with clinch/uppercut.
  - To escape big hits: dodge to create space.

RULES:
- Insufficient stamina for your move: downgrades to jab (or rest if stamina < 5).
- 3 consecutive rests = TKO loss.
- Both fighters choose simultaneously - you do not know the opponent's pick.

Now choose your move."""

    return system_prompt, user_prompt


def build_build_prompt(fighter: Fighter) -> tuple[str, str]:
    """Build the pre-fight character creation prompt."""
    fighter_cfg = CONFIG["fighters"].get(fighter.name, {})
    inner_voice = fighter_cfg.get("inner_voice", "")
    budget = CONFIG["build_points"]
    point_effects = CONFIG["point_effects"]
    perks = CONFIG["available_perks"]
    perks_allowed = CONFIG["perks_allowed"]
    output_rules = "Respond ONLY with a JSON object - no other text."
    if fighter_cfg.get("disable_thinking"):
        output_rules = "Respond ONLY with a JSON object. Do not output <think> tags, markdown, or any text outside the JSON."

    perk_list = "\n".join(
        f"  - {name}: {info['description']}"
        for name, info in perks.items()
    )

    system_prompt = f"""You are {fighter.display_name}, an AI boxer preparing for a fight.

PERSONALITY: {fighter.personality}

{"INNER VOICE: " + inner_voice if inner_voice else ""}

You are about to enter the ring. Before the fight begins, you must choose your physical build.
Your choices should reflect your fighting personality and strategy.

{output_rules}"""

    user_prompt = f"""BUILD YOUR FIGHTER - Pre-fight preparation

You have {budget} STAT POINTS to allocate across these categories:
- "hp": +{point_effects['hp']} HP per point (more health = survive longer)
- "stamina": +{point_effects['stamina']} stamina per point (more gas = more moves)
- "power": +{int(point_effects['power'] * 100)}% damage dealt per point (hit harder)
- "endurance": +{int(point_effects['endurance'] * 100)}% stamina cost reduction per point (moves cost less)

Points MUST total exactly {budget}. Minimum 0 per category.

You also get to pick exactly {perks_allowed} PERKS from this list:
{perk_list}

Respond with this exact JSON format (reasoning must be one sentence, 15 words max):
{{"points": {{"hp": <int>, "stamina": <int>, "power": <int>, "endurance": <int>}}, "perks": ["<perk1>", "<perk2>"], "reasoning": "<one sentence max>"}}"""

    return system_prompt, user_prompt
