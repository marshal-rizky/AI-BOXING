"""
fighters.py — Async API providers for Claude, GPT, and Gemini fighters.

Each provider:
- Has an 8-second timeout
- Retries up to 2 times with exponential backoff (1s, 2s)
- On rate limit (429): respects Retry-After or waits 5s
- On auth error: raises immediately (no retry)
- On total failure: returns a fallback jab response
"""
import asyncio
import logging
import os
import random
import threading
import time

from config import CONFIG, VALID_MOVES
from models import Fighter

logger = logging.getLogger(__name__)

_TIMEOUT = CONFIG["api_timeout_seconds"]
_MAX_RETRIES = CONFIG["max_retries"]
_BACKOFF_BASE = CONFIG["retry_base_delay"]
_RATE_LIMIT_WAIT = 8
_MAX_TOKENS = CONFIG.get("response_max_tokens", 96)

_OPENAI_CLIENTS = {}
_ANTHROPIC_CLIENTS = {}
_PROVIDER_LOCKS = {}
_PROVIDER_LAST_CALL = {}
_OPENROUTER_KEY_INDEX = 0
_OPENROUTER_KEY_LOCK = threading.Lock()
_INVALID_OPENROUTER_KEYS = set()
_OPENROUTER_KEY_COOLDOWNS = {}
_OLLAMA_KEY_INDEX = 0
_OLLAMA_KEY_LOCK = threading.Lock()
_INVALID_OLLAMA_KEYS = set()
_OLLAMA_KEY_COOLDOWNS = {}
_GROQ_KEY_INDEX = 0
_GROQ_KEY_LOCK = threading.Lock()
_INVALID_GROQ_KEYS = set()
_GROQ_KEY_COOLDOWNS = {}


def _fighter_provider_setting(fighter: Fighter, key: str, default):
    fighter_cfg = CONFIG["fighters"].get(fighter.name, {})
    return fighter_cfg.get(key, default)


def _extract_chat_message_text(message) -> str:
    """Normalize provider-specific chat payloads into plain text."""
    content = getattr(message, "content", None)

    if isinstance(content, str) and content.strip():
        return content

    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
            else:
                text = getattr(item, "text", None)
            if text:
                parts.append(text)
        if parts:
            return "\n".join(parts)

    reasoning = getattr(message, "reasoning", None)
    if isinstance(reasoning, str) and reasoning.strip():
        return reasoning

    reasoning_details = getattr(message, "reasoning_details", None)
    if isinstance(reasoning_details, list):
        parts = []
        for item in reasoning_details:
            if isinstance(item, dict):
                text = item.get("text")
            else:
                text = getattr(item, "text", None)
            if text:
                parts.append(text)
        if parts:
            return "\n".join(parts)

    return ""


def _openai_client(cache_key: tuple, **kwargs):
    import openai
    import httpx

    client = _OPENAI_CLIENTS.get(cache_key)
    if client is None:
        client = _OPENAI_CLIENTS[cache_key] = openai.AsyncOpenAI(
            max_retries=0,
            timeout=httpx.Timeout(_TIMEOUT, connect=5.0),
            **kwargs,
        )
    return client


def _openrouter_api_keys() -> list[str]:
    now = time.monotonic()
    keys = []
    for env_name in CONFIG.get("openrouter_api_key_envs", ["OPENROUTER_API_KEY"]):
        value = os.environ.get(env_name, "").strip()
        cooldown_until = _OPENROUTER_KEY_COOLDOWNS.get(value, 0.0)
        if (
            value
            and value not in keys
            and value not in _INVALID_OPENROUTER_KEYS
            and cooldown_until <= now
        ):
            keys.append(value)
    return keys


def _select_openrouter_api_key() -> str:
    global _OPENROUTER_KEY_INDEX

    keys = _openrouter_api_keys()
    if not keys:
        return ""

    with _OPENROUTER_KEY_LOCK:
        api_key = keys[_OPENROUTER_KEY_INDEX % len(keys)]
        _OPENROUTER_KEY_INDEX += 1
    return api_key


