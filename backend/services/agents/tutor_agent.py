"""
NeoBright Tutor Agent — Phase 1 foundation.

Defines the primary student-facing chat agent using the
OpenAI Agents SDK.  The agent receives a fully-rendered
system prompt (student context, course content, formatting
rules) as *instructions* and produces a plain-text reply.

Future phases will layer on:
  Phase 2 — Tools  (Moodle lookups, grade queries)
  Phase 3 — Handoffs (quiz agent, insights agent)
  Phase 5 — Streaming
"""
from agents import Agent, ModelSettings


def create_tutor_agent(
    instructions: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.6,
    max_tokens: int = 2000,
) -> Agent:
    """
    Build a Tutor Agent for a single request.

    A new Agent is created per request because the *instructions*
    (system prompt) change with every conversation turn — they
    embed the student's live context, course content, etc.

    Args:
        instructions: Fully-rendered system prompt.
        model:        OpenAI model identifier.
        temperature:  Sampling temperature (0-1).
        max_tokens:   Maximum completion tokens.

    Returns:
        A ready-to-run ``Agent`` instance.
    """
    return Agent(
        name="NeoBright Tutor",
        instructions=instructions,
        model=model,
        model_settings=ModelSettings(
            temperature=temperature,
            max_tokens=max_tokens,
        ),
    )
