"""Authenticated owner-only paper API and always-on worker (NOT Vercel cron).

TLS termination, persistent disk, secrets, and licensed market feed must be configured
before running on a public cloud origin. No broker or capital-trading routes exist.
"""

from __future__ import annotations

import hmac
import json
import logging
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlsplit

from atlas.cloud_paper.engine import CloudPaperEngine, OrderError

logger = logging.getLogger("atlas.cloud_paper")


def serve() -> None:
    api_token = os.environ.get("ATLAS_PAPER_OWNER_TOKEN", "")
    quote_token = os.environ.get("ATLAS_PAPER_FEED_TOKEN", "")
    db_path = os.environ.get("ATLAS_PAPER_DB_PATH", "")
    if len(api_token) < 32 or len(quote_token) < 32 or hmac.compare_digest(api_token, quote_token):
        raise RuntimeError("Two distinct owner/feed tokens (>=32 characters) are required")
    allowed_origin = os.environ.get("ATLAS_PAPER_ALLOWED_ORIGIN", "")
    host = os.environ.get("ATLAS_PAPER_HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8787"))
    if host not in ("localhost", "127.0.0.1") and not allowed_origin.startswith("https://"):
        raise RuntimeError("Public binding requires a specific https:// allowed origin")
    engine = CloudPaperEngine(db_path)
    stop = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def _cors(self) -> None:
            if allowed_origin and self.headers.get("Origin") == allowed_origin:
                self.send_header("Access-Control-Allow-Origin", allowed_origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Headers", "Authorization,Content-Type")
                self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")

        def _response(self, status: int, body: dict[str, Any]) -> None:
            raw = json.dumps(body, separators=(",", ":")).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self._cors()
            self.end_headers()
            self.wfile.write(raw)

        def _authorized(self, token: str) -> bool:
            sent = self.headers.get("Authorization", "")
            return hmac.compare_digest(sent, "Bearer " + token)

        def _origin_accepted(self) -> bool:
            origin = self.headers.get("Origin")
            return not origin or bool(allowed_origin and origin == allowed_origin)

        def do_OPTIONS(self) -> None:
            if not self._origin_accepted():
                return self._response(403, {"error": "origin rejected"})
            self._response(204, {})

        def do_GET(self) -> None:
            path = urlsplit(self.path).path
            if path == "/healthz":
                return self._response(200, {"service": "atlas-paper", "mode": "PAPER_ONLY"})
            if path != "/api/cloud-paper/state":
                return self._response(404, {"error": "not found"})
            if not self._origin_accepted() or not self._authorized(api_token):
                return self._response(401, {"error": "unauthorized"})
            self._response(200, engine.overview())

        def do_POST(self) -> None:
            path = urlsplit(self.path).path
            supported = {
                "/api/cloud-paper/orders",
                "/api/cloud-paper/cancel",
                "/api/cloud-paper/strategy",
                "/api/cloud-paper/quotes",
            }
            if path not in supported:
                return self._response(404, {"error": "not found"})
            token = quote_token if path.endswith("/quotes") else api_token
            if not self._origin_accepted() or not self._authorized(token):
                return self._response(401, {"error": "unauthorized"})
            if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
                return self._response(415, {"error": "JSON body required"})
            try:
                n = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self._response(400, {"error": "invalid length"})
            if n <= 0 or n > 2000000:
                return self._response(413, {"error": "invalid body length"})
            try:
                body = json.loads(self.rfile.read(n))
                if not isinstance(body, dict):
                    raise OrderError("JSON object required")
                if path.endswith("/orders"):
                    result = engine.schedule(body)
                elif path.endswith("/cancel"):
                    result = engine.cancel(body.get("id", ""))
                elif path.endswith("/strategy"):
                    if type(body.get("enabled")) is not bool:
                        raise OrderError("enabled must be boolean")
                    result = engine.set_strategy(body["enabled"])
                else:
                    result = engine.ingest(body)
                self._response(200, result)
            except (ValueError, OrderError, TypeError) as exc:
                self._response(400, {"error": str(exc)})
            except Exception:
                logger.exception("Unexpected paper API failure")
                self._response(503, {"error": "paper service temporarily unavailable"})

        def log_message(self, fmt: str, *args: Any) -> None:
            # Never log Authorization headers / secrets / POST bodies.
            logger.info("%s %s", self.address_string(), fmt % args)

    def worker() -> None:
        while not stop.is_set():
            try:
                engine.tick()
            except Exception:
                logger.exception("Paper worker tick failed; no broker orders possible")
            stop.wait(1.0)

    thread = threading.Thread(target=worker, daemon=True, name="atlas-paper-scheduler")
    thread.start()
    server = ThreadingHTTPServer((host, port), Handler)
    logger.info("Atlas paper worker listening on %s:%s", host, port)
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        stop.set()
        server.server_close()
        thread.join(timeout=3)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    serve()
