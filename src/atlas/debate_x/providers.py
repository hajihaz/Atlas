"""Explicitly opted-in, bounded HTTPS LLM providers. Never sends broker credentials."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

from .evidence import EvidenceError


class _RejectRedirect(urllib.request.HTTPRedirectHandler):
    """Prevent a model API origin from redirecting credential-bearing requests."""

    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> urllib.request.Request | None:
        raise EvidenceError("LLM API redirect blocked")


class APIModel:
    """Provider adapter; no retry, no tool use, no outbound call unless explicitly enabled."""

    def __init__(self, provider: str, model: str, api_key: str, *, timeout: float = 12.0):
        if provider not in {"openai", "anthropic"}:
            raise ValueError("unsupported LLM provider")
        if not model or len(model) > 100 or not api_key:
            raise ValueError("explicit model and API key required")
        if not 1 <= timeout <= 30:
            raise ValueError("timeout outside bounded range")
        self.provider, self.model, self.api_key, self.timeout = provider, model, api_key, timeout

    @classmethod
    def from_environment(cls) -> APIModel:
        if os.getenv("ATLAS_DEBATE_ENABLED") != "1":
            raise EvidenceError("Debate X is disabled; set ATLAS_DEBATE_ENABLED=1")
        provider = os.getenv("ATLAS_DEBATE_PROVIDER", "")
        model = os.getenv("ATLAS_DEBATE_MODEL", "")
        key_name = {"openai": "OPENAI_API_KEY", "anthropic": "ANTHROPIC_API_KEY"}.get(provider)
        if key_name is None:
            raise EvidenceError("set ATLAS_DEBATE_PROVIDER=openai or anthropic")
        key = os.getenv(key_name, "")
        if not key:
            raise EvidenceError(key_name + " missing; no external model calls made")
        return cls(provider, model, key)

    def complete(self, *, role: str, instructions: str, evidence_json: str) -> str:
        if role not in {"bull", "bear", "judge"}:
            raise ValueError("unrecognized role")
        if len(instructions) > 8000 or len(evidence_json) > 62000:
            raise ValueError("bounded message size exceeded")
        if self.provider == "openai":
            url = "https://api.openai.com/v1/chat/completions"
            body = {
                "model": self.model,
                "temperature": 0,
                "max_tokens": 1000,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": instructions},
                    {"role": "user", "content": evidence_json},
                ],
            }
            headers = {"Authorization": "Bearer " + self.api_key}
        else:
            url = "https://api.anthropic.com/v1/messages"
            body = {
                "model": self.model,
                "max_tokens": 1000,
                "temperature": 0,
                "system": instructions,
                "messages": [{"role": "user", "content": evidence_json}],
            }
            headers = {"x-api-key": self.api_key, "anthropic-version": "2023-06-01"}
        req = urllib.request.Request(  # noqa: S310 -- fixed HTTPS provider origin
            url,
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json", **headers},
            method="POST",
        )
        try:
            with urllib.request.build_opener(_RejectRedirect()).open(
                req, timeout=self.timeout
            ) as reply:
                if reply.status != 200:
                    raise EvidenceError("LLM HTTP status not successful")
                raw = reply.read(120000)
            result: dict[str, Any] = json.loads(raw)
            if self.provider == "openai":
                content = result["choices"][0]["message"]["content"]
            else:
                content = "".join(
                    block["text"] for block in result["content"] if block.get("type") == "text"
                )
            if not isinstance(content, str):
                raise EvidenceError("LLM content malformed")
            return content
        except (
            urllib.error.URLError,
            TimeoutError,
            json.JSONDecodeError,
            KeyError,
            IndexError,
            TypeError,
        ) as exc:
            # Never include exception text: HTTP errors can embed sensitive request details.
            raise EvidenceError("LLM request failed or malformed; no trade authorized") from exc
