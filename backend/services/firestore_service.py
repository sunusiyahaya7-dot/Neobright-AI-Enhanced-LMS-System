"""
Firestore database service for NeoBright LMS.
Handles all database operations with proper error handling and validation.
"""
from firebase_admin import firestore
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
        """Get all materials for a course."""
        docs = self.db.collection('course_materials')\
            .where('moodle_course_id', '==', moodle_course_id)\
            .order_by('order_index')\
            .stream()
        return [doc.to_dict() for doc in docs]
    
    def get_material(self, material_id: str) -> Optional[Dict]:
        """Get specific material by ID."""
        doc = self.db.collection('course_materials').document(material_id).get()
        return doc.to_dict() if doc.exists else None
    
    # ==================== SUMMARIES ====================
    
    def create_summary(self, summary: Summary) -> str:
        """Create AI-generated summary."""
        summary.generated_at = datetime.utcnow()
        doc_ref = self.db.collection('summaries').add(summary.to_dict())
        return doc_ref[1].id
    
    def get_material_summaries(self, material_id: str) -> List[Dict]:
        """Get all summaries for a material."""
        docs = self.db.collection('summaries')\
            .where('material_id', '==', material_id)\
            .order_by('generated_at', direction=firestore.Query.DESCENDING)\
            .stream()
        return [doc.to_dict() for doc in docs]
    
    def get_user_summaries(self, user_id: str, moodle_course_id: Optional[int] = None) -> List[Dict]:
        """Get user's summaries, optionally filtered by course."""
        query = self.db.collection('summaries').where('user_id', '==', user_id)
        if moodle_course_id:
            query = query.where('moodle_course_id', '==', moodle_course_id)
        
        docs = query.order_by('generated_at', direction=firestore.Query.DESCENDING).stream()
        return [doc.to_dict() for doc in docs]
    
    # ==================== AI CHATS ====================
    
    def create_chat(self, chat: AIChat) -> str:
        """Create new AI chat session."""
        chat.created_at = datetime.utcnow()
        chat.updated_at = datetime.utcnow()
        chat.messages = chat.messages or []
        doc_ref = self.db.collection('ai_chats').add(chat.to_dict())
        return doc_ref[1].id
    
    def add_chat_message(self, chat_id: str, message: ChatMessage) -> None:
        """Add message to chat session."""
        message.timestamp = datetime.utcnow()
        self.db.collection('ai_chats').document(chat_id).update({
            'messages': firestore.ArrayUnion([message.to_dict()]),
            'updated_at': datetime.utcnow()
        })
    
    def get_chat(self, chat_id: str) -> Optional[Dict]:
        """Get chat session by ID."""
        doc = self.db.collection('ai_chats').document(chat_id).get()
        return doc.to_dict() if doc.exists else None
    
    def get_user_chats(self, user_id: str, moodle_course_id: Optional[int] = None) -> List[Dict]:
        """Get user's chat sessions, optionally filtered by course."""
        query = self.db.collection('ai_chats').where('user_id', '==', user_id)
        if moodle_course_id:
            query = query.where('moodle_course_id', '==', moodle_course_id)
        
        docs = query.order_by('updated_at', direction=firestore.Query.DESCENDING).stream()
        return [doc.to_dict() for doc in docs]
    
    # ==================== ASSIGNMENTS ====================
    
    def create_assignment(self, assignment: Assignment) -> str:
        """Create new assignment."""
        assignment.created_at = datetime.utcnow()
        doc_ref = self.db.collection('assignments').add(assignment.to_dict())
        return doc_ref[1].id
    
    def get_course_assignments(self, moodle_course_id: int) -> List[Dict]:
        """Get all assignments for a course."""
        docs = self.db.collection('assignments')\
            .where('moodle_course_id', '==', moodle_course_id)\
            .stream()
        return [doc.to_dict() for doc in docs]
    
    def get_user_assignments(self, user_id: str) -> List[Dict]:
        """Get assignments assigned to user."""
        docs = self.db.collection('assignments')\
            .where('assigned_to', 'array_contains', user_id)\
            .stream()
        return [doc.to_dict() for doc in docs]
    
    # ==================== FEEDBACK ====================
    
    def create_feedback(self, feedback: FeedbackLog) -> str:
        """Create feedback log."""
        feedback.created_at = datetime.utcnow()
        doc_ref = self.db.collection('feedback_logs').add(feedback.to_dict())
        return doc_ref[1].id
    
    def get_feedback_by_reference(self, reference_id: str) -> List[Dict]:
        """Get all feedback for a specific reference (summary, chat, etc.)."""
        docs = self.db.collection('feedback_logs')\
            .where('reference_id', '==', reference_id)\
            .stream()
        return [doc.to_dict() for doc in docs]