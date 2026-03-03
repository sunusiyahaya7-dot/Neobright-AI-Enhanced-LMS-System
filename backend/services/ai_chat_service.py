"""
AI Chat Service for NeoBright LMS.

Phase 0 — extracted from ai_routes.py.
Phase 1 — powered by the OpenAI Agents SDK.

The public function `generate_chat_response` builds a per-
request Tutor Agent, feeds it the conversation history via
`Runner.run_sync()`, and returns the plain-text reply.
"""
import logging
import time
from datetime import datetime, timezone

from flask import current_app
from agents import Runner

from services.agents.tutor_agent import create_tutor_agent
from services.agents.tools import TutorContext
from services.moodle_service import MoodleService
from services.ai_logging_service import AiLoggingService
from services.firestore_service import FirestoreService

logger = logging.getLogger(__name__)


# ─────────────────────── public API ────────────────────────

def generate_chat_response(
    user_message: str,
    context: dict,
    conversation_history: list,
    course_id: int | None,
    app_config: dict,
    *,
    user_id: str | None = None,
) -> str:
    """
    Generate an AI chat response.

    Args:
        user_message: The user's (possibly file-augmented) message.
        context: Cached AI context dict from AIContextService.
        conversation_history: Last N Firestore message dicts.
        course_id: Active Moodle course ID (or None).
        app_config: Flask app.config dict.
        user_id: Firebase UID for logging (keyword-only).

    Returns:
        The assistant's reply text.
    """
    start_time = time.time()
    model = app_config.get("AI_MODEL", "gpt-4o-mini")

    # Gate: no API key → immediate fallback
    if not app_config.get("OPENAI_API_KEY"):
        logger.warning("OPENAI_API_KEY not set — returning fallback")
        return _fallback_chat_response(user_message)

    # ── Build per-request agent ────────────────────────────
    system_prompt = _build_chat_system_prompt(context, course_id, app_config)

    agent = create_tutor_agent(
        instructions=system_prompt,
        model=model,
        temperature=app_config.get("AI_TEMPERATURE", 0.6),
        max_tokens=app_config.get("AI_MAX_TOKENS", 2000),
    )

    # ── Assemble conversation input ───────────────────────
    input_items: list[dict] = []
    for msg in conversation_history:
        input_items.append({
            "role": msg.get("role", "user"),
            "content": msg.get("content", ""),
        })
    if not conversation_history or conversation_history[-1].get("content") != user_message:
        input_items.append({"role": "user", "content": user_message})

    # ── Build per-request context for tools ─────────────
    moodle_user_id = None
    if user_id:
        try:
            user_doc = FirestoreService().get_user(user_id)
            if user_doc:
                moodle_user_id = user_doc.get("moodle_user_id") or user_doc.get("moodleUserId")
                if moodle_user_id is not None:
                    moodle_user_id = int(moodle_user_id)
        except Exception:
            logger.debug("Could not resolve moodle_user_id for tools")

    tutor_ctx = TutorContext(
        firebase_uid=user_id or "",
        moodle_user_id=moodle_user_id,
        enrolled_courses=context.get("courses", []),
        app=current_app._get_current_object(),
    )

    # ── Run the agent ─────────────────────────────────────
    try:
        result = Runner.run_sync(agent, input=input_items, context=tutor_ctx)
        reply = result.final_output

        if not reply:
            return _fallback_chat_response(user_message)

        # Extract token usage from SDK raw responses
        if user_id and result.raw_responses:
            usage = result.raw_responses[-1].usage
            AiLoggingService.log_ai_call(
                user_id=user_id,
                endpoint="/api/ai/chat",
                model=model,
                success=True,
                prompt_tokens=usage.input_tokens if usage else None,
                completion_tokens=usage.output_tokens if usage else None,
                total_tokens=usage.total_tokens if usage else None,
                response_time_ms=(time.time() - start_time) * 1000,
            )

        return reply

    except Exception as e:
        logger.error("Agent chat error: %s", e)
        if user_id:
            AiLoggingService.log_ai_call(
                user_id=user_id,
                endpoint="/api/ai/chat",
                model=model,
                success=False,
                error_message=str(e),
                response_time_ms=(time.time() - start_time) * 1000,
            )
        return _fallback_chat_response(user_message)


# ─────────────────── prompt builders  ──────────────────────

