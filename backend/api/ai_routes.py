"""
AI Routes for NeoBright LMS.
Provides AI-related endpoints.
"""
from flask import Blueprint, jsonify, g
from auth.firebase_auth import firebase_required
from services.ai_context_service import AIContextService


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
