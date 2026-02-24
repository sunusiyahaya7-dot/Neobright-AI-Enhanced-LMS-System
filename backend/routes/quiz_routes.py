"""Quiz routes – list quizzes, manage attempts, review results."""

from flask import Blueprint, jsonify, request, g
from auth.firebase_auth import firebase_required
from services.moodle_service import MoodleService
from services.firestore_service import FirestoreService

quiz_bp = Blueprint("quizzes", __name__, url_prefix="/api")


# ── helpers ───────────────────────────────────────────────────────────────

def _get_moodle_user_id():
    """Resolve the current user's Moodle user ID from Firestore."""
    firebase_uid = g.firebase_uid
    fs = FirestoreService()
    user_doc = fs.get_user(firebase_uid)
    if not user_doc:
        return None, ("User not found", 404)

    moodle_user_id = user_doc.get("moodle_user_id") or user_doc.get("moodleUserId")
    if not moodle_user_id:
        return None, ("Moodle account not linked for this user", 400)

    return int(moodle_user_id), None


# ── List quizzes for a course ─────────────────────────────────────────────

@quiz_bp.route("/courses/<int:course_id>/quizzes", methods=["GET"])
@firebase_required
def list_course_quizzes(course_id: int):
    """
    GET /api/courses/<course_id>/quizzes

    Returns all quizzes in a course with the current user's attempt summary.
    """
    try:
        moodle_user_id, err = _get_moodle_user_id()
        if err:
            return jsonify({"error": err[0]}), err[1]

        # Fetch quizzes from Moodle
        quiz_data = MoodleService.get_quizzes_by_course(course_id)
        quizzes = quiz_data.get("quizzes", [])

        # Enrich each quiz with the user's attempt info
        results = []
        for q in quizzes:
            quiz_id = q.get("id")

            # Fetch user attempts for this quiz
            attempts_data = MoodleService.get_quiz_user_attempts(quiz_id, moodle_user_id)
            attempts = attempts_data.get("attempts", [])

            finished = [a for a in attempts if a.get("state") == "finished"]
            in_progress = [a for a in attempts if a.get("state") == "inprogress"]

            best_grade = None
            if finished:
                grades = [a.get("sumgrades") for a in finished if a.get("sumgrades") is not None]
                if grades:
                    best_grade = max(grades)

            results.append({
                "id": quiz_id,
                "coursemodule": q.get("coursemodule"),
                "name": q.get("name"),
                "intro": q.get("intro", ""),
                "timeopen": q.get("timeopen"),
                "timeclose": q.get("timeclose"),
                "timelimit": q.get("timelimit"),
                "grade": q.get("grade"),
                "maxattempts": q.get("attempts"),            # 0 = unlimited
                "grademethod": q.get("grademethod"),
                "totalAttempts": len(attempts),
                "finishedAttempts": len(finished),
                "hasInProgress": len(in_progress) > 0,
                "inProgressAttemptId": in_progress[0].get("id") if in_progress else None,
                "bestGrade": best_grade,
            })

        return jsonify({"success": True, "quizzes": results}), 200

    except Exception as e:
        print(f"Error listing quizzes for course {course_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to fetch quizzes: {str(e)}"}), 500


# ── User attempts for a quiz ─────────────────────────────────────────────

@quiz_bp.route("/quizzes/<int:quiz_id>/attempts", methods=["GET"])
@firebase_required
def get_quiz_attempts(quiz_id: int):
    """
    GET /api/quizzes/<quiz_id>/attempts

    Returns all attempts for the current user on a specific quiz.
    """
    try:
        moodle_user_id, err = _get_moodle_user_id()
        if err:
            return jsonify({"error": err[0]}), err[1]

        data = MoodleService.get_quiz_user_attempts(quiz_id, moodle_user_id)
        return jsonify({"success": True, "attempts": data.get("attempts", [])}), 200

    except Exception as e:
        print(f"Error fetching attempts for quiz {quiz_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to fetch attempts: {str(e)}"}), 500


# ── Start a new attempt ──────────────────────────────────────────────────