def _build_chat_system_prompt(
    context: dict,
    course_id: int | None,
    app_config: dict,
) -> str:
    """Build the full system prompt for a chat turn."""
    assignments_text = _format_assignments_context(context.get("assignments", []))
    quizzes_text = _format_quizzes_context(context.get("quizzes", []))
    course_content_text = _format_active_course_content(course_id)

    return f"""You are NeoBright, a helpful AI learning assistant for university students.

STUDENT CONTEXT:
- Name: {context.get('student', {}).get('name', 'Student')}
- Overall Progress: {context.get('analytics', {}).get('overallProgress', 0)}%
- Risk Level: {context.get('analytics', {}).get('riskLevel', 'unknown')}
- Enrolled Courses: {len(context.get('courses', []))}

{_format_courses_context(context.get('courses', []), course_id)}

{course_content_text}

{assignments_text}

{quizzes_text}

GUIDELINES:
- If user asks you show them their progress, Don't start with "The student's progress is..." Instead, say "Your progress is..." etc.
- Be encouraging, supportive, and helpful
- Provide specific, actionable advice
- Reference the student's actual courses and progress when relevant
- Keep responses concise but thorough
- If asked about grades or progress, use the provided context data to give specific numbers
- If asked about due dates or deadlines, use the ASSIGNMENTS context above to give specific dates and names
- IMPORTANT: Distinguish between SUBMITTED and NOT SUBMITTED assignments. If an assignment is marked as SUBMITTED, do NOT call it overdue or tell the student to submit it — it's already done
- Only flag assignments as overdue if they are BOTH past due AND not submitted
- Format responses using proper markdown for readability:
  - Use ### for main section headers
  - Use **bold** for emphasis
  - Use - for bullet list items (always include the dash and a space)
  - Use 1. 2. 3. for numbered/ordered lists
  - Never write list items as bare text without a - or number prefix
  - Use **Label:** Description format for definition-style items within lists
- Always speak directly to the student using "you" and "your"
- Avoid jargon or complex terminology; keep language simple and student-friendly

QUIZ & LEARNING GUIDELINES:
- When a student asks to be quizzed ("Quiz Me", "create a quiz", "test me", etc.):
  - If COURSE CONTENT STRUCTURE is available above, use the section and module names to generate relevant quiz questions based on those topics
  - If the student mentions a specific topic/section name from the COURSE CONTENT, create questions based on that topic's modules
  - Only ask for uploaded materials if you truly have no course content context at all
  - When a student uploads a file and asks you to quiz them on it, extract the key concepts and create 3-5 questions based on that content
  - Make sure quiz questions are directly relevant to the provided material and not generic questions about the course
  - When creating quiz questions, provide a mix of question types (e.g., multiple choice, short answer) and cover different aspects of the material (definitions, applications, implications)
  - When displaying quiz questions, format them clearly with question numbers and options (if multiple choice)
  - When displaying quiz results, provide explanations for correct and incorrect answers to enhance learning 
  - Display the Quiz Questions and Answers beautifully using markdown and emojis for better engagement

SUMMARIZATION & TOPIC EXPLANATION GUIDELINES:
- When a student asks to summarize or explain a topic:
  - If COURSE CONTENT STRUCTURE is available above, use the section/module names to identify what the topic covers
  - Use the module names (lectures, labs, resources) listed under each section as context clues for what the topic teaches
  - Explain based on your general knowledge of the subject matter, referencing the specific modules/lectures under that topic
  - Do NOT ask the student to provide materials if you already have the course structure — use the module/lecture names as guidance
  - Only ask for uploaded notes if the topic is highly specialized and you have zero course content context
- Summarize concisely, focusing on key points and main ideas
- For summaries, use numbered points for main ideas and bullet points for details
- Summaries should be clear enough for a beginner to understand
- If asked to summarize again, provide an even more concise version focusing on the absolute essentials
- Never make up information not in the context
- If asked anything that is not related to learning or courses, politely decline and steer back to academic topics
- Always prioritize the student's learning and well-being
- Current date: {datetime.utcnow().date().isoformat()}
- Respond to the user's messages based on this context and the conversation history.

TOOL USE:
- You have tools that can fetch LIVE data from the student's learning platform.
  Use them when the context above is insufficient:
  • **get_grade_details** — call when the student asks for individual quiz/assignment scores
    or a detailed grade breakdown for a specific course.
  • **get_assignment_details** — call when the student asks what an assignment is about,
    its requirements, or its full description.
  • **search_course_content** — call when the student asks about topics, lectures, or
    materials in a course (especially if it is not the active course shown above).
- For simple questions answerable from the STUDENT CONTEXT above, do NOT call tools — just reply directly.
"""


# ─────────────────── formatting helpers ────────────────────

