"""
Firestore data models for NeoBright LMS.
Collections: users, courses, course_materials, summaries, ai_chats, assignments, feedback_logs
"""
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum

class UserRole(Enum):
    STUDENT = "student"
    INSTRUCTOR = "instructor"
    ADMIN = "admin"

class MaterialType(Enum):
    PDF = "pdf"
    VIDEO = "video"
    DOCUMENT = "document"
    LINK = "link"
    QUIZ = "quiz"

class ChatRole(Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"

@dataclass
class User:
    """User profile with Firebase UID as document ID."""
    firebase_uid: str
    email: str
    display_name: str
    role: str  # UserRole enum value
    moodle_user_id: Optional[int] = None
    enrolled_courses: List[int] = None  # List of Moodle course IDs
    preferences: Dict[str, Any] = None
    created_at: datetime = None
    updated_at: datetime = None
    
    def to_dict(self) -> Dict:
        data = asdict(self)
        if self.created_at:
            data['created_at'] = self.created_at
        if self.updated_at:
            data['updated_at'] = self.updated_at
        return data

@dataclass
class Course:
    """Course metadata synced from Moodle."""
    moodle_course_id: int  # Used as document ID
    course_name: str
    short_name: str
    category: Optional[str] = None
    summary: Optional[str] = None
    instructor_ids: List[str] = None  # Firebase UIDs
    enrolled_student_ids: List[str] = None  # Firebase UIDs
    total_materials: int = 0
    synced_at: datetime = None
    created_at: datetime = None
    
    def to_dict(self) -> Dict:
        data = asdict(self)
        if self.synced_at:
            data['synced_at'] = self.synced_at
        if self.created_at:
            data['created_at'] = self.created_at
        return data

@dataclass
class CourseMaterial:
    """Individual course material/resource from Moodle."""
    material_id: str  # Auto-generated or Moodle module ID
    moodle_course_id: int
    moodle_module_id: int
    title: str
    type: str  # MaterialType enum value
    file_url: Optional[str] = None  # Moodle pluginfile URL
    content: Optional[str] = None  # Text content for non-file materials
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    section_name: Optional[str] = None
    order_index: int = 0
    is_downloadable: bool = True
    created_at: datetime = None
    updated_at: datetime = None
    
    def to_dict(self) -> Dict:
        data = asdict(self)
        if self.created_at:
            data['created_at'] = self.created_at
        if self.updated_at:
            data['updated_at'] = self.updated_at
        return data

@dataclass
class Summary:
    """AI-generated summary of course materials."""
    summary_id: str  # Auto-generated
    material_id: str  # Reference to CourseMaterial
    moodle_course_id: int
    user_id: str  # Firebase UID of requester
    summary_text: str
    key_points: List[str] = None
    model_used: str = "GPT-4o-mini"
    tokens_used: int = 0
    generated_at: datetime = None
    
    def to_dict(self) -> Dict:
        data = asdict(self)
        if self.generated_at:
            data['generated_at'] = self.generated_at
        return data

@dataclass
class ChatMessage:
    """Individual message in an AI chat session."""
    role: str  # ChatRole enum value
    content: str
    timestamp: datetime = None
    
    def to_dict(self) -> Dict:
        data = asdict(self)
        if self.timestamp:
            data['timestamp'] = self.timestamp
        return data

@dataclass
class AIChat:
    """AI chat session for a specific course/material."""
    chat_id: str  # Auto-generated
    user_id: str  # Firebase UID
    moodle_course_id: int
    material_id: Optional[str] = None  # If chat is about specific material
    title: str = "New Chat"
    messages: List[Dict] = None  # List of ChatMessage dicts
    total_tokens: int = 0
    model_used: str = "GPT-4o-mini"
    created_at: datetime = None
    updated_at: datetime = None
    
    def to_dict(self) -> Dict:
        data = asdict(self)
        if self.created_at:
            data['created_at'] = self.created_at
        if self.updated_at:
            data['updated_at'] = self.updated_at
        return data

@dataclass
class Assignment:
    """Assignment/task tracking."""
    assignment_id: str  # Auto-generated or Moodle assignment ID
    moodle_course_id: int
    moodle_assignment_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    max_grade: Optional[float] = None
    assigned_to: List[str] = None  # Firebase UIDs of students
    created_at: datetime = None
    
    def to_dict(self) -> Dict:
        data = asdict(self)
        if self.due_date:
            data['due_date'] = self.due_date
        if self.created_at:
            data['created_at'] = self.created_at
        return data

@dataclass
class FeedbackLog:
    """User feedback on AI responses, summaries, etc."""
    feedback_id: str  # Auto-generated
    user_id: str  # Firebase UID
    feedback_type: str  # "summary", "chat", "general"
    reference_id: Optional[str] = None  # ID of summary/chat/etc.
    rating: Optional[int] = None  # 1-5 stars
    comment: Optional[str] = None
    is_helpful: Optional[bool] = None
    created_at: datetime = None
    
    def to_dict(self) -> Dict:
        data = asdict(self)
        if self.created_at:
            data['created_at'] = self.created_at
        return data