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
        
        # Fetch and compute progress from Moodle
        progress_data = ProgressService.fetch_and_compute_course_progress(
            course_id, 
            int(moodle_user_id)
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
            
            # Fetch and compute progress
            progress_data = ProgressService.fetch_and_compute_course_progress(
                course_id,
                int(moodle_user_id)
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
