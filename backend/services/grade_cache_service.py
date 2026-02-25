"""Grade caching service - stores and retrieves grades from Firestore."""

import re
from datetime import datetime

from services.firestore_service import FirestoreService
from typing import Dict, Optional


class GradeCacheService:
    """Service for caching and retrieving assignment grades from Firestore."""

    CACHE_COLLECTION = "grade_cache"
    CACHE_TTL_SECONDS = 3600  # 1 hour TTL for cache

    @staticmethod
    def _normalise_cache_key(raw_key: str, grade_data: Optional[Dict] = None) -> str:
        """Normalise legacy keys to the new prefixed format.

        New format:
        - assignments: 'assign_<id>'
        - quizzes: 'quiz_<id>'

        Legacy format:
        - '<id>' (numeric doc id)
        """
        key = str(raw_key)
        if re.fullmatch(r"\d+", key):
            item_type = (grade_data or {}).get("itemType")
            if item_type == "quiz":
                return f"quiz_{int(key)}"
            return f"assign_{int(key)}"
        return key

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
            safe_key = GradeCacheService._normalise_cache_key(str(item_key), grade_data)
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

            # Prefer new format, but fall back to legacy numeric key.
            candidate_keys = [
                f"assign_{int(assignment_id)}",
                str(int(assignment_id)),
            ]

            for candidate in candidate_keys:
                cache_key = f"{GradeCacheService.CACHE_COLLECTION}/{firebase_uid}/courses/{course_id}/assignments/{candidate}"
                doc = fs.db.document(cache_key).get()
                if doc.exists:
                    data = doc.to_dict()
                    print(f"Retrieved cached grade for assignment {assignment_id} (key={candidate}): {data}")
                    return data

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

            def _pick_newer(existing: Dict, incoming: Dict) -> Dict:
                existing_ts = existing.get("synced_at") or existing.get("cached_at")
                incoming_ts = incoming.get("synced_at") or incoming.get("cached_at")
                if isinstance(existing_ts, datetime) and isinstance(incoming_ts, datetime):
                    return incoming if incoming_ts >= existing_ts else existing
                # Prefer entries that include itemType/itemId when timestamps aren't comparable.
                existing_has_type = bool(existing.get("itemType"))
                incoming_has_type = bool(incoming.get("itemType"))
                if incoming_has_type and not existing_has_type:
                    return incoming
                return existing

            for doc in docs:
                data = doc.to_dict() or {}
                raw_key = doc.id
                norm_key = GradeCacheService._normalise_cache_key(raw_key, data)

                if norm_key in result:
                    # If both legacy and new exist for same item, keep the newer/better one.
                    result[norm_key] = _pick_newer(result[norm_key], data)
                else:
                    result[norm_key] = data
            
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
                numeric_key = str(int(assignment_id))
                prefixed_key = f"assign_{int(assignment_id)}"
                for key in (prefixed_key, numeric_key):
                    cache_key = f"{GradeCacheService.CACHE_COLLECTION}/{firebase_uid}/courses/{course_id}/assignments/{key}"
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
