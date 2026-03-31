"""
Phase 6 — Tracing, Logging & Observability for NeoBright agents.

Provides:
    NeoBrightTracingProcessor  — persists trace/span data to Firestore
    NeoBrightRunHooks          — structured Python logging for agent lifecycle
    setup_tracing()            — one-call bootstrap (registers the processor)

Trace data is stored in the ``ai_traces`` Firestore collection, with one
document per trace.  Each trace document contains a ``spans`` list with
every agent, tool, handoff and generation span that occurred during the run.

Usage (automatic — wired in ai_chat_service.py):
    from services.agents.tracing import setup_tracing, NeoBrightRunHooks
    setup_tracing()                     # call once at app startup
    hooks = NeoBrightRunHooks(user_id)  # per-request
    Runner.run_sync(agent, ..., run_hooks=hooks)
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from agents import RunHooks
from agents.run_context import RunContextWrapper, AgentHookContext
from agents.tracing import (
    TracingProcessor,
    Trace,
    Span,
    AgentSpanData,
    FunctionSpanData,
    GenerationSpanData,
    HandoffSpanData,
)

logger = logging.getLogger("neobright.tracing")

# Thread-local storage for associating user_id with the current trace.
_trace_local = threading.local()


def set_trace_user(user_id: str) -> None:
    """Call before Runner.run_sync/run_streamed to tag the trace with a user."""
    _trace_local.user_id = user_id


def _get_trace_user() -> str | None:
    return getattr(_trace_local, "user_id", None)


# ═══════════════════════════════════════════════════════════════
# 1.  TracingProcessor  →  Firestore persistence
# ═══════════════════════════════════════════════════════════════

class NeoBrightTracingProcessor(TracingProcessor):
    """
    Collects spans into per-trace buckets and writes them to Firestore
    when the trace ends.

    Each trace becomes one Firestore document in ``ai_traces``:
    {
        trace_id, name, started_at, ended_at, duration_ms,
        spans: [ { span_id, parent_id, type, name, started_at, ended_at,
                    duration_ms, error, data } , ... ]
    }
    """

    def __init__(self) -> None:
        self._traces: dict[str, dict] = {}   # trace_id → trace meta
        self._spans: dict[str, list] = {}     # trace_id → [span dicts]

    # ── trace lifecycle ──────────────────────────────────
    def on_trace_start(self, trace: Trace) -> None:
        tid = trace.trace_id
        self._traces[tid] = {
            "trace_id": tid,
            "name": trace.name or "agent_run",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "user_id": _get_trace_user() or "",
        }
        self._spans[tid] = []

    def on_trace_end(self, trace: Trace) -> None:
        tid = trace.trace_id
        meta = self._traces.pop(tid, None)
        spans = self._spans.pop(tid, [])
        if meta is None:
            return

        meta["ended_at"] = datetime.now(timezone.utc).isoformat()
        # Calculate duration
        try:
            start = datetime.fromisoformat(meta["started_at"])
            end = datetime.fromisoformat(meta["ended_at"])
            meta["duration_ms"] = round((end - start).total_seconds() * 1000)
        except Exception:
            meta["duration_ms"] = None

        meta["spans"] = spans
        meta["span_count"] = len(spans)

        # Persist to Firestore (best-effort, non-blocking)
        try:
            from services.firestore_service import FirestoreService
            fs = FirestoreService()
            fs.db.collection("ai_traces").document(tid).set(meta)
            logger.debug("Trace %s persisted (%d spans)", tid, len(spans))
        except Exception as exc:
            logger.warning("Failed to persist trace %s: %s", tid, exc)

    # ── span lifecycle ──────────────────────────────────
    def on_span_start(self, span: Span) -> None:
        pass  # we collect data on_span_end when all fields are populated

    def on_span_end(self, span: Span) -> None:
        tid = span.trace_id
        if tid not in self._spans:
            return

        data = span.span_data

        def _to_iso(val: Any) -> str | None:
            """Safely convert to ISO string whether val is datetime or str."""
            if val is None:
                return None
            return val.isoformat() if hasattr(val, "isoformat") else str(val)

        span_dict: dict[str, Any] = {
            "span_id": span.span_id,
            "parent_id": span.parent_id,
            "type": getattr(data, "type", "unknown"),
            "started_at": _to_iso(span.started_at),
            "ended_at": _to_iso(span.ended_at),
        }

        # Duration — handle both datetime and str timestamps
        try:
            if span.started_at and span.ended_at:
                s = span.started_at if hasattr(span.started_at, "timestamp") else datetime.fromisoformat(str(span.started_at))
                e = span.ended_at if hasattr(span.ended_at, "timestamp") else datetime.fromisoformat(str(span.ended_at))
                span_dict["duration_ms"] = round((e - s).total_seconds() * 1000)
        except Exception:
            pass  # skip duration if timestamps aren't parseable

        # Error
        if span.error:
            span_dict["error"] = {
                "message": span.error.message if hasattr(span.error, "message") else str(span.error),
            }

        # Type-specific data
        span_dict["data"] = self._extract_span_data(data)

        self._spans[tid].append(span_dict)

    # ── helpers ──────────────────────────────────────────

    @staticmethod
    def _extract_span_data(data: Any) -> dict:
        """Pull useful fields from typed SpanData subclasses."""
        out: dict[str, Any] = {}

        if isinstance(data, AgentSpanData):
            out["agent_name"] = data.name
            out["tools"] = data.tools or []
            out["handoffs"] = data.handoffs or []
            out["output_type"] = data.output_type

        elif isinstance(data, FunctionSpanData):
            out["function_name"] = data.name
            # Truncate large inputs/outputs for storage
            if data.input:
                out["input"] = str(data.input)[:500]
            if data.output:
                out["output"] = str(data.output)[:500]

        elif isinstance(data, GenerationSpanData):
            out["model"] = data.model
            if data.usage:
                usage = data.usage
                out["usage"] = {
                    "input_tokens": getattr(usage, "input_tokens", None),
                    "output_tokens": getattr(usage, "output_tokens", None),
                    "total_tokens": getattr(usage, "total_tokens", None),
                }
            if data.model_config:
                out["model_config"] = str(data.model_config)[:200]

        elif isinstance(data, HandoffSpanData):
            out["from_agent"] = data.from_agent
            out["to_agent"] = data.to_agent

        return out

    def force_flush(self) -> None:
        """Flush any remaining traces (best-effort)."""
        for tid in list(self._traces.keys()):
            try:
                meta = self._traces.pop(tid, {})
                spans = self._spans.pop(tid, [])
                meta["ended_at"] = datetime.now(timezone.utc).isoformat()
                meta["spans"] = spans
                meta["span_count"] = len(spans)
                meta["flushed"] = True
                from services.firestore_service import FirestoreService
                FirestoreService().db.collection("ai_traces").document(tid).set(meta)
            except Exception:
                pass

    def shutdown(self) -> None:
        self.force_flush()


# ═══════════════════════════════════════════════════════════════
# 2.  RunHooks  →  structured Python logging
# ═══════════════════════════════════════════════════════════════

class NeoBrightRunHooks(RunHooks):
    """
    Logs every agent lifecycle event at INFO/DEBUG level.

    Instantiate per-request with the user_id so logs are correlated:
        hooks = NeoBrightRunHooks(user_id="abc123")
        Runner.run_sync(agent, ..., run_hooks=hooks)
    """

    def __init__(self, user_id: str = "") -> None:
        self.user_id = user_id
        self._timers: dict[str, float] = {}

    def _tag(self) -> str:
        return f"[user={self.user_id}]" if self.user_id else ""

    # ── agent ────────────────────────────────────────────
    async def on_agent_start(self, context, agent) -> None:
        self._timers[f"agent:{agent.name}"] = time.time()
        logger.info(
            "%s Agent started: %s (tools=%s, handoffs=%s)",
            self._tag(),
            agent.name,
            [t.name for t in (agent.tools or [])],
            [getattr(h, 'agent_name', None) or getattr(getattr(h, 'agent', h), 'name', str(h)) for h in (agent.handoffs or [])],
        )

    async def on_agent_end(self, context, agent, output) -> None:
        elapsed = time.time() - self._timers.pop(f"agent:{agent.name}", time.time())
        out_preview = str(output)[:120] if output else "(none)"
        logger.info(
            "%s Agent ended: %s (%.1fs) output=%s",
            self._tag(), agent.name, elapsed, out_preview,
        )

    # ── LLM ──────────────────────────────────────────────
    async def on_llm_start(self, context, agent, system_prompt, input_items) -> None:
        self._timers[f"llm:{agent.name}"] = time.time()
        logger.debug(
            "%s LLM call started: agent=%s, input_items=%d",
            self._tag(), agent.name, len(input_items),
        )

    async def on_llm_end(self, context, agent, response) -> None:
        elapsed = time.time() - self._timers.pop(f"llm:{agent.name}", time.time())
        usage_str = ""
        if hasattr(response, "usage") and response.usage:
            u = response.usage
            usage_str = f" tokens=({getattr(u, 'input_tokens', '?')}/{getattr(u, 'output_tokens', '?')})"
        logger.info(
            "%s LLM call ended: agent=%s (%.1fs)%s",
            self._tag(), agent.name, elapsed, usage_str,
        )

    # ── tools ────────────────────────────────────────────
    async def on_tool_start(self, context, agent, tool) -> None:
        self._timers[f"tool:{tool.name}"] = time.time()
        logger.info(
            "%s Tool started: %s (agent=%s)",
            self._tag(), tool.name, agent.name,
        )

    async def on_tool_end(self, context, agent, tool, result) -> None:
        elapsed = time.time() - self._timers.pop(f"tool:{tool.name}", time.time())
        result_preview = str(result)[:150] if result else "(none)"
        logger.info(
            "%s Tool ended: %s (%.2fs) result=%s",
            self._tag(), tool.name, elapsed, result_preview,
        )

    # ── handoffs ─────────────────────────────────────────
    async def on_handoff(self, context, from_agent, to_agent) -> None:
        logger.info(
            "%s Handoff: %s → %s",
            self._tag(), from_agent.name, to_agent.name,
        )


# ═══════════════════════════════════════════════════════════════
# 3.  Bootstrap helper
# ═══════════════════════════════════════════════════════════════

_processor: Optional[NeoBrightTracingProcessor] = None


def setup_tracing() -> None:
    """
    Register the NeoBright tracing processor with the Agents SDK.
    Safe to call multiple times — only registers once.
    """
    global _processor
    if _processor is not None:
        return

    from agents import add_trace_processor

    _processor = NeoBrightTracingProcessor()
    add_trace_processor(_processor)
    logger.info("NeoBright tracing processor registered")


def get_processor() -> Optional[NeoBrightTracingProcessor]:
    """Return the active processor (for testing/admin)."""
    return _processor
