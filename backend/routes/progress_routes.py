"""
Progress tracking API routes for NeoBright LMS.
Endpoints for fetching and caching student progress data.
"""
from flask import Blueprint, request, jsonify, g
from auth.firebase_auth import firebase_required
from services.progress_service import ProgressService
from services.firestore_service import FirestoreService
from services.moodle_service import MoodleService

progress_bp = Blueprint('progress', __name__, url_prefix='/api/progress')


@progress_bp.route('/course/<int:course_id>', methods=['GET'])
@firebase_required
def get_course_progress(course_id):
    """
    GET /api/progress/course/{courseId}
    
    Fetch and compute progress for a single course.
    
    Returns:
    {
        "progress": 72.5,
        "completed": 29,
        "total": 40,
        "lastSynced": timestamp
    }
    """
    try:
        # Get Firebase user from g object (set by @firebase_required)
        firebase_uid = g.firebase_uid
        if not firebase_uid:
            return jsonify({"error": "Unauthorized"}), 401
        
        # Get Moodle user ID from Firestore
        fs = FirestoreService()
        user_doc = fs.get_user(firebase_uid)
        
        if not user_doc:
            return jsonify({"error": "User not found"}), 404
        
        moodle_user_id = user_doc.get("moodle_user_id") or user_doc.get("moodleUserId")
        if not moodle_user_id:
            return jsonify({"error": "User not linked to Moodle"}), 400
        
        print(f"Fetching progress for course {course_id}, user {firebase_uid}, moodle_id {moodle_user_id}")
        
        # Fetch and compute progress from Moodle + user completions overlay
        progress_data = ProgressService.fetch_and_compute_course_progress(
            course_id,
            int(moodle_user_id),
            firebase_uid
        )
        
        # Cache the progress
        ProgressService.cache_course_progress(firebase_uid, course_id, progress_data)
        
        # Return normalized response
        return jsonify({
            "progress": progress_data.get("progress", 0.0),
            "completed": progress_data.get("completedActivities", 0),
            "total": progress_data.get("totalActivities", 0),
            "lastSynced": progress_data.get("lastFetched")
        }), 200
    
    except Exception as e:
        print(f"Error fetching course progress: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to fetch progress: {str(e)}"}), 500


@progress_bp.route('/overview', methods=['GET'])
@firebase_required
def get_progress_overview():
    """
    GET /api/progress/overview
    
    Fetch progress for all courses for the logged-in user.
    
    Returns:
    [
        { "courseId": 5, "progress": 72.5, "completed": 29, "total": 40 },
        { "courseId": 8, "progress": 43.1, "completed": 17, "total": 40 }
    ]
    """
    try:
        # Get Firebase user from g object (set by @firebase_required)
        firebase_uid = g.firebase_uid
        if not firebase_uid:
            return jsonify({"error": "Unauthorized"}), 401
        
        # Get Moodle user ID from Firestore
        fs = FirestoreService()
        user_doc = fs.get_user(firebase_uid)
        
        if not user_doc:
            return jsonify({"error": "User not found"}), 404
        
        moodle_user_id = user_doc.get("moodle_user_id") or user_doc.get("moodleUserId")
        if not moodle_user_id:
            return jsonify({"error": "User not linked to Moodle"}), 400
        
        print(f"Fetching progress overview for user {firebase_uid}, moodle_id {moodle_user_id}")
        
        # Get user's courses
        courses_data = MoodleService.get_user_courses(int(moodle_user_id))
        courses = courses_data if isinstance(courses_data, list) else []
        
        print(f"User enrolled in {len(courses)} courses")
        
        # Compute progress for each course
        progress_overview = []
        for course in courses:
            course_id = course.get("id")
            
            # Fetch and compute progress (Moodle + user completions)
            progress_data = ProgressService.fetch_and_compute_course_progress(
                course_id,
                int(moodle_user_id),
                firebase_uid
            )
            
            # Cache progress
            ProgressService.cache_course_progress(firebase_uid, course_id, progress_data)
            
            # Add to overview
            progress_overview.append({
                "courseId": course_id,
                "progress": progress_data.get("progress", 0.0),
                "completed": progress_data.get("completedActivities", 0),
                "total": progress_data.get("totalActivities", 0)
            })
        
        print(f"Computed progress for {len(progress_overview)} courses")
        return jsonify(progress_overview), 200
    
    except Exception as e:
        print(f"Error fetching progress overview: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to fetch progress overview: {str(e)}"}), 500


