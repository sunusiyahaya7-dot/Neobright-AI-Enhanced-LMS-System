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
    def fetch_and_compute_course_progress(course_id: int, moodle_user_id: int) -> Dict:
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
            
            # Step 2: Compute progress metrics
            metrics = ProgressService.compute_progress(statuses)
            
            # Step 3: Enrich with metadata
            result = {
                "courseId": course_id,
                **metrics,
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
                "lastFetched": int(datetime.utcnow().timestamp()),
                "error": str(e)
            }
    
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
                        ├── lastSynced: timestamp
        """
        try:
            fs = FirestoreService()
            
            progress_doc = {
                "progress": progress_data.get("progress", 0.0),
                "completed": progress_data.get("completedActivities", 0),
                "total": progress_data.get("totalActivities", 0),
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
