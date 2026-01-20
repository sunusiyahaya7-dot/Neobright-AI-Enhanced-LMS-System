"""
Firestore initialization and index creation helper.
Run this once to set up Firestore indexes and collections.
"""
from firebase_admin import firestore

def initialize_firestore_indexes():
    """
    Create composite indexes for efficient queries.
    """
    indexes_needed = [
        # course_materials: query by course + order
        {
            "collection": "course_materials",
            "fields": [
                {"field": "moodle_course_id", "order": "ASCENDING"},
                {"field": "order_index", "order": "ASCENDING"}
            ]
        },
        # summaries: query by material + time
        {
            "collection": "summaries",
            "fields": [
                {"field": "material_id", "order": "ASCENDING"},
                {"field": "generated_at", "order": "DESCENDING"}
            ]
        },
        # ai_chats: query by user + course + time
        {
            "collection": "ai_chats",
            "fields": [
                {"field": "user_id", "order": "ASCENDING"},
                {"field": "moodle_course_id", "order": "ASCENDING"},
                {"field": "updated_at", "order": "DESCENDING"}
            ]
        }
    ]
    
    print("Firestore indexes needed:")
    print("Please create these indexes manually in Firebase Console:")
    for idx in indexes_needed:
        print(f"\nCollection: {idx['collection']}")
        for field in idx['fields']:
            print(f"  - {field['field']}: {field['order']}")

def create_initial_collections():
    """Create empty collections with proper structure."""
    db = firestore.client()
    
    collections = [
        'users',
        'courses', 
        'course_materials',
        'summaries',
        'ai_chats',
        'assignments',
        'feedback_logs'
    ]
    
    for collection_name in collections:
        # Create a temporary document to initialize collection
        temp_ref = db.collection(collection_name).document('_init')
        temp_ref.set({'initialized': True, 'created_at': firestore.SERVER_TIMESTAMP})
        temp_ref.delete()
        print(f"✓ Initialized collection: {collection_name}")

if __name__ == "__main__":
    create_initial_collections()
    initialize_firestore_indexes()