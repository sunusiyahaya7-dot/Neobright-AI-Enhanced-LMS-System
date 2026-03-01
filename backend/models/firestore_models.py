"""
Firestore data models for NeoBright LMS.
Collections: users, courses, course_materials, summaries, ai_chats, assignments, feedback_logs
"""
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict, field
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
    enrolled_courses: List[int] = field(default_factory=list)
    preferences: Dict[str, Any] = field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
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
    instructor_ids: List[str] = field(default_factory=list)
    enrolled_student_ids: List[str] = field(default_factory=list)
    total_materials: int = 0
    synced_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    
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
    file_url: Optional[str] = None
    content: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    section_name: Optional[str] = None
    order_index: int = 0
    is_downloadable: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
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
    summary_id: str
    material_id: str
    moodle_course_id: int
    user_id: str
    summary_text: str
    key_points: List[str] = field(default_factory=list)
    model_used: str = "GPT-4o-mini"
    tokens_used: int = 0
    generated_at: Optional[datetime] = None
    
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
    timestamp: Optional[datetime] = None
    
    def to_dict(self) -> Dict:
        data = asdict(self)
        if self.timestamp:
            data['timestamp'] = self.timestamp
        return data

@dataclass
class AIChat:
    """AI chat session for a specific course/material."""
    chat_id: str
    user_id: str
    moodle_course_id: int
    material_id: Optional[str] = None
    title: str = "New Chat"
    messages: List[Dict] = field(default_factory=list)
    total_tokens: int = 0
    model_used: str = "GPT-4o-mini"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
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
    assignment_id: str
    moodle_course_id: int
    title: str
    moodle_assignment_id: Optional[int] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    max_grade: Optional[float] = None
    assigned_to: List[str] = field(default_factory=list)
    created_at: Optional[datetime] = None
    
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
    feedback_id: str
    user_id: str
    feedback_type: str  # "summary", "chat", "general"
    reference_id: Optional[str] = None
    rating: Optional[int] = None
    comment: Optional[str] = None
    is_helpful: Optional[bool] = None
    created_at: Optional[datetime] = None
    
    def to_dict(self) -> Dict:
        data = asdict(self)
        if self.created_at:
            data['created_at'] = self.created_at
        return data