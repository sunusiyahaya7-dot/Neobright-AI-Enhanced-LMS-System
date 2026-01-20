"""
Enrollment routes for course enrollment and progress tracking.
"""
from flask import Blueprint, request, jsonify, g
from auth.firebase_auth import firebase_required
from services.firestore_service import FirestoreService

enrollment_bp = Blueprint("enrollment", __name__, url_prefix="/api")

@enrollment_bp.route("/enrollments", methods=["POST"])
@firebase_required
def create_enrollment():
    """Enroll user in a course."""
    body = request.get_json() or {}
    course_id = body.get("courseId")
    
    if not course_id:
        return jsonify({"error": "courseId is required"}), 400
    
    fs = FirestoreService()
    
    # Check if already enrolled
    existing = fs.get_enrollment(g.firebase_uid, course_id)
    if existing:
        return jsonify({"error": "Already enrolled in this course"}), 400
    
    # Create enrollment
    enrollment_id = fs.create_enrollment(g.firebase_uid, course_id)
    
    return jsonify({
        "success": True,
        "enrollmentId": enrollment_id,
        "message": "Successfully enrolled in course"
    }), 201

@enrollment_bp.route("/enrollments", methods=["GET"])
@firebase_required
def get_enrollments():
    """Get all user enrollments."""
    fs = FirestoreService()
    enrollments = fs.get_user_enrollments(g.firebase_uid)
    
    return jsonify({
        "success": True,
        "enrollments": enrollments,
        "count": len(enrollments)
    })

@enrollment_bp.route("/enrollments/<enrollment_id>/progress", methods=["PUT"])
@firebase_required
def update_progress(enrollment_id):
    """Update enrollment progress."""
    body = request.get_json() or {}
    progress = body.get("progress", 0)
    completed_section = body.get("completedSection")
    
    fs = FirestoreService()
    fs.update_enrollment_progress(enrollment_id, progress, completed_section)
    
    return jsonify({
        "success": True,
        "message": "Progress updated"
    })

@enrollment_bp.route("/courses/<int:course_id>/enrollment", methods=["GET"])
@firebase_required
def get_course_enrollment(course_id):
    """Get user's enrollment for specific course."""
    fs = FirestoreService()
    enrollment = fs.get_enrollment(g.firebase_uid, course_id)
    
    if not enrollment:
        return jsonify({"enrolled": False}), 200
    
    return jsonify({
        "enrolled": True,
        "enrollment": enrollment
    })