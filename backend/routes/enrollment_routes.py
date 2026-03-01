"""
Enrollment routes for course enrollment and progress tracking.
Includes endpoints for creating enrollments and fetching user-specific courses
and course materials aligned with frontend expectations.
"""
from flask import Blueprint, request, jsonify, g
from auth.firebase_auth import firebase_required
from services.firestore_service import FirestoreService
from services.moodle_service import MoodleService
from models.firestore_models import Course as CourseModel

enrollment_bp = Blueprint("enrollment", __name__, url_prefix="/api")

@enrollment_bp.route("/enrollments", methods=["POST"])
@firebase_required
def create_enrollment():
    """Enroll user in a course."""
    body = request.get_json() or {}
    course_id = body.get("courseId")
    
    if not course_id:
        return jsonify({"error": "courseId is required"}), 400
    
    fs = FirestoreService()
    
    # Check if already enrolled
    existing = fs.get_enrollment(g.firebase_uid, course_id)
    if existing:
        return jsonify({"error": "Already enrolled in this course"}), 400
    
    # Create enrollment
    enrollment_id = fs.create_enrollment(g.firebase_uid, course_id)

    # Upsert course metadata into Firestore so user courses list resolves
    try:
        all_courses = MoodleService.get_courses()
        match = next((c for c in all_courses if c.get("id") == course_id), None)
        if match:
            course_model = CourseModel(
                moodle_course_id=match.get("id"),
                course_name=match.get("fullname") or "",
                short_name=match.get("shortname") or "",
                summary=match.get("summary"),
                instructor_ids=[],
                enrolled_student_ids=[g.firebase_uid]
            )
        else:
            # Fallback minimal course metadata so UI can render even if Moodle list isn't available
            course_model = CourseModel(
                moodle_course_id=course_id,
                course_name=f"Course {course_id}",
                short_name=str(course_id),
                summary="",
                instructor_ids=[],
                enrolled_student_ids=[g.firebase_uid]
            )
        fs.create_or_update_course(course_model)
    except Exception:
        # Non-critical: create minimal record on any error
        course_model = CourseModel(
            moodle_course_id=course_id,
            course_name=f"Course {course_id}",
            short_name=str(course_id),
            summary="",
            instructor_ids=[],
            enrolled_student_ids=[g.firebase_uid]
        )
        fs.create_or_update_course(course_model)

    return jsonify({
        "success": True,
        "enrollmentId": enrollment_id,
        "message": "Successfully enrolled in course"
    }), 201

@enrollment_bp.route("/enrollments", methods=["GET"])
@firebase_required
def get_enrollments():
    """Get all user enrollments."""
    fs = FirestoreService()
    enrollments = fs.get_user_enrollments(g.firebase_uid)
    
    return jsonify({
        "success": True,
        "enrollments": enrollments,
        "count": len(enrollments)
    })

@enrollment_bp.route("/enrollments/<enrollment_id>/progress", methods=["PUT"])
@firebase_required
def update_progress(enrollment_id):
    """Update enrollment progress."""
    body = request.get_json() or {}
    progress = body.get("progress", 0)
    completed_section = body.get("completedSection")
    
    fs = FirestoreService()
    fs.update_enrollment_progress(enrollment_id, progress, completed_section)
    
    return jsonify({
        "success": True,
        "message": "Progress updated"
    })

@enrollment_bp.route("/courses/<int:course_id>/enrollment", methods=["GET"])
@firebase_required
def get_course_enrollment(course_id):
    """Get user's enrollment for specific course."""
    fs = FirestoreService()
    enrollment = fs.get_enrollment(g.firebase_uid, course_id)
    
    if not enrollment:
        return jsonify({"enrolled": False}), 200
    
    return jsonify({
        "enrolled": True,
        "enrollment": enrollment
    })

# ==================== USER COURSES (for frontend) ====================

@enrollment_bp.route("/enrollment/courses", methods=["GET"])
@firebase_required
def get_user_courses():
    """Return courses the current user is enrolled in (from Firestore).

    Frontend consumes this at GET /api/enrollment/courses.
    """
    fs = FirestoreService()
    raw_courses = fs.get_user_courses(g.firebase_uid)

    # Normalize payload shape to match frontend expectations (Moodle-like)
    normalized = []
    for c in raw_courses:
        normalized.append({
            "id": c.get("moodle_course_id") or c.get("id"),
            "fullname": c.get("course_name") or c.get("fullname") or "",
            "shortname": c.get("short_name") or c.get("shortname") or "",
            "summary": c.get("summary", "")
        })

    return jsonify({
        "success": True,
        "courses": normalized,
        "count": len(normalized)
    })


@enrollment_bp.route("/enrollment/courses/<int:course_id>", methods=["GET"])
@firebase_required
def get_user_course_detail(course_id: int):
    """Return specific course metadata from Firestore."""
    fs = FirestoreService()
    course = fs.get_course(course_id)
    if not course:
        return jsonify({"success": False, "error": "Course not found"}), 404
    return jsonify({"success": True, "course": course})


@enrollment_bp.route("/enrollment/courses/<int:course_id>/materials", methods=["GET"])
@firebase_required
def get_user_course_materials(course_id: int):
    """Return course contents/modules directly from Moodle.

    This mirrors the structure used in api.moodle_routes but aligns the path
    with the frontend's expected /enrollment/courses/<id>/materials.
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