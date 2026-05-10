"""
AI Course Insights Service for NeoBright LMS.

Extracted from ai_routes.py to isolate per-course insight
generation into a testable, replaceable service.  Phase 3
(Insights Agent) will swap the internals while keeping the
same public signature.
"""
import json
import logging
import time
from datetime import datetime, timezone

from services.openai_client import get_openai_client
from services.ai_logging_service import AiLoggingService

logger = logging.getLogger(__name__)


# ─────────────────── public API ────────────────────────

def generate_course_insights(
    course: dict,
    assignments: list,
    quizzes: list,
    full_context: dict,
    app_config: dict,
    *,
    user_id: str | None = None,
) -> dict:
    """
    Generate AI insights for a specific course.

    Args:
        course: Course dict from the AI context.
        assignments: Filtered assignments for this course.
        quizzes: Filtered quizzes for this course.
        full_context: Full AI context dict.
        app_config: Flask app.config dict.
        user_id: Firebase UID for logging (keyword-only).

    Returns:
        dict with keys ``insights`` (list[str]) and ``study_tip`` (str).
    """
    start_time = time.time()
    model = app_config.get("AI_MODEL", "gpt-4o-mini")

    client = get_openai_client(app_config.get("OPENAI_API_KEY"))
    if client is None:
        return _fallback_course_insights(course)

    prompt = _build_course_insights_prompt(course, assignments, quizzes, full_context)

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are NeoBright, a supportive AI learning coach. "
                        "Always address the student directly using 'you' and 'your'. "
                        "Be specific and actionable. Return ONLY valid JSON."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.5,
            max_tokens=600,
        )

        raw = response.choices[0].message.content.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        result = json.loads(raw)

        # Log
        if user_id:
            usage = response.usage
            AiLoggingService.log_ai_call(
                user_id=user_id,
                endpoint="/api/ai/course-insights",
                model=model,
                success=True,
                prompt_tokens=usage.prompt_tokens if usage else None,
                completion_tokens=usage.completion_tokens if usage else None,
                total_tokens=usage.total_tokens if usage else None,
                response_time_ms=(time.time() - start_time) * 1000,
            )

        return {
            "insights": result.get("insights", []),
            "study_tip": result.get("study_tip", "Keep up the good work!"),
        }

    except Exception as e:
        logger.error("Course insights generation error: %s", e)
        if user_id:
            AiLoggingService.log_ai_call(
                user_id=user_id,
                endpoint="/api/ai/course-insights",
                model=model,
                success=False,
                error_message=str(e),
                response_time_ms=(time.time() - start_time) * 1000,
            )
        return _fallback_course_insights(course)


# ─────────────────── prompt builder ────────────────────

def _build_course_insights_prompt(
    course: dict,
    assignments: list,
    quizzes: list,
    full_context: dict,
) -> str:
    """Build the user prompt for course-specific insights."""
    student_name = full_context.get("student", {}).get("name", "Student")
    progress = course.get("progress", 0)
    avg_score = course.get("averageScore")
    completed = course.get("completedActivities", 0)
    total = course.get("totalActivities", 0)

    # Format assignments
    assignments_text = ""
    if assignments:
        now = datetime.now(timezone.utc)
        lines = []
        for a in assignments:
            status = a.get("status", "not submitted")
            name = a.get("name", "Unknown")
            duedate_ts = a.get("duedate_ts", 0)
            if duedate_ts:
                due_dt = datetime.utcfromtimestamp(duedate_ts).replace(tzinfo=timezone.utc)
                days_diff = (due_dt - now).days
                if status == "submitted":
                    lines.append(f"- {name}: SUBMITTED ✅ (no action needed)")
                elif days_diff < 0:
                    lines.append(f"- {name}: NOT SUBMITTED, OVERDUE by {abs(days_diff)} days")
                elif days_diff == 0:
                    lines.append(f"- {name}: NOT SUBMITTED, DUE TODAY")
                elif days_diff == 1:
                    lines.append(f"- {name}: NOT SUBMITTED, DUE TOMORROW")
                else:
                    lines.append(f"- {name}: NOT SUBMITTED, due in {days_diff} days")
            else:
                lines.append(f"- {name}: {status}, no due date set")
        assignments_text = "\n".join(lines)

    # Format quizzes
    quizzes_text = ""
    if quizzes:
        q_lines = []
        for q in quizzes:
            qname = q.get("name", "Unknown")
            score = q.get("score")
            max_score = q.get("maxScore")
            pct = q.get("percentage")
            if score is not None and max_score is not None:
                q_lines.append(f"- {qname}: {score}/{max_score} ({pct}%)")
            else:
                q_lines.append(f"- {qname}: not graded")
        quizzes_text = "\n".join(q_lines)

    return f"""Analyze this student's status in a specific course and provide personalized insights.

STUDENT: {student_name}
COURSE: {course.get('name', 'Unknown')} ({course.get('id', '')})
PROGRESS: {progress}% ({completed}/{total} activities completed)
AVERAGE SCORE: {avg_score if avg_score is not None else 'Not yet graded'}

ASSIGNMENTS:
{assignments_text if assignments_text else 'No assignments data available'}

QUIZ RESULTS:
{quizzes_text if quizzes_text else 'No quiz attempts recorded yet'}

Generate a JSON response with:
1. "insights": An array of 3-4 short, specific bullet points about the student's status in THIS course. Address the student directly with "you/your". Examples:
   - "You've completed 3/5 lab modules"
   - "You scored 6/10 on Quiz 1 — review the topics you missed"
   - "Try completing the next assignment before the deadline"
2. "study_tip": A single short, actionable study tip specific to this course and the student's current progress.

Return ONLY valid JSON, no markdown, no extra text.
"""


# ─────────────────── fallback ──────────────────────────

def _fallback_course_insights(course: dict) -> dict:
    """Fallback when AI is unavailable."""
    progress = course.get("progress", 0)
    completed = course.get("completedActivities", 0)
    total = course.get("totalActivities", 0)
    name = course.get("name", "this course")

    insights = [f"You've completed {completed}/{total} activities in {name}"]
    if progress < 50:
        insights.append("Your progress is below 50% - try to catch up this week")
        tip = f"Set aside dedicated time to work through the remaining modules in {name}."
    elif progress < 100:
        insights.append(f"You're at {progress}% — keep going!")
        tip = f"You're making good progress. Try to complete the next activity in {name} today."
    else:
        insights.append("Great job — you've completed all activities!")
        tip = "Review the material to solidify your understanding before any exams."

    return {"insights": insights, "study_tip": tip}
