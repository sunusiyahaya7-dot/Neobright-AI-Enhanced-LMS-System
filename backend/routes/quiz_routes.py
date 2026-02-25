"""Quiz routes – list quizzes, manage attempts, review results."""

from flask import Blueprint, jsonify, request, g
from auth.firebase_auth import firebase_required
from services.moodle_service import MoodleService
from services.firestore_service import FirestoreService
from services.progress_service import ProgressService
from services.grade_cache_service import GradeCacheService

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

            # Best-effort: persist attempt snapshot/event to Firestore
            try:
                fs = FirestoreService()
                fs.upsert_quiz_attempt(g.firebase_uid, moodle_user_id, quiz_id, attempt.get("id"), attempt, {
                    "source": "start_attempt",
                })
                fs.add_quiz_attempt_event(g.firebase_uid, moodle_user_id, quiz_id, attempt.get("id"), "start", {
                    "resumed": False,
                })
            except Exception as log_err:
                print(f"Firestore quiz logging failed (start): {log_err}")

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

                        # Best-effort: persist resume event
                        try:
                            fs = FirestoreService()
                            fs.upsert_quiz_attempt(g.firebase_uid, moodle_user_id, quiz_id, ip.get("id"), ip, {
                                "source": "start_attempt",
                            })
                            fs.add_quiz_attempt_event(g.firebase_uid, moodle_user_id, quiz_id, ip.get("id"), "resume", {
                                "resumed": True,
                            })
                        except Exception as log_err:
                            print(f"Firestore quiz logging failed (resume): {log_err}")

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
        moodle_user_id, err = _get_moodle_user_id()
        if err:
            return jsonify({"error": err[0]}), err[1]

        page = request.args.get("page", 0, type=int)
        data = MoodleService.get_attempt_data(attempt_id, page)

        # Best-effort: persist snapshot/event to Firestore
        try:
            attempt = data.get("attempt", {}) or {}
            fs = FirestoreService()
            fs.upsert_quiz_attempt(g.firebase_uid, moodle_user_id, quiz_id, attempt_id, attempt, {
                "source": "get_attempt_data",
                "page": page,
            })
            fs.add_quiz_attempt_event(g.firebase_uid, moodle_user_id, quiz_id, attempt_id, "view_page", {
                "page": page,
                "questions": len(data.get("questions", []) or []),
            })
        except Exception as log_err:
            print(f"Firestore quiz logging failed (get_attempt_data): {log_err}")

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
        moodle_user_id, err = _get_moodle_user_id()
        if err:
            return jsonify({"error": err[0]}), err[1]

        body = request.get_json(silent=True) or {}
        answer_data = body.get("data", [])

        if not answer_data:
            return jsonify({"error": "No answer data provided"}), 400

        result = MoodleService.save_attempt_data(attempt_id, answer_data)

        # Best-effort: log save event (do NOT store full answers long-term unless needed)
        try:
            fs = FirestoreService()
            fs.upsert_quiz_attempt(g.firebase_uid, moodle_user_id, quiz_id, attempt_id, {
                "id": attempt_id,
                "quiz": quiz_id,
                "userid": moodle_user_id,
            }, {
                "source": "save_attempt",
                "last_saved_at": FirestoreService.timestamp_now(),
                "last_saved_fields": len(answer_data),
            })
            fs.add_quiz_attempt_event(g.firebase_uid, moodle_user_id, quiz_id, attempt_id, "save", {
                "fields": len(answer_data),
            })
        except Exception as log_err:
            print(f"Firestore quiz logging failed (save): {log_err}")

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
        moodle_user_id, err = _get_moodle_user_id()
        if err:
            return jsonify({"error": err[0]}), err[1]

        body = request.get_json(silent=True) or {}
        time_up = body.get("timeup", False)

        result = MoodleService.submit_quiz_attempt(attempt_id, time_up=time_up)

        # Best-effort: persist submit event
        try:
            fs = FirestoreService()
            fs.upsert_quiz_attempt(g.firebase_uid, moodle_user_id, quiz_id, attempt_id, {
                "id": attempt_id,
                "quiz": quiz_id,
                "userid": moodle_user_id,
                "state": "finished",
            }, {
                "source": "submit_attempt",
                "submitted_at": FirestoreService.timestamp_now(),
                "timeup": bool(time_up),
            })
            fs.add_quiz_attempt_event(g.firebase_uid, moodle_user_id, quiz_id, attempt_id, "submit", {
                "timeup": bool(time_up),
            })
        except Exception as log_err:
            print(f"Firestore quiz logging failed (submit): {log_err}")

        # Best-effort: bust the 5-min AI context cache so AI sees updated quiz scores
        try:
            from api.ai_routes import _context_cache
            if g.firebase_uid in _context_cache:
                del _context_cache[g.firebase_uid]
                print(f"Busted AI context cache for {g.firebase_uid}")
        except Exception as cache_err:
            print(f"Failed to bust AI context cache: {cache_err}")

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
        moodle_user_id, err = _get_moodle_user_id()
        if err:
            return jsonify({"error": err[0]}), err[1]

        data = MoodleService.get_quiz_attempt_review(attempt_id)

        # Best-effort: persist grade snapshot
        try:
            fs = FirestoreService()
            attempt = data.get("attempt", {}) or {}
            fs.upsert_quiz_attempt(g.firebase_uid, moodle_user_id, quiz_id, attempt_id, attempt, {
                "source": "review_attempt",
                "grade": data.get("grade"),
                "graded_at": FirestoreService.timestamp_now(),
            })
            fs.add_quiz_attempt_event(g.firebase_uid, moodle_user_id, quiz_id, attempt_id, "review", {
                "grade": data.get("grade"),
                "questions": len(data.get("questions", []) or []),
            })
        except Exception as log_err:
            print(f"Firestore quiz logging failed (review): {log_err}")

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
