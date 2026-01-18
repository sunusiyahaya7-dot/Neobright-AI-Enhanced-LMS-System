import requests
from flask import current_app

class MoodleService:
    @staticmethod
    def _build_url(wsfunction: str) -> str:
        """
        Build full Moodle REST URL for a given function.
        """
        base_url = current_app.config["MOODLE_BASE_URL"].rstrip("/")
        token = current_app.config["MOODLE_TOKEN"]

        if not token:
            raise ValueError("MOODLE_TOKEN is not set in environment")

        return (
            f"{base_url}/webservice/rest/server.php"
            f"?wstoken={token}"
            f"&wsfunction={wsfunction}"
            f"&moodlewsrestformat=json"
        )

    @staticmethod
    def get_courses():
        """
        Call Moodle core_course_get_courses and return parsed JSON.
        """
        url = MoodleService._build_url("core_course_get_courses")

        response = requests.get(url, timeout=10)
        response.raise_for_status()  # raises if HTTP error

        data = response.json()

        # If Moodle returns an 'exception', handle it
        if isinstance(data, dict) and "exception" in data:
            raise RuntimeError(
                f"Moodle error: {data.get('exception')} - {data.get('message')}"
            )

        return data
    
    @staticmethod
    def get_course_contents(course_id: int):
        """
        Fetch topics/sections and resources for a course.
        """
        url = MoodleService._build_url("core_course_get_contents")
        params = {
            "courseid": course_id
        }

        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()

        data = response.json()

        if isinstance(data, dict) and "exception" in data:
            raise RuntimeError(
                f"Moodle error: {data.get('exception')} - {data.get('message')}"
            )

        return data

