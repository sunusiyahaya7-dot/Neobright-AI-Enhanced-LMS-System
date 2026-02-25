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
            all_attempts = attempts_data.get("attempts", [])

            # Separate real attempts from preview attempts
            attempts = [a for a in all_attempts if not a.get("preview")]
            preview_attempts = [a for a in all_attempts if a.get("preview")]

            finished = [a for a in attempts if a.get("state") == "finished"]
            in_progress = [a for a in attempts if a.get("state") == "inprogress"]
            # Also check preview attempts for stuck in-progress state
            preview_in_progress = [a for a in preview_attempts if a.get("state") == "inprogress"]

            best_grade = None
            if finished:
                grades = [a.get("sumgrades") for a in finished if a.get("sumgrades") is not None]
                if grades:
                    best_grade = max(grades)

            # Check if in-progress attempt has expired (time limit exceeded)
            timelimit = q.get("timelimit", 0)
            time_expired = False
            in_progress_id = None
            # Check both real and preview in-progress attempts
            ip_list = in_progress or preview_in_progress
            if ip_list:
                ip = ip_list[0]
                in_progress_id = ip.get("id")
                if timelimit > 0:
                    import time as _time
                    elapsed = int(_time.time()) - ip.get("timestart", 0)
                    if elapsed >= timelimit:
                        time_expired = True

            # Get last finished attempt id for review
            last_finished_id = finished[-1].get("id") if finished else None

            results.append({
                "id": quiz_id,
                "coursemodule": q.get("coursemodule"),
                "name": q.get("name"),
                "intro": q.get("intro", ""),
                "timeopen": q.get("timeopen"),
                "timeclose": q.get("timeclose"),
                "timelimit": timelimit,
                "grade": q.get("grade"),
                "maxattempts": q.get("attempts"),            # 0 = unlimited
                "grademethod": q.get("grademethod"),
                "totalAttempts": len(attempts),
                "finishedAttempts": len(finished),
                "hasInProgress": len(ip_list) > 0,
                "inProgressAttemptId": in_progress_id,
                "timeExpired": time_expired,
                "bestGrade": best_grade,
                "lastFinishedAttemptId": last_finished_id,
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
        # Filter out preview attempts from the list shown to students
        real_attempts = [a for a in data.get("attempts", []) if not a.get("preview")]
        return jsonify({"success": True, "attempts": real_attempts}), 200

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

    Starts a new quiz attempt.  If there is already an in-progress attempt,
    return it instead of erroring out so the frontend can resume.
    """
    try:
        moodle_user_id, err = _get_moodle_user_id()
        if err:
            return jsonify({"error": err[0]}), err[1]

        try:
            data = MoodleService.start_quiz_attempt(quiz_id)
            attempt = data.get("attempt", {})
            return jsonify({"success": True, "attempt": attempt}), 200
        except RuntimeError as re:
            # If Moodle says "attempt still in progress", find it and handle it
            if "attemptstillinprogress" in str(re).lower() or "still in progress" in str(re).lower():
                attempts_data = MoodleService.get_quiz_user_attempts(quiz_id, moodle_user_id)
                all_attempts = attempts_data.get("attempts", [])
                in_progress = [
                    a for a in all_attempts
                    if a.get("state") == "inprogress"
                ]
                if in_progress:
                    ip = in_progress[0]
                    # If it's a preview or its time has expired, auto-submit it and retry
                    is_preview = bool(ip.get("preview"))
                    if is_preview:
                        print(f"Auto-submitting stuck preview attempt {ip.get('id')}...")
                        try:
                            MoodleService.submit_quiz_attempt(ip.get("id"), timeup=True)
                        except Exception as sub_err:
                            print(f"Failed to submit preview: {sub_err}")
                        # Retry starting
                        data = MoodleService.start_quiz_attempt(quiz_id)
                        return jsonify({"success": True, "attempt": data.get("attempt", {})}), 200
                    else:
                        # Real in-progress attempt — return it for resume
                        return jsonify({"success": True, "attempt": ip, "resumed": True}), 200
            # Re-raise if it's a different error
            raise

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
        # Moodle returns: moodle_quiz_exception - This attempt has already been finished.
        msg = str(e)
        if "already been finished" in msg.lower():
            return jsonify({"error": "Attempt already finished", "code": "ATTEMPT_FINISHED"}), 409

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
        msg = str(e)
        if "already been finished" in msg.lower():
            return jsonify({"success": True, "result": {"state": "finished", "alreadyFinished": True}}), 200

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