def _mark_openrouter_api_key_invalid(api_key: str) -> None:
    if not api_key:
        return
    with _OPENROUTER_KEY_LOCK:
        _INVALID_OPENROUTER_KEYS.add(api_key)


def _mark_openrouter_api_key_rate_limited(api_key: str, wait_seconds: float) -> None:
    if not api_key:
        return
    with _OPENROUTER_KEY_LOCK:
        _OPENROUTER_KEY_COOLDOWNS[api_key] = max(
            _OPENROUTER_KEY_COOLDOWNS.get(api_key, 0.0),
            time.monotonic() + max(wait_seconds, 1.0),
        )


def _ollama_api_keys() -> list[str]:
    now = time.monotonic()
    keys = []
    for env_name in CONFIG.get("ollama_api_key_envs", ["OLLAMA_API_KEY_1"]):
        value = os.environ.get(env_name, "").strip()
        cooldown_until = _OLLAMA_KEY_COOLDOWNS.get(value, 0.0)
        if (
            value
            and value not in keys
            and value not in _INVALID_OLLAMA_KEYS
            and cooldown_until <= now
        ):
            keys.append(value)
    return keys


def _select_ollama_api_key() -> str:
    global _OLLAMA_KEY_INDEX
    keys = _ollama_api_keys()
    if not keys:
        return ""
    with _OLLAMA_KEY_LOCK:
        api_key = keys[_OLLAMA_KEY_INDEX % len(keys)]
        _OLLAMA_KEY_INDEX += 1
    return api_key


def _mark_ollama_api_key_invalid(api_key: str) -> None:
    if not api_key:
        return
    with _OLLAMA_KEY_LOCK:
        _INVALID_OLLAMA_KEYS.add(api_key)


def _mark_ollama_api_key_rate_limited(api_key: str, wait_seconds: float) -> None:
    if not api_key:
        return
    with _OLLAMA_KEY_LOCK:
        _OLLAMA_KEY_COOLDOWNS[api_key] = max(
            _OLLAMA_KEY_COOLDOWNS.get(api_key, 0.0),
            time.monotonic() + max(wait_seconds, 1.0),
        )


def _groq_api_keys() -> list[str]:
    now = time.monotonic()
    keys = []
    for env_name in CONFIG.get("groq_api_key_envs", ["GROQ_API_KEY"]):
        value = os.environ.get(env_name, "").strip()
        cooldown_until = _GROQ_KEY_COOLDOWNS.get(value, 0.0)
        if (
            value
            and value not in keys
            and value not in _INVALID_GROQ_KEYS
            and cooldown_until <= now
        ):
            keys.append(value)
    return keys


def _select_groq_api_key() -> str:
    global _GROQ_KEY_INDEX
    keys = _groq_api_keys()
    if not keys:
        return ""
    with _GROQ_KEY_LOCK:
        api_key = keys[_GROQ_KEY_INDEX % len(keys)]
        _GROQ_KEY_INDEX += 1
    return api_key


def _mark_groq_api_key_invalid(api_key: str) -> None:
    if not api_key:
        return
    with _GROQ_KEY_LOCK:
        _INVALID_GROQ_KEYS.add(api_key)


def _mark_groq_api_key_rate_limited(api_key: str, wait_seconds: float) -> None:
    if not api_key:
        return
    with _GROQ_KEY_LOCK:
        _GROQ_KEY_COOLDOWNS[api_key] = max(
            _GROQ_KEY_COOLDOWNS.get(api_key, 0.0),
            time.monotonic() + max(wait_seconds, 1.0),
        )


def _build_openai_compat_client(api_key: str, base_url: str, extra_headers: dict):
    return _openai_client(
        ("openai_compat", api_key, base_url, tuple(sorted(extra_headers.items()))),
        api_key=api_key,
        base_url=base_url,
        default_headers=extra_headers if extra_headers else {},
    )


