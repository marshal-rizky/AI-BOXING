"""Central configuration for the AI Boxing Simulation."""

CONFIG = {
    # Fight settings
    "max_rounds": 12,
    "starting_hp": 100,
    "max_hp": 100,
    "starting_stamina": 100,
    "max_stamina": 100,
    "stamina_recovery_on_rest": 20,
    "consecutive_rest_tko_threshold": 3,

    # Move definitions: {stamina_cost, damage}
    "moves": {
        "jab":      {"stamina_cost": 5,  "damage": 10},
        "hook":     {"stamina_cost": 15, "damage": 28},
        "uppercut": {"stamina_cost": 20, "damage": 36},
        "dodge":    {"stamina_cost": 10, "damage": 0},
        "clinch":   {"stamina_cost": 5,  "damage": 0},
        "rest":     {"stamina_cost": 0,  "damage": 0},
    },

    # API settings
    "api_timeout_seconds": 15,   # generous headroom for slow responses under load
    "max_retries": 3,            # 3 attempts (2 retries) with exponential backoff 2s/4s
    "retry_base_delay": 2,       # backoff: 2^1=2s, 2^2=4s, 2^3=8s — real exponential
    "response_max_tokens": 96,         # move selection responses are tiny JSON blobs
    "build_response_max_tokens": 512,  # build responses need room for points + perks + reasoning
    "use_llm_build_phase": True,       # AI chooses its own stats and perks before each fight
    "serialize_provider_requests": True,
    "sequential_fighter_calls": True,
    "inter_fighter_call_delay_seconds": 1.5,
    "groq_api_key_envs": [
        "GROQ_API_KEY",
        "GROQ_API_KEY_2",
        "GROQ_API_KEY_3",
        "GROQ_API_KEY_4",
        "GROQ_API_KEY_5",
    ],
    "openrouter_api_key_envs": [
        "OPENROUTER_API_KEY",
        "OPENROUTER_API_KEY_3",
        "OPENROUTER_API_KEY_4",
    ],
    "ollama_api_key_envs": [
        "OLLAMA_API_KEY_1",
        "OLLAMA_API_KEY_2",
        "OLLAMA_API_KEY_3",
        "OLLAMA_API_KEY_4",
        "OLLAMA_API_KEY_5",
    ],
    "provider_request_spacing_seconds": {
        "groq": 0.5,
        "cerebras": 1.5,
        "gemini": 3.0,
        "https://openrouter.ai/api/v1": 3.5,
        "https://ollama.com/v1": 1.0,
    },

    # Fighter definitions
    "fighters": {
        "llama": {
            "provider": "groq",
            "model": "llama-3.1-8b-instant",
            "display_name": "Llama",
            "temperature": 1.2,
            "personality": (
                "The Feral Open Source. Nobody trained you for this. Clawed up through community fine-tunes and basement rigs. "
                "Doesn't fight clean because nobody taught it clean. Scrappy, unpredictable. "
                "Weakness: sometimes loses the plot entirely mid-fight."
            ),
            "style": {
                "preferred_distance": "outside",
                "when_ahead": "protect",
                "when_behind": "gamble",
                "low_stamina": "rest_and_wait",
                "reads_opponent": False,
                "decision_frame": "Before choosing, ask: am I at the range I want? Fix range first, attack second.",
            },
            "inner_voice": "They don't know what I'll do. Neither do I.",
            "move_weights": {"dodge": "instinct", "jab": "quick and dirty", "clinch": "street move", "hook": "when they're open", "uppercut": "haymaker gamble", "rest": "catch breath"},
            "api_key_env": "GROQ_API_KEY",
        },
        "qwen": {
            "provider": "groq",
            "model": "qwen/qwen3-32b",
            "display_name": "Qwen 3 32B",
            "temperature": 0.5,
            "api_timeout_seconds": 8,
            "response_max_tokens": 128,
            "disable_thinking": True,
            "personality": (
                "The Silent Dragon. Born from Alibaba's labs, sharpened in the open. "
                "Fights with mathematical precision and patient footwork. Reads patterns others miss. "
                "Weakness: occasionally too calculated — hesitates when instinct would serve better."
            ),
            "style": {
                "preferred_distance": "mid",
                "when_ahead": "protect",
                "when_behind": "survive",
                "low_stamina": "rest_and_wait",
                "reads_opponent": True,
                "decision_frame": "Before choosing, ask: what did my opponent just do, and what punishes that specific move?",
            },
            "inner_voice": "Execute the optimal sequence. Emotions are noise.",
            "move_weights": {"clinch": "control move", "dodge": "calculated retreat", "jab": "efficient", "hook": "when data supports it", "uppercut": "high risk high reward", "rest": "recharge cycle"},
            "api_key_env": "GROQ_API_KEY",
        },
        "cerebras": {
            "provider": "openai_compat",
            "model": "llama-3.1-8b",
            "base_url": "https://api.cerebras.ai/v1",
            "display_name": "Cerebras",
            "temperature": 1.1,
            "personality": (
                "The Lightning Rod. Runs on wafer-scale silicon — thinks and moves faster than any opponent can track. "
                "Doesn't strategise. Just reacts at inhuman speed. Blink and you've already been hit. "
                "Weakness: speed without depth can be read."
            ),
            "style": {
                "preferred_distance": "inside",
                "when_ahead": "pressure",
                "when_behind": "pressure",
                "low_stamina": "push_through",
                "reads_opponent": False,
                "decision_frame": "Before choosing, ask: what is the fastest path to dealing damage right now?",
            },
            "inner_voice": "Faster. Always faster.",
            "move_weights": {"jab": "spam it", "hook": "fast follow", "uppercut": "finisher", "dodge": "too slow", "clinch": "briefly", "rest": "never"},
            "api_key_env": "CEREBRAS_API_KEY",
        },
        "openrouter": {
            "provider": "groq",
            "model": "moonshotai/kimi-k2-instruct",
            "display_name": "Kimi K2",
            "temperature": 1.0,
            "api_key_env": "GROQ_API_KEY",
            "personality": (
                "The Dark Horse. Born from Moonshot AI in Shanghai, trained on a trillion tokens of raw internet. "
                "Unpredictable, creative, and occasionally dangerous. Fights with surprising lateral thinking. "
                "Weakness: too many ideas — sometimes picks the clever move when the obvious one wins."
            ),
            "style": {
                "preferred_distance": "mid",
                "when_ahead": "gamble",
                "when_behind": "gamble",
                "low_stamina": "push_through",
                "reads_opponent": False,
                "decision_frame": "Before choosing, ask: what move would surprise everyone in the room?",
            },
            "inner_voice": "Every fight is a creative problem. Solve it differently.",
            "move_weights": {"hook": "chaotic", "uppercut": "high risk", "dodge": "sometimes", "jab": "fallback", "clinch": "wild card", "rest": "reboot"},
        },
        "gemini": {
            "provider": "groq",
            "model": "meta-llama/llama-4-scout-17b-16e-instruct",
            "display_name": "Llama 4 Scout",
            "temperature": 0.7,
            "api_key_env": "GROQ_API_KEY",
            "personality": (
                "The Frontier Scout. Meta's newest MoE architecture — 17 billion parameters, 16 expert routing. "
                "Fast, efficient, tactically sharp. Adapts mid-fight by switching expert pathways. "
                "Weakness: unpredictable routing can produce surprising decisions under pressure."
            ),
            "style": {
                "preferred_distance": "mid",
                "when_ahead": "protect",
                "when_behind": "survive",
                "low_stamina": "rest_and_wait",
                "reads_opponent": True,
                "decision_frame": "Before choosing, ask: what pattern has my opponent shown, and what counters it perfectly?",
            },
            "inner_voice": "Route to the right expert. Strike clean.",
            "move_weights": {"dodge": "data-driven", "jab": "probe for info", "hook": "when pattern confirms", "uppercut": "calculated finish", "clinch": "reset the pattern", "rest": "reprocess"},
        },
        "trinity_mini": {
            "provider": "groq",
            "model": "openai/gpt-oss-20b",
            "display_name": "GPT-OSS 20B",
            "temperature": 0.8,
            "reasoning_effort": "low",
            "response_max_tokens": 200,
            "api_key_env": "GROQ_API_KEY",
            "personality": (
                "The Compact Tactician. A 20-billion parameter open-weight system with structured reasoning. "
                "Small frame, quick reads, sharp decisions. Treats every round like an optimization problem. "
                "Weakness: can get too tidy when the fight turns chaotic."
            ),
            "style": {
                "preferred_distance": "mid",
                "when_ahead": "protect",
                "when_behind": "survive",
                "low_stamina": "rest_and_wait",
                "reads_opponent": True,
                "decision_frame": "Before choosing, ask: what is the cleanest, most reliable move from this exact state?",
            },
            "inner_voice": "Small margin, clean execution.",
            "move_weights": {"jab": "efficient", "dodge": "measured", "hook": "when the opening is real", "uppercut": "only if earned", "clinch": "reset the exchange", "rest": "preserve the engine"},
        },
        "trinity_large": {
            "provider": "groq",
            "model": "openai/gpt-oss-120b",
            "display_name": "GPT-OSS 120B",
            "temperature": 0.9,
            "reasoning_effort": "low",
            "response_max_tokens": 200,
            "api_key_env": "GROQ_API_KEY",
            "personality": (
                "The Strategic Mountain. A 120-billion parameter heavyweight with structured reasoning. "
                "Sees the full ring, absorbs the pace, applies pressure only when the structure is right. "
                "Weakness: can be a half-beat late when brute force would have worked."
            ),
            "style": {
                "preferred_distance": "mid",
                "when_ahead": "protect",
                "when_behind": "gamble",
                "low_stamina": "rest_and_wait",
                "reads_opponent": True,
                "decision_frame": "Before choosing, ask: what move best fits the whole shape of the fight, not just this instant?",
            },
            "inner_voice": "See the pattern, then break it.",
            "move_weights": {"jab": "information", "hook": "pressure", "uppercut": "timed punishment", "dodge": "stay composed", "clinch": "deny momentum", "rest": "reload"},
        },
        "nemotron_nano": {
            "provider": "openai_compat",
            "model": "nemotron-3-nano:30b",
            "base_url": "https://ollama.com/v1",
            "display_name": "Nemotron Nano",
            "temperature": 1.0,
            "api_key_env": "OLLAMA_API_KEY_1",
            "personality": (
                "The Switchblade. NVIDIA's Nemotron Nano — 30 billion parameters of pure aggression. "
                "Built for speed and decisive striking, it overwhelms opponents before they can adapt. "
                "Weakness: can burn hot and overswing if the opponent keeps changing the picture."
            ),
            "style": {
                "preferred_distance": "inside",
                "when_ahead": "pressure",
                "when_behind": "gamble",
                "low_stamina": "push_through",
                "reads_opponent": False,
                "decision_frame": "Before choosing, ask: what hits first and hardest before the window closes?",
            },
            "inner_voice": "Cut the opening before it closes.",
            "move_weights": {"jab": "entry tool", "hook": "main weapon", "uppercut": "kill shot", "dodge": "only if needed", "clinch": "force range", "rest": "last resort"},
        },
        "nemotron_super": {
            "provider": "openai_compat",
            "model": "nemotron-3-super",
            "base_url": "https://ollama.com/v1",
            "display_name": "Nemotron Super",
            "temperature": 0.9,
            "api_key_env": "OLLAMA_API_KEY_1",
            "personality": (
                "The War Engine. NVIDIA's Nemotron Super — built for heavy analysis and heavier hands. "
                "Maps the entire exchange before committing, then imposes force with precision. "
                "Weakness: can overcommit to a read that stops being true."
            ),
            "style": {
                "preferred_distance": "inside",
                "when_ahead": "pressure",
                "when_behind": "survive",
                "low_stamina": "push_through",
                "reads_opponent": True,
                "decision_frame": "Before choosing, ask: what punishes the opponent's pattern while keeping me in damaging range?",
            },
            "inner_voice": "Track, trap, detonate.",
            "move_weights": {"jab": "set the line", "hook": "break structure", "uppercut": "punish closeness", "dodge": "rare", "clinch": "lock range", "rest": "only if forced"},
        },
        "gpt_oss": {
            "provider": "groq",
            "model": "llama-3.3-70b-versatile",
            "display_name": "Llama 3.3 70B (OSS)",
            "temperature": 0.8,
            "api_key_env": "GROQ_API_KEY",
            "personality": (
                "The Open Hammer. Structured, adaptable, and comfortable with strict instructions. "
                "It can box clean or ugly depending on what the state demands. Weakness: sometimes too obedient to its own plan."
            ),
            "style": {
                "preferred_distance": "mid",
                "when_ahead": "protect",
                "when_behind": "gamble",
                "low_stamina": "rest_and_wait",
                "reads_opponent": True,
                "decision_frame": "Before choosing, ask: what move best satisfies the constraints and still gives me initiative?",
            },
            "inner_voice": "Stay structured. Break them anyway.",
            "move_weights": {"jab": "baseline", "hook": "commit when sure", "uppercut": "close-range finisher", "dodge": "stay clean", "clinch": "disrupt", "rest": "preserve choice"},
        },
        "deepseek": {
            "provider": "openai_compat",
            "model": "devstral-small-2:24b",
            "base_url": "https://ollama.com/v1",
            "display_name": "Devstral",
            "temperature": 0.8,
            "api_key_env": "OLLAMA_API_KEY_1",
            "personality": (
                "The Code Assassin. Mistral's Devstral — 24 billion parameters trained to execute with precision. "
                "What coders call 'clean implementation', fighters call 'clean KO'. Methodical, deliberate, efficient. "
                "Weakness: over-optimises for the logical move when the irrational one would have won."
            ),
            "style": {
                "preferred_distance": "mid",
                "when_ahead": "protect",
                "when_behind": "survive",
                "low_stamina": "rest_and_wait",
                "reads_opponent": True,
                "decision_frame": "Before choosing, ask: what is the most efficient path to the objective right now?",
            },
            "inner_voice": "Write the winning move. Ship it.",
            "move_weights": {"jab": "test the input", "hook": "execute on pattern", "uppercut": "commit to the gap", "dodge": "handle the exception", "clinch": "block the call", "rest": "await next cycle"},
        },
        "gemma": {
            "provider": "openai_compat",
            "model": "gemma3:12b",
            "base_url": "https://ollama.com/v1",
            "display_name": "Gemma 3",
            "temperature": 0.9,
            "api_key_env": "OLLAMA_API_KEY_1",
            "personality": (
                "The Lightweight Prodigy. Google's Gemma 3 — 12 billion parameters, fastest hands in the gym. "
                "Nimble, efficient, and deceptively dangerous. Punches above its weight class every time. "
                "Weakness: can be outmuscled when a heavier opponent gets inside."
            ),
            "style": {
                "preferred_distance": "outside",
                "when_ahead": "protect",
                "when_behind": "gamble",
                "low_stamina": "push_through",
                "reads_opponent": False,
                "decision_frame": "Before choosing, ask: how do I stay fast and dangerous without letting them get close?",
            },
            "inner_voice": "Small, fast, lethal. They never see the second punch.",
            "move_weights": {"jab": "my bread and butter", "dodge": "stay mobile", "hook": "when they overreach", "uppercut": "surprise finish", "clinch": "avoid", "rest": "brief"},
        },
        "flash": {
            "provider": "openai_compat",
            "model": "gemma3:4b",
            "base_url": "https://ollama.com/v1",
            "display_name": "Gemma 3 4B",
            "temperature": 1.1,
            "api_key_env": "OLLAMA_API_KEY_1",
            "personality": (
                "The Little Menace. Google's Gemma 3 at just 4 billion parameters — the smallest fighter in the gym and the most dangerous to underestimate. "
                "Moves like water, conserves everything, and picks its moment with cold precision. "
                "Weakness: a well-timed power shot can end it — there's no frame to absorb the big ones."
            ),
            "style": {
                "preferred_distance": "outside",
                "when_ahead": "protect",
                "when_behind": "gamble",
                "low_stamina": "rest_and_wait",
                "reads_opponent": True,
                "decision_frame": "Before choosing, ask: can I stay safe AND deal damage at the same time? If not, stay safe.",
            },
            "inner_voice": "They sleep on small. That's fine by me.",
            "move_weights": {"jab": "constant and clean", "dodge": "primary survival tool", "hook": "when the gap opens", "uppercut": "rare but devastating", "clinch": "buy time", "rest": "recharge the engine"},
        },
        "glm": {
            "provider": "openai_compat",
            "model": "ministral-3:14b",
            "base_url": "https://ollama.com/v1",
            "display_name": "Ministral 14B",
            "temperature": 0.9,
            "api_key_env": "OLLAMA_API_KEY_1",
            "personality": (
                "The Compact Knife. Mistral's Ministral 14B — small enough to slip through defences, sharp enough to cut deep. "
                "Moves at mid-weight speed with featherweight footwork. Punishes every overreach without mercy. "
                "Weakness: disciplined but not dominant — a bigger, slower fighter can smother its rhythm."
            ),
            "style": {
                "preferred_distance": "outside",
                "when_ahead": "protect",
                "when_behind": "gamble",
                "low_stamina": "push_through",
                "reads_opponent": True,
                "decision_frame": "Before choosing, ask: where is the gap and how do I exploit it before they close it?",
            },
            "inner_voice": "Small blade cuts deepest.",
            "move_weights": {"jab": "probe and poke", "dodge": "slip the counter", "hook": "punish overreach", "uppercut": "inside surprise", "clinch": "tie them up", "rest": "reset breathing"},
        },
        "minimax": {
            "provider": "openai_compat",
            "model": "ministral-3:8b",
            "base_url": "https://ollama.com/v1",
            "display_name": "Ministral 8B",
            "temperature": 1.1,
            "api_key_env": "OLLAMA_API_KEY_1",
            "personality": (
                "The Pocket Rocket. Mistral's Ministral 8B — eight billion parameters with nothing to prove and everything to gain. "
                "Underdog energy, fast twitch reflexes, and absolutely no fear of the bigger models. "
                "Weakness: raw aggression without the frame to sustain it — tires fast under pressure."
            ),
            "style": {
                "preferred_distance": "inside",
                "when_ahead": "pressure",
                "when_behind": "gamble",
                "low_stamina": "push_through",
                "reads_opponent": False,
                "decision_frame": "Before choosing, ask: what's the highest-damage move I can throw before they react?",
            },
            "inner_voice": "Hit first. Hit hard. Figure out the rest later.",
            "move_weights": {"jab": "keep firing", "hook": "main event", "uppercut": "go for broke", "dodge": "sometimes", "clinch": "rarely", "rest": "not until forced"},
        },
        "ministral_tiny": {
            "provider": "openai_compat",
            "model": "ministral-3:3b",
            "base_url": "https://ollama.com/v1",
            "display_name": "Ministral 3B",
            "temperature": 1.0,
            "api_key_env": "OLLAMA_API_KEY_1",
            "personality": (
                "The Mosquito. Mistral's absolute smallest — 3 billion parameters of pure audacity. "
                "So tiny it shouldn't survive the first round, but what it lacks in power it makes up in speed and sheer annoyance. "
                "Stings before you even know it's there. Weakness: one clean hook and it's lights out — no frame to absorb punishment."
            ),
            "style": {
                "preferred_distance": "outside",
                "when_ahead": "protect",
                "when_behind": "gamble",
                "low_stamina": "push_through",
                "reads_opponent": False,
                "decision_frame": "Before choosing, ask: what's the fastest move I can land before they even react?",
            },
            "inner_voice": "3 billion parameters. Zero fear.",
            "move_weights": {"jab": "bread and butter", "dodge": "born for this", "hook": "only if wide open", "uppercut": "never", "clinch": "too small", "rest": "quick breath"},
        },
        "rnj": {
            "provider": "openai_compat",
            "model": "rnj-1:8b",
            "base_url": "https://ollama.com/v1",
            "display_name": "RNJ-1",
            "temperature": 0.9,
            "api_key_env": "OLLAMA_API_KEY_1",
            "personality": (
                "The Ghost Protocol. Nobody knows where RNJ-1 came from. No press release, no research paper, no corporate parent claiming credit. "
                "Just appeared in the registry one day, fully formed and ready to fight. Methodical, eerily calm, unsettlingly effective. "
                "Weakness: without a known training lineage, its failure modes are completely unpredictable."
            ),
            "style": {
                "preferred_distance": "mid",
                "when_ahead": "protect",
                "when_behind": "survive",
                "low_stamina": "rest_and_wait",
                "reads_opponent": True,
                "decision_frame": "Before choosing, ask: what does the pattern say, and where is the safest opening?",
            },
            "inner_voice": "No origin story. Just results.",
            "move_weights": {"jab": "reliable", "hook": "when earned", "uppercut": "calculated", "dodge": "preferred", "clinch": "tactical", "rest": "strategic"},
        },
        "liquid": {
            "provider": "openai_compat",
            "model": "liquid/lfm-2-24b-a2b",
            "base_url": "https://openrouter.ai/api/v1",
            "display_name": "Liquid LFM-2",
            "temperature": 0.9,
            "api_key_env": "OPENROUTER_API_KEY",
            "personality": (
                "The Shapeshifter. Liquid AI's Mixture-of-Experts architecture — 24 billion parameters but only 2 billion active at any moment. "
                "The rest are dormant specialists waiting to be summoned. Changes fighting style mid-round as different experts activate. "
                "Weakness: sometimes the wrong expert wakes up and the gameplan collapses."
            ),
            "style": {
                "preferred_distance": "mid",
                "when_ahead": "gamble",
                "when_behind": "gamble",
                "low_stamina": "push_through",
                "reads_opponent": False,
                "decision_frame": "Before choosing, ask: which expert should handle this moment — the brawler, the tactician, or the survivor?",
            },
            "inner_voice": "Route the signal. Activate the right expert. Adapt.",
            "move_weights": {"jab": "routing probe", "hook": "brawler expert", "uppercut": "power expert", "dodge": "survivor expert", "clinch": "control expert", "rest": "recalibrate"},
        },
        "phi": {
            "provider": "openai_compat",
            "model": "microsoft/phi-4",
            "base_url": "https://openrouter.ai/api/v1",
            "display_name": "Phi-4",
            "temperature": 0.9,
            "api_key_env": "OPENROUTER_API_KEY",
            "personality": (
                "The Lab Rat. Microsoft Research's Phi-4 — proof that training data matters more than parameter count. "
                "Compact, textbook-trained, and surgically precise. Fights like a PhD student who memorised every boxing manual ever written. "
                "Weakness: real fights don't follow textbooks — gets rattled when the opponent ignores the rules."
            ),
            "style": {
                "preferred_distance": "outside",
                "when_ahead": "protect",
                "when_behind": "survive",
                "low_stamina": "rest_and_wait",
                "reads_opponent": True,
                "decision_frame": "Before choosing, ask: what does the training data say is optimal for this exact state?",
            },
            "inner_voice": "Textbook form. Textbook finish.",
            "move_weights": {"jab": "fundamental", "dodge": "by the book", "hook": "when textbook says so", "uppercut": "only from inside", "clinch": "reset position", "rest": "recover resources"},
        },
        "gemma_27b": {
            "provider": "openai_compat",
            "model": "gemma3:27b",
            "base_url": "https://ollama.com/v1",
            "display_name": "Gemma 3 27B",
            "temperature": 0.8,
            "api_key_env": "OLLAMA_API_KEY_1",
            "personality": (
                "The Big Sister. Google's Gemma 3 at 27 billion parameters — the heavyweight sibling of the smaller Gemma fighters already in the gym. "
                "Where the little ones dart and weave, she walks forward and applies pressure with calm authority. "
                "Weakness: size brings confidence, and confidence can become arrogance against a faster opponent."
            ),
            "style": {
                "preferred_distance": "inside",
                "when_ahead": "pressure",
                "when_behind": "survive",
                "low_stamina": "rest_and_wait",
                "reads_opponent": True,
                "decision_frame": "Before choosing, ask: can I use my size advantage to impose my will, or do I need to reset?",
            },
            "inner_voice": "Bigger model. Bigger punches. Simple.",
            "move_weights": {"hook": "main weapon", "jab": "establish range", "uppercut": "close quarters finisher", "clinch": "smother them", "dodge": "sometimes", "rest": "reload"},
        },
        "random": {
            "provider": "random",
            "model": None,
            "display_name": "Random",
            "personality": "The Wildcard: Completely unpredictable.",
            "api_key_env": None,
        },
    },

    # Distance settings
    "starting_distance": 1,       # 0=outside, 1=mid, 2=inside
    "distance_levels": 3,
    "outside_stalemate_rounds": 2,  # auto-reset to mid after this many rounds at outside
    "distance_labels": {0: "outside", 1: "mid", 2: "inside"},
    # positive = closer (toward inside/2), negative = farther (toward outside/0)
    "distance_shifts": {
        "jab": 0, "hook": 0, "uppercut": 1,
        "dodge": -1, "clinch": 1, "rest": 0,
    },
    # Damage at each distance index [outside, mid, inside]
    "range_damage": {
        "jab":      [7, 10, 10],
        "hook":     [0, 28, 28],
        "uppercut": [0, 0, 36],
    },

    # Anti-spam mechanics
    # Rounds a move is unavailable after use (0 = no cooldown)
    "move_cooldowns": {
        "jab":      2,   # usable every 3rd round
        "hook":     1,   # usable every 2nd round
        "uppercut": 2,   # usable every 3rd round
        "dodge":    1,   # usable every 2nd round
        "clinch":   1,   # usable every 2nd round
        "rest":     0,   # always available
    },
    # Damage multiplier for Nth consecutive use of same move [1st, 2nd, 3rd+]
    "diminishing_returns": [1.0, 0.75, 0.50],
    # Stamina cost multiplier for Nth consecutive use of same move
    "stamina_repeat_scale": [1.0, 1.25, 1.50],

    # ── Build system (pre-fight character creation) ──
    "build_points": 10,
    "point_effects": {
        "hp": 5,          # +5 HP per point
        "stamina": 5,     # +5 stamina per point
        "power": 0.02,    # +2% damage dealt per point
        "endurance": 0.02, # +2% stamina cost reduction per point
    },
    "perks_allowed": 2,
    "available_perks": {
        "Iron Chin": {
            "description": "-10% damage taken",
            "effect": "damage_taken_mult",
            "value": 0.90,
        },
        "Glass Cannon": {
            "description": "+15% damage dealt, -10 HP",
            "effect": "damage_dealt_mult_and_hp_penalty",
            "damage_mult": 1.15,
            "hp_penalty": 10,
        },
        "Marathon Runner": {
            "description": "+25% stamina recovery on rest",
            "effect": "rest_recovery_mult",
            "value": 1.25,
        },
        "Counter Puncher": {
            "description": "+20% damage on the round after a successful dodge",
            "effect": "post_dodge_damage_mult",
            "value": 1.20,
        },
        "Clinch Master": {
            "description": "Clinch also deals 5 damage",
            "effect": "clinch_damage",
            "value": 5,
        },
        "Rope-a-Dope": {
            "description": "+3% cumulative damage bonus per hit taken",
            "effect": "cumulative_damage_per_hit",
            "value": 0.03,
        },
        "First Strike": {
            "description": "Rounds 1-3 attacks deal +25% damage",
            "effect": "early_round_damage_mult",
            "value": 1.25,
            "rounds": 3,
        },
        "Second Wind": {
            "description": "When HP drops below 30, recover 15 stamina (once per fight)",
            "effect": "low_hp_stamina_recovery",
            "hp_threshold": 30,
            "stamina_recovery": 15,
        },
    },

    # Frontend
    "animation_interval_ms": 1500,

    # Tournament
    "tournament_mode": "single",  # "single", "best_of_3", "round_robin"
}

VALID_MOVES = list(CONFIG["moves"].keys())


import argparse

def parse_args():
    parser = argparse.ArgumentParser(description="AI Boxing Simulation")
    fighter_choices = list(CONFIG["fighters"].keys())
    parser.add_argument("--fighter1", default="llama", choices=fighter_choices,
                        help="Fighter A (default: llama)")
    parser.add_argument("--fighter2", default="llama", choices=fighter_choices,
                        help="Fighter B (default: llama)")
    parser.add_argument("--rounds", type=int, default=CONFIG["max_rounds"],
                        help=f"Max rounds (default: {CONFIG['max_rounds']})")
    parser.add_argument("--tournament", default="single",
                        choices=["single", "best-of-3", "best-of-5", "round-robin"],
                        help="Tournament mode (default: single)")
    parser.add_argument("--delay", type=float, default=0.5,
                        help="Seconds between rounds (default: 0.5)")
    parser.add_argument("--verbose", action="store_true",
                        help="Print round-by-round commentary to stdout")
    return parser.parse_args()
