"""
AI Routes for NeoBright LMS.
Provides AI-related endpoints.
"""
from flask import Blueprint, jsonify, g, current_app
from auth.firebase_auth import firebase_required
from services.ai_context_service import AIContextService
from services.ai_service import AiService
from services.ai_rate_limit_service import ai_rate_limit


ai_bp = Blueprint('ai', __name__, url_prefix='/api')


@ai_bp.route('/ai/context', methods=['GET'])
@firebase_required
def get_ai_context():
    """
    GET /api/ai/context
    
    Returns standardized AI context for logged-in student.
    
    This endpoint aggregates:
    - Student profile
    - Enrolled courses with progress
    - Grades/scores
    - Weekly progress trends
    - Overall analytics
    
    Returns:
    {
        "student": {...},
        "courses": [...],
        "analytics": {...}
    }
    """
    try:
        firebase_uid = g.firebase_uid
        
        # Build AI context from aggregated data
        context = AIContextService.build_ai_context(firebase_uid)
        
        return jsonify(context), 200
    
    except Exception as e:
        print(f"Error getting AI context: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@ai_bp.route('/ai/insights', methods=['GET'])
@firebase_required
@ai_rate_limit  # Rate limit after auth (needs firebase_uid)
def get_ai_insights():
    """
    GET /api/ai/insights
    
    Returns AI-generated insights for logged-in student.
    
    Rate limited to 2 calls/minute, 20 calls/hour per user.
    
    Uses:
    - StudentContext from /ai/context
    - AiService to generate insights
    - Fallback to rule-based insights if AI fails
    
    Returns:
    {
        "summary": "...",
        "strengths": [...],
        "areas_to_improve": [...],
        "actions": [...],
        "risk_level": "low|medium|high",
        "confidence_score": 0.95,
        "generated_at": "2026-01-27T..."
    }
    """
    try:
        from models.ai_models import StudentContext
        
        firebase_uid = g.firebase_uid
        
        # Build AI context from aggregated data (returns dict)
        context_dict = AIContextService.build_ai_context(firebase_uid)
        
        # Convert dict to StudentContext object
        context = StudentContext.from_dict(context_dict)
        
        # Generate insights using AiService (pass user_id for logging)
        insights = AiService.generate_insights(
            context, 
            current_app.config,
            user_id=firebase_uid  # For logging
        )
        
        # Convert dataclass to dict for JSON response
        return jsonify(insights.to_dict()), 200
    
    except Exception as e:
        print(f"Error generating AI insights: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