def _provider_bucket(fighter: Fighter) -> str:
    fighter_cfg = CONFIG["fighters"].get(fighter.name, {})
    if fighter.provider == "openai_compat":
        return fighter_cfg.get("base_url", fighter.provider)
    return fighter.provider


async def _run_bucketed_request(fighter: Fighter, request_coro_factory):
    if not CONFIG.get("serialize_provider_requests", False):
        return await request_coro_factory()

    bucket = _provider_bucket(fighter)
    spacing_map = CONFIG.get("provider_request_spacing_seconds", {})
    spacing = spacing_map.get(bucket, spacing_map.get(fighter.provider, 0))
    lock = _PROVIDER_LOCKS.setdefault(bucket, asyncio.Lock())

    async with lock:
        if spacing > 0:
            elapsed = time.monotonic() - _PROVIDER_LAST_CALL.get(bucket, 0.0)
            wait = spacing - elapsed
            if wait > 0:
                await asyncio.sleep(wait)
        try:
            return await request_coro_factory()
        finally:
            _PROVIDER_LAST_CALL[bucket] = time.monotonic()


# ── Fallback response ─────────────────────────────────────────────────────────

def _fallback_response(fighter_name: str, error: str) -> dict:
    logger.warning(f"[{fighter_name}] API FAILURE: {error} — defaulting to jab")
    return {"raw": '{"move": "jab", "reasoning": "API unavailable"}', "latency_ms": 0, "api_error": True}


# ── Claude (Anthropic) ────────────────────────────────────────────────────────

async def _call_claude(fighter: Fighter, system_prompt: str, user_prompt: str, max_tokens: int | None = None) -> dict:
    import anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise PermissionError("ANTHROPIC_API_KEY not set")

    client = _ANTHROPIC_CLIENTS.get(api_key)
    if client is None:
        client = _ANTHROPIC_CLIENTS[api_key] = anthropic.AsyncAnthropic(api_key=api_key)

    timeout = _fighter_provider_setting(fighter, "api_timeout_seconds", _TIMEOUT)
    max_retries = _fighter_provider_setting(fighter, "max_retries", _MAX_RETRIES)
    rate_limit_wait = _fighter_provider_setting(fighter, "rate_limit_wait_seconds", _RATE_LIMIT_WAIT)
    max_tokens = max_tokens or _fighter_provider_setting(fighter, "response_max_tokens", _MAX_TOKENS)

    for attempt in range(max_retries):
        try:
            start = time.time()
            response = await _run_bucketed_request(
                fighter,
                lambda: asyncio.wait_for(
                    client.messages.create(
                        model=fighter.model,
                    max_tokens=max_tokens,
                        temperature=fighter.temperature,
                        system=system_prompt,
                        messages=[{"role": "user", "content": user_prompt}],
                    ),
                    timeout=timeout,
                ),
            )
            latency_ms = int((time.time() - start) * 1000)
            raw = response.content[0].text
            return {"raw": raw, "latency_ms": latency_ms, "api_error": False}

        except anthropic.AuthenticationError as e:
            raise PermissionError(f"Claude auth failed: {e}") from e
        except anthropic.RateLimitError:
            wait = rate_limit_wait * (attempt + 1) + random.uniform(0, 2)
            logger.warning(f"[Claude] Rate limited, waiting {wait:.1f}s (attempt {attempt+1})")
            await asyncio.sleep(wait)
        except (asyncio.TimeoutError, anthropic.APIError, Exception) as e:
            if attempt < max_retries - 1:
                delay = _BACKOFF_BASE ** (attempt + 1)
                logger.warning(f"[Claude] {type(e).__name__}: {e}, retrying in {delay}s (attempt {attempt+1})")
                await asyncio.sleep(delay)
            else:
                return _fallback_response(fighter.display_name, f"Claude {type(e).__name__}: {e}")

    return _fallback_response(fighter.display_name, "Claude max retries exceeded")


# ── GPT (OpenAI) ──────────────────────────────────────────────────────────────

