"""Moodle API Routes - Endpoints for fetching course data from Moodle."""

from flask import Blueprint, jsonify
from services.moodle_service import MoodleService

moodle_bp = Blueprint("moodle", __name__, url_prefix="/api/moodle")

@moodle_bp.route("/courses", methods=["GET"])
def get_courses():
    """Retrieve list of courses from Moodle. Returns cleaned course data (id, shortname, fullname, visible)."""
    try:
        courses = MoodleService.get_courses()

        cleaned = [
            {
                "id": c.get("id"),
                "shortname": c.get("shortname"),
                "fullname": c.get("fullname"),
                "visible": c.get("visible"),
            }
            for c in courses
        ]

        return jsonify({"success": True, "data": cleaned})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
