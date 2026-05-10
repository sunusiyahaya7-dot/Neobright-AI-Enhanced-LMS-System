"""
Centralized OpenAI client factory for NeoBright LMS.

Provides a single shared OpenAI client instance to avoid
re-instantiation on every API call.  Thread-safe for Flask.

Usage:
    from services.openai_client import get_openai_client
    client = get_openai_client()       # uses current_app.config
    client = get_openai_client(api_key) # explicit key
"""
import logging

_client = None
_client_key = None

logger = logging.getLogger(__name__)


def get_openai_client(api_key: str | None = None):
    """
    Return a shared OpenAI client, creating one if needed.

    If called without an api_key inside a Flask request context,
    it reads OPENAI_API_KEY from current_app.config.

    Returns None (with a warning) when the key is missing or
    the openai package is not installed.
    """
    global _client, _client_key

    try:
        from openai import OpenAI
    except ImportError:
        logger.error("openai package is not installed")
        return None

    # Resolve the key
    if api_key is None:
        from flask import current_app
        api_key = current_app.config.get("OPENAI_API_KEY", "")

    if not api_key:
        logger.warning("OPENAI_API_KEY not set — AI features disabled")
        return None

    # Re-use the same client as long as the key hasn't changed
    if _client is not None and _client_key == api_key:
        return _client

    _client = OpenAI(api_key=api_key)
    _client_key = api_key
    logger.info("OpenAI client initialised")
    return _client
