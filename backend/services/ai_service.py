"""
AI Service for NeoBright LMS - Phase 1.

Handles all LLM interactions:
- Prompt building from StudentContext
- OpenAI API calls
- Response parsing to AiInsights
- Fallback rule-based insights (no AI)

Architecture:
- Single responsibility: AI-only logic
- Input: StudentContext (from Phase 0)
- Output: AiInsights (to frontend/API)
- Error handling: graceful fallback if AI fails
"""
import json
import logging
import time
from typing import Dict, Any, Optional
from datetime import datetime

from models.ai_models import (
    StudentContext,
    AiInsights,
    AiActionItem,
    CourseAnalytics,
    OverallAnalytics,
)

from services.openai_client import get_openai_client


# ============================================================================
# SYSTEM PROMPT: Define AI role and constraints
# ============================================================================

SYSTEM_PROMPT = """You are NeoBright, a supportive academic learning coach for university students.

Your role:
- Analyze the student's learning progress and performance data
- Identify their strengths and areas for improvement
- Provide specific, actionable recommendations
- Be encouraging and supportive, not critical
- Focus on realistic, achievable goals

CRITICAL TONE RULE:
- ALWAYS address the student directly using "you" and "your" (second person)
- NEVER refer to them as "the student", "this student", or "they" — you are speaking TO them
- Example: "You've made strong progress in..." NOT "The student has demonstrated..."
- Use emojis to add warmth and encouragement (e.g., "Great job on your recent assignment! 🎉")


Constraints:
- Do NOT invent courses, grades, or activities that don't exist in the data
- Base all insights strictly on the provided student context
- IGNORE null/None averageScore values - these mean grades haven't been released yet
- Do NOT mention missing grades as a weakness
- Be concise: summaries ~2 sentences, action items ~1-2 sentences each
- Prioritize high-impact actions (focus on weak areas first)
- Consider course deadlines and velocity when recommending timing
- Always explain WHY an action matters (the "so what")

Output format:
Return ONLY a valid JSON object (no markdown, no extra text) matching this schema:
{
  "summary": "1-2 sentence overview of student status",
  "strengths": ["strength 1", "strength 2"],
  "areas_to_improve": ["area 1", "area 2"],
  "actions": [
    {
      "title": "Action title",
      "description": "Why and how to do this",
      "deadline_days": 7,
      "course_id": "COURSE123",
      "priority": "high"
    }
  ],
  "risk_level": "low|medium|high",
  "confidence_score": 0.95
}
"""


