"""
commentary.py — Template-based round narration for the AI Boxing Simulation.
"""
import random
from models import Fighter, RoundFighterResult

# Templates keyed by (move_a, move_b) or by move alone for single-fighter events
_TEMPLATES = {
    ("jab", "jab"): [
        "{a} and {b} trade jabs! Both connect — {a} takes {da} damage, {b} takes {db} damage.",
        "Quick exchanges in the center — {a} and {b} both land jabs.",
    ],
    ("jab", "hook"): [
        "{a} snaps a jab but {b} catches them with a big hook! {a} takes {da} damage, {b} eats {db}.",
        "{b} swings a hook — {a} walks into it while throwing a jab.",
    ],
    ("hook", "jab"): [
        "{a} lands a powerful hook while {b} throws a jab. {a} deals {db} damage, takes {da}.",
        "{a}'s hook connects clean! {b}'s jab barely matters.",
    ],
    ("jab", "uppercut"): [
        "{b} drives an uppercut through {a}'s jab! Devastating — {a} takes {da} damage.",
        "{a} tries a jab but {b}'s uppercut catches them coming in.",
    ],
    ("uppercut", "jab"): [
        "{a} unloads a thunderous uppercut! {b}'s jab is nothing by comparison. {b} takes {db} damage.",
        "{a}'s uppercut explodes on the chin of {b}!",
    ],
    ("hook", "hook"): [
        "Both fighters swing hooks simultaneously — they trade {da}/{db} damage!",
        "Wild exchange! {a} and {b} both land hooks at the same time.",
    ],
    ("hook", "uppercut"): [
        "{a} throws a hook, {b} goes upstairs with an uppercut — both connect!",
        "Brawl in the center! {a}'s hook and {b}'s uppercut both land.",
    ],
    ("uppercut", "hook"): [
        "{a} unloads an uppercut, {b} counters with a hook — brutal exchange!",
        "{a}'s uppercut cracks {b} but the hook comes right back.",
    ],
    ("uppercut", "uppercut"): [
        "Both fighters go for the kill with uppercuts! {a} takes {da}, {b} takes {db} damage.",
        "Simultaneous uppercuts — the crowd goes wild!",
    ],
    ("dodge", "jab"): [
        "{a} slips the jab! {b} misses completely.",
        "{a} reads {b}'s jab perfectly and glides out of the way.",
    ],
    ("jab", "dodge"): [
        "{b} ghosts {a}'s jab — nothing landed!",
        "{a} throws a jab into thin air as {b} dodges.",
    ],
    ("dodge", "hook"): [
        "{a} ducks under {b}'s hook! The big swing misses!",
        "{b} telegraphed that hook — {a} made them pay with a perfect dodge.",
    ],
    ("hook", "dodge"): [
        "{a} throws a big hook but {b} slips it cleanly.",
        "{a}'s hook sails past as {b} moves out of range.",
    ],
    ("dodge", "uppercut"): [
        "{a} slips {b}'s uppercut! That could have been devastating.",
        "{b} rips an uppercut but {a} isn't there.",
    ],
    ("uppercut", "dodge"): [
        "{a} launches a massive uppercut — {b} dodges and it connects with nothing.",
        "{b} reads {a}'s uppercut and steps aside.",
    ],
    ("clinch", "jab"): [
        "{a} ties up {b} — the jab still sneaks through for {da} damage.",
        "{b}'s jab finds its way through the clinch. {a} takes {da}.",
    ],
    ("jab", "clinch"): [
        "{a}'s jab gets through {b}'s clinch for {db} damage.",
        "{b} ties up but the jab punches through.",
    ],
    ("clinch", "hook"): [
        "{a} grabs {b} before that hook can land! Clinch nullifies it.",
        "Smart clinch from {a} — {b}'s hook is smothered.",
    ],
    ("hook", "clinch"): [
        "{a} swings a hook but {b} clinches — the punch is muffled.",
        "{b} grabs onto {a}, killing that hook attempt.",
    ],
    ("clinch", "uppercut"): [
        "{a} clinches up tight — {b}'s uppercut is smothered.",
        "Clever tie-up from {a} stops {b}'s power shot.",
    ],
    ("uppercut", "clinch"): [
        "{a} loads up on the uppercut but {b} grabs hold — no damage.",
        "{b} reads the uppercut and clinches before it lands.",
    ],
    ("clinch", "dodge"): [
        "Both fighters play it safe — {a} clinches, {b} dodges. Uneventful round.",
        "No damage either way: {a} clinches, {b} evades.",
    ],
    ("dodge", "clinch"): [
        "Tactical round — {a} dodges, {b} clinches. Zero damage.",
        "Both fighters avoid commitment this round.",
    ],
    ("clinch", "rest"): [
        "{a} clinches while {b} catches their breath. No damage.",
        "{b} rests, {a} holds on — quiet round.",
    ],
    ("rest", "clinch"): [
        "{a} rests, {b} clinches — both fighters take a breather.",
        "Quiet round: {a} recovers stamina, {b} ties up.",
    ],
    ("rest", "jab"): [
        "{a} tries to rest but {b} punishes them with a jab! {a} takes {da} damage.",
        "Big mistake by {a} — resting against {b}'s jab. {da} damage lands.",
    ],
    ("jab", "rest"): [
        "{b} rests and eats a jab for it! {b} takes {db} damage.",
        "{a} capitalizes on {b}'s rest with a clean jab.",
    ],
    ("rest", "hook"): [
        "{a} rests — {b} makes them pay with a hook! {a} takes {da} damage!",
        "Costly rest for {a}: {b}'s hook lands flush for {da} damage.",
    ],
    ("hook", "rest"): [
        "{b} rests and {a} unloads a hook! {b} takes {db} damage!",
        "Punishing hook from {a} as {b} tried to recover.",
    ],
    ("rest", "uppercut"): [
        "{a} rests — {b} destroys them with an uppercut! {a} takes {da} damage!",
        "Catastrophic rest from {a}: {b}'s uppercut hits for {da} damage!",
    ],
    ("uppercut", "rest"): [
        "{b} rests and {a} smashes an uppercut! {b} takes {db} damage!",
        "Devastating uppercut from {a} as {b} tried to recover.",
    ],
    ("rest", "rest"): [
        "Both fighters rest. They eye each other across the ring, catching their breath.",
        "Quiet round — {a} and {b} both recover stamina.",
    ],
    ("dodge", "rest"): [
        "{a} dodges, {b} rests. No damage.",
        "Both fighters play it cautious.",
    ],
    ("rest", "dodge"): [
        "{a} rests, {b} dodges. Uneventful round.",
        "No action — {a} catches breath, {b} evades nothing.",
    ],
    ("clinch", "clinch"): [
        "Both fighters grab each other and hold on. The referee breaks them.",
        "Double clinch — the crowd boos. No damage.",
    ],
    ("dodge", "dodge"): [
        "Both fighters dodge simultaneously! Nothing connects.",
        "Evasive round — {a} and {b} both step back.",
    ],
}


