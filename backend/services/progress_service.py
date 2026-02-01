"""
Progress tracking service for NeoBright LMS.
Handles computation and caching of student progress data.
"""
from typing import Dict, List, Optional
from datetime import datetime
from services.moodle_service import MoodleService
from services.firestore_service import FirestoreService


class ProgressService:
    """Service for computing and managing student progress."""
    
    @staticmethod
    def compute_progress(statuses: List[Dict]) -> Dict:
        """
        Compute completion percentage from activity statuses.
        
        Args:
            statuses: List of activity completion statuses from Moodle
            
        Returns:
            Dict with progress metrics:
            {
                "progress": 72.5,
                "completedActivities": 29,
                "totalActivities": 40
            }
        """
        if not statuses:
            return {
                "progress": 0.0,
                "completedActivities": 0,
                "totalActivities": 0
            }
        
        total = len(statuses)
        completed = sum(1 for s in statuses if s.get("completed", False))
        
        progress_percent = round((completed / total) * 100, 2) if total > 0 else 0
        
        return {
            "progress": progress_percent,
            "completedActivities": completed,
            "totalActivities": total
        }
    
    @staticmethod
    def fetch_and_compute_course_progress(course_id: int, moodle_user_id: int, firebase_uid: Optional[str] = None) -> Dict:
        """
        Fetch progress from Moodle and compute metrics.
        
        Args:
            course_id: Moodle course ID
            moodle_user_id: Moodle user ID
            
        Returns:
            Dict with progress data:
            {
                "courseId": 5,
                "progress": 72.5,
                "completedActivities": 29,
                "totalActivities": 40,
                "lastFetched": timestamp
            }
        """
        try:
            print(f"Fetching progress for course {course_id}, user {moodle_user_id}...")
            
            # Step 1: Fetch raw progress data from Moodle
            raw_data = MoodleService.get_course_progress(course_id, moodle_user_id)
            statuses = raw_data.get("statuses", [])

            # Normalize Moodle statuses into completion booleans
            def status_is_complete(s: Dict) -> bool:
                try:
                    # Moodle 'state': 1 means complete
                    if s.get("state") == 1:
                        return True
                    # Some modules expose detailed rules
                    for d in s.get("details", []) or []:
                        rv = d.get("rulevalue") or {}
                        if isinstance(rv, dict) and rv.get("status") == 1:
                            return True
                    return False
                except Exception:
                    return False

            total = len(statuses)
            completed_ids = set()
            cmid_set = set()
            for s in statuses:
                cmid = s.get("cmid")
                if cmid is not None:
                    cmid_set.add(str(cmid))
                if status_is_complete(s) and cmid is not None:
                    completed_ids.add(str(cmid))

            # Use only Moodle's native completion status (no Firestore overlay)
            # This ensures progress is always based on authoritative Moodle data
            print(f"Moodle-marked complete (state=1): {completed_ids}")

            completed = len(completed_ids)
            progress_percent = round((completed / total) * 100, 2) if total > 0 else 0.0

            # Step 3: Fetch grades from Moodle
            average_score = 0.0
            try:
                grades_data = MoodleService.get_course_grades(course_id, moodle_user_id)
                usergrades = grades_data.get("usergrades", [])
                
                if usergrades and len(usergrades) > 0:
                    # Calculate average from grade items
                    grades = []
                    for item in usergrades:
                        if isinstance(item, dict):
                            grade_value = item.get("gradevalue")
                            if grade_value is not None:
                                grades.append(float(grade_value))
                    
                    if grades:
                        average_score = round(sum(grades) / len(grades), 2)
                        print(f"Computed average score for course {course_id}: {average_score}")
            except Exception as e:
                print(f"Warning: Could not fetch grades for course {course_id}: {e}")
                average_score = 0.0

            # Step 4: Build result with combined metrics
            result = {
                "courseId": course_id,
                "progress": progress_percent,
                "completedActivities": completed,
                "totalActivities": total,
                "averageScore": average_score,
                "lastFetched": int(datetime.utcnow().timestamp())
            }
            
            print(f"Computed progress for course {course_id}: {result}")
            return result
        
        except Exception as e:
            print(f"Error computing course progress: {e}")
            import traceback
            traceback.print_exc()
            return {
                "courseId": course_id,
                "progress": 0.0,
                "completedActivities": 0,
                "totalActivities": 0,
                "averageScore": 0.0,
                "lastFetched": int(datetime.utcnow().timestamp()),
                "error": str(e)
            }
    
    @staticmethod
    def mark_activity_complete(firebase_uid: str, course_id: int, activity_id: int) -> bool:
        """
        Mark an activity as complete and update progress.
        
        Stores in Firestore:
        completions/{firebase_uid}/courses/{course_id}/{activity_id}
        """
        try:
            fs = FirestoreService()
            
            completion_doc = {
                "activityId": activity_id,
                "courseId": course_id,
                "completedAt": datetime.utcnow(),
                "isComplete": True
            }
            
            # Store completion
            fs.db.collection("completions").document(firebase_uid).collection(
                "courses"
            ).document(str(course_id)).collection("activities").document(
                str(activity_id)
            ).set(completion_doc, merge=True)
            
            print(f"✅ Stored in Firestore: completions/{firebase_uid}/courses/{course_id}/activities/{activity_id}")
            return True
        
        except Exception as e:
            print(f"Error marking activity as complete: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    @staticmethod
    def is_activity_complete(firebase_uid: str, course_id: int, activity_id: int) -> bool:
        """
        Check if an activity is marked as complete by the user.
        """
        try:
            fs = FirestoreService()
            
            doc = fs.db.collection("completions").document(firebase_uid).collection(
                "courses"
            ).document(str(course_id)).collection("activities").document(
                str(activity_id)
            ).get()
            
            if doc.exists:
                return doc.to_dict().get("isComplete", False)
            
            return False
        
        except Exception as e:
            print(f"Error checking activity completion: {e}")
            return False
    
    @staticmethod
    def get_course_completions(firebase_uid: str, course_id: int) -> Dict[str, bool]:
        """
        Get all user-marked completions for a course.
        
        Returns dict: {activity_id: True/False}
        """
        try:
            fs = FirestoreService()
            
            completions = {}
            activities_ref = fs.db.collection("completions").document(firebase_uid).collection(
                "courses"
            ).document(str(course_id)).collection("activities")
            
            docs = activities_ref.stream()
            for doc in docs:
                data = doc.to_dict()
                completions[doc.id] = data.get("isComplete", False)
            
            return completions
        
        except Exception as e:
            print(f"Error getting course completions: {e}")
            return {}
    
    @staticmethod
    def cache_course_progress(firebase_uid: str, course_id: int, progress_data: Dict) -> None:
        """
        Cache progress snapshot in Firestore.
        
        Structure:
        progress/
         └── {firebase_uid}
              └── courses/
                   └── {course_id}
                        ├── progress: 72.5
                        ├── completed: 29
                        ├── total: 40
                        ├── averageScore: 85.5
                        ├── lastSynced: timestamp
        """
        try:
            fs = FirestoreService()
            
            progress_doc = {
                "progress": progress_data.get("progress", 0.0),
                "completed": progress_data.get("completedActivities", 0),
                "total": progress_data.get("totalActivities", 0),
                "averageScore": progress_data.get("averageScore", 0.0),
                "lastSynced": datetime.utcnow()
            }
            
            # Set in Firestore
            fs.db.collection("progress").document(firebase_uid).collection(
                "courses"
            ).document(str(course_id)).set(progress_doc, merge=True)
            
            print(f"Cached progress for user {firebase_uid}, course {course_id}")
        
        except Exception as e:
            print(f"Error caching progress: {e}")
            import traceback
            traceback.print_exc()
    
    @staticmethod
    def get_cached_course_progress(firebase_uid: str, course_id: int) -> Optional[Dict]:
        """
        Retrieve cached progress from Firestore.
        
        Returns None if not found or expired.
        """
        try:
            fs = FirestoreService()
            
            doc = fs.db.collection("progress").document(firebase_uid).collection(
                "courses"
            ).document(str(course_id)).get()
            
            if doc.exists:
                return doc.to_dict()
            
            return None
        
        except Exception as e:
            print(f"Error retrieving cached progress: {e}")
            return None
    
    @staticmethod
    def get_all_courses_progress(firebase_uid: str) -> List[Dict]:
        """
        Get progress for all courses for a user.
        
        Returns list of progress objects with courseId.
        """
        try:
            fs = FirestoreService()
            
            courses_ref = fs.db.collection("progress").document(firebase_uid).collection(
                "courses"
            )
            docs = courses_ref.stream()
            
            result = []
            for doc in docs:
                progress_data = doc.to_dict()
                result.append({
                    "courseId": int(doc.id),
                    **progress_data
                })
            
            return result
        
        except Exception as e:
            print(f"Error retrieving all courses progress: {e}")
            return []
