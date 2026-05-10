"""
Analytics Routes for NeoBright LMS.
Provides rule-based learning analytics endpoints.
"""
from flask import Blueprint, jsonify, g, request
from auth.firebase_auth import firebase_required
from services.analytics_service import AnalyticsService
from services.moodle_service import MoodleService
from services.firestore_service import FirestoreService


analytics_bp = Blueprint('analytics', __name__, url_prefix='/api')


@analytics_bp.route('/analytics/overview', methods=['GET'])
@firebase_required
def get_analytics_overview():
    """
    Get analytics overview across all enrolled courses.
    
    Returns:
    {
        "overallRisk": "medium",
        "averageVelocity": 2.8,
        "totalCoursesAtRisk": 2,
        "courses": [
            {
                "courseId": 5,
                "weeklyProgress": [...],
                "velocity": 3.2,
                "engagement": {...},
                "riskLevel": "medium"
            }
        ]
    }
    """
    try:
        firebase_uid = g.firebase_uid
        
        # Get user's Moodle user ID
        fs = FirestoreService()
        user_doc = fs.get_user(firebase_uid)
        
        if not user_doc:
            return jsonify({"error": "User not found"}), 404
        
        moodle_user_id = user_doc.get("moodle_user_id") or user_doc.get("moodleUserId")
        
        if not moodle_user_id:
            return jsonify({"error": "Moodle account not linked"}), 400
        
        # Get enrolled courses
        courses = MoodleService.get_user_courses(int(moodle_user_id))
        
        if not courses:
            return jsonify({
                "overallRisk": "low",
                "averageVelocity": 0.0,
                "totalCoursesAtRisk": 0,
                "courses": []
            }), 200
        
        course_ids = [course["id"] for course in courses]
        
        # Compute analytics overview
        overview = AnalyticsService.get_analytics_overview(firebase_uid, course_ids)
        
        return jsonify(overview), 200
    
    except Exception as e:
        print(f"Error getting analytics overview: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@analytics_bp.route('/analytics/course/<int:course_id>', methods=['GET'])
@firebase_required
def get_course_analytics(course_id):
    """
    Get detailed analytics for a specific course.
    
    Returns:
    {
        "courseId": 5,
        "weeklyProgress": [
            { "week": "2024-W10", "progress": 45 },
            { "week": "2024-W11", "progress": 62 }
        ],
        "velocity": 3.2,
        "engagement": {
            "lastActive": "2024-03-15T10:30:00",
            "inactiveDays": 2,
            "engagementLevel": "high"
        },
        "riskLevel": "low",
        "lastUpdated": "2024-03-17T08:00:00"
    }
    """
    try:
        firebase_uid = g.firebase_uid
        
        # Compute analytics for this course
        analytics = AnalyticsService.compute_course_analytics(firebase_uid, course_id)
        
        return jsonify(analytics), 200
    
    except Exception as e:
        print(f"Error getting course analytics: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@analytics_bp.route('/analytics/risk/<int:course_id>', methods=['GET'])
@firebase_required
def get_risk_level(course_id):
    """
    Get risk level for a specific course.
    
    Returns:
    {
        "courseId": 5,
        "riskLevel": "medium",
        "reasons": [
            "Progress below 60%",
            "Inactive for 5 days"
        ]
    }
    """
    try:
        firebase_uid = g.firebase_uid
        
        # Detect risk
        risk_level = AnalyticsService.detect_risk_level(firebase_uid, course_id)
        
        # Get reasons
        fs = FirestoreService()
        progress_doc = fs.db.collection("progress").document(firebase_uid).collection(
            "courses"
        ).document(str(course_id)).get()
        
        reasons = []
        if progress_doc.exists:
            progress = progress_doc.to_dict().get("progress", 0)
            if progress < 30:
                reasons.append("Progress critically low (< 30%)")
            elif progress < 60:
                reasons.append("Progress below 60%")
        
        engagement = AnalyticsService.compute_engagement_frequency(firebase_uid, course_id)
        inactive_days = engagement.get("inactiveDays", 0)
        
        if inactive_days > 7:
            reasons.append(f"Inactive for {inactive_days} days")
        elif inactive_days > 3:
            reasons.append(f"Low activity ({inactive_days} days since last interaction)")
        
        return jsonify({
            "courseId": course_id,
            "riskLevel": risk_level,
            "reasons": reasons if reasons else ["No risk factors detected"]
        }), 200
    
    except Exception as e:
        print(f"Error getting risk level: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@analytics_bp.route('/analytics/course/<int:course_id>/progress-trend', methods=['GET'])
@firebase_required
def get_course_progress_trend(course_id: int):
    """Get progress trend for a course grouped by week/month/year.

    Query params:
    - granularity: week | month | year (default: week)
    - year: required for month/year
    - month: required for month (1-12)

    Returns:
    [
        {"label": "2026-W19", "progress": 42.5},
        {"label": "2026-W20", "progress": 48.0}
    ]
    """
    try:
        firebase_uid = g.firebase_uid

        granularity = (request.args.get('granularity') or 'week').lower()
        year = request.args.get('year', type=int)
        month = request.args.get('month', type=int)

        if granularity not in ['week', 'month', 'year']:
            return jsonify({"error": "Invalid granularity", "details": "Use week, month, or year"}), 400

        if granularity == 'month' and (year is None or month is None):
            return jsonify({"error": "Missing parameters", "details": "month view requires year and month"}), 400

        if granularity == 'year' and year is None:
            return jsonify({"error": "Missing parameters", "details": "year view requires year"}), 400

        points = AnalyticsService.compute_progress_trend(
            firebase_uid,
            course_id,
            granularity=granularity,  # type: ignore[arg-type]
            year=year,
            month=month,
        )

        return jsonify(points), 200

    except Exception as e:
        print(f"Error getting progress trend: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
