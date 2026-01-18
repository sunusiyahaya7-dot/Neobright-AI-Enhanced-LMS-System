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


"""API route to get course contents."""

@moodle_bp.route("/course/<int:course_id>/contents", methods=["GET"])
def get_course_contents(course_id):
    """
    Return structured course contents (topics + resources).
    """
    try:
        contents = MoodleService.get_course_contents(course_id)

        structured = []

        for section in contents:
            section_data = {
                "section_id": section.get("id"),
                "section_name": section.get("name"),
                "summary": section.get("summary"),
                "modules": []
            }

            for module in section.get("modules", []):
                module_data = {
                    "id": module.get("id"),
                    "name": module.get("name"),
                    "modname": module.get("modname"),
                    "description": module.get("description"),
                    "files": []
                }

                for content in module.get("contents", []):
                    module_data["files"].append({
                        "filename": content.get("filename"),
                        "fileurl": content.get("fileurl"),
                        "mimetype": content.get("mimetype"),
                        "filesize": content.get("filesize")
                    })

                section_data["modules"].append(module_data)

            structured.append(section_data)

        return jsonify({"success": True, "data": structured})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