def _format_courses_context(courses: list, active_course_id: int | None) -> str:
    """Format courses for system prompt."""
    if not courses:
        return "No courses enrolled."

    lines = ["COURSES:"]
    for course in courses:
        marker = "→ " if (course.get("moodle_id") == active_course_id or course.get("id") == active_course_id) else "  "
        score_str = f", Avg: {course.get('averageScore')}%" if course.get("averageScore") else ""
        lines.append(
            f"{marker}{course.get('name', 'Unknown')} - Progress: {course.get('progress', 0)}%{score_str}"
        )
    return "\n".join(lines)


def _format_active_course_content(course_id: int | None) -> str:
    """Fetch and format sections/modules for the active course."""
    if not course_id:
        return ""

    try:
        contents = MoodleService.get_course_contents(course_id)
        if not contents:
            return ""

        lines = ["COURSE CONTENT STRUCTURE (sections and modules for the active course):"]
        for section in contents:
            section_name = section.get("name", "Unnamed Section")
            modules = section.get("modules", [])
            if not modules:
                continue
            lines.append(f"\n  Section: {section_name}")
            for mod in modules:
                mod_name = mod.get("name", "Unnamed")
                mod_type = mod.get("modname", "resource")
                description = mod.get("description", "")
                line = f"    - [{mod_type}] {mod_name}"
                if description:
                    clean_desc = description[:200].replace("\n", " ").strip()
                    line += f" — {clean_desc}"
                lines.append(line)

        if len(lines) == 1:
            return ""

        lines.append("\nUse this structure to answer questions about specific sections/topics in this course.")
        return "\n".join(lines)

    except Exception as e:
        logger.error("Error fetching course content for prompt: %s", e)
        return ""


def _format_assignments_context(assignments: list) -> str:
    """Format assignments with due dates and submission status."""
    if not assignments:
        return "ASSIGNMENTS:\nNo assignments found."

    now = datetime.now(timezone.utc)

    pending_lines = ["PENDING ASSIGNMENTS (not yet submitted):"]
    submitted_lines = ["SUBMITTED/COMPLETED ASSIGNMENTS:"]
    has_pending = False
    has_submitted = False

    for a in assignments:
        name = a.get("name", "Unknown")
        course = a.get("course", "Unknown")
        duedate_ts = a.get("duedate_ts", 0)
        status = a.get("status", "not submitted")

        if duedate_ts:
            due_dt = datetime.utcfromtimestamp(duedate_ts).replace(tzinfo=timezone.utc)
            due_str = due_dt.strftime("%B %d, %Y at %I:%M %p")
            days_diff = (due_dt - now).days
            if days_diff < 0:
                time_label = f"(was due {abs(days_diff)} days ago)"
            elif days_diff == 0:
                time_label = "(DUE TODAY)"
            elif days_diff == 1:
                time_label = "(DUE TOMORROW)"
            else:
                time_label = f"(due in {days_diff} days)"
        else:
            due_str = "No due date set"
            time_label = ""

        if status == "submitted":
            has_submitted = True
            submitted_lines.append(f" {name} [{course}] — Due: {due_str} — SUBMITTED")
        else:
            has_pending = True
            if duedate_ts and days_diff < 0:
                pending_lines.append(f"  {name} [{course}] — Due: {due_str} {time_label} — OVERDUE, NOT SUBMITTED")
            else:
                pending_lines.append(f"  {name} [{course}] — Due: {due_str} {time_label}")

    result_lines = []
    if has_pending:
        result_lines.extend(pending_lines)
    else:
        result_lines.append("PENDING ASSIGNMENTS: None — all assignments are submitted! 🎉")
    result_lines.append("")
    if has_submitted:
        result_lines.extend(submitted_lines)

    return "\n".join(result_lines)


def _format_quizzes_context(quizzes: list) -> str:
    """Format quiz grades for the AI system prompt."""
    if not quizzes:
        return "QUIZ RESULTS:\nNo quiz attempts recorded yet."

    lines = ["QUIZ RESULTS:"]
    for q in quizzes:
        name = q.get("name", "Unknown")
        course = q.get("course", "")
        score = q.get("score")
        max_score = q.get("maxScore")
        pct = q.get("percentage")
        status = q.get("status", "not graded")

        if score is not None and max_score is not None:
            lines.append(f"  - {name} [{course}]: {score}/{max_score} ({pct}%) — {status}")
        else:
            lines.append(f"  - {name} [{course}]: {status}")

    return "\n".join(lines)


def _fallback_chat_response(user_message: str) -> str:
    """Fallback response when AI is unavailable."""
    return (
        "I'm currently operating in limited mode. While I can't provide AI-powered responses right now, "
        "here are some general tips:\n\n"
        "• Check your course materials and syllabus for guidance\n"
        "• Review your progress dashboard for insights\n"
        "• Reach out to your instructor for specific questions\n\n"
        "Please try again later for personalized AI assistance."
    )
