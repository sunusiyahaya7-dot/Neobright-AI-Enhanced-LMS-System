"""Grade synchronization and caching routes."""

from flask import Blueprint, jsonify, g
from services.moodle_service import MoodleService
from services.grade_cache_service import GradeCacheService
from services.firestore_service import FirestoreService
from auth.firebase_auth import firebase_required


grades_bp = Blueprint("grades", __name__, url_prefix="/api/grades")


@grades_bp.route("/sync/<int:course_id>", methods=["POST"])
@firebase_required
def sync_course_grades(course_id: int):
    """
    Sync grades for all assignments in a course from Moodle and cache in Firestore.
    
    This endpoint attempts to fetch grades from Moodle, but fails gracefully
    if Moodle is unreachable - the cached grades will still be returned.
    """
    try:
        firebase_uid = g.firebase_uid
        print(f"Syncing grades for user {firebase_uid}, course {course_id}...")

        fs = FirestoreService()
        user = fs.get_user(firebase_uid) or {}
        moodle_user_id = user.get("moodle_user_id") or user.get("moodleUserId")
        if not moodle_user_id:
            return jsonify({
                "success": False,
                "error": "Moodle account not linked for this user",
                "message": "Link your Moodle account first"
            }), 400

        synced_grades: dict[int, dict] = {}
        failed_items: list[dict] = []
        moodle_error = None

        try:
            grades_payload = MoodleService.get_course_grades(course_id, int(moodle_user_id))
            usergrades = []
            if isinstance(grades_payload, dict):
                usergrades = grades_payload.get("usergrades") or []

            gradeitems = []
            if isinstance(usergrades, list) and len(usergrades) > 0:
                gradeitems = usergrades[0].get("gradeitems") or []

            for item in gradeitems:
                try:
                    if item.get("itemmodule") != "assign":
                        continue

                    assignment_id = item.get("iteminstance")
                    if assignment_id is None:
                        continue

                    assignment_id_int = int(assignment_id)

                    grade_raw = item.get("graderaw")
                    grade_max = item.get("grademax")
                    feedback = item.get("feedback") or item.get("feedbackformatted")
                    graded_date = item.get("gradedategraded") or item.get("gradedate")

                    grade_data = {
                        "grade": grade_raw,
                        "gradeMax": grade_max if grade_max is not None else 100,
                        "feedback": feedback,
                        "gradeddate": graded_date,
                    }

                    GradeCacheService.cache_grade(firebase_uid, course_id, assignment_id_int, grade_data)
                    synced_grades[assignment_id_int] = grade_data
                except Exception as item_err:
                    failed_items.append({
                        "item": item,
                        "error": str(item_err)
                    })
        except Exception as moodle_err:
            print(f"Warning: Could not fetch from Moodle: {moodle_err}")
            moodle_error = str(moodle_err)

        # Always merge in existing cache (even if Moodle fetch failed)
        try:
            existing_cache = GradeCacheService.get_all_cached_grades(firebase_uid, course_id)
            for assignment_id_int, cached in existing_cache.items():
                if assignment_id_int not in synced_grades:
                    synced_grades[assignment_id_int] = cached
        except Exception as e:
            print(f"Could not retrieve existing cache: {e}")

        return jsonify({
            "success": True,
            "course_id": course_id,
            "moodle_user_id": int(moodle_user_id),
            "synced_count": len(synced_grades),
            "failed_count": len(failed_items),
            "grades": synced_grades,
            "failed_items": failed_items,
            "moodle_error": moodle_error,
            "message": f"Synced/retrieved grades for {len(synced_grades)} assignments"
        })
    
    except Exception as e:
        print(f"Error syncing grades for course {course_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e),
            "message": "Failed to sync grades"
        }), 500


@grades_bp.route("/<int:course_id>/assignment/<int:assignment_id>", methods=["GET"])
@firebase_required
def get_cached_grade(course_id: int, assignment_id: int):
    """
    Retrieve cached grade for a specific assignment.
    
    If cache is empty, returns not graded status.
    """
    try:
        user_id = g.firebase_uid
        
        # Try to get cached grade
        cached_grade = GradeCacheService.get_cached_grade(user_id, course_id, assignment_id)
        
        if cached_grade:
            return jsonify({
                "success": True,
                "cached": True,
                "grade": cached_grade
            })
        else:
            return jsonify({
                "success": True,
                "cached": False,
                "grade": {
                    "grade": None,
                    "gradeMax": 100,
                    "feedback": None,
                    "gradeddate": None
                }
            })
    
    except Exception as e:
        print(f"Error retrieving cached grade: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@grades_bp.route("/<int:course_id>", methods=["GET"])
@firebase_required
def get_all_cached_grades(course_id: int):
    """
    Retrieve all cached grades for a course.
    """
    try:
        user_id = g.firebase_uid
        
        # Get all cached grades
        grades = GradeCacheService.get_all_cached_grades(user_id, course_id)
        
        return jsonify({
            "success": True,
            "course_id": course_id,
            "count": len(grades),
            "grades": grades
        })
    
    except Exception as e:
        print(f"Error retrieving cached grades: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@grades_bp.route("/<int:course_id>/clear", methods=["DELETE"])
@firebase_required
def clear_grade_cache(course_id: int):
    """
    Clear cached grades for a course.
    """
    try:
        user_id = g.firebase_uid
        
        GradeCacheService.clear_cache(user_id, course_id)
        
        return jsonify({
            "success": True,
            "message": f"Cleared grade cache for course {course_id}"
        })
    
    except Exception as e:
        print(f"Error clearing grade cache: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500
