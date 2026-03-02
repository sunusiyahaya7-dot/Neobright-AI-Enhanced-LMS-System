"""
AI Routes for NeoBright LMS.
Provides AI-related endpoints including chat functionality.
"""
import uuid
import time
from datetime import datetime
from flask import Blueprint, jsonify, g, current_app, request
from auth.firebase_auth import firebase_required
from services.ai_context_service import AIContextService
from services.ai_service import AiService
from services.ai_rate_limit_service import ai_rate_limit
from services.firestore_service import FirestoreService
from services.ai_chat_service import generate_chat_response
from services.ai_course_insights_service import generate_course_insights
from models.firestore_models import ChatMessage


ai_bp = Blueprint('ai', __name__, url_prefix='/api')


# ==================== IN-MEMORY CONTEXT CACHE ====================
# Caches build_ai_context results for 5 minutes per user to avoid
# re-fetching all Moodle progress data on every chat message.
_context_cache: dict = {}        # {firebase_uid: {"data": ..., "ts": ...}}
_CONTEXT_CACHE_TTL = 300         # 5 minutes


def _get_cached_ai_context(firebase_uid: str) -> dict:
    """Return cached AI context if fresh, otherwise build and cache it."""
    cached = _context_cache.get(firebase_uid)
    if cached and (time.time() - cached["ts"]) < _CONTEXT_CACHE_TTL:
        return cached["data"]
    
    data = AIContextService.build_ai_context(firebase_uid)
    _context_cache[firebase_uid] = {"data": data, "ts": time.time()}
    return data