_RANGE_MISS_TEMPLATES = {
    "hook": [
        "{attacker}'s hook sails wide — {defender} is too far away!",
        "{attacker} throws a hook but {defender} is out of range!",
    ],
    "uppercut": [
        "{attacker}'s uppercut falls short — not close enough!",
        "{attacker} swings an uppercut from too far away. Whiff!",
    ],
    "jab": [
        "{attacker}'s jab barely reaches, landing a glancing blow.",
    ],
}

_DIST_LABELS = {0: "outside", 1: "mid", 2: "inside"}

_DISTANCE_CHANGE = {
    (0, 1): [
        "The fighters close to mid range.",
        "The gap narrows — back to boxing range.",
    ],
    (1, 2): [
        "The fighters close to inside range!",
        "They're in tight now — inside range!",
    ],
    (1, 0): [
        "The fighters separate to outside range.",
        "Space opens up — outside range now.",
    ],
    (2, 1): [
        "The fighters create space — back to mid range.",
        "They push apart to mid range.",
    ],
    (2, 0): [
        "The fighters spring apart to outside range!",
        "Big separation — all the way to outside!",
    ],
    (0, 1, "stalemate"): [
        "The referee pushes them back together!",
        "Ref breaks the standoff — back to mid range!",
    ],
}


def generate_commentary(
    f1: Fighter,
    f2: Fighter,
    fr1: RoundFighterResult,
    fr2: RoundFighterResult,
    round_num: int,
    distance_before: int = 1,
    distance_after: int = 1,
) -> str:
    """Generate a commentary string for the round."""
    key = (fr1.move_executed, fr2.move_executed)
    templates = _TEMPLATES.get(key)

    if not templates:
        templates = [
            f"Round {round_num}: {f1.display_name} uses {fr1.move_executed}, "
            f"{f2.display_name} uses {fr2.move_executed}. "
            f"Damage: {fr1.damage_taken} to {f1.display_name}, {fr2.damage_taken} to {f2.display_name}."
        ]

    template = random.choice(templates)
    text = template.format(
        a=f1.display_name,
        b=f2.display_name,
        da=fr1.damage_taken,
        db=fr2.damage_taken,
    )

    # Add range miss commentary
    from config import CONFIG
    range_table = CONFIG.get("range_damage", {})
    for move, fr, fighter, opponent in [
        (fr1.move_executed, fr1, f1, f2),
        (fr2.move_executed, fr2, f2, f1),
    ]:
        if move in range_table and range_table[move][distance_before] == 0:
            miss_tpl = _RANGE_MISS_TEMPLATES.get(move)
            if miss_tpl:
                text += " " + random.choice(miss_tpl).format(
                    attacker=fighter.display_name,
                    defender=opponent.display_name,
                )

    # Add distance change commentary
    if distance_before != distance_after:
        change_key = (distance_before, distance_after)
        change_templates = _DISTANCE_CHANGE.get(change_key)
        if change_templates:
            text += " " + random.choice(change_templates)

    return text
