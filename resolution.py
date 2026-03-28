"""Move resolution logic for the AI Boxing Simulation.

Implements the full 6x6 move resolution matrix and stamina enforcement.
"""

from config import CONFIG

MOVES = CONFIG["moves"]


def enforce_stamina(move: str, stamina: int) -> str:
    """Downgrade a move if the fighter lacks stamina.

    Returns the move that will actually be executed.
    """
    cost = MOVES[move]["stamina_cost"]
    if stamina >= cost:
        return move
    # Can't afford chosen move — try jab
    if stamina >= MOVES["jab"]["stamina_cost"]:
        return "jab"
    # Can't even jab — forced rest
    return "rest"


def _range_damage(move: str, distance: int) -> int:
    """Look up damage for an attack at the given distance.

    Returns 0 if the attack is out of range (a range miss).
    Non-attack moves always return 0.
    """
    range_table = CONFIG.get("range_damage", {})
    if move in range_table:
        damages = range_table[move]
        return damages[distance] if 0 <= distance < len(damages) else 0
    # Non-attack moves (dodge, clinch, rest) — no damage
    return 0


def resolve_moves(move_a: str, move_b: str, distance: int = 1) -> tuple[int, int]:
    """Resolve two simultaneous moves and return (damage_to_a, damage_to_b).

    Distance affects whether attacks land:
    - Outside (0): only jab lands (reduced to 5). Hook/uppercut miss.
    - Mid (1): jab (8) and hook (20) land. Uppercut misses.
    - Inside (2): all attacks land at full damage.

    On top of range, existing defenses still apply:
    - Dodge avoids ALL in-range attacks
    - Clinch nullifies in-range hook and uppercut
    - Rest provides zero defense
    """
    # Get range-adjusted base damage for each attack
    dmg_a = _range_damage(move_a, distance)
    dmg_b = _range_damage(move_b, distance)

    damage_to_a = 0
    damage_to_b = 0

    # --- Resolve damage B deals to A ---
    if dmg_b > 0:  # B's attack is in range
        if move_a == "dodge":
            damage_to_a = 0
        elif move_a == "clinch" and move_b in ("hook", "uppercut"):
            damage_to_a = 0
        else:
            damage_to_a = dmg_b

    # --- Resolve damage A deals to B ---
    if dmg_a > 0:  # A's attack is in range
        if move_b == "dodge":
            damage_to_b = 0
        elif move_b == "clinch" and move_a in ("hook", "uppercut"):
            damage_to_b = 0
        else:
            damage_to_b = dmg_a

    return damage_to_a, damage_to_b


def resolve_distance(move_a: str, move_b: str, current: int) -> int:
    """Compute new distance after both moves' shifts are applied.

    Positive shift = closer (toward inside/2): uppercut, clinch.
    Negative shift = farther (toward outside/0): dodge.
    """
    shifts = CONFIG.get("distance_shifts", {})
    new = current + shifts.get(move_a, 0) + shifts.get(move_b, 0)
    return max(0, min(CONFIG.get("distance_levels", 3) - 1, new))


def apply_stamina_cost(move: str, stamina: int) -> int:
    """Deduct stamina cost for a move. Returns new stamina value."""
    cost = MOVES[move]["stamina_cost"]
    return max(0, stamina - cost)


def apply_rest_recovery(move: str, stamina: int) -> int:
    """Apply stamina recovery if the move is rest. Returns new stamina value."""
    if move == "rest":
        max_stam = CONFIG["max_stamina"]
        recovery = CONFIG["stamina_recovery_on_rest"]
        return min(max_stam, stamina + recovery)
    return stamina


def score_round(dmg_to_a: int, dmg_to_b: int) -> dict:
    """Score a round using the 10-point must system.

    - Fighter who dealt more damage: 10 pts, other: 9 pts
    - Equal damage: 10-10
    - Knockdown bonus (25+ dealt while taking 0): 10-8
    """
    # dmg_to_a is what fighter B dealt TO A (i.e., B's offense)
    # dmg_to_b is what fighter A dealt TO B (i.e., A's offense)
    score_a = 10
    score_b = 10

    if dmg_to_b > dmg_to_a:
        # Fighter A dealt more damage
        score_b = 9
        # Knockdown check: A dealt 25+ while taking 0
        if dmg_to_b >= 25 and dmg_to_a == 0:
            score_b = 8
    elif dmg_to_a > dmg_to_b:
        # Fighter B dealt more damage
        score_a = 9
        # Knockdown check: B dealt 25+ while A dealt 0
        if dmg_to_a >= 25 and dmg_to_b == 0:
            score_a = 8
    # else: equal damage, both get 10

    return {"fighter1": score_a, "fighter2": score_b}
