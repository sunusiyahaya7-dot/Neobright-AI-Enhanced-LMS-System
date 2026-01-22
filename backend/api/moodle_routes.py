"""Moodle API Routes - Authenticated endpoints."""

from flask import Blueprint, jsonify, g, request
from services.moodle_service import MoodleService
from services.firestore_service import FirestoreService
from auth.firebase_auth import firebase_required

moodle_bp = Blueprint("moodle", __name__, url_prefix="/api/moodle")


@moodle_bp.route("/link", methods=["POST"])
@firebase_required
def link_moodle_account():
    """Link the logged-in NeoBright user to a Moodle account.

    Looks up a Moodle user by email/username and stores moodle_user_id in Firestore.

    Body:
      {"email": "student@uniten.edu.my"}
      or {"username": "student1"}
      If omitted, will try using the Firebase email (g.firebase_email).
    """
    body = request.get_json() or {}
    email = (body.get("email") or "").strip()
    username = (body.get("username") or "").strip()

    if not email and not username:
        email = (g.firebase_email or "").strip()

    if not email and not username:
        return jsonify({
            "success": False,
            "error": "Provide email or username (or ensure Firebase token includes email)"
        }), 400

    try:
        if email:
            matches = MoodleService.get_users_by_field("email", [email])
            lookup = {"field": "email", "value": email}
        else:
            matches = MoodleService.get_users_by_field("username", [username])
            lookup = {"field": "username", "value": username}

        if not isinstance(matches, list) or len(matches) == 0:
            return jsonify({
                "success": False,
                "error": "No Moodle user found",
                "lookup": lookup
            }), 404

        chosen = matches[0]
        moodle_user_id = chosen.get("id")
        if not moodle_user_id:
            return jsonify({
                "success": False,
                "error": "Moodle user lookup did not return an id",
                "lookup": lookup,
                "matches": matches
            }), 500

        fs = FirestoreService()
        fs.set_user_fields(g.firebase_uid, {
            "moodle_user_id": int(moodle_user_id),
            "moodle_email": chosen.get("email"),
            "moodle_username": chosen.get("username")
        })

        return jsonify({
            "success": True,
            "firebase_uid": g.firebase_uid,
            "linked": {
                "moodle_user_id": int(moodle_user_id),
                "moodle_email": chosen.get("email"),
                "moodle_username": chosen.get("username")
            },
            "lookup": lookup,
            "match_count": len(matches)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@moodle_bp.route("/my-courses", methods=["GET"])
@firebase_required
def my_courses():
    """Return only the Moodle courses for the logged-in NeoBright user.

    Correct approach: uses core_enrol_get_users_courses with the user's linked
    moodle_user_id stored in Firestore.
    """
    fs = FirestoreService()
    user_doc = fs.get_user(g.firebase_uid)

    moodle_user_id = None
    if user_doc:
        # Support both naming styles
        moodle_user_id = user_doc.get("moodle_user_id") or user_doc.get("moodleUserId")

    if not moodle_user_id:
        return jsonify({
            "success": False,
            "error": "Moodle account not linked",
            "hint": "Set users/{firebase_uid}.moodle_user_id to the numeric Moodle user id"
        }), 400

    try:
        courses = MoodleService.get_user_courses(int(moodle_user_id))
        cleaned = [
            {
                "id": c.get("id"),
                "shortname": c.get("shortname"),
                "fullname": c.get("fullname"),
                "visible": c.get("visible"),
                "summary": c.get("summary"),
            }
            for c in courses
        ]
        return jsonify({"success": True, "courses": cleaned, "count": len(cleaned)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@moodle_bp.route("/courses", methods=["GET"])
@firebase_required
def get_courses():
    """Retrieve courses - Firebase authenticated."""
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

@moodle_bp.route("/courses/<int:course_id>/contents", methods=["GET"])
@firebase_required
def get_course_contents(course_id):
    """Get course contents - Firebase authenticated."""
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
