#!/usr/bin/env python3
"""Misty's local web server. Python 3 standard library only."""
import argparse
import json
import os
import re
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from prompts import blending_messages, refinement_messages, repair_messages

ROOT = Path(__file__).resolve().parent
BRIDGE_URL = os.environ.get("MISTY_BRIDGE_URL", "http://127.0.0.1:8787").rstrip("/")
MAX_REQUEST = 16 * 1024 * 1024


class RequestError(Exception):
    pass


def bridge_health():
    try:
        with urllib.request.urlopen(BRIDGE_URL + "/health", timeout=3) as response:
            health = json.load(response)
        return health
    except (OSError, ValueError) as error:
        return {"ok": False, "backend": None, "error": str(error)}


def require_codex():
    health = bridge_health()
    if not health.get("ok"):
        raise RequestError("The LLM bridge is unavailable. From the repository root run: python3 llm-bridge/bridge.py codex")
    if health.get("backend") != "codex":
        raise RequestError("Port 8787 is using another backend. Stop that bridge and start python3 llm-bridge/bridge.py codex, or set MISTY_BRIDGE_URL to a separate Codex bridge.")
    return health


def normalize_result(content):
    if not isinstance(content, str):
        raise RequestError("The model did not return text.")
    content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip())
    try:
        result = json.loads(content)
    except ValueError:
        try:
            result = json.loads(content[content.index("{"):content.rindex("}") + 1])
        except (ValueError, TypeError):
            raise RequestError("The model returned invalid JSON. Your existing design is safe; try Regenerate.") from None
    if not isinstance(result, dict) or not isinstance(result.get("updatedCode"), str) or not result["updatedCode"].strip():
        raise RequestError("The model returned no component code. Try again.")
    code = result["updatedCode"].strip()
    code = re.sub(r"^```(?:jsx|tsx|javascript|react)?\s*|\s*```$", "", code)
    result["updatedCode"] = code
    normalized = []
    groups = result.get("categorizedChanges", [])
    for index, group in enumerate(groups if isinstance(groups, list) else []):
        if not isinstance(group, dict):
            continue
        changes = []
        for change in group.get("changes", []) if isinstance(group.get("changes"), list) else []:
            if isinstance(change, dict):
                changes.append({"type": str(change.get("type", "style")), "before": str(change.get("before", "")), "after": str(change.get("after", ""))})
        normalized.append({"id": "change-" + str(index), "category": str(group.get("category", "Design change")), "changes": changes, "enabled": True})
    result["categorizedChanges"] = normalized
    result["designExplanation"] = str(result.get("designExplanation", ""))
    result["differences"] = str(result.get("differences", ""))
    return result


def call_model(messages):
    health = require_codex()
    payload = json.dumps({"model": "bridge", "messages": messages, "response_format": {"type": "json_object"}}).encode()
    request = urllib.request.Request(BRIDGE_URL + "/v1/chat/completions", payload, {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=310) as response:
            answer = json.load(response)
        content = answer["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as error:
        # Never echo arbitrary bridge output or headers (which may contain credentials).
        raise RequestError(f"The Codex bridge returned HTTP {error.code}. Check its terminal and retry.") from None
    except (OSError, ValueError, KeyError, IndexError, TypeError) as error:
        raise RequestError("The Codex bridge could not finish this request. Check its terminal and retry.") from error
    result = normalize_result(content)
    result["model"] = health.get("model", "bridge default")
    return result


def validate(data, action):
    if not isinstance(data, dict):
        raise RequestError("Expected a JSON object.")
    if not isinstance(data.get("code"), str) or not data["code"].strip():
        raise RequestError("Add source code first.")
    if len(data["code"]) > 200_000:
        raise RequestError("Keep a single-screen component under 200,000 characters.")
    if action == "blend":
        if not isinstance(data.get("image"), str) or not re.match(r"^data:image/(png|jpeg|webp);base64,", data["image"]):
            raise RequestError("Choose a PNG, JPEG, or WebP reference image.")
        if data.get("mode") not in ["global", "localized"]:
            raise RequestError("Unknown blend mode.")
        if data["mode"] == "localized":
            allowed = {"Color", "Layout", "Content", "Customize"}
            aspects = data.get("aspects", [])
            if not isinstance(aspects, list) or not aspects or not set(aspects).issubset(allowed):
                raise RequestError("Pick at least one blending aspect.")
            if "Customize" in aspects and not str(data.get("custom", "")).strip():
                raise RequestError("Describe the custom blending aspect.")
            if not data.get("target"):
                raise RequestError("Drop the reference onto a target element first.")
    if action == "refine" and (not isinstance(data.get("groups"), list) or not isinstance(data.get("originalCode"), str) or not isinstance(data.get("blendedCode"), str)):
        raise RequestError("This design has no semantic change history.")


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def send_json(self, status, payload):
        encoded = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        if self.path == "/api/health":
            health = bridge_health()
            self.send_json(200, {"ok": True, "bridge": health, "compatible": bool(health.get("ok") and health.get("backend") == "codex")})
        else:
            super().do_GET()

    def do_POST(self):
        action = self.path.removeprefix("/api/")
        if action not in ["blend", "refine", "repair"]:
            self.send_json(404, {"error": "Unknown endpoint"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_REQUEST:
                raise RequestError("Request is empty or too large (16 MB limit).")
            data = json.loads(self.rfile.read(length))
            validate(data, action)
            messages = {"blend": blending_messages, "refine": refinement_messages, "repair": repair_messages}[action](data)
            self.send_json(200, call_model(messages))
        except (ValueError, RequestError) as error:
            self.send_json(400, {"error": str(error)})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            self.send_json(500, {"error": "Unexpected server error. Existing designs are unchanged. Check the server terminal."})


def main():
    parser = argparse.ArgumentParser(description="Run the Misty web app")
    parser.add_argument("--port", type=int, default=5173)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    handler = partial(Handler, directory=str(ROOT / "static"))
    try:
        server = ThreadingHTTPServer((args.host, args.port), handler)
    except OSError as error:
        parser.exit(1, f"Could not bind port {args.port}: {error}. Try --port {args.port + 1}\n")
    print(f"Misty: http://{args.host}:{args.port}\nLLM bridge: {BRIDGE_URL} (Codex required)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