@quiz_bp.route("/quizzes/<int:quiz_id>/attempt/start", methods=["POST"])
@firebase_required
def start_attempt(quiz_id: int):
    """
    POST /api/quizzes/<quiz_id>/attempt/start

    Starts a new quiz attempt and returns the attempt object.
    """
    try:
        moodle_user_id, err = _get_moodle_user_id()
        if err:
            return jsonify({"error": err[0]}), err[1]

        data = MoodleService.start_quiz_attempt(quiz_id)
        attempt = data.get("attempt", {})

        return jsonify({"success": True, "attempt": attempt}), 200

    except Exception as e:
        print(f"Error starting attempt for quiz {quiz_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to start attempt: {str(e)}"}), 500


# ── Get attempt question data (page) ─────────────────────────────────────

@quiz_bp.route("/quizzes/<int:quiz_id>/attempt/<int:attempt_id>", methods=["GET"])
@firebase_required
def get_attempt_questions(quiz_id: int, attempt_id: int):
    """
    GET /api/quizzes/<quiz_id>/attempt/<attempt_id>?page=0

    Returns question HTML for a page of the attempt.
    """
    try:
        page = request.args.get("page", 0, type=int)
        data = MoodleService.get_attempt_data(attempt_id, page)

        return jsonify({
            "success": True,
            "questions": data.get("questions", []),
            "attempt": data.get("attempt", {}),
            "nextpage": data.get("nextpage", -1),
        }), 200

    except Exception as e:
        print(f"Error fetching attempt data for attempt {attempt_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to fetch attempt data: {str(e)}"}), 500


# ── Save answers (without submitting) ────────────────────────────────────

@quiz_bp.route("/quizzes/<int:quiz_id>/attempt/<int:attempt_id>/save", methods=["POST"])
@firebase_required
def save_attempt(quiz_id: int, attempt_id: int):
    """
    POST /api/quizzes/<quiz_id>/attempt/<attempt_id>/save

    Body: { "data": [ { "name": "q1:1_answer", "value": "3" }, ... ] }

    Saves current answers without finishing the attempt.
    """
    try:
        body = request.get_json(silent=True) or {}
        answer_data = body.get("data", [])

        if not answer_data:
            return jsonify({"error": "No answer data provided"}), 400

        result = MoodleService.save_attempt_data(attempt_id, answer_data)
        return jsonify({"success": True, "result": result}), 200

    except Exception as e:
        print(f"Error saving attempt {attempt_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to save attempt: {str(e)}"}), 500


# ── Submit (finish) an attempt ────────────────────────────────────────────

@quiz_bp.route("/quizzes/<int:quiz_id>/attempt/<int:attempt_id>/submit", methods=["POST"])
@firebase_required
def submit_attempt(quiz_id: int, attempt_id: int):
    """
    POST /api/quizzes/<quiz_id>/attempt/<attempt_id>/submit

    Finishes the attempt and triggers grading.
    """
    try:
        body = request.get_json(silent=True) or {}
        time_up = body.get("timeup", False)

        result = MoodleService.submit_quiz_attempt(attempt_id, time_up=time_up)
        return jsonify({"success": True, "result": result}), 200

    except Exception as e:
        print(f"Error submitting attempt {attempt_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to submit attempt: {str(e)}"}), 500


# ── Review a finished attempt ─────────────────────────────────────────────

@quiz_bp.route("/quizzes/<int:quiz_id>/attempt/<int:attempt_id>/review", methods=["GET"])
@firebase_required
def review_attempt(quiz_id: int, attempt_id: int):
    """
    GET /api/quizzes/<quiz_id>/attempt/<attempt_id>/review

    Returns the graded review of a finished attempt with questions + answers.
    """
    try:
        data = MoodleService.get_quiz_attempt_review(attempt_id)

        return jsonify({
            "success": True,
            "questions": data.get("questions", []),
            "attempt": data.get("attempt", {}),
            "additionaldata": data.get("additionaldata", []),
            "grade": data.get("grade"),
        }), 200

    except Exception as e:
        print(f"Error reviewing attempt {attempt_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to fetch review: {str(e)}"}), 500
