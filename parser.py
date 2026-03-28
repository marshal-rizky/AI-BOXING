"""4-layer LLM response parser for extracting boxing moves."""

import json
import logging
import re

from config import VALID_MOVES

logger = logging.getLogger(__name__)

# Priority order: check specific moves first to avoid substring collisions.
KEYWORD_PRIORITY = ["uppercut", "hook", "clinch", "dodge", "rest", "jab"]

FUZZY_MAP = {
    "upp": "uppercut",
    "upper": "uppercut",
    "hoo": "hook",
    "cli": "clinch",
    "clin": "clinch",
    "dod": "dodge",
    "evade": "dodge",
    "duck": "dodge",
    "block": "clinch",
    "guard": "clinch",
    "recover": "rest",
    "wait": "rest",
    "punch": "jab",
    "hit": "jab",
    "strike": "jab",
}


def sanitize_model_output(raw_response: str) -> str:
    """Remove common wrappers so parsing focuses on the actual answer."""
    if not raw_response:
        return ""

    text = raw_response.strip()
    if not text:
        return ""

    text = re.sub(r"```(?:json)?", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE).strip()

    # Handle incomplete think-tag output by dropping the preamble and keeping the JSON tail.
    if "<think>" in text.lower():
        json_start = text.find("{")
        if json_start != -1:
            text = text[json_start:].strip()
        else:
            closing = text.lower().rfind("</think>")
            if closing != -1:
                text = text[closing + len("</think>"):].strip()

    # Prefer the last apparent JSON object if the model wrapped it in narration.
    json_start = text.find("{")
    json_end = text.rfind("}") + 1
    if json_start != -1 and json_end > json_start:
        candidate = text[json_start:json_end].strip()
        if candidate:
            text = candidate

    return text.strip()


def parse_move(raw_response: str) -> tuple[str, str, bool]:
    """Parse an LLM response into a valid move.

    Returns:
        (move, reasoning, was_parsed_cleanly)
    """
    if not raw_response or not raw_response.strip():
        logger.warning("Empty response from model, defaulting to jab")
        return "jab", "", False

    text = sanitize_model_output(raw_response)
    reasoning = ""

    if not text:
        logger.warning("Response was only wrapper text with no JSON, defaulting to jab")
        return "jab", "", False

    # Layer 1: direct JSON parsing.
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            move = data.get("move", "").lower().strip()
            reasoning = data.get("reasoning", "")
            if move in VALID_MOVES:
                return move, reasoning, True
    except (json.JSONDecodeError, AttributeError):
        pass

    # Layer 1b: recover a JSON object embedded in larger output.
    json_start = text.find("{")
    json_end = text.rfind("}") + 1
    if json_start != -1 and json_end > json_start:
        try:
            data = json.loads(text[json_start:json_end])
            if isinstance(data, dict):
                move = data.get("move", "").lower().strip()
                reasoning = data.get("reasoning", "")
                if move in VALID_MOVES:
                    return move, reasoning, True
        except (json.JSONDecodeError, AttributeError):
            pass

    # Layer 2: keyword extraction from cleaned output.
    lower = text.lower()
    for move in KEYWORD_PRIORITY:
        if move in lower:
            return move, _extract_reasoning(text), True

    # Layer 3: fuzzy matching.
    for prefix, move in FUZZY_MAP.items():
        if prefix in lower:
            logger.info("Fuzzy matched '%s' -> '%s' from: %s", prefix, move, text[:80])
            return move, _extract_reasoning(text), False

    # Layer 4: default.
    logger.warning("Could not parse move from: %s, defaulting to jab", text[:100])
    return "jab", _extract_reasoning(text), False


def _extract_reasoning(text: str) -> str:
    """Best-effort extraction of reasoning from free-text responses."""
    if len(text) <= 200:
        return text
    return text[:200] + "..."
