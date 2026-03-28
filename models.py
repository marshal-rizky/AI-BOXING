"""Data models for the AI Boxing Simulation."""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Fighter:
    name: str
    display_name: str
    provider: str
    model: str
    personality: str
    temperature: float = 0.7
    hp: int = 100
    stamina: int = 100
    consecutive_rests: int = 0
    last_move: Optional[str] = None
    # Anti-spam tracking
    move_cooldowns: dict = field(default_factory=dict)  # {move: rounds_remaining}
    consecutive_move: str = ""     # last executed move
    consecutive_count: int = 0     # how many times in a row (1 = first use)
    # Build system
    build: dict = field(default_factory=dict)       # {"points": {...}, "perks": [...], "reasoning": "..."}
    power_modifier: float = 1.0                     # from stat points
    endurance_modifier: float = 1.0                 # from stat points
    active_perks: list = field(default_factory=list) # list of perk name strings
    # Perk runtime state
    hits_taken_count: int = 0       # for Rope-a-Dope
    second_wind_used: bool = False  # for Second Wind
    last_move_was_dodge: bool = False  # for Counter Puncher


@dataclass
class RoundFighterResult:
    move_chosen: str
    move_executed: str
    reasoning: str
    damage_dealt: int
    damage_taken: int
    hp_before: int
    hp_after: int
    stamina_before: int
    stamina_after: int
    api_latency_ms: int = 0
    api_error: bool = False
    parse_clean: bool = True


@dataclass
class RoundResult:
    round_number: int
    fighter1: RoundFighterResult
    fighter2: RoundFighterResult
    commentary: str = ""
    scorecard: dict = field(default_factory=dict)
    distance_before: int = 1
    distance_after: int = 1


@dataclass
class FightMetadata:
    fight_id: str
    date: str
    fighter1_config: dict
    fighter2_config: dict
    config: dict
    fighter1_build: dict = field(default_factory=dict)
    fighter2_build: dict = field(default_factory=dict)


@dataclass
class FightStats:
    total_damage_dealt: int = 0
    total_damage_taken: int = 0
    moves_used: dict = field(default_factory=dict)
    successful_dodges: int = 0
    range_misses: int = 0
    api_errors: int = 0


@dataclass
class FightResult:
    winner: Optional[str]
    method: str  # "KO", "TKO", "Decision", "Draw"
    final_score: dict = field(default_factory=dict)
    rounds_fought: int = 0
    fighter1_stats: FightStats = field(default_factory=FightStats)
    fighter2_stats: FightStats = field(default_factory=FightStats)


@dataclass
class FightLog:
    metadata: FightMetadata
    rounds: list[RoundResult] = field(default_factory=list)
    result: Optional[FightResult] = None

    def to_dict(self) -> dict:
        """Convert the entire fight log to a JSON-serializable dict."""
        def _asdict(obj):
            if hasattr(obj, '__dataclass_fields__'):
                return {k: _asdict(v) for k, v in obj.__dict__.items()}
            elif isinstance(obj, list):
                return [_asdict(item) for item in obj]
            elif isinstance(obj, dict):
                return {k: _asdict(v) for k, v in obj.items()}
            return obj
        return _asdict(self)