async def _call_gpt(fighter: Fighter, system_prompt: str, user_prompt: str, max_tokens: int | None = None) -> dict:
    import openai

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise PermissionError("OPENAI_API_KEY not set")

    client = _openai_client(("openai", api_key), api_key=api_key)
    timeout = _fighter_provider_setting(fighter, "api_timeout_seconds", _TIMEOUT)
    max_retries = _fighter_provider_setting(fighter, "max_retries", _MAX_RETRIES)
    rate_limit_wait = _fighter_provider_setting(fighter, "rate_limit_wait_seconds", _RATE_LIMIT_WAIT)
    max_tokens = max_tokens or _fighter_provider_setting(fighter, "response_max_tokens", _MAX_TOKENS)

    for attempt in range(max_retries):
        try:
            start = time.time()
            request_kwargs = {
                "model": fighter.model,
                "max_tokens": max_tokens,
                "temperature": fighter.temperature,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            }
            if "openrouter.ai/api/v1" in base_url:
                request_kwargs["response_format"] = {"type": "json_object"}
                request_kwargs["extra_body"] = {
                    "reasoning": {"exclude": True, "effort": "minimal"}
                }
            response = await _run_bucketed_request(
                fighter,
                lambda: asyncio.wait_for(
                    client.chat.completions.create(**request_kwargs),
                    timeout=timeout,
                ),
            )
            latency_ms = int((time.time() - start) * 1000)
            raw = _extract_chat_message_text(response.choices[0].message)
            return {"raw": raw, "latency_ms": latency_ms, "api_error": False}

        except openai.AuthenticationError as e:
            raise PermissionError(f"GPT auth failed: {e}") from e
        except openai.RateLimitError as e:
            retry_after = getattr(e, "retry_after", None)
            wait = (retry_after if retry_after else rate_limit_wait * (attempt + 1)) + random.uniform(0, 2)
            logger.warning(f"[GPT] Rate limited, waiting {wait:.1f}s (attempt {attempt+1})")
            await asyncio.sleep(wait)
        except (asyncio.TimeoutError, openai.APIError, Exception) as e:
            if attempt < max_retries - 1:
                delay = _BACKOFF_BASE ** (attempt + 1)
                logger.warning(f"[GPT] {type(e).__name__}: {e}, retrying in {delay}s (attempt {attempt+1})")
                await asyncio.sleep(delay)
            else:
                return _fallback_response(fighter.display_name, f"GPT {type(e).__name__}: {e}")

    return _fallback_response(fighter.display_name, "GPT max retries exceeded")


# ── Gemini (Google) ───────────────────────────────────────────────────────────