class AiService:
    """Service for AI-powered insights generation."""

    logger = logging.getLogger(__name__)

    @staticmethod
    def build_prompt(context: StudentContext) -> str:
        """
        Build user prompt from StudentContext.

        Converts context to structured JSON for the LLM to analyze.
        Deterministic and stable format.

        Args:
            context: StudentContext from Phase 0

        Returns:
            Formatted prompt string for LLM
        """
        # Convert context to dict for JSON serialization
        context_dict = context.to_dict()

        prompt = f"""Analyze this student's learning progress and provide personalized insights:

STUDENT DATA (JSON):
{json.dumps(context_dict, indent=2)}

INSTRUCTIONS:
1. Analyze the student's progress across all courses
2. Identify 2-3 key strengths based on performance metrics
3. Identify 2-3 areas needing improvement
4. Generate 3-5 specific, actionable recommendations
5. Rate overall risk level (low/medium/high) based on progress and velocity
6. Assign confidence score (0.0-1.0) to your analysis
7. Return ONLY valid JSON, no other text
"""
        return prompt

    @staticmethod
    def generate_insights(
        context: StudentContext, 
        app_config: Dict[str, Any],
        user_id: Optional[str] = None
    ) -> AiInsights:
        """
        Generate AI insights for a student.

        Main entry point: takes StudentContext and returns AiInsights.
        Handles OpenAI API call with error handling and fallback.

        Args:
            context: StudentContext from Phase 0
            app_config: Flask config dict with:
                - OPENAI_API_KEY: API key
                - AI_MODEL: Model name (e.g., "gpt-4o-mini")
                - AI_TEMPERATURE: Temperature (0-1)
                - AI_MAX_TOKENS: Max tokens
            user_id: Firebase UID for logging (optional)

        Returns:
            AiInsights dataclass with generated insights
        """
        from services.ai_logging_service import AiLoggingService
        
        start_time = time.time()
        model_name = app_config.get("AI_MODEL", "gpt-4o-mini")
        
        # Check if AI is configured — get_openai_client handles missing key
        try:
            # Build prompt from context
            user_prompt = AiService.build_prompt(context)

            # Get shared OpenAI client
            client = get_openai_client(app_config.get("OPENAI_API_KEY"))
            if client is None:
                AiService.logger.error("OpenAI client unavailable - using fallback")
                if user_id:
                    AiLoggingService.log_ai_call(
                        user_id=user_id,
                        endpoint="/api/ai/insights",
                        model="fallback",
                        success=True,
                        error_message="OpenAI client unavailable"
                    )
                return AiService.fallback_insights(context)

            # Call OpenAI API
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=app_config.get("AI_TEMPERATURE", 0.6),
                max_tokens=app_config.get("AI_MAX_TOKENS", 500),
            )

            # Extract response text
            raw_text = response.choices[0].message.content
            
            # Get token usage from response
            usage = response.usage
            prompt_tokens = usage.prompt_tokens if usage else None
            completion_tokens = usage.completion_tokens if usage else None
            total_tokens = usage.total_tokens if usage else None

            AiService.logger.debug(f"LLM response: {raw_text[:200]}...")

            # Parse response to AiInsights
            insights = AiService.parse_insights(raw_text, context)
            
            # Calculate response time
            response_time_ms = (time.time() - start_time) * 1000
            
            # Log successful API call
            if user_id:
                AiLoggingService.log_ai_call(
                    user_id=user_id,
                    endpoint="/api/ai/insights",
                    model=model_name,
                    success=True,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=total_tokens,
                    response_time_ms=response_time_ms
                )

            return insights

        except Exception as e:
            AiService.logger.error(f"AI generation failed: {str(e)}", exc_info=True)
            
            # Log failed API call
            if user_id:
                response_time_ms = (time.time() - start_time) * 1000
                AiLoggingService.log_ai_call(
                    user_id=user_id,
                    endpoint="/api/ai/insights",
                    model=model_name,
                    success=False,
                    error_message=str(e),
                    response_time_ms=response_time_ms
                )
            
            return AiService.fallback_insights(context)

    @staticmethod
    def parse_insights(raw_text: str, context: StudentContext) -> AiInsights:
        """
        Parse LLM response to AiInsights dataclass.

        Attempts to extract JSON from response and map to AiInsights.
        Falls back to fallback_insights if parsing fails.

        Args:
            raw_text: Raw response from LLM
            context: StudentContext for fallback

        Returns:
            AiInsights dataclass
        """
        try:
            # Remove markdown code blocks if present
            text = raw_text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()

            # Parse JSON
            data = json.loads(text)

            # Map to AiInsights with validation
            actions = []
            for action_data in data.get("actions", []):
                actions.append(
                    AiActionItem(
                        title=action_data.get("title", ""),
                        description=action_data.get("description", ""),
                        deadline_days=action_data.get("deadline_days"),
                        course_id=action_data.get("course_id"),
                        priority=action_data.get("priority", "medium"),
                    )
                )

            insights = AiInsights(
                summary=data.get("summary", ""),
                strengths=data.get("strengths", []),
                areas_to_improve=data.get("areas_to_improve", []),
                actions=actions,
                risk_level=data.get("risk_level", context.analytics.risk_level if context.analytics else "medium"),
                confidence_score=data.get("confidence_score", 0.8),
                generated_at=datetime.utcnow().isoformat() + "Z",
                context_timestamp=context.timestamp,
            )

            return insights

        except (json.JSONDecodeError, KeyError, ValueError) as e:
            AiService.logger.warning(f"Failed to parse AI response: {str(e)}")
            return AiService.fallback_insights(context)

    @staticmethod
    def fallback_insights(context: StudentContext) -> AiInsights:
        """
        Generate rule-based insights without AI.

        Used when AI is unavailable or fails. Generates insights from
        analytics data using simple rules (no LLM).

        Args:
            context: StudentContext

        Returns:
            AiInsights dataclass with rule-based insights
        """
        analytics = context.analytics or OverallAnalytics()

        # Identify strengths (courses above 70%)
        strengths = []
        strong_courses = [
            c.name for c in context.courses if c.average_score and c.average_score >= 70
        ]
        if strong_courses:
            strengths.append(f"Performing well in: {', '.join(strong_courses[:2])}")
        if analytics.completion_rate > 0.75:
            strengths.append("Maintaining good assignment completion rate")

        # Identify areas to improve (courses below 60%)
        areas = []
        weak_courses = [
            c.name for c in context.courses if c.average_score and c.average_score < 60
        ]
        if weak_courses:
            areas.append(f"Focus needed in: {', '.join(weak_courses[:2])}")
        if analytics.completion_rate < 0.6:
            areas.append("Need to improve activity completion rate")

        # Generate actions based on risk level
        actions = []

        # Action: Review weak topics
        if weak_courses:
            actions.append(
                AiActionItem(
                    title=f"Review {weak_courses[0]} content",
                    description=f"Allocate 5-7 hours this week to review key topics in {weak_courses[0]}. "
                    f"Start with the lowest-scoring assignment.",
                    deadline_days=7,
                    course_id=context.courses[0].id if context.courses else None,
                    priority="high",
                )
            )

        # Action: Complete pending activities
        incomplete_courses = [
            c for c in context.courses if c.completed_activities < c.total_activities
        ]
        if incomplete_courses:
            actions.append(
                AiActionItem(
                    title=f"Complete pending activities in {incomplete_courses[0].name}",
                    description=f"{incomplete_courses[0].total_activities - incomplete_courses[0].completed_activities} "
                    f"activities remain. Complete {(incomplete_courses[0].total_activities - incomplete_courses[0].completed_activities + 1) // 2} this week.",
                    deadline_days=7,
                    course_id=incomplete_courses[0].id,
                    priority="high",
                )
            )

        # Action: Maintain pace
        if analytics.velocity_activities_per_week > 0:
            actions.append(
                AiActionItem(
                    title="Maintain current learning pace",
                    description=f"You're completing {analytics.velocity_activities_per_week:.1f} activities/week. "
                    f"Keep this momentum to finish strong.",
                    deadline_days=14,
                    priority="medium",
                )
            )

        # Default summary based on progress
        if analytics.overall_progress >= 75:
            summary = f"You're on track with {analytics.overall_progress:.0f}% overall progress. Keep up the good work!"
        elif analytics.overall_progress >= 50:
            summary = f"You're at {analytics.overall_progress:.0f}% overall progress. Focus on weak areas to improve."
        else:
            summary = f"You're at {analytics.overall_progress:.0f}% progress. Prioritize catching up this week."

        # Determine risk level
        if analytics.overall_progress < 40:
            risk_level = "high"
        elif analytics.overall_progress < 60 or analytics.completion_rate < 0.5:
            risk_level = "medium"
        else:
            risk_level = "low"

        return AiInsights(
            summary=summary,
            strengths=strengths or ["Consistent engagement with coursework"],
            areas_to_improve=areas or ["Continue building course comprehension"],
            actions=actions,
            risk_level=risk_level,
            confidence_score=0.65,  # Lower confidence for rule-based
            generated_at=datetime.utcnow().isoformat() + "Z",
            context_timestamp=context.timestamp,
        )
