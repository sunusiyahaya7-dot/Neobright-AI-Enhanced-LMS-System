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
    
    # Backend URL for generating absolute file proxy links
    BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:5000")