async def _call_gemini(fighter: Fighter, system_prompt: str, user_prompt: str, max_tokens: int | None = None) -> dict:
    try:
        import google.generativeai as genai
    except ModuleNotFoundError:
        logger.warning("[Gemini] google-generativeai not installed, falling back to OpenAI-compatible endpoint")
        return await _call_openai_compat(fighter, system_prompt, user_prompt, max_tokens=max_tokens)

    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        fallback = await _call_gemini_openrouter_fallback(fighter, system_prompt, user_prompt, max_tokens=max_tokens)
        if fallback is not None and not user_prompt.startswith("BUILD YOUR FIGHTER"):
            return fallback
        raise PermissionError("GOOGLE_API_KEY not set")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(fighter.model)
    timeout = _fighter_provider_setting(fighter, "api_timeout_seconds", _TIMEOUT)
    max_retries = _fighter_provider_setting(fighter, "max_retries", _MAX_RETRIES)
    rate_limit_wait = _fighter_provider_setting(fighter, "rate_limit_wait_seconds", _RATE_LIMIT_WAIT)
    max_tokens = max_tokens or _fighter_provider_setting(fighter, "response_max_tokens", _MAX_TOKENS)

    for attempt in range(max_retries):
        try:
            start = time.time()
            # google-generativeai is sync; run in thread pool to avoid blocking event loop
            response = await _run_bucketed_request(
                fighter,
                lambda: asyncio.wait_for(
                    asyncio.get_event_loop().run_in_executor(
                        None,
                        lambda: model.generate_content(
                            f"{system_prompt}\n\n{user_prompt}",
                            generation_config={
                                "temperature": fighter.temperature,
                                "max_output_tokens": max_tokens,
                                "response_mime_type": "application/json",
                            },
                        ),
                    ),
                    timeout=timeout,
                ),
            )
            latency_ms = int((time.time() - start) * 1000)
            raw = response.text
            return {"raw": raw, "latency_ms": latency_ms, "api_error": False}

        except Exception as e:
            err_str = str(e).lower()
            if "api_key" in err_str or "auth" in err_str or "permission" in err_str:
                raise PermissionError(f"Gemini auth failed: {e}") from e
            if "quota" in err_str or "rate" in err_str or "429" in err_str:
                wait = rate_limit_wait * (attempt + 1)
                logger.warning(f"[Gemini] Rate limited, waiting {wait}s (attempt {attempt+1})")
                await asyncio.sleep(wait)
            elif attempt < max_retries - 1:
                delay = _BACKOFF_BASE ** (attempt + 1)
                logger.warning(f"[Gemini] Error {e}, retrying in {delay}s (attempt {attempt+1})")
                await asyncio.sleep(delay)
            else:
                if not user_prompt.startswith("BUILD YOUR FIGHTER"):
                    fallback = await _call_gemini_openrouter_fallback(fighter, system_prompt, user_prompt, max_tokens=max_tokens)
                    if fallback is not None:
                        return fallback
                return _fallback_response(fighter.display_name, str(e))

    if not user_prompt.startswith("BUILD YOUR FIGHTER"):
        fallback = await _call_gemini_openrouter_fallback(fighter, system_prompt, user_prompt, max_tokens=max_tokens)
        if fallback is not None:
            return fallback
    return _fallback_response(fighter.display_name, "max retries exceeded")


async def _call_gemini_openrouter_fallback(fighter: Fighter, system_prompt: str, user_prompt: str, max_tokens: int | None = None) -> dict | None:
    """Use an OpenRouter Gemini model when direct Google access is unavailable for moves."""
    fighter_cfg = CONFIG["fighters"].get(fighter.name, {})
    model = fighter_cfg.get("openrouter_fallback_model")
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not model or not api_key:
        return None

    logger.warning("[Gemini] Falling back to OpenRouter Gemini model for move generation")
    import openai

    timeout = _fighter_provider_setting(fighter, "api_timeout_seconds", _TIMEOUT)
    max_retries = _fighter_provider_setting(fighter, "max_retries", _MAX_RETRIES)
    rate_limit_wait = _fighter_provider_setting(fighter, "rate_limit_wait_seconds", _RATE_LIMIT_WAIT)
    max_tokens = max_tokens or _fighter_provider_setting(fighter, "response_max_tokens", _MAX_TOKENS)
    headers = {"HTTP-Referer": "http://localhost:8080", "X-Title": "AI Boxing"}
    client = _openai_client(
        ("gemini-openrouter", api_key, "https://openrouter.ai/api/v1", tuple(sorted(headers.items()))),
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
        default_headers=headers,
    )

    for attempt in range(max_retries):
        try:
            start = time.time()
            response = await _run_bucketed_request(
                fighter,
                lambda: asyncio.wait_for(
                    client.chat.completions.create(
                        model=model,
                        max_tokens=max_tokens,
                        temperature=fighter.temperature,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                    ),
                    timeout=timeout,
                ),
            )
            latency_ms = int((time.time() - start) * 1000)
            raw = _extract_chat_message_text(response.choices[0].message)
            return {"raw": raw, "latency_ms": latency_ms, "api_error": False}
        except openai.RateLimitError as e:
            retry_after = getattr(e, "retry_after", None)
            wait = (retry_after if retry_after else rate_limit_wait * (attempt + 1)) + random.uniform(0, 2)
            logger.warning(f"[Gemini/OpenRouter] Rate limited, waiting {wait:.1f}s (attempt {attempt+1})")
            await asyncio.sleep(wait)
        except (asyncio.TimeoutError, openai.APIError, Exception) as e:
            if attempt < max_retries - 1:
                delay = _BACKOFF_BASE ** (attempt + 1)
                logger.warning(f"[Gemini/OpenRouter] {type(e).__name__}: {e}, retrying in {delay}s")
                await asyncio.sleep(delay)
            else:
                return None

    return None


