"""
Firestore database service for NeoBright LMS.
Handles all database operations with proper error handling and validation.
"""
from firebase_admin import firestore
from google.cloud.firestore_v1 import FieldFilter
from datetime import datetime
from typing import Dict, List, Optional, Any
from models.firestore_models import (
    User, Course, CourseMaterial, Summary, AIChat, 
    Assignment, FeedbackLog, ChatMessage
)

class FirestoreService:
    """Centralized Firestore operations."""
    
    def __init__(self):
        self.db = firestore.client()
        from services.firestore_extensions import FirestoreExtensions
        self.extensions = FirestoreExtensions(self.db)
    
    @staticmethod
    def timestamp_now():
        """Return current timestamp for Firestore."""
        return datetime.utcnow()
    
    def store_assignment_submission(self, user_id: str, course_id: int, assignment_id: int, submission_data: Dict) -> str:
        """Store assignment submission in Firestore."""
        return self.extensions.store_assignment_submission(user_id, course_id, assignment_id, submission_data)
    
    def get_user_assignment_submissions(self, user_id: str, course_id: int) -> List[Dict]:
        """Get all assignment submissions for a user in a course."""
        return self.extensions.get_user_assignment_submissions(user_id, course_id)
    
    def sync_course_materials(self, course_id: int, materials: List[Dict]) -> None:
        """Sync course materials from Moodle to Firestore."""
        return self.extensions.sync_course_materials(course_id, materials)
    
    # ==================== USERS ====================
    
    def create_user(self, user: User) -> str:
        """Create new user profile."""
        user.created_at = datetime.utcnow()
        user.updated_at = datetime.utcnow()
        doc_ref = self.db.collection('users').document(user.firebase_uid)
        doc_ref.set(user.to_dict())
        return user.firebase_uid
    
    def get_user(self, firebase_uid: str) -> Optional[Dict]:
        """Get user by Firebase UID."""
        doc = self.db.collection('users').document(firebase_uid).get()
        return doc.to_dict() if doc.exists else None
    
    def update_user(self, firebase_uid: str, data: Dict) -> None:
        """Update user profile."""
        data['updated_at'] = datetime.utcnow()
        self.db.collection('users').document(firebase_uid).update(data)

    def set_user_fields(self, firebase_uid: str, data: Dict) -> None:
        """Upsert user fields (creates doc if missing)."""
        data['updated_at'] = datetime.utcnow()
        self.db.collection('users').document(firebase_uid).set(data, merge=True)
    
    def add_enrolled_course(self, firebase_uid: str, moodle_course_id: int) -> None:
        """Add course to user's enrolled courses."""
        self.db.collection('users').document(firebase_uid).update({
            'enrolled_courses': firestore.ArrayUnion([moodle_course_id]),
            'updated_at': datetime.utcnow()
        })
    
    # ==================== COURSES ====================
    
    def create_or_update_course(self, course: Course) -> str:
        """Create or update course (upsert)."""
        course.synced_at = datetime.utcnow()
        if not course.created_at:
            course.created_at = datetime.utcnow()
        
        doc_id = str(course.moodle_course_id)
        self.db.collection('courses').document(doc_id).set(course.to_dict(), merge=True)
        return doc_id
    
    def get_course(self, moodle_course_id: int) -> Optional[Dict]:
        """Get course by Moodle course ID."""
        doc = self.db.collection('courses').document(str(moodle_course_id)).get()
        return doc.to_dict() if doc.exists else None
    
    def get_user_courses(self, firebase_uid: str) -> List[Dict]:
        """Get all courses enrolled by user."""
        user = self.get_user(firebase_uid)
        if not user or not user.get('enrolled_courses'):
            return []
        
        courses = []
        for course_id in user['enrolled_courses']:
            course = self.get_course(course_id)
            if course:
                courses.append(course)
        return courses
    
    # ==================== COURSE MATERIALS ====================
    
    def create_material(self, material: CourseMaterial) -> str:
        """Create new course material."""
        material.created_at = datetime.utcnow()
        material.updated_at = datetime.utcnow()
        doc_ref = self.db.collection('course_materials').add(material.to_dict())
        return doc_ref[1].id
    
    def get_course_materials(self, moodle_course_id: int) -> List[Dict]:
        """Get course materials for a given Moodle course.
        
        Note: Removed order_by to avoid requiring composite indexes.
        Materials are returned in document order.
        """
        docs = (
            self.db.collection('course_materials')
            .where(filter=FieldFilter('moodle_course_id', '==', moodle_course_id))
            .stream()
        )
        return [doc.to_dict() for doc in docs]
    
    def get_material(self, material_id: str) -> Optional[Dict]:
        """Get specific material by ID."""
        doc = self.db.collection('course_materials').document(material_id).get()
        return doc.to_dict() if doc.exists else None
    
    def get_material_summaries(self, material_id: str) -> List[Dict]:
        """Get all summaries for a material."""
        docs = (
            self.db.collection('course_materials')
            .document(material_id)
            .collection('summaries')
            .stream()
        )
        return [doc.to_dict() for doc in docs]
    
    def add_summary(self, material_id: str, summary: Summary) -> str:
        """Add summary to a material."""
        summary.generated_at = datetime.utcnow()
        doc_ref = (
            self.db.collection('course_materials')
            .document(material_id)
            .collection('summaries')
            .add(summary.to_dict())
        )
        return doc_ref[1].id
    
    def update_material_processed(self, material_id: str, extracted_text: str, ai_insights: List[str]) -> None:
        """Update material with processed data."""
        self.db.collection('course_materials').document(material_id).update({
            'extracted_text': extracted_text,
            'ai_insights': ai_insights,
            'processed': True,
            'processed_at': datetime.utcnow()
        })
    
    # ==================== ASSIGNMENTS ====================
    
    def create_assignment(self, assignment: Assignment) -> str:
        """Create new assignment."""
        assignment.created_at = datetime.utcnow()
        assignment.updated_at = datetime.utcnow()
        doc_ref = self.db.collection('assignments').add(assignment.to_dict())
        return doc_ref[1].id
    
    def get_course_assignments(self, moodle_course_id: int) -> List[Dict]:
        """Get all assignments in a course."""
        docs = (
            self.db.collection('assignments')
            .where(filter=FieldFilter('moodle_course_id', '==', moodle_course_id))
            .stream()
        )
        return [doc.to_dict() for doc in docs]
    
    def get_assignment(self, assignment_id: int) -> Optional[Dict]:
        """Get assignment by Moodle assignment ID."""
        docs = (
            self.db.collection('assignments')
            .where(filter=FieldFilter('moodle_assignment_id', '==', assignment_id))
            .limit(1)
            .stream()
        )
        assignments = [doc.to_dict() for doc in docs]
        return assignments[0] if assignments else None
    
    def update_assignment_submission_status(self, assignment_id: int, user_id: str, status: str) -> None:
        """Update assignment submission status for user."""
        docs = (
            self.db.collection('assignment_submissions')
            .where(filter=FieldFilter('assignment_id', '==', assignment_id))
            .where(filter=FieldFilter('user_id', '==', user_id))
            .limit(1)
            .stream()
        )
        for doc in docs:
            doc.reference.update({'status': status, 'updated_at': datetime.utcnow()})
    
    # ==================== CHAT HISTORY ====================
    
    def save_chat_message(self, chat_id: str, message: ChatMessage) -> str:
        """Save a chat message."""
        message.timestamp = datetime.utcnow()
        doc_ref = (
            self.db.collection('ai_chats')
            .document(chat_id)
            .collection('messages')
            .add(message.to_dict())
        )
        return doc_ref[1].id
    
    def get_chat_messages(self, chat_id: str) -> List[Dict]:
        """Get all messages in a chat."""
        docs = (
            self.db.collection('ai_chats')
            .document(chat_id)
            .collection('messages')
            .order_by('timestamp')
            .stream()
        )
        return [doc.to_dict() for doc in docs]
    
    # ==================== ENROLLMENTS ====================
    
    def create_enrollment(self, user_id: str, moodle_course_id: int, enrollment_data: Dict) -> str:
        """Create course enrollment record."""
        enrollment_id = f"{user_id}_{moodle_course_id}"
        data = {
            **enrollment_data,
            'user_id': user_id,
            'moodle_course_id': moodle_course_id,
            'enrolled_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        self.db.collection('enrollments').document(enrollment_id).set(data, merge=True)
        return enrollment_id
    
    def update_enrollment(self, enrollment_id: str, data: Dict, completed_section: int = None) -> None:
        """Update enrollment record."""
        data['updated_at'] = datetime.utcnow()
        if completed_section:
            data['completed_sections'] = firestore.ArrayUnion([completed_section])
        
        self.db.collection('enrollments').document(enrollment_id).update(data)
    
    def get_enrollment(self, user_id: str, moodle_course_id: int) -> Optional[Dict]:
        """Get specific enrollment."""
        docs = (
            self.db.collection('enrollments')
            .where(filter=FieldFilter('user_id', '==', user_id))
            .where(filter=FieldFilter('moodle_course_id', '==', moodle_course_id))
            .limit(1)
            .stream()
        )
        enrollments = [doc.to_dict() for doc in docs]
        return enrollments[0] if enrollments else None

    # ==================== QUIZ ATTEMPTS ====================

    def upsert_quiz_attempt(
        self,
        firebase_uid: str,
        moodle_user_id: int,
        quiz_id: int,
        attempt_id: int,
        attempt_data: Dict,
        extra: Optional[Dict] = None,
    ) -> None:
        """Upsert a Moodle quiz attempt snapshot for later caching/analytics.

        Stored in top-level collection `quiz_attempts` keyed by Moodle attempt_id
        so the same attempt is not duplicated across re-fetches.
        """
        extra = extra or {}

        # Extract common fields for easy querying.
        state = attempt_data.get("state") if isinstance(attempt_data, dict) else None
        preview = bool(attempt_data.get("preview")) if isinstance(attempt_data, dict) else False

        payload = {
            "attempt_id": int(attempt_id),
            "quiz_id": int(quiz_id),
            "firebase_uid": firebase_uid,
            "moodle_user_id": int(moodle_user_id),
            "state": state,
            "preview": preview,
            "timestart": attempt_data.get("timestart"),
            "timefinish": attempt_data.get("timefinish"),
            "timemodified": attempt_data.get("timemodified"),
            "sumgrades": attempt_data.get("sumgrades"),
            "attempt_number": attempt_data.get("attempt"),
            "last_synced_at": datetime.utcnow(),
            # Keep the raw attempt payload for future fields.
            "attempt": attempt_data,
            **extra,
        }

        self.db.collection("quiz_attempts").document(str(attempt_id)).set(payload, merge=True)

    def add_quiz_attempt_event(
        self,
        firebase_uid: str,
        moodle_user_id: int,
        quiz_id: int,
        attempt_id: int,
        event: str,
        details: Optional[Dict] = None,
    ) -> None:
        """Append an event for an attempt (start/save/submit/review)."""
        details = details or {}
        payload = {
            "firebase_uid": firebase_uid,
            "moodle_user_id": int(moodle_user_id),
            "quiz_id": int(quiz_id),
            "attempt_id": int(attempt_id),
            "event": event,
            "details": details,
            "created_at": datetime.utcnow(),
        }
        self.db.collection("quiz_attempt_events").add(payload)
