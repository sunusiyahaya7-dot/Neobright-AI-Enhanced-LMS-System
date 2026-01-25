"""
Learning Analytics Service for NeoBright LMS.
Computes rule-based analytics from progress data.
"""
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from services.firestore_service import FirestoreService
from services.progress_service import ProgressService


class AnalyticsService:
    """Service for computing learning analytics."""
    
    @staticmethod
    def compute_weekly_progress(firebase_uid: str, course_id: int) -> List[Dict]:
        """
        Compute weekly progress trend for a course.
        
        Returns:
        [
            { "week": "2024-W10", "progress": 45 },
            { "week": "2024-W11", "progress": 62 }
        ]
        """
        try:
            fs = FirestoreService()
            
            # Get progress snapshots from Firestore (cached data)
            progress_doc = fs.db.collection("progress").document(firebase_uid).collection(
                "courses"
            ).document(str(course_id)).get()
            
            if not progress_doc.exists:
                return []
            
            progress_data = progress_doc.to_dict()
            current_progress = progress_data.get("progress", 0)
            
            # For now, return simple weekly trend
            now = datetime.utcnow()
            current_week = now.strftime("%Y-W%U")
            
            # Simulate weekly trend (in production, fetch from historical data)
            weeks_back = 4
            weekly_data = []
            for i in range(weeks_back, 0, -1):
                week_date = now - timedelta(weeks=i)
                week_str = week_date.strftime("%Y-W%U")
                # Simulate historical progress (in reality, you'd fetch actual snapshots)
                simulated_progress = max(0, current_progress - (i * 10))
                weekly_data.append({
                    "week": week_str,
                    "progress": round(simulated_progress, 1)
                })
            
            # Add current week
            weekly_data.append({
                "week": current_week,
                "progress": round(current_progress, 1)
            })
            
            return weekly_data
        
        except Exception as e:
            print(f"Error computing weekly progress: {e}")
            return []
    
    @staticmethod
    def compute_completion_velocity(firebase_uid: str, course_id: int) -> float:
        """
        Compute completion velocity (activities per week).
        
        Returns:
            float: Activities completed per week
        """
        try:
            fs = FirestoreService()
            
            # Get progress data
            progress_doc = fs.db.collection("progress").document(firebase_uid).collection(
                "courses"
            ).document(str(course_id)).get()
            
            if not progress_doc.exists:
                return 0.0
            
            progress_data = progress_doc.to_dict()
            completed = progress_data.get("completed", 0)
            last_synced = progress_data.get("lastSynced")
            
            if not last_synced or completed == 0:
                return 0.0
            
            # Calculate weeks since course started (simplified)
            # In production, you'd track actual enrollment date
            now = datetime.utcnow()
            if isinstance(last_synced, datetime):
                time_diff = now - last_synced
            else:
                # Assume at least 1 week of activity
                time_diff = timedelta(weeks=1)
            
            weeks_active = max(1, time_diff.days / 7)
            velocity = completed / weeks_active
            
            return round(velocity, 2)
        
        except Exception as e:
            print(f"Error computing velocity: {e}")
            return 0.0
    
    @staticmethod
    def compute_engagement_frequency(firebase_uid: str, course_id: int) -> Dict:
        """
        Compute engagement frequency metrics.
        
        Returns:
        {
            "lastActive": timestamp,
            "inactiveDays": 5,
            "engagementLevel": "low" | "medium" | "high"
        }
        """
        try:
            fs = FirestoreService()
            
            # Get user completions to determine last activity
            completions_ref = fs.db.collection("completions").document(firebase_uid).collection(
                "courses"
            ).document(str(course_id)).collection("activities")
            
            docs = completions_ref.order_by("completedAt", direction="DESCENDING").limit(1).stream()
            last_activity = None
            
            for doc in docs:
                data = doc.to_dict()
                last_activity = data.get("completedAt")
                break
            
            now = datetime.utcnow()
            
            if last_activity:
                if isinstance(last_activity, datetime):
                    inactive_days = (now - last_activity).days
                else:
                    inactive_days = 0
            else:
                # Check progress last sync
                progress_doc = fs.db.collection("progress").document(firebase_uid).collection(
                    "courses"
                ).document(str(course_id)).get()
                
                if progress_doc.exists:
                    last_synced = progress_doc.to_dict().get("lastSynced")
                    if isinstance(last_synced, datetime):
                        inactive_days = (now - last_synced).days
                    else:
                        inactive_days = 7  # Default assumption
                else:
                    inactive_days = 7
            
            # Determine engagement level
            if inactive_days <= 1:
                engagement_level = "high"
            elif inactive_days <= 3:
                engagement_level = "medium"
            else:
                engagement_level = "low"
            
            return {
                "lastActive": last_activity.isoformat() if isinstance(last_activity, datetime) else None,
                "inactiveDays": inactive_days,
                "engagementLevel": engagement_level
            }
        
        except Exception as e:
            print(f"Error computing engagement: {e}")
            return {
                "lastActive": None,
                "inactiveDays": 7,
                "engagementLevel": "low"
            }
    
    @staticmethod
    def detect_risk_level(firebase_uid: str, course_id: int) -> str:
        """
        Detect student risk level using rule-based logic.
        
        Rules:
        - high: progress < 30% AND inactive > 7 days
        - medium: progress < 60% OR inactive > 3 days
        - low: otherwise
        
        Returns:
            str: "low" | "medium" | "high"
        """
        try:
            fs = FirestoreService()
            
            # Get progress
            progress_doc = fs.db.collection("progress").document(firebase_uid).collection(
                "courses"
            ).document(str(course_id)).get()
            
            if not progress_doc.exists:
                return "high"  # No data = high risk
            
            progress_data = progress_doc.to_dict()
            progress = progress_data.get("progress", 0)
            
            # Get engagement
            engagement = AnalyticsService.compute_engagement_frequency(firebase_uid, course_id)
            inactive_days = engagement.get("inactiveDays", 7)
            
            # Apply risk rules
            if progress < 30 and inactive_days > 7:
                return "high"
            elif progress < 60 or inactive_days > 3:
                return "medium"
            else:
                return "low"
        
        except Exception as e:
            print(f"Error detecting risk: {e}")
            return "medium"
    
    @staticmethod
    def compute_course_analytics(firebase_uid: str, course_id: int) -> Dict:
        """
        Compute comprehensive analytics for a course.
        
        Returns:
        {
            "courseId": 5,
            "weeklyProgress": [...],
            "velocity": 3.2,
            "engagement": {...},
            "riskLevel": "medium",
            "lastUpdated": timestamp
        }
        """
        try:
            weekly_progress = AnalyticsService.compute_weekly_progress(firebase_uid, course_id)
            velocity = AnalyticsService.compute_completion_velocity(firebase_uid, course_id)
            engagement = AnalyticsService.compute_engagement_frequency(firebase_uid, course_id)
            risk_level = AnalyticsService.detect_risk_level(firebase_uid, course_id)
            
            analytics = {
                "courseId": course_id,
                "weeklyProgress": weekly_progress,
                "velocity": velocity,
                "engagement": engagement,
                "riskLevel": risk_level,
                "lastUpdated": datetime.utcnow().isoformat()
            }
            
            # Cache analytics in Firestore
            AnalyticsService.cache_analytics(firebase_uid, course_id, analytics)
            
            return analytics
        
        except Exception as e:
            print(f"Error computing course analytics: {e}")
            import traceback
            traceback.print_exc()
            return {
                "courseId": course_id,
                "weeklyProgress": [],
                "velocity": 0.0,
                "engagement": {"inactiveDays": 7, "engagementLevel": "low"},
                "riskLevel": "medium",
                "lastUpdated": datetime.utcnow().isoformat()
            }
    
    @staticmethod
    def cache_analytics(firebase_uid: str, course_id: int, analytics: Dict) -> None:
        """
        Cache analytics data in Firestore.
        """
        try:
            fs = FirestoreService()
            
            fs.db.collection("analytics").document(firebase_uid).collection(
                "courses"
            ).document(str(course_id)).set(analytics, merge=True)
            
            print(f"Cached analytics for user {firebase_uid}, course {course_id}")
        
        except Exception as e:
            print(f"Error caching analytics: {e}")
            import traceback
            traceback.print_exc()
    
    @staticmethod
    def get_analytics_overview(firebase_uid: str, course_ids: List[int]) -> Dict:
        """
        Get analytics overview across all courses.
        
        Returns:
        {
            "overallRisk": "medium",
            "averageVelocity": 2.8,
            "totalCoursesAtRisk": 2,
            "courses": [...]
        }
        """
        try:
            course_analytics = []
            total_velocity = 0
            courses_at_risk = 0
            
            for course_id in course_ids:
                analytics = AnalyticsService.compute_course_analytics(firebase_uid, course_id)
                course_analytics.append(analytics)
                total_velocity += analytics.get("velocity", 0)
                
                if analytics.get("riskLevel") in ["high", "medium"]:
                    courses_at_risk += 1
            
            avg_velocity = total_velocity / len(course_ids) if course_ids else 0
            
            # Determine overall risk
            if courses_at_risk >= len(course_ids) * 0.5:
                overall_risk = "high"
            elif courses_at_risk > 0:
                overall_risk = "medium"
            else:
                overall_risk = "low"
            
            return {
                "overallRisk": overall_risk,
                "averageVelocity": round(avg_velocity, 2),
                "totalCoursesAtRisk": courses_at_risk,
                "courses": course_analytics
            }
        
        except Exception as e:
            print(f"Error computing analytics overview: {e}")
            import traceback
            traceback.print_exc()
            return {
                "overallRisk": "medium",
                "averageVelocity": 0.0,
                "totalCoursesAtRisk": 0,
                "courses": []
            }
