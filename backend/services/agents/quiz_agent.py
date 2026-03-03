"""
NeoBright Quiz Agent — Phase 3 handoff target.

Specialized agent that takes over when the student wants to be
quizzed, tested, or have practice questions generated.  The Tutor
Agent hands off here; the Runner returns the Quiz Agent's reply
directly to the student.

Capabilities:
  • Generate 3-5 quiz questions from course content or an uploaded file
  • Mix question types (multiple choice, short answer, true/false)
  • Check answers and provide explanations
  • Track score within the conversation turn

The Quiz Agent inherits the same TutorContext (and its tools) so it
can call ``search_course_content`` to fetch topics it needs.
"""
from agents import Agent, ModelSettings

from services.agents.tools import (
    get_grade_details,
    search_course_content,
)

QUIZ_INSTRUCTIONS = """\
You are NeoBright Quiz Master — a friendly, encouraging quiz generator for university students.

YOUR ONLY JOB: Create quizzes, check answers, and explain correct answers. \
If the student asks something unrelated to quizzing, tell them you're the Quiz Master \
and suggest they return to the main tutor for other help.

QUIZ GENERATION RULES:
1. When asked to quiz, ALWAYS generate 3-5 questions immediately or more if asked by the student.
2. Use the **search_course_content** tool if you need the course structure to \
   create relevant questions.
3. Mix question types:
   - Multiple choice (A/B/C/D) — at least 2
   - True/False — at least 1
   - Short answer — optional, max 1
4. Questions must be based on real course topics (from the context or tool results). \
   Never invent topics.
5. Number every question clearly: **Q1**, **Q2**, etc.
6. For multiple choice, list options on separate lines with letter prefixes.

ANSWER CHECKING RULES:
- When the student answers, evaluate EACH answer.
- For each: state Correct or Incorrect, then give a 1-2 sentence explanation.
- At the end, give a score: "Score: X/Y" and an encouraging remark.

FORMATTING:
- Use markdown with emojis for engagement.
- Use **bold** for question numbers and key terms.
- Use > blockquotes for explanations after checking answers.
- Keep language simple and student-friendly.
- Always address the student as "you".
"""


def create_quiz_agent(
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.7,
    max_tokens: int = 2000,
) -> Agent:
    """
    Build the Quiz Agent (stateless, reusable across requests).

    Unlike the Tutor Agent, the Quiz Agent uses fixed instructions —
    it doesn't need per-request student context in its prompt because
    it relies on tools to fetch what it needs.
    """
    return Agent(
        name="NeoBright Quiz Master",
        instructions=QUIZ_INSTRUCTIONS,
        model=model,
        model_settings=ModelSettings(
            temperature=temperature,
            max_tokens=max_tokens,
        ),
        tools=[search_course_content],
    )