# ── Random bot (no API) ───────────────────────────────────────────────────────

async def _call_random(fighter: Fighter, system_prompt: str, user_prompt: str, max_tokens: int | None = None) -> dict:
    await asyncio.sleep(0.05)  # Simulate a tiny API delay
    move = random.choice(VALID_MOVES)
    raw = f'{{"move": "{move}", "reasoning": "Random selection"}}'
    return {"raw": raw, "latency_ms": 50, "api_error": False}


# ── Groq (OpenAI-compatible) ───────────────────────────────────────────────────

async def _call_groq(fighter: Fighter, system_prompt: str, user_prompt: str, max_tokens: int | None = None) -> dict:
    import openai

    api_key = _select_groq_api_key()
    if not api_key:
        raise PermissionError("No Groq API keys available (GROQ_API_KEY not set)")

    client = _openai_client(
        ("groq", api_key, "https://api.groq.com/openai/v1"),
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1",
    )
    timeout = _fighter_provider_setting(fighter, "api_timeout_seconds", _TIMEOUT)
    max_retries = _fighter_provider_setting(fighter, "max_retries", _MAX_RETRIES)
    rate_limit_wait = _fighter_provider_setting(fighter, "rate_limit_wait_seconds", _RATE_LIMIT_WAIT)
    max_tokens = max_tokens or _fighter_provider_setting(fighter, "response_max_tokens", _MAX_TOKENS)

    for attempt in range(max_retries):
        try:
            start = time.time()
            request_kwargs = {
                "model": fighter.model,
                "max_tokens": max_tokens,
                "temperature": fighter.temperature,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            }
            effort = _fighter_provider_setting(fighter, "reasoning_effort", None)
            if effort is None and _fighter_provider_setting(fighter, "disable_thinking", False):
                effort = "none"
            if effort:
                request_kwargs["reasoning_effort"] = effort
            response = await _run_bucketed_request(
                fighter,
                lambda: asyncio.wait_for(
                    client.chat.completions.create(**request_kwargs),
                    timeout=timeout,
                ),
            )
            latency_ms = int((time.time() - start) * 1000)
            raw = _extract_chat_message_text(response.choices[0].message)
            return {"raw": raw, "latency_ms": latency_ms, "api_error": False}

        except openai.AuthenticationError as e:
            _mark_groq_api_key_invalid(api_key)
            available_keys = _groq_api_keys()
            if attempt < max_retries - 1 and available_keys:
                logger.warning(f"[Groq] Key rejected, rotating to next key (attempt {attempt+1})")
                api_key = _select_groq_api_key()
                client = _openai_client(
                    ("groq", api_key, "https://api.groq.com/openai/v1"),
                    api_key=api_key,
                    base_url="https://api.groq.com/openai/v1",
                )
                continue
            raise PermissionError(f"Groq auth failed: {e}") from e
        except openai.RateLimitError as e:
            retry_after = getattr(e, "retry_after", None)
            wait = (retry_after if retry_after else rate_limit_wait * (attempt + 1)) + random.uniform(0, 2)
            _mark_groq_api_key_rate_limited(api_key, wait)
            available_keys = _groq_api_keys()
            if attempt < max_retries - 1 and available_keys:
                logger.warning(f"[Groq] Rate limited, rotating to next key (attempt {attempt+1})")
                api_key = _select_groq_api_key()
                client = _openai_client(
                    ("groq", api_key, "https://api.groq.com/openai/v1"),
                    api_key=api_key,
                    base_url="https://api.groq.com/openai/v1",
                )
                continue
            logger.warning(f"[Groq] Rate limited, waiting {wait:.1f}s (attempt {attempt+1})")
            await asyncio.sleep(wait)
        except (asyncio.TimeoutError, openai.APIError, openai.BadRequestError, Exception) as e:
            if attempt < max_retries - 1:
                delay = _BACKOFF_BASE ** (attempt + 1)
                logger.warning(f"[Groq] {type(e).__name__}: {e}, retrying in {delay}s (attempt {attempt+1})")
                await asyncio.sleep(delay)
            else:
                return _fallback_response(fighter.display_name, f"Groq {type(e).__name__}: {e}")

    return _fallback_response(fighter.display_name, "Groq max retries exceeded")


