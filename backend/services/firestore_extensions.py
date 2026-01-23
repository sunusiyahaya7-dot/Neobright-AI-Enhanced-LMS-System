"""
Extension methods for FirestoreService to handle submissions and material sync.
"""
from firebase_admin import firestore
from google.cloud.firestore_v1 import FieldFilter
from datetime import datetime
from typing import Dict, List


class FirestoreExtensions:
    """Additional Firestore methods for assignments and materials."""
    
    def __init__(self, db):
        self.db = db
    
    @staticmethod
    def timestamp_now():
        """Return current timestamp for Firestore."""
        return datetime.utcnow()
    
    def store_assignment_submission(self, user_id: str, course_id: int, assignment_id: int, submission_data: Dict) -> str:
        """Store assignment submission in Firestore."""
        doc_ref = self.db.collection('assignment_submissions').add({
            **submission_data,
            'created_at': datetime.utcnow()
        })
        return doc_ref[1].id
    
    def get_user_assignment_submissions(self, user_id: str, course_id: int) -> List[Dict]:
        """Get all assignment submissions for a user in a course."""
        docs = (
            self.db.collection('assignment_submissions')
            .where(filter=FieldFilter('user_id', '==', user_id))
            .where(filter=FieldFilter('course_id', '==', course_id))
            .stream()
        )
        return [doc.to_dict() for doc in docs]
    
    def sync_course_materials(self, course_id: int, materials: List[Dict]) -> None:
        """Sync course materials from Moodle to Firestore."""
        for material in materials:
            # Create or update material
            material_data = {
                'moodle_course_id': course_id,
                'module_id': material.get('id'),
                'name': material.get('name'),
                'type': material.get('modname'),
                'description': material.get('description'),
                'section_name': material.get('section_name'),
                'synced_at': datetime.utcnow()
            }
            
            # Use module_id as document ID to prevent duplicates
            doc_id = f"{course_id}_{material.get('id')}"
            self.db.collection('course_materials').document(doc_id).set(material_data, merge=True)
