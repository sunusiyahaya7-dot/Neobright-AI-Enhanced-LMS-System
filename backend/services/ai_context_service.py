"""
AI Context Service for NeoBright LMS.
Builds standardized JSON context for AI features.
"""
from typing import Dict, List, Optional
from datetime import datetime
from services.firestore_service import FirestoreService
from services.moodle_service import MoodleService
from services.progress_service import ProgressService
from services.analytics_service import AnalyticsService


class AIContextService:
    """Builds standardized AI context from aggregated analytics."""

    @staticmethod
    def build_ai_context(firebase_uid: str) -> Dict:
        """
        Build complete AI context JSON for a student.
        
        Data Flow:
        1. Get Firebase user → student object
        2. Get Moodle user ID from Firestore
        3. Get enrolled courses
        4. For each course: fetch cached progress (includes averageScore)
        5. Get overall analytics
        6. Return standardized structure
        
        Returns:
        {
            "student": {
                "id": "firebase_uid",
                "name": "Student Name"
            },
            "courses": [
                {
                    "id": "CSSB4113",
                    "name": "Software Quality Assurance",
                    "progress": 78,
                    "averageScore": 72,
                    "completedActivities": 10,
                    "totalActivities": 14,
                    "lastAccess": "2026-01-26T12:30:00Z"
                }
            ],
            "analytics": {
                "overallProgress": 75,
                "weeklyProgress": [20, 35, 55, 72, 75],
                "completionRate": 1.0,
                "velocityActivitiesPerWeek": 3,
                "riskLevel": "medium"
            }
        }
        """
        try:
            print(f"Building AI context for user {firebase_uid}...")
            
            fs = FirestoreService()
            
            # ========== STEP 1: Get Student Info ==========
            user_doc = fs.get_user(firebase_uid)
            if not user_doc:
                return {"error": "User not found"}
            
            student_name = user_doc.get("email", "Student").split("@")[0]
            moodle_user_id = user_doc.get("moodle_user_id") or user_doc.get("moodleUserId")
            
            student_info = {
                "id": firebase_uid,
                "name": student_name
            }
            
            # ========== STEP 2: Get Enrolled Courses ==========
            try:
                moodle_courses = MoodleService.get_user_courses(int(moodle_user_id))
            except Exception as e:
                print(f"Error fetching courses: {e}")
                moodle_courses = []
            
            # ========== STEP 3: Build Courses with Progress ==========
            courses_context = []
            
            for course in moodle_courses:
                try:
                    # Get cached progress (includes averageScore)
                    cached_progress = ProgressService.get_cached_course_progress(
                        firebase_uid, course.get("id")
                    )
                    
                    if not cached_progress:
                        # If not cached, compute it (will also cache)
                        progress_data = ProgressService.fetch_and_compute_course_progress(
                            course.get("id"),
                            int(moodle_user_id),
                            firebase_uid
                        )
                        ProgressService.cache_course_progress(
                            firebase_uid,
                            course.get("id"),
                            progress_data
                        )
                        cached_progress = progress_data
                    
                    course_context = {
                        "id": course.get("shortname", str(course.get("id"))),
                        "name": course.get("fullname", "Unknown"),
                        "progress": cached_progress.get("progress", 0),
                        "averageScore": cached_progress.get("averageScore", 0),
                        "completedActivities": cached_progress.get("completed", 0),
                        "totalActivities": cached_progress.get("total", 0),
                        "lastAccess": cached_progress.get("lastSynced").isoformat() if cached_progress.get("lastSynced") else datetime.utcnow().isoformat()
                    }
                    courses_context.append(course_context)
                
                except Exception as e:
                    print(f"Error processing course {course.get('id')}: {e}")
                    continue
            
            # ========== STEP 4: Get Overall Analytics ==========
            analytics_context = {
                "overallProgress": 0,
                "weeklyProgress": [],
                "completionRate": 0,
                "velocityActivitiesPerWeek": 0,
                "riskLevel": "medium"
            }
            
            try:
                course_ids = [c.get("id") for c in moodle_courses]
                analytics_data = AnalyticsService.get_analytics_overview(firebase_uid, course_ids)
                
                # Calculate overall progress (average across courses)
                if courses_context:
                    overall_progress = sum(c["progress"] for c in courses_context) / len(courses_context)
                    analytics_context["overallProgress"] = round(overall_progress, 2)
                
                # Get weekly progress from first course
                if analytics_data.get("courses") and len(analytics_data["courses"]) > 0:
                    first_course = analytics_data["courses"][0]
                    weekly_data = first_course.get("weeklyProgress", [])
                    analytics_context["weeklyProgress"] = [w.get("progress", 0) for w in weekly_data]
                    analytics_context["velocityActivitiesPerWeek"] = first_course.get("velocity", 0)
                
                analytics_context["riskLevel"] = analytics_data.get("overallRisk", "medium")
                
                # Calculate completion rate
                total_completed = sum(c["completedActivities"] for c in courses_context)
                total_activities = sum(c["totalActivities"] for c in courses_context)
                if total_activities > 0:
                    analytics_context["completionRate"] = round(total_completed / total_activities, 2)
                
            except Exception as e:
                print(f"Error computing analytics: {e}")
            
            # ========== FINAL RESPONSE ==========
            context = {
                "student": student_info,
                "courses": courses_context,
                "analytics": analytics_context,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            print(f"Successfully built AI context for {student_name}")
            return context
        
        except Exception as e:
            print(f"Error building AI context: {e}")
            import traceback
            traceback.print_exc()
            return {
                "error": str(e),
                "student": {"id": firebase_uid, "name": "Unknown"},
                "courses": [],
                "analytics": {
                    "overallProgress": 0,
                    "weeklyProgress": [],
                    "completionRate": 0,
                    "velocityActivitiesPerWeek": 0,
                    "riskLevel": "medium"
                }
            }
