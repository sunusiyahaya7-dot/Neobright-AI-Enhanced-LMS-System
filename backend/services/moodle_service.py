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
    def get_user_courses(moodle_user_id: int):
        """Fetch only the courses a specific Moodle user is enrolled in.

        Uses Moodle core_enrol_get_users_courses.
        """
        url = MoodleService._build_url("core_enrol_get_users_courses")
        params = {"userid": moodle_user_id}

        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        if isinstance(data, dict) and "exception" in data:
            raise RuntimeError(
                f"Moodle error: {data.get('exception')} - {data.get('message')}"
            )

        return data

    @staticmethod
    def get_users_by_field(field: str, values: list[str]):
        """Lookup Moodle users by a specific field.

        Uses Moodle core_user_get_users_by_field.
        Common fields: "email", "username", "id".
        """
        url = MoodleService._build_url("core_user_get_users_by_field")

        # Moodle expects values[0], values[1], ...
        params = {"field": field}
        for idx, value in enumerate(values):
            params[f"values[{idx}]"] = value

        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

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

    @staticmethod
    def get_file_url(file_path: str) -> str:
        """Build secure Moodle file URL using server-side token."""
        base_url = current_app.config["MOODLE_BASE_URL"].rstrip("/")
        token = current_app.config["MOODLE_TOKEN"]
        
        if not token:
            raise ValueError("MOODLE_TOKEN is not set in environment")
         
        return f"{base_url}/webservice/pluginfile.php/{file_path}?token={token}"

    @staticmethod
    def fetch_file_stream(file_url: str):
        """Stream a file from Moodle without loading it fully into memory."""
        response = requests.get(file_url, stream=True, timeout=30)
        response.raise_for_status()

        return response