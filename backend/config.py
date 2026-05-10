# Environment config
import os
from dotenv import load_dotenv

# Load .env file
load_dotenv()

class Config:
    MOODLE_BASE_URL = os.getenv("MOODLE_BASE_URL", "http://localhost:8080")
    # Optional internal base URL for server-to-server calls (useful in Docker on Windows).
    # Example: public=http://localhost:8080, internal=http://host.docker.internal:8080
    MOODLE_INTERNAL_BASE_URL = os.getenv("MOODLE_INTERNAL_BASE_URL", MOODLE_BASE_URL)
    # Optional Host header override to match Moodle's configured wwwroot host.
    # Example: localhost:8080
    MOODLE_HOST_HEADER = os.getenv("MOODLE_HOST_HEADER", "")
    MOODLE_TOKEN = os.getenv("MOODLE_TOKEN")
    DEBUG = os.getenv("FLASK_ENV") == "development"
    PORT = int(os.getenv("PORT", 5000))

    # OpenAI API Configuration (Phase 1: AI Insights)
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    AI_MODEL = os.getenv("AI_MODEL", "gpt-4o-mini")
    AI_MAX_TOKENS = int(os.getenv("AI_MAX_TOKENS", 2000))
    AI_TEMPERATURE = float(os.getenv("AI_TEMPERATURE", 0.6))
    
    # Backend URL for generating absolute file proxy links
    BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:5000")
    
    @classmethod
    def validate_ai_config(cls):
        """Validate that AI configuration is set. Call in app factory."""
        if not cls.OPENAI_API_KEY:
            import logging
            logging.warning(
                "OPENAI_API_KEY not set! – AI features will be disabled. "
                "Set OPENAI_API_KEY in .env to enable AI insights."
            )
            return False
        return True
