"""Grade caching service - stores and retrieves grades from Firestore."""

from datetime import datetime
from services.firestore_service import FirestoreService
from typing import Dict, Optional


class GradeCacheService:
    """Service for caching and retrieving assignment grades from Firestore."""

    CACHE_COLLECTION = "grade_cache"
    CACHE_TTL_SECONDS = 3600  # 1 hour TTL for cache

    @staticmethod
    def cache_grade(
        firebase_uid: str,
        course_id: int,
        item_key,
        grade_data: Dict
    ) -> None:
        """
        Store a grade item in Firestore cache.

        Args:
            firebase_uid: User's Firebase UID
            course_id: Moodle course ID
            item_key: Cache key – either an int (legacy assignment_id) or a
                      string like 'assign_3' / 'quiz_1'.
            grade_data: Grade info (grade, gradeMax, feedback, gradeddate,
                        assignmentName, itemType, itemId).
        """
        try:
            fs = FirestoreService()
            # Normalise key so both old (int) and new (str) callers work.
            safe_key = str(item_key)
            cache_path = f"{GradeCacheService.CACHE_COLLECTION}/{firebase_uid}/courses/{course_id}/assignments/{safe_key}"

            cache_entry = {
                "course_id": course_id,
                "assignment_id": grade_data.get("itemId") or safe_key,
                "grade": grade_data.get("grade"),
                "gradeMax": grade_data.get("gradeMax", 100),
                "feedback": grade_data.get("feedback"),
                "gradeddate": grade_data.get("gradeddate"),
                "assignmentName": grade_data.get("assignmentName"),
                "itemType": grade_data.get("itemType", "assign"),
                "itemId": grade_data.get("itemId"),
                "cached_at": datetime.utcnow(),
                "synced_at": datetime.utcnow()
            }

            fs.db.document(cache_path).set(cache_entry)
            print(f"Cached grade for {safe_key}: {cache_entry}")
        except Exception as e:
            print(f"Error caching grade: {e}")
            import traceback
            traceback.print_exc()

    @staticmethod
    def get_cached_grade(
        firebase_uid: str,
        course_id: int,
        assignment_id: int
    ) -> Optional[Dict]:
        """
        Retrieve cached grade from Firestore.
        
        Args:
            firebase_uid: User's Firebase UID
            course_id: Moodle course ID
            assignment_id: Moodle assignment ID
            
        Returns:
            Grade data dict or None if not cached
        """
        try:
            fs = FirestoreService()
            cache_key = f"{GradeCacheService.CACHE_COLLECTION}/{firebase_uid}/courses/{course_id}/assignments/{assignment_id}"
            
            doc = fs.db.document(cache_key).get()
            if doc.exists:
                data = doc.to_dict()
                print(f"Retrieved cached grade for assignment {assignment_id}: {data}")
                return data
            else:
                print(f"No cached grade found for assignment {assignment_id}")
                return None
        except Exception as e:
            print(f"Error retrieving cached grade: {e}")
            import traceback
            traceback.print_exc()
            return None

    @staticmethod
    def get_all_cached_grades(
        firebase_uid: str,
        course_id: int
    ) -> Dict[str, Dict]:
        """
        Retrieve all cached grades for a course.
        
        Args:
            firebase_uid: User's Firebase UID
            course_id: Moodle course ID
            
        Returns:
            Dict mapping item_key (e.g. 'assign_3', 'quiz_1') -> grade data
        """
        try:
            fs = FirestoreService()
            base_path = f"{GradeCacheService.CACHE_COLLECTION}/{firebase_uid}/courses/{course_id}/assignments"
            docs = fs.db.collection(base_path).stream()

            result: Dict[str, Dict] = {}
            for doc in docs:
                data = doc.to_dict() or {}
                # Use the Firestore document id as the key (e.g. 'quiz_1', 'assign_3')
                doc_key = doc.id
                result[doc_key] = data
            
            print(f"Retrieved {len(result)} cached grades for course {course_id}")
            return result
        except Exception as e:
            print(f"Error retrieving all cached grades: {e}")
            import traceback
            traceback.print_exc()
            return {}

    @staticmethod
    def clear_cache(
        firebase_uid: str,
        course_id: int,
        assignment_id: Optional[int] = None
    ) -> None:
        """
        Clear cached grades.
        
        Args:
            firebase_uid: User's Firebase UID
            course_id: Moodle course ID
            assignment_id: Specific assignment to clear (optional, clears all if omitted)
        """
        try:
            fs = FirestoreService()
            
            if assignment_id:
                # Clear specific assignment
                cache_key = f"{GradeCacheService.CACHE_COLLECTION}/{firebase_uid}/courses/{course_id}/assignments/{assignment_id}"
                fs.db.document(cache_key).delete()
                print(f"Cleared cache for assignment {assignment_id}")
            else:
                # Clear all assignments for course
                base_path = f"{GradeCacheService.CACHE_COLLECTION}/{firebase_uid}/courses/{course_id}/assignments"
                docs = fs.db.collection(base_path).stream()
                for doc in docs:
                    doc.reference.delete()
                print(f"Cleared all cached grades for course {course_id}")
        except Exception as e:
            print(f"Error clearing cache: {e}")
            import traceback
            traceback.print_exc()
