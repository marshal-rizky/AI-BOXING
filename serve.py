"""
serve.py - HTTP server for the AI Boxing frontend.

Serves static/ as the web root. Also exposes:
  GET  /api/fighters - list available fighters
  POST /api/fight    - run a fight and return the full fight log JSON

Usage:
    python serve.py [--port 8080]
"""
import argparse
import asyncio
import json
import logging
import os
import sys
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# Add the project directory to sys.path so sim/config can be imported.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logger = logging.getLogger(__name__)
OUTPUT_DIR = Path("output/fights")
MAX_CUSTOM_ROUNDS = 999


def _load_dotenv(path=None):
    """Load a .env file into os.environ (simple parser, no deps)."""
    if path is None:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    os.environ[key.strip()] = val.strip()
    except FileNotFoundError:
        pass


class BoxingHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="static", **kwargs)

    def log_message(self, format, *args):
        # Only log errors (4xx/5xx).
        if args and len(args) > 1 and str(args[1]).startswith(("4", "5")):
            super().log_message(format, *args)

    def do_OPTIONS(self):
        self._cors(200)
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/fighters":
            try:
                from config import CONFIG

                data = {
                    key: {"display_name": value["display_name"], "provider": value["provider"]}
                    for key, value in CONFIG["fighters"].items()
                }
                self._json(data)
            except Exception as e:
                self._json({"error": str(e)}, 500)
            return

        if self.path == "/api/leaderboard":
            try:
                from db import get_leaderboard
                self._json(get_leaderboard())
            except Exception as e:
                logger.exception("Leaderboard error")
                self._json({"error": str(e)}, 500)
            return

        if self.path.startswith("/api/fighter/"):
            try:
                parts = self.path.split("/")
                fighter_id = parts[3] if len(parts) > 3 else ""
                if not fighter_id:
                    self._json({"error": "Missing fighter ID"}, 400)
                    return
                from db import get_fighter_profile
                profile = get_fighter_profile(fighter_id)
                if profile:
                    self._json(profile)
                else:
                    self._json({"error": "Fighter not found"}, 404)
            except Exception as e:
                logger.exception("Fighter profile error")
                self._json({"error": str(e)}, 500)
            return

        super().do_GET()

    def do_POST(self):
        if self.path == "/api/interview":
            try:
                length = int(self.headers.get("Content-Length", 0))
                fight_log = json.loads(self.rfile.read(length) or b"{}")
                from interview import run_interviews
                result = asyncio.run(run_interviews(fight_log))
                self._json(result)
            except Exception as e:
                logger.exception("Interview error")
                self._json({"error": str(e)}, 500)
            return

        if self.path != "/api/fight":
            self.send_error(404)
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
            fighter1 = body.get("fighter1", "llama")
            fighter2 = body.get("fighter2", "qwen")
            rounds = self._parse_rounds(body.get("rounds", 12))
            if body.get("ko_only", False):
                rounds = MAX_CUSTOM_ROUNDS

            from sim import run_fight

            log = asyncio.run(
                run_fight(
                    fighter1_key=fighter1,
                    fighter2_key=fighter2,
                    max_rounds=rounds,
                    round_delay=0,
                    verbose=False,
                )
            )
            log_dict = log.to_dict()
            self._save_fight_log(log_dict, log.metadata.fight_id)

            # Record to Supabase (fire-and-forget)
            try:
                from db import record_fight
                record_fight(log_dict)
            except Exception as e:
                logger.warning("Could not record fight to DB: %s", e)

            self._json(log_dict)
        except PermissionError as e:
            self._json({"error": str(e)}, 403)
        except ValueError as e:
            self._json({"error": str(e)}, 400)
        except Exception as e:
            logger.exception("Fight error")
            self._json({"error": str(e)}, 500)

    def _cors(self, status):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self._cors(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _save_fight_log(self, log_dict, fight_id):
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        named_path = OUTPUT_DIR / f"{fight_id}.json"
        latest_path = Path("static/fight_log.json")

        with open(named_path, "w", encoding="utf-8") as f:
            json.dump(log_dict, f, indent=2, ensure_ascii=False)

        with open(latest_path, "w", encoding="utf-8") as f:
            json.dump(log_dict, f, indent=2, ensure_ascii=False)

    @staticmethod
    def _parse_rounds(raw_rounds):
        try:
            rounds = int(raw_rounds)
        except (TypeError, ValueError) as exc:
            raise ValueError("Rounds must be a whole number.") from exc

        if rounds < 1 or rounds > MAX_CUSTOM_ROUNDS:
            raise ValueError(f"Rounds must be between 1 and {MAX_CUSTOM_ROUNDS}.")

        return rounds


def serve(port: int = 8080):
    from config import CONFIG

    _load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    # Seed fighters into Supabase on startup
    try:
        from db import seed_fighters
        seed_fighters(CONFIG)
    except Exception as e:
        logger.warning("Could not seed fighters to Supabase: %s", e)

    key_names = ["GROQ_API_KEY", "CEREBRAS_API_KEY", "GOOGLE_API_KEY"]
    key_names.extend(CONFIG.get("openrouter_api_key_envs", ["OPENROUTER_API_KEY"]))

    for key_name in key_names:
        val = os.environ.get(key_name, "")
        status = f"set ({len(val)} chars)" if val else "MISSING"
        logger.info("  %s: %s", key_name, status)

    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    host = "0.0.0.0" if os.environ.get("RAILWAY_ENVIRONMENT") else "localhost"
    server = ThreadingHTTPServer((host, port), BoxingHandler)
    url = f"http://localhost:{port}"
    print(f"AI Boxing server: {url} (binding {host})")
    print("GET  /api/fighters - list fighters")
    print("POST /api/fight    - run a fight")
    print("POST /api/interview - post-fight interview")
    print("Press Ctrl+C to stop.\n")
    if host == "localhost":
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Serve the AI Boxing frontend")
    parser.add_argument("--port", type=int, default=None, help="Port (default: 8080)")
    args = parser.parse_args()
    port = args.port or int(os.environ.get("PORT", 8080))
    serve(port)