@progress_bp.route('/course/<int:course_id>/activity/<int:activity_id>/complete', methods=['POST'])
@firebase_required
def mark_activity_complete(course_id, activity_id):
    """
    POST /api/progress/course/{courseId}/activity/{activityId}/complete
    
    Mark an activity as complete for the user in Firestore (user bookmarks/notes).
    Note: Moodle completion is automatic and controlled by teacher/system.
    
    Returns:
    {
        "success": true,
        "message": "Activity marked as complete for user"
    }
    """
    try:
        firebase_uid = g.firebase_uid
        if not firebase_uid:
            return jsonify({"error": "Unauthorized"}), 401
        
        print(f"Marking activity {activity_id} (cmid) complete for user {firebase_uid} in course {course_id}")
        
        # Validate that activity_id is a valid Moodle cmid in this course
        fs = FirestoreService()
        user_doc = fs.get_user(firebase_uid)
        
        if not user_doc:
            return jsonify({"error": "User not found"}), 404
        
        moodle_user_id = user_doc.get("moodle_user_id") or user_doc.get("moodleUserId")
        if not moodle_user_id:
            return jsonify({"error": "User not linked to Moodle"}), 400
        
        # Get Moodle activity list to validate the cmid
        print(f"🔍 Validating activity {activity_id} in course {course_id}")
        moodle_service = MoodleService()
        try:
            progress_response = moodle_service.get_course_progress(course_id, int(moodle_user_id))
        except Exception as moodle_err:
            print(f"❌ Moodle error during validation: {moodle_err}")
            return jsonify({"error": f"Could not validate activity: {str(moodle_err)}"}), 500
        
        # Handle response format - might be {statuses: [...]} or just [...]
        if isinstance(progress_response, dict) and 'statuses' in progress_response:
            statuses = progress_response.get('statuses', [])
        elif isinstance(progress_response, list):
            statuses = progress_response
        else:
            statuses = []
        
        valid_cmids = {status.get("cmid") for status in statuses if isinstance(status, dict) and status.get("cmid")}
        print(f"📋 Valid cmids in course {course_id}: {valid_cmids}")
        
        if activity_id not in valid_cmids:
            print(f"❌ Activity {activity_id} not in valid cmids")
            return jsonify({"error": f"Activity {activity_id} not found in course {course_id}"}), 400
        
        # Store user-marked completion in Firestore (only for valid cmids)
        ProgressService.mark_activity_complete(firebase_uid, course_id, activity_id)
        
        print(f"✓ User marked completion: course {course_id}, activity {activity_id}")
        
        return jsonify({
            "success": True,
            "message": "Activity marked as complete for user"
        }), 200
    
    except Exception as e:
        print(f"Error marking activity as complete: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to mark activity: {str(e)}"}), 500


@progress_bp.route('/course/<int:course_id>/completions', methods=['GET'])
@firebase_required
def get_course_completions(course_id):
    """
    GET /api/progress/course/{courseId}/completions
    
    Get all user-marked activity completions for a course.
    
    Returns:
    {
        "1": true,
        "2": true,
        "5": false
    }
    """
    try:
        firebase_uid = g.firebase_uid
        if not firebase_uid:
            return jsonify({"error": "Unauthorized"}), 401
        
        print(f"Fetching completions for course {course_id}, user {firebase_uid}")
        
        # Fetch Moodle completion status (source of truth)
        fs = FirestoreService()
        user_doc = fs.get_user(firebase_uid)
        
        if not user_doc:
            return jsonify({"error": "User not found"}), 404
        
        moodle_user_id = user_doc.get("moodle_user_id") or user_doc.get("moodleUserId")
        if not moodle_user_id:
            return jsonify({"error": "User not linked to Moodle"}), 400
        
        # Get Moodle completion status for all activities
        moodle_service = MoodleService()
        progress_response = moodle_service.get_course_progress(course_id, int(moodle_user_id))
        
        # Handle response format - might be {statuses: [...]} or just [...]
        if isinstance(progress_response, dict) and 'statuses' in progress_response:
            statuses = progress_response.get('statuses', [])
        elif isinstance(progress_response, list):
            statuses = progress_response
        else:
            statuses = []
        
        # Build dict: {cmid: is_complete} from Moodle
        completions = {}
        for status in statuses:
            if isinstance(status, dict):
                cmid = status.get("cmid")
                is_complete = status.get("state") == 1
                if cmid is not None:
                    completions[str(cmid)] = is_complete
        
        # Merge with user-marked completions from Firestore
        user_marked = ProgressService.get_course_completions(firebase_uid, course_id)
        moodle_count = len([v for v in completions.values() if v])
        firestore_count = 0
        
        for cmid_str, user_is_done in user_marked.items():
            if cmid_str in completions:
                # User can only add to completion (or-logic), not remove
                if user_is_done and not completions[cmid_str]:
                    completions[cmid_str] = True
                    firestore_count += 1
        
        print(f"Combined completions: Moodle={moodle_count}, User-marked-added={firestore_count}, Total={len([v for v in completions.values() if v])}")
        
        return jsonify(completions), 200
    
    except Exception as e:
        print(f"Error fetching course completions: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to fetch completions: {str(e)}"}), 500
