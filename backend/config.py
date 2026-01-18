# Environment config
import os
from dotenv import load_dotenv

# Load .env file
load_dotenv()

class Config:
    MOODLE_BASE_URL = os.getenv("MOODLE_BASE_URL", "http://localhost:8080")
    MOODLE_TOKEN = os.getenv("MOODLE_TOKEN")
    DEBUG = os.getenv("FLASK_ENV") == "development"
    PORT = int(os.getenv("PORT", 5000))
