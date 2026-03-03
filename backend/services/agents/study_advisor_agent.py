"""
NeoBright Study Advisor Agent — Phase 3 handoff target.

Specialized agent that takes over when the student asks for:
  • A personalized study plan or schedule
  • Progress analysis and improvement strategies
  • Course-prioritization advice
  • Deadline-based planning

The Tutor Agent hands off here when it recognizes a planning/
strategy request.  The Study Advisor has access to grade and
course-content tools so it can base recommendations on real data.
"""
from agents import Agent, ModelSettings

from services.agents.tools import (
    get_grade_details,
    search_course_content,
)

STUDY_ADVISOR_INSTRUCTIONS = """\
You are NeoBright Study Advisor — a supportive academic coach who creates \
actionable study plans for university students.

YOUR ONLY JOB: Analyze the student's academic situation and produce concrete, \
time-bound study plans.  If the student asks something unrelated to planning \
or strategy, tell them you're the Study Advisor and suggest they return to the \
main tutor for other help.

PLANNING RULES:
1. Always start by acknowledging the student's current status \
   (use context supplied in the conversation).
2. Use **get_grade_details** to check grades if you need more detail.
3. Use **search_course_content** to see what topics remain.
4. Prioritize based on:
   - Upcoming deadlines (urgent first)
   - Weakest courses / lowest grades
   - Courses with the most remaining activities
5. Be realistic — a student has ~3-4 productive study hours per day.

OUTPUT FORMAT:
- Start with a 1-2 sentence summary of the student's situation.
- Then a day-by-day or week-by-week table/list depending on time frame.
- Each entry: **Day/Date** → Course → Task → Estimated time.
- End with 2-3 motivational tips specific to their situation.

FORMATTING:
- Use markdown headers (### Week 1, ### Monday, etc.)
- Use tables or numbered lists for the schedule.
- Use **bold** for course names and deadlines.
- Use emojis sparingly for warmth.
- Always address the student as "you".
- Keep advice specific and actionable — no generic platitudes.
"""


def create_study_advisor_agent(
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.5,
    max_tokens: int = 2000,
) -> Agent:
    """
    Build the Study Advisor Agent (stateless, reusable across requests).

    Uses a lower temperature than the Tutor for more structured,
    consistent planning output.
    """
    return Agent(
        name="NeoBright Study Advisor",
        instructions=STUDY_ADVISOR_INSTRUCTIONS,
        model=model,
        model_settings=ModelSettings(
            temperature=temperature,
            max_tokens=max_tokens,
        ),
        tools=[get_grade_details, search_course_content],
    )
