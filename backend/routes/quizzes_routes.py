"""Quiz-related routes for fetching and managing quiz content."""

from flask import Blueprint, jsonify, g
from auth.firebase_auth import firebase_required
from services.moodle_service import MoodleService
from services.firestore_service import FirestoreService

quizzes_bp = Blueprint("quizzes", __name__, url_prefix="/api/courses")


@quizzes_bp.route("/<int:course_id>/quizzes", methods=["GET"])
@firebase_required
def get_course_quizzes(course_id: int):
    """
    Get all quizzes in a course with access info and attempts.
    
    Response:
    {
      "success": true,
      "course_id": 5,
      "quizzes": [
        {
          "id": 1,
          "cmid": 5,
          "name": "Quiz 1",
          "intro": "Quiz description",
          "timeopen": 0,
          "timeclose": 0,
          "timelimit": 1200,
          "attempts": 0,
          "grademethod": 1,
          "grade": 100,
          "questions": "1,2,3",
          "access_info": { canstudentreview, ... },
          "user_attempts": [{ id, state, timefinish, ... }]
        }
      ],
      "count": 3
    }
    """
    try:
        user_id = g.firebase_uid
        print(f"Fetching quizzes - User: {user_id}, Course: {course_id}")
        
        # Get user's Moodle ID
        fs = FirestoreService()
        user = fs.get_user(user_id) or {}
        moodle_user_id = user.get("moodle_user_id") or user.get("moodleUserId")
        
        if not moodle_user_id:
            return jsonify({
                "success": False,
                "error": "Moodle account not linked",
                "message": "Link your Moodle account first"
            }), 400
        
        moodle_user_id = int(moodle_user_id)
        
        # Fetch all quizzes in the course
        quiz_data = MoodleService.get_quizzes_by_course(course_id)
        quizzes_list = quiz_data.get("quizzes", [])
        
        # Enrich each quiz with access info and user attempts
        quizzes_enriched = []
        for quiz in quizzes_list:
            quiz_id = quiz.get("id")
            
            # Get access information
            access_info = {}
            try:
                access_data = MoodleService.get_quiz_access_information(quiz_id, moodle_user_id)
                # Extract relevant fields (handle both dict and potential other formats)
                if isinstance(access_data, dict):
                    access_info = {
                        "canstudentreview": access_data.get("canstudentreview", False),
                        "canreviewresponses": access_data.get("canreviewresponses", False),
                        "warnings": access_data.get("warnings", [])
                    }
            except Exception as e:
                print(f"Warning: Could not fetch access info for quiz {quiz_id}: {e}")
                access_info = {"canstudentreview": False, "canreviewresponses": False}
            
            # Get user attempts
            user_attempts = []
            try:
                attempts_data = MoodleService.get_quiz_user_attempts(quiz_id, moodle_user_id)
                if isinstance(attempts_data, dict):
                    user_attempts = attempts_data.get("attempts", [])
            except Exception as e:
                print(f"Warning: Could not fetch attempts for quiz {quiz_id}: {e}")
            
            # Build enriched quiz object
            quiz_enriched = {
                "id": quiz_id,
                "cmid": quiz.get("cmid"),
                "name": quiz.get("name"),
                "intro": quiz.get("intro") or quiz.get("introduction"),
                "timeopen": quiz.get("timeopen"),
                "timeclose": quiz.get("timeclose"),
                "timelimit": quiz.get("timelimit"),
                "attempts": quiz.get("attempts"),
                "grademethod": quiz.get("grademethod"),
                "grade": quiz.get("grade"),
                "questions": quiz.get("questions"),
                "access_info": access_info,
                "user_attempts": user_attempts,
                "attempt_count": len(user_attempts)
            }
            quizzes_enriched.append(quiz_enriched)
        
        return jsonify({
            "success": True,
            "course_id": course_id,
            "quizzes": quizzes_enriched,
            "count": len(quizzes_enriched)
        })
    
    except Exception as e:
        print(f"Error fetching quizzes for course {course_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@quizzes_bp.route("/<int:course_id>/quizzes/<int:quiz_id>", methods=["GET"])
@firebase_required
def get_quiz_details(course_id: int, quiz_id: int):
    """
    Get detailed information about a specific quiz.
    Includes access info, student's previous attempts, and attempt status.
    """
    try:
        user_id = g.firebase_uid
        print(f"Fetching quiz details - User: {user_id}, Course: {course_id}, Quiz: {quiz_id}")
        
        # Get user's Moodle ID
        fs = FirestoreService()
        user = fs.get_user(user_id) or {}
        moodle_user_id = user.get("moodle_user_id") or user.get("moodleUserId")
        
        if not moodle_user_id:
            return jsonify({
                "success": False,
                "error": "Moodle account not linked"
            }), 400
        
        moodle_user_id = int(moodle_user_id)
        
        # Get all quizzes for the course
        quiz_data = MoodleService.get_quizzes_by_course(course_id)
        quizzes = quiz_data.get("quizzes", [])
        
        # Find the requested quiz
        quiz = None
        for q in quizzes:
            if q.get("id") == quiz_id:
                quiz = q
                break
        
        if not quiz:
            return jsonify({
                "success": False,
                "error": "Quiz not found in this course"
            }), 404
        
        # Get access info and attempts
        access_info = MoodleService.get_quiz_access_information(quiz_id, moodle_user_id)
        attempts_data = MoodleService.get_quiz_user_attempts(quiz_id, moodle_user_id)
        user_attempts = attempts_data.get("attempts", []) if isinstance(attempts_data, dict) else []
        
        # Build response
        quiz_details = {
            "id": quiz.get("id"),
            "cmid": quiz.get("cmid"),
            "name": quiz.get("name"),
            "intro": quiz.get("intro") or quiz.get("introduction"),
            "description": quiz.get("description"),
            "timeopen": quiz.get("timeopen"),
            "timeclose": quiz.get("timeclose"),
            "timelimit": quiz.get("timelimit"),
            "attempts": quiz.get("attempts"),
            "grademethod": quiz.get("grademethod"),
            "grade": quiz.get("grade"),
            "questions": quiz.get("questions"),
            "access_info": access_info,
            "user_attempts": user_attempts,
            "attempt_count": len(user_attempts)
        }
        
        return jsonify({
            "success": True,
            "course_id": course_id,
            "quiz": quiz_details
        })
    
    except Exception as e:
        print(f"Error fetching quiz {quiz_id} details: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