# ── Generic OpenAI-compatible provider (OpenRouter, Cerebras, Mistral, Together, etc.) ──

async def _call_openai_compat(fighter: Fighter, system_prompt: str, user_prompt: str, max_tokens: int | None = None) -> dict:
    """Generic handler for any OpenAI-compatible API.

    Reads 'api_key_env' and 'base_url' from the fighter's config entry.
    Works with OpenRouter, Cerebras, Mistral, Together AI, and any other
    provider that exposes an OpenAI-compatible /chat/completions endpoint.
    """
    import openai
    from config import CONFIG

    fighter_cfg = CONFIG["fighters"].get(fighter.name, {})
    key_env = fighter_cfg.get("api_key_env", "")
    base_url = fighter_cfg.get("base_url", "")
    extra_headers = fighter_cfg.get("extra_headers", {})

    if "openrouter.ai/api/v1" in base_url:
        api_key = _select_openrouter_api_key()
    elif "ollama.com/v1" in base_url:
        api_key = _select_ollama_api_key()
    else:
        api_key = os.environ.get(key_env, "") if key_env else ""
    if not api_key:
        raise PermissionError(f"{key_env} not set")
    if not base_url:
        raise PermissionError(f"No base_url configured for fighter '{fighter.name}'")

    provider_label = fighter_cfg.get("display_name", fighter.name)
    client = _build_openai_compat_client(api_key, base_url, extra_headers)
    timeout = _fighter_provider_setting(fighter, "api_timeout_seconds", _TIMEOUT)
    max_retries = _fighter_provider_setting(fighter, "max_retries", _MAX_RETRIES)
    rate_limit_wait = _fighter_provider_setting(fighter, "rate_limit_wait_seconds", _RATE_LIMIT_WAIT)
    max_tokens = max_tokens or _fighter_provider_setting(fighter, "response_max_tokens", _MAX_TOKENS)

    for attempt in range(max_retries):
        try:
            start = time.time()
            request_kwargs = {
                "model": fighter.model,
                "max_tokens": max_tokens,
                "temperature": fighter.temperature,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            }
            if "openrouter.ai/api/v1" in base_url:
                request_kwargs["response_format"] = {"type": "json_object"}
                request_kwargs["extra_body"] = {
                    "reasoning": {"exclude": True, "effort": "minimal"}
                }
            response = await _run_bucketed_request(
                fighter,
                lambda: asyncio.wait_for(
                    client.chat.completions.create(**request_kwargs),
                    timeout=timeout,
                ),
            )
            latency_ms = int((time.time() - start) * 1000)
            raw = _extract_chat_message_text(response.choices[0].message)
            return {"raw": raw, "latency_ms": latency_ms, "api_error": False}

        except openai.AuthenticationError as e:
            if "openrouter.ai/api/v1" in base_url:
                _mark_openrouter_api_key_invalid(api_key)
                if attempt < max_retries - 1 and _openrouter_api_keys():
                    logger.warning(f"[{provider_label}] OpenRouter key rejected, rotating to next key")
                    api_key = _select_openrouter_api_key()
                    client = _build_openai_compat_client(api_key, base_url, extra_headers)
                    continue
            elif "ollama.com/v1" in base_url:
                _mark_ollama_api_key_invalid(api_key)
                if attempt < max_retries - 1 and _ollama_api_keys():
                    logger.warning(f"[{provider_label}] Ollama key rejected, rotating to next key")
                    api_key = _select_ollama_api_key()
                    client = _build_openai_compat_client(api_key, base_url, extra_headers)
                    continue
            raise PermissionError(f"{provider_label} auth failed: {e}") from e
        except openai.RateLimitError as e:
            retry_after = getattr(e, "retry_after", None)
            wait = (retry_after if retry_after else rate_limit_wait * (attempt + 1)) + random.uniform(0, 2)
            if "openrouter.ai/api/v1" in base_url:
                _mark_openrouter_api_key_rate_limited(api_key, wait)
                available_keys = _openrouter_api_keys()
                if attempt < max_retries - 1 and available_keys:
                    logger.warning(f"[{provider_label}] Rate limited, rotating OpenRouter key (attempt {attempt+1})")
                    api_key = _select_openrouter_api_key()
                    client = _build_openai_compat_client(api_key, base_url, extra_headers)
                    continue
            elif "ollama.com/v1" in base_url:
                _mark_ollama_api_key_rate_limited(api_key, wait)
                available_keys = _ollama_api_keys()
                if attempt < max_retries - 1 and available_keys:
                    logger.warning(f"[{provider_label}] Rate limited, rotating Ollama key (attempt {attempt+1})")
                    api_key = _select_ollama_api_key()
                    client = _build_openai_compat_client(api_key, base_url, extra_headers)
                    continue
            logger.warning(f"[{provider_label}] Rate limited, waiting {wait:.1f}s (attempt {attempt+1})")
            await asyncio.sleep(wait)
        except (asyncio.TimeoutError, openai.APIError, Exception) as e:
            if attempt < max_retries - 1:
                delay = _BACKOFF_BASE ** (attempt + 1)
                logger.warning(f"[{provider_label}] {type(e).__name__}: {e}, retrying in {delay}s")
                await asyncio.sleep(delay)
            else:
                return _fallback_response(fighter.display_name, f"{provider_label} {type(e).__name__}: {e}")

    return _fallback_response(fighter.display_name, f"{provider_label} max retries exceeded")