@ai_bp.route('/ai/context', methods=['GET'])
@firebase_required
def get_ai_context():
    """
    GET /api/ai/context
    
    Returns standardized AI context for logged-in student.
    
    This endpoint aggregates:
    - Student profile
    - Enrolled courses with progress
    - Grades/scores
    - Weekly progress trends
    - Overall analytics
    
    Returns:
    {
        "student": {...},
        "courses": [...],
        "analytics": {...}
    }
    """
    try:
        firebase_uid = g.firebase_uid
        
        # Build AI context from aggregated data
        context = AIContextService.build_ai_context(firebase_uid)
        
        return jsonify(context), 200
    
    except Exception as e:
        print(f"Error getting AI context: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ==================== INSIGHTS CACHING ====================

INSIGHTS_CACHE_HOURS = 6  # Cache insights for 6 hours


def _get_cached_insights(firebase_uid: str) -> dict | None:
    """Retrieve cached insights if not stale."""
    from datetime import datetime, timedelta, timezone
    
    fs = FirestoreService()
    doc = fs.db.collection('ai_insights_cache').document(firebase_uid).get()
    
    if not doc.exists:
        return None
    
    data = doc.to_dict()
    cached_at = data.get('cached_at')
    
    if not cached_at:
        return None
    
    # Make both datetimes timezone-aware for comparison
    now = datetime.now(timezone.utc)
    if cached_at.tzinfo is None:
        cached_at = cached_at.replace(tzinfo=timezone.utc)
    
    # Check if cache is stale
    cache_age = now - cached_at
    if cache_age > timedelta(hours=INSIGHTS_CACHE_HOURS):
        return None
    
    return data.get('insights')


def _save_insights_cache(firebase_uid: str, insights: dict) -> None:
    """Save insights to cache."""
    from datetime import datetime, timezone
    
    fs = FirestoreService()
    fs.db.collection('ai_insights_cache').document(firebase_uid).set({
        'insights': insights,
        'cached_at': datetime.now(timezone.utc),
        'user_id': firebase_uid
    })


# ==================== COURSE-SPECIFIC INSIGHTS ====================

COURSE_INSIGHTS_CACHE_HOURS = 6


def _get_cached_course_insights(firebase_uid: str, course_id: int) -> dict | None:
    """Retrieve cached course-specific insights if not stale."""
    from datetime import datetime, timedelta, timezone
    
    fs = FirestoreService()
    doc_id = f"{firebase_uid}_{course_id}"
    doc = fs.db.collection('ai_course_insights_cache').document(doc_id).get()
    
    if not doc.exists:
        return None
    
    data = doc.to_dict()
    cached_at = data.get('cached_at')
    
    if not cached_at:
        return None
    
    now = datetime.now(timezone.utc)
    if cached_at.tzinfo is None:
        cached_at = cached_at.replace(tzinfo=timezone.utc)
    
    cache_age = now - cached_at
    if cache_age > timedelta(hours=COURSE_INSIGHTS_CACHE_HOURS):
        return None
    
    return data.get('insights')


def _save_course_insights_cache(firebase_uid: str, course_id: int, insights: dict) -> None:
    """Save course-specific insights to cache."""
    from datetime import datetime, timezone
    
    fs = FirestoreService()
    doc_id = f"{firebase_uid}_{course_id}"
    fs.db.collection('ai_course_insights_cache').document(doc_id).set({
        'insights': insights,
        'cached_at': datetime.now(timezone.utc),
        'user_id': firebase_uid,
        'course_id': course_id
    })


@ai_bp.route('/ai/courses/<int:course_id>/insights', methods=['GET'])
@firebase_required
def get_course_insights(course_id: int):
    """
    GET /api/ai/courses/<course_id>/insights
    
    Returns AI-generated insights specific to a single course.
    Cached in Firestore for 6 hours per user+course.
    
    Query params:
    - force=true: Skip cache and regenerate
    
    Returns:
    {
        "insights": ["bullet 1", "bullet 2", ...],
        "study_tip": "...",
        "cached": true/false,
        "cache_expires_at": "..."
    }
    """
    try:
        from datetime import datetime, timedelta, timezone
        from services.ai_rate_limit_service import check_rate_limit
        
        firebase_uid = g.firebase_uid
        force_refresh = request.args.get('force', '').lower() == 'true'
        
        # Try cache first
        if not force_refresh:
            cached = _get_cached_course_insights(firebase_uid, course_id)
            if cached:
                cached['cached'] = True
                fs = FirestoreService()
                doc_id = f"{firebase_uid}_{course_id}"
                doc = fs.db.collection('ai_course_insights_cache').document(doc_id).get()
                if doc.exists:
                    cached_at = doc.to_dict().get('cached_at')
                    if cached_at:
                        expires_at = cached_at + timedelta(hours=COURSE_INSIGHTS_CACHE_HOURS)
                        cached['cache_expires_at'] = expires_at.isoformat() + 'Z'
                
                print(f"Returning cached course insights for user {firebase_uid}, course {course_id}")
                return jsonify(cached), 200
        
        # Rate limit for fresh generation
        rate_limit_error = check_rate_limit(firebase_uid)
        if rate_limit_error:
            return jsonify({"error": rate_limit_error}), 429
        
        print(f"Generating fresh course insights for user {firebase_uid}, course {course_id}")
        
        # Build context — bust the in-memory cache when force-refreshing
        # so we get fresh progress data from Moodle
        if force_refresh and firebase_uid in _context_cache:
            del _context_cache[firebase_uid]
        context_dict = _get_cached_ai_context(firebase_uid)
        
        # Find this specific course in context (match by numeric moodle_id)
        target_course = None
        for c in context_dict.get('courses', []):
            if c.get('moodle_id') == course_id or c.get('id') == course_id:
                target_course = c
                break
        
        if not target_course:
            return jsonify({
                "insights": ["This course was not found in your enrollment data."],
                "study_tip": "Make sure you're enrolled in this course on Moodle.",
                "cached": False
            }), 200
        
        # Get assignments for this course (assignments use course name, not ID)
        course_name = target_course.get('name', '')
        course_assignments = [
            a for a in context_dict.get('assignments', [])
            if a.get('course', '') == course_name
        ]
        course_quizzes = [
            q for q in context_dict.get('quizzes', [])
            if q.get('course', '') == course_name
        ]
        
        # Generate using extracted service
        insights_data = generate_course_insights(
            target_course, course_assignments, course_quizzes, context_dict, current_app.config,
            user_id=firebase_uid
        )
        
        # Cache
        _save_course_insights_cache(firebase_uid, course_id, insights_data)
        
        insights_data['cached'] = False
        expires_at = datetime.now(timezone.utc) + timedelta(hours=COURSE_INSIGHTS_CACHE_HOURS)
        insights_data['cache_expires_at'] = expires_at.isoformat() + 'Z'
        
        return jsonify(insights_data), 200
    
    except Exception as e:
        print(f"Error generating course insights: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500



@ai_bp.route('/ai/insights', methods=['GET'])
@firebase_required
def get_ai_insights():
    """
    GET /api/ai/insights
    
    Returns AI-generated insights for logged-in student.
    
    Query params:
    - force=true: Skip cache and regenerate (uses tokens, rate limited)
    
    Rate limited only when generating fresh insights (not cached reads).
    
    Returns:
    {
        "summary": "...",
        "strengths": [...],
        "areas_to_improve": [...],
        "actions": [...],
        "risk_level": "low|medium|high",
        "confidence_score": 0.95,
        "generated_at": "2026-01-27T...",
        "cached": true/false,
        "cache_expires_at": "2026-01-27T..."
    }
    """
    try:
        from models.ai_models import StudentContext
        from datetime import datetime, timedelta, timezone
        from services.ai_rate_limit_service import check_rate_limit
        
        firebase_uid = g.firebase_uid
        force_refresh = request.args.get('force', '').lower() == 'true'
        
        # Try to get cached insights (unless force refresh)
        if not force_refresh:
            cached = _get_cached_insights(firebase_uid)
            if cached:
                # Add cache metadata
                cached['cached'] = True
                fs = FirestoreService()
                doc = fs.db.collection('ai_insights_cache').document(firebase_uid).get()
                if doc.exists:
                    cached_at = doc.to_dict().get('cached_at')
                    if cached_at:
                        expires_at = cached_at + timedelta(hours=INSIGHTS_CACHE_HOURS)
                        cached['cache_expires_at'] = expires_at.isoformat() + 'Z'
                
                print(f"Returning cached insights for user {firebase_uid}")
                return jsonify(cached), 200
        
        # Rate limit only applies when generating fresh insights
        rate_limit_error = check_rate_limit(firebase_uid)
        if rate_limit_error:
            return jsonify({"error": rate_limit_error}), 429
        
        # Generate fresh insights
        print(f"Generating fresh insights for user {firebase_uid} (force={force_refresh})")
        
        # Build AI context — bust in-memory cache when force-refreshing
        # This happens when generating course-specific insights too, so we get fresh progress data from Moodle
        # regardless of the 5 stale in-min cache.
        if force_refresh and firebase_uid in _context_cache:
            del _context_cache[firebase_uid]
        context_dict = _get_cached_ai_context(firebase_uid)
        
        # Convert dict to StudentContext object
        context = StudentContext.from_dict(context_dict)
        
        # Generate insights using AiService (pass user_id for logging)
        insights = AiService.generate_insights(
            context, 
            current_app.config,
            user_id=firebase_uid  # For logging
        )
        
        # Convert dataclass to dict for JSON response
        insights_dict = insights.to_dict()
        
        # Save to cache
        _save_insights_cache(firebase_uid, insights_dict)
        
        # Add cache metadata
        insights_dict['cached'] = False
        expires_at = datetime.now(timezone.utc) + timedelta(hours=INSIGHTS_CACHE_HOURS)
        insights_dict['cache_expires_at'] = expires_at.isoformat() + 'Z'
        
        return jsonify(insights_dict), 200
    
    except Exception as e:
        print(f"Error generating AI insights: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ==================== AI CHAT ENDPOINTS ====================

@ai_bp.route('/ai/chats', methods=['POST'])
@firebase_required
def create_chat():
    """
    POST /api/ai/chats
    
    Create a new AI chat session.
    
    Request body:
    {
        "courseId": 5,  // optional - for course-specific chats
        "title": "Help with Assignment 1"  // optional
    }
    
    Returns:
    {
        "chatId": "uuid",
        "title": "...",
        "courseId": 5,
        "createdAt": "..."
    }
    """
    try:
        firebase_uid = g.firebase_uid
        body = request.get_json() or {}
        
        course_id = body.get("courseId")
        title = body.get("title", "New Chat")
        
        # Generate unique chat ID
        chat_id = str(uuid.uuid4())
        
        # Create chat document in Firestore
        fs = FirestoreService()
        chat_data = {
            "chat_id": chat_id,
            "user_id": firebase_uid,
            "moodle_course_id": course_id,
            "title": title,
            "total_tokens": 0,
            "model_used": current_app.config.get("AI_MODEL", "gpt-4o-mini"),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        fs.db.collection('ai_chats').document(chat_id).set(chat_data)
        
        return jsonify({
            "chatId": chat_id,
            "title": title,
            "courseId": course_id,
            "createdAt": chat_data["created_at"].isoformat()
        }), 201
    
    except Exception as e:
        print(f"Error creating chat: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@ai_bp.route('/ai/chats', methods=['GET'])
@firebase_required
def list_chats():
    """
    GET /api/ai/chats
    
    List all chat sessions for the current user.
    
    Query params:
    - courseId: filter by course (optional)
    
    Returns:
    {
        "chats": [
            {
                "chatId": "...",
                "title": "...",
                "courseId": 5,
                "createdAt": "...",
                "updatedAt": "..."
            }
        ]
    }
    """
    try:
        firebase_uid = g.firebase_uid
        course_id = request.args.get("courseId", type=int)
        
        fs = FirestoreService()
        
        # Query chats for user
        query = fs.db.collection('ai_chats').where('user_id', '==', firebase_uid)
        
        if course_id:
            query = query.where('moodle_course_id', '==', course_id)
        
        query = query.order_by('updated_at', direction='DESCENDING').limit(50)
        
        docs = query.stream()
        
        chats = []
        for doc in docs:
            data = doc.to_dict()
            chats.append({
                "chatId": data.get("chat_id"),
                "title": data.get("title", "Chat"),
                "courseId": data.get("moodle_course_id"),
                "createdAt": data.get("created_at").isoformat() if data.get("created_at") else None,
                "updatedAt": data.get("updated_at").isoformat() if data.get("updated_at") else None
            })
        
        return jsonify({"chats": chats}), 200
    
    except Exception as e:
        print(f"Error listing chats: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@ai_bp.route('/ai/chats/<chat_id>', methods=['GET'])
@firebase_required
def get_chat(chat_id: str):
    """
    GET /api/ai/chats/<chat_id>
    
    Get a specific chat with all messages.
    
    Returns:
    {
        "chatId": "...",
        "title": "...",
        "courseId": 5,
        "messages": [
            { "role": "user", "content": "...", "timestamp": "..." },
            { "role": "assistant", "content": "...", "timestamp": "..." }
        ]
    }
    """
    try:
        firebase_uid = g.firebase_uid
        fs = FirestoreService()
        
        # Get chat document
        chat_doc = fs.db.collection('ai_chats').document(chat_id).get()
        
        if not chat_doc.exists:
            return jsonify({"error": "Chat not found"}), 404
        
        chat_data = chat_doc.to_dict()
        
        # Verify ownership
        if chat_data.get("user_id") != firebase_uid:
            return jsonify({"error": "Access denied"}), 403
        
        # Get messages
        messages = fs.get_chat_messages(chat_id)
        
        # Format timestamps
        formatted_messages = []
        for msg in messages:
            formatted_messages.append({
                "role": msg.get("role"),
                "content": msg.get("content"),
                "timestamp": msg.get("timestamp").isoformat() if msg.get("timestamp") else None
            })
        
        return jsonify({
            "chatId": chat_id,
            "title": chat_data.get("title", "Chat"),
            "courseId": chat_data.get("moodle_course_id"),
            "messages": formatted_messages
        }), 200
    
    except Exception as e:
        print(f"Error getting chat: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@ai_bp.route('/ai/chats/<chat_id>/messages', methods=['POST'])
@firebase_required
@ai_rate_limit
def send_message(chat_id: str):
    """
    POST /api/ai/chats/<chat_id>/messages
    
    Send a message and get AI response.
    Supports optional file upload (PDF or image).
    
    Request body (JSON):
    {
        "message": "Help me understand this concept..."
    }
    
    OR multipart/form-data:
    {
        "message": "Summarize this...",
        "file": <file object>
    }
    
    Returns:
    {
        "userMessage": { "role": "user", "content": "...", "timestamp": "..." },
        "assistantMessage": { "role": "assistant", "content": "...", "timestamp": "..." }
    }
    """
    try:
        from models.ai_models import StudentContext
        from services.file_service import FileService
        
        firebase_uid = g.firebase_uid
        
        # ── Verbose request debugging ──
        print(f"[SEND_MSG] content_type={request.content_type}")
        print(f"[SEND_MSG] content_length={request.content_length}")
        print(f"[SEND_MSG] files keys={list(request.files.keys()) if request.files else 'NONE'}")
        print(f"[SEND_MSG] form keys={list(request.form.keys()) if request.form else 'NONE'}")
        
        # Handle both JSON and multipart/form-data
        user_message_content = ""
        if request.content_type and 'multipart/form-data' in request.content_type:
            user_message_content = request.form.get("message", "").strip()
        else:
            body = request.get_json(silent=True) or {}
            user_message_content = body.get("message", "").strip()
        
        # Check for file upload
        file_context = None
        file_meta = None  # File metadata for frontend rendering
        if 'file' in request.files:
            file = request.files['file']
            if file and file.filename:
                file_content = file.read()
                file_name = file.filename
                file_type = file.content_type or 'application/octet-stream'
                file_size = len(file_content)
                
                print(f"[FILE UPLOAD] Received: {file_name} ({file_type}, {file_size} bytes)")
                
                # Store file metadata for frontend
                file_meta = {
                    "name": file_name,
                    "type": file_type,
                    "size": file_size
                }
                
                # Extract text from file
                extracted_text = FileService.process_uploaded_file(file_content, file_name, file_type)
                
                print(f"[FILE UPLOAD] Extraction result: {len(extracted_text) if extracted_text else 0} chars")
                
                if extracted_text:
                    # Create file context for AI (internal - full text)
                    file_context = FileService.create_file_context_message(file_name, extracted_text)
        
        if not user_message_content and not file_meta:
            return jsonify({"error": "Message or file is required"}), 400
        
        fs = FirestoreService()
        
        # Verify chat exists and user owns it
        chat_doc = fs.db.collection('ai_chats').document(chat_id).get()
        
        if not chat_doc.exists:
            return jsonify({"error": "Chat not found"}), 404
        
        chat_data = chat_doc.to_dict()
        
        if chat_data.get("user_id") != firebase_uid:
            return jsonify({"error": "Access denied"}), 403
        
        # Save user message (just the text part, file is metadata)
        save_content = user_message_content or ("Analyze this file" if file_meta else "")
        user_msg = ChatMessage(role="user", content=save_content)
        fs.save_chat_message(chat_id, user_msg)
        user_timestamp = datetime.utcnow()
        
        # Build AI context message (with file content for AI processing)
        ai_context_message = ""
        if file_context:
            ai_context_message = file_context
        if user_message_content:
            if ai_context_message:
                ai_context_message += f"\n\nUser request: {user_message_content}"
            else:
                ai_context_message = user_message_content
        
        # Get student context for AI (cached 5min to avoid Moodle spam)
        context_dict = _get_cached_ai_context(firebase_uid)
        
        # Get previous messages for context (last 10)
        previous_messages = fs.get_chat_messages(chat_id)
        conversation_history = previous_messages[-10:] if len(previous_messages) > 10 else previous_messages
        
        # Generate AI response using extracted chat service (with logging)
        ai_response = generate_chat_response(
            ai_context_message,
            context_dict,
            conversation_history,
            chat_data.get("moodle_course_id"),
            current_app.config,
            user_id=firebase_uid,
        )
        
        # Save assistant message
        assistant_msg = ChatMessage(role="assistant", content=ai_response)
        fs.save_chat_message(chat_id, assistant_msg)
        assistant_timestamp = datetime.utcnow()
        
        # Update chat timestamp
        fs.db.collection('ai_chats').document(chat_id).update({
            "updated_at": datetime.utcnow()
        })
        
        response_data = {
            "userMessage": {
                "role": "user",
                "content": save_content,
                "timestamp": user_timestamp.isoformat()
            },
            "assistantMessage": {
                "role": "assistant",
                "content": ai_response,
                "timestamp": assistant_timestamp.isoformat()
            }
        }
        
        # Include file metadata if a file was uploaded
        if file_meta:
            response_data["userMessage"]["file"] = file_meta
        
        return jsonify(response_data), 200
    
    except Exception as e:
        print(f"Error sending message: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@ai_bp.route('/ai/chats/<chat_id>', methods=['DELETE'])
@firebase_required
def delete_chat(chat_id: str):
    """
    DELETE /api/ai/chats/<chat_id>
    
    Delete a cghat session and all its messaes.
    """
    try:
        firebase_uid = g.firebase_uid
        fs = FirestoreService()
        
        # Verify chat exists and user owns it
        chat_doc = fs.db.collection('ai_chats').document(chat_id).get()
        
        if not chat_doc.exists:
            return jsonify({"error": "Chat not found"}), 404
        
        chat_data = chat_doc.to_dict()
        
        if chat_data.get("user_id") != firebase_uid:
            return jsonify({"error": "Access denied"}), 403
        
        # Delete all messages in subcollection
        messages_ref = fs.db.collection('ai_chats').document(chat_id).collection('messages')
        for msg_doc in messages_ref.stream():
            msg_doc.reference.delete()
        
        # Delete chat document
        fs.db.collection('ai_chats').document(chat_id).delete()
        
        return jsonify({"success": True, "message": "Chat deleted"}), 200
    
    except Exception as e:
        print(f"Error deleting chat: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


