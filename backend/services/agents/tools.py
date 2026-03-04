"""
Agent tools — Phase 2: giving the Tutor Agent live Moodle access.

Each ``@function_tool`` receives a ``RunContextWrapper[TutorContext]``
as its first argument so it can access per-request student data and
the Flask app (for MoodleService calls that need ``current_app``).

Design:
  • Tools return **plain-text summaries** (not raw JSON) because the
    LLM will weave the answer into a natural reply.
  • Each tool is guarded with ``try/except`` → returns a user-friendly
    error string on failure so the agent can still respond.
  • Flask app context is pushed inside each tool via
    ``ctx.context.app.app_context()`` because ``Runner.run_sync``
    may execute tool functions in a different thread.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from agents import function_tool, RunContextWrapper

logger = logging.getLogger(__name__)


# ───────────────── per-request context ─────────────────────

@dataclass
class TutorContext:
    """Immutable bag of per-request student data carried into tools."""

    firebase_uid: str
    moodle_user_id: int | None
    enrolled_courses: list[dict] = field(default_factory=list)
    app: Any = None  # Flask app instance (for pushing app context)


# ───────────────── helpers ─────────────────────────────────

def _strip_html(html: str) -> str:
    """Remove HTML tags and collapse whitespace."""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _find_course(enrolled: list[dict], name: str) -> dict | None:
    """Fuzzy-match a course by name (case-insensitive substring)."""
    name_lower = name.lower()
    for c in enrolled:
        full = (c.get("name") or "").lower()
        short = (c.get("id") or "").lower()  # shortname
        if name_lower in full or name_lower in short:
            return c
    return None


# ───────────────── tool: grade details ─────────────────────

@function_tool
def get_grade_details(
    ctx: RunContextWrapper[TutorContext],
    course_name: str,
) -> str:
    """Look up detailed per-item grades for a specific course.

    Call this when the student asks about individual quiz scores,
    assignment marks, or a full grade breakdown — the system prompt
    only has the overall average.

    Args:
        course_name: Full or partial course name.
    """
    tc = ctx.context
    if not tc.moodle_user_id:
        return "Cannot look up grades — Moodle account not linked."

    course = _find_course(tc.enrolled_courses, course_name)
    if not course:
        return f"No enrolled course matching '{course_name}' found."

    course_id = course.get("moodle_id") or course.get("id")

    try:
        with tc.app.app_context():
            from services.moodle_service import MoodleService

            data = MoodleService.get_course_grades(int(course_id), tc.moodle_user_id)

        usergrades = data.get("usergrades", [])
        if not usergrades:
            return f"No grades available yet for {course.get('name')}."

        items = usergrades[0].get("gradeitems", [])
        if not items:
            return f"No graded items found in {course.get('name')}."

        lines = [f"Grade details for {course.get('name')}:\n"]
        for item in items:
            name = item.get("itemname") or "Course Total"
            raw = item.get("graderaw")
            gmax = item.get("grademax")
            pct = item.get("percentageformatted", "")

            if raw is not None and gmax:
                lines.append(f"  • {name}: {raw:.1f}/{gmax:.0f} ({pct})")
            else:
                lines.append(f"  • {name}: not yet graded")

        return "\n".join(lines)

    except Exception as e:
        logger.error("get_grade_details error: %s", e)
        return f"Could not retrieve grades for '{course_name}': {e}"


# ───────────────── tool: assignment details ────────────────

@function_tool
def get_assignment_details(
    ctx: RunContextWrapper[TutorContext],
    assignment_name: str,
) -> str:
    """Look up the full description and instructions for a specific assignment.

    Call this when the student asks what an assignment is about, what
    the requirements are, or needs the assignment instructions.

    Args:
        assignment_name: Full or partial assignment name.
    """
    tc = ctx.context
    name_lower = assignment_name.lower()

    try:
        with tc.app.app_context():
            from services.moodle_service import MoodleService

            for course in tc.enrolled_courses:
                course_id = course.get("moodle_id") or course.get("id")
                data = MoodleService.get_assignment_details(int(course_id))

                for c in data.get("courses", []):
                    for assign in c.get("assignments", []):
                        if name_lower in (assign.get("name") or "").lower():
                            name = assign.get("name", "Unknown")
                            intro = _strip_html(assign.get("intro") or "No description provided.")
                            duedate = assign.get("duedate", 0)
                            due_str = (
                                datetime.utcfromtimestamp(duedate).strftime("%B %d, %Y at %I:%M %p")
                                if duedate
                                else "No due date"
                            )

                            return (
                                f"Assignment: {name}\n"
                                f"Course: {course.get('name')}\n"
                                f"Due: {due_str}\n\n"
                                f"Description:\n{intro}"
                            )

        return f"No assignment matching '{assignment_name}' found in your enrolled courses."

    except Exception as e:
        logger.error("get_assignment_details error: %s", e)
        return f"Could not retrieve details for '{assignment_name}': {e}"


# ───────────────── tool: course content search ─────────────

@function_tool
def search_course_content(
    ctx: RunContextWrapper[TutorContext],
    course_name: str,
) -> str:
    """Fetch the full content structure (sections and modules) for a course.

    Call this when the student asks about topics, lectures, or materials
    in a course that is NOT the active one, or when more detail is needed
    than what is already in the system prompt.

    Args:
        course_name: Full or partial course name.
    """
    tc = ctx.context
    course = _find_course(tc.enrolled_courses, course_name)
    if not course:
        return f"No enrolled course matching '{course_name}' found."

    course_id = course.get("moodle_id") or course.get("id")

    try:
        with tc.app.app_context():
            from services.moodle_service import MoodleService

            contents = MoodleService.get_course_contents(int(course_id))

        if not contents:
            return f"No content found for {course.get('name')}."

        lines = [f"Content structure for {course.get('name')}:\n"]
        for section in contents:
            section_name = section.get("name", "Unnamed Section")
            modules = section.get("modules", [])
            if not modules:
                continue

            lines.append(f"\n  Section: {section_name}")
            for mod in modules:
                mod_name = mod.get("name", "Unnamed")
                mod_type = mod.get("modname", "resource")
                desc = _strip_html(mod.get("description") or "")[:150]
                line = f"    - [{mod_type}] {mod_name}"
                if desc:
                    line += f" — {desc}"
                lines.append(line)

        return "\n".join(lines) if len(lines) > 1 else f"No modules found in {course.get('name')}."

    except Exception as e:
        logger.error("search_course_content error: %s", e)
        return f"Could not retrieve content for '{course_name}': {e}"


# ───────────────── tool: course activities status ──────────

@function_tool
def get_course_activities_status(
    ctx: RunContextWrapper[TutorContext],
    course_name: str,
) -> str:
    """List all activities in a course with their completion status.

    Call this when the student asks what they have or haven't completed,
    or before marking an activity as done (to resolve the correct cmid).

    Args:
        course_name: Full or partial course name.
    """
    tc = ctx.context
    if not tc.moodle_user_id:
        return "Cannot check progress — Moodle account not linked."

    course = _find_course(tc.enrolled_courses, course_name)
    if not course:
        return f"No enrolled course matching '{course_name}' found."

    course_id = int(course.get("moodle_id") or course.get("id"))

    try:
        with tc.app.app_context():
            from services.moodle_service import MoodleService

            contents = MoodleService.get_course_contents(course_id)
            progress = MoodleService.get_course_progress(course_id, tc.moodle_user_id)

        # Build cmid → completion lookup
        statuses = progress.get("statuses", [])
        done_map: dict[int, bool] = {}
        for s in statuses:
            cmid = s.get("cmid")
            if cmid is not None:
                done_map[cmid] = s.get("state", 0) >= 1

        if not contents:
            return f"No content found for {course.get('name')}."

        lines = [f"Activities for {course.get('name')}:\n"]
        total = 0
        completed = 0
        for section in contents:
            section_name = section.get("name", "Unnamed Section")
            modules = section.get("modules", [])
            if not modules:
                continue
            lines.append(f"\n  Section: {section_name}")
            for mod in modules:
                mod_name = mod.get("name", "Unnamed")
                cmid = mod.get("id")
                is_done = done_map.get(cmid, False)
                status = " Done" if is_done else "Not done"
                lines.append(f"    - {status} | {mod_name} (cmid={cmid})")
                total += 1
                if is_done:
                    completed += 1

        lines.insert(1, f"  Progress: {completed}/{total} activities completed")
        return "\n".join(lines) if total > 0 else f"No trackable activities in {course.get('name')}."

    except Exception as e:
        logger.error("get_course_activities_status error: %s", e)
        return f"Could not retrieve activity status for '{course_name}': {e}"


# ───────────────── tool: mark activity done (ACTION) ───────

@function_tool
def mark_activity_done(
    ctx: RunContextWrapper[TutorContext],
    course_name: str,
    activity_name: str,
) -> str:
    """Mark a specific activity as complete in the student's Moodle account.

    THIS IS A WRITE ACTION — it changes the student's completion record.
    Only call this when the student explicitly asks to mark something as done
    (e.g. "mark Lab 2 as done", "I finished the Chapter 3 lecture").

    Steps: resolve the course → find the cmid by matching the activity
    name → call MoodleService.mark_activity_complete.

    Args:
        course_name:  Full or partial course name.
        activity_name: Full or partial activity/module name.
    """
    tc = ctx.context
    if not tc.moodle_user_id:
        return "Cannot mark activity — Moodle account not linked."

    course = _find_course(tc.enrolled_courses, course_name)
    if not course:
        return f"No enrolled course matching '{course_name}' found."

    course_id = int(course.get("moodle_id") or course.get("id"))
    name_lower = activity_name.lower()

    try:
        with tc.app.app_context():
            from services.moodle_service import MoodleService

            contents = MoodleService.get_course_contents(course_id)

            # Find the module (cmid) by name
            matched_mod = None
            for section in (contents or []):
                for mod in section.get("modules", []):
                    if name_lower in (mod.get("name") or "").lower():
                        matched_mod = mod
                        break
                if matched_mod:
                    break

            if not matched_mod:
                return (
                    f"No activity matching '{activity_name}' found in "
                    f"{course.get('name')}. Use get_course_activities_status "
                    f"to see the full list."
                )

            cmid = matched_mod["id"]
            mod_name = matched_mod.get("name", activity_name)

            # Perform the write
            MoodleService.mark_activity_complete(tc.moodle_user_id, cmid, True)

            # Also record in Firestore for the frontend
            from services.progress_service import ProgressService
            ProgressService.mark_activity_complete(tc.firebase_uid, course_id, cmid)

        return (
            f"Marked '{mod_name}' as complete in {course.get('name')}. "
            f"Your progress has been updated."
        )

    except Exception as e:
        logger.error("mark_activity_done error: %s", e)
        return f"Could not mark '{activity_name}' as done: {e}"


# ───────────────── tool: quiz attempts ─────────────────────

@function_tool
def get_quiz_attempts(
    ctx: RunContextWrapper[TutorContext],
    course_name: str,
) -> str:
    """Fetch the student's quiz attempt history and scores for a course.

    Call this when the student asks about their quiz results,
    past attempts, or wants to review quiz performance.

    Args:
        course_name: Full or partial course name.
    """
    tc = ctx.context
    if not tc.moodle_user_id:
        return "Cannot look up quiz attempts — Moodle account not linked."

    course = _find_course(tc.enrolled_courses, course_name)
    if not course:
        return f"No enrolled course matching '{course_name}' found."

    course_id = int(course.get("moodle_id") or course.get("id"))

    try:
        with tc.app.app_context():
            from services.moodle_service import MoodleService

            quizzes = MoodleService.get_quizzes_by_course(course_id)

        quiz_list = quizzes.get("quizzes", [])
        if not quiz_list:
            return f"No quizzes found in {course.get('name')}."

        lines = [f"Quiz attempts for {course.get('name')}:\n"]

        for quiz in quiz_list:
            quiz_id = quiz.get("id")
            quiz_name = quiz.get("name", "Unknown Quiz")

            with tc.app.app_context():
                from services.moodle_service import MoodleService as MS
                attempts_data = MS.get_quiz_user_attempts(quiz_id, tc.moodle_user_id)

            attempts = attempts_data.get("attempts", [])
            if not attempts:
                lines.append(f"  📝 {quiz_name}: No attempts yet")
                continue

            for att in attempts:
                att_num = att.get("attempt", "?")
                state = att.get("state", "unknown")
                grade = att.get("sumgrades")
                timestart = att.get("timestart", 0)
                timefinish = att.get("timefinish", 0)

                started = (
                    datetime.fromtimestamp(timestart, tz=timezone.utc).strftime("%b %d %H:%M")
                    if timestart else "?"
                )
                duration = ""
                if timestart and timefinish:
                    mins = (timefinish - timestart) // 60
                    duration = f" ({mins} min)"

                if grade is not None:
                    lines.append(
                        f"  📝 {quiz_name} — Attempt {att_num}: "
                        f"{grade} pts | {state}{duration} | {started}"
                    )
                else:
                    lines.append(
                        f"  📝 {quiz_name} — Attempt {att_num}: "
                        f"{state}{duration} | {started}"
                    )

        return "\n".join(lines)

    except Exception as e:
        logger.error("get_quiz_attempts error: %s", e)
        return f"Could not retrieve quiz attempts for '{course_name}': {e}"