# ── Public dispatcher ─────────────────────────────────────────────────────────

async def get_fighter_move(fighter: Fighter, system_prompt: str, user_prompt: str, max_tokens: int | None = None) -> dict:
    """Call the appropriate API for a fighter and return a raw response dict.

    Returns:
        {
            "raw": str,         # raw text from the API
            "latency_ms": int,
            "api_error": bool,
        }
    """
    providers = {
        "anthropic":     _call_claude,
        "openai":        _call_gpt,
        "gemini":        _call_gemini,
        "groq":          _call_groq,
        "openai_compat": _call_openai_compat,  # OpenRouter, Cerebras, Mistral, Together, etc.
        "random":        _call_random,
    }

    provider_fn = providers.get(fighter.provider)
    if provider_fn is None:
        logger.error(f"Unknown provider '{fighter.provider}' for {fighter.display_name}")
        return _fallback_response(fighter.display_name, f"unknown provider: {fighter.provider}")

    try:
        return await provider_fn(fighter, system_prompt, user_prompt, max_tokens=max_tokens)
    except PermissionError as e:
        # Auth errors bubble up — abort the fight
        raise
    except Exception as e:
        return _fallback_response(fighter.display_name, str(e))


async def get_fighter_build(fighter: Fighter, system_prompt: str, user_prompt: str) -> dict:
    """Pre-fight build call — uses build_response_max_tokens to avoid JSON truncation.

    Returns:
        {"raw": str, "latency_ms": int, "api_error": bool}
    """
    build_tokens = CONFIG.get("build_response_max_tokens", 256)
    return await get_fighter_move(fighter, system_prompt, user_prompt, max_tokens=build_tokens)
