"""
AI Routes for NeoBright LMS.
Provides AI-related endpoints including chat functionality.
"""
import uuid
from datetime import datetime
from flask import Blueprint, jsonify, g, current_app, request
from auth.firebase_auth import firebase_required
from services.ai_context_service import AIContextService
from services.ai_service import AiService
from services.ai_rate_limit_service import ai_rate_limit
from services.firestore_service import FirestoreService
from models.firestore_models import ChatMessage


ai_bp = Blueprint('ai', __name__, url_prefix='/api')


# ═══════════════════════════════════════════════════════
# DEBUG endpoint — will be removing in production
# ═══════════════════════════════════════════════════════
@ai_bp.route('/ai/debug-upload', methods=['POST'])
def debug_upload():
    """
    POST /api/ai/debug-upload  (NO AUTH REQUIRED)
    Test file upload processing. Send multipart/form-data with a 'file' field.
    """
    from services.file_service import FileService
    
    info = {
        "content_type": request.content_type,
        "content_length": request.content_length,
        "files_keys": list(request.files.keys()) if request.files else [],
        "form_keys": list(request.form.keys()) if request.form else [],
    }
    print(f"[DEBUG UPLOAD] Request info: {info}")
    
    if 'file' not in request.files:
        info["error"] = "No 'file' key in request.files"
        return jsonify(info), 400
    
    file = request.files['file']
    file_content = file.read()
    info["file_name"] = file.filename
    info["file_content_type"] = file.content_type
    info["file_size_bytes"] = len(file_content)
    info["file_header_hex"] = file_content[:16].hex() if file_content else "EMPTY"
    
    print(f"[DEBUG UPLOAD] File: name={file.filename}, type={file.content_type}, size={len(file_content)}, header={info['file_header_hex']}")
    
    # Try extraction
    extracted = FileService.process_uploaded_file(file_content, file.filename, file.content_type)
    info["extracted_length"] = len(extracted) if extracted else 0
    info["extracted_preview"] = extracted[:500] if extracted else None
    
    print(f"[DEBUG UPLOAD] Extraction result: {info['extracted_length']} chars")
    
    return jsonify(info), 200


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
        
        # Build AI context from aggregated data (returns dict)
        context_dict = AIContextService.build_ai_context(firebase_uid)
        
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
        
        # Get student context for AI
        context_dict = AIContextService.build_ai_context(firebase_uid)
        
        # Get previous messages for context (last 10)
        previous_messages = fs.get_chat_messages(chat_id)
        conversation_history = previous_messages[-10:] if len(previous_messages) > 10 else previous_messages
        
        # Generate AI response using chat-specific prompt with file context
        ai_response = _generate_chat_response(
            ai_context_message,
            context_dict,
            conversation_history,
            chat_data.get("moodle_course_id"),
            current_app.config
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


def _generate_chat_response(
    user_message: str,
    context: dict,
    conversation_history: list,
    course_id: int | None,
    app_config: dict
) -> str:
    """
    Generate AI chat response using OpenAI.
    
    Includes student context and conversation history for personalized responses.
    """
    try:
        from openai import OpenAI
    except ImportError:
        return _fallback_chat_response(user_message)
    
    api_key = app_config.get("OPENAI_API_KEY")
    if not api_key:
        return _fallback_chat_response(user_message)
    
    # Build system prompt with student context
    assignments_text = _format_assignments_context(context.get('assignments', []))
    system_prompt = f"""You are NeoBright, a helpful AI learning assistant for university students.

STUDENT CONTEXT:
- Name: {context.get('student', {}).get('name', 'Student')}
- Overall Progress: {context.get('analytics', {}).get('overallProgress', 0)}%
- Risk Level: {context.get('analytics', {}).get('riskLevel', 'unknown')}
- Enrolled Courses: {len(context.get('courses', []))}

{_format_courses_context(context.get('courses', []), course_id)}

{assignments_text}

GUIDELINES:
- If user asks you show them their progress, Don't start with "The student's progress is..." Instead, say "Your progress is..." etc.
- Be encouraging, supportive, and helpful
- Provide specific, actionable advice
- Reference the student's actual courses and progress when relevant
- Keep responses concise but thorough
- If asked about grades or progress, use the provided context data to give specific numbers
- If asked about due dates or deadlines, use the ASSIGNMENTS context above to give specific dates and names
- IMPORTANT: Distinguish between SUBMITTED and NOT SUBMITTED assignments. If an assignment is marked as SUBMITTED, do NOT call it overdue or tell the student to submit it — it's already done
- Only flag assignments as overdue if they are BOTH past due AND not submitted
- Format responses with bullet points, bold text (**bold**), and clear structure for readability
- When listing items (progress, assignments, tips), use bullet points (- ) for clarity
- Always speak directly to the student using "you" and "your"
- Avoid jargon or complex terminology; keep language simple and student-friendly

QUIZ & LEARNING GUIDELINES:
- When a student asks to be quizzed ("Quiz Me", "create a quiz", "test me", etc.):
  - FIRST, ask which specific lecture, topic, or chapter they want to be quizzed on
  - THEN, ask them to upload lecture notes/materials OR provide the topic content
  - Do NOT create quizzes without specific content to base them on
  - Explain that you need the specific material to create relevant questions
  - If they mention a course name (e.g., "Parallel Computing"), ask for the specific topic/lecture number
- When a student asks to summarize a topic:
  - Ask which specific topic or lecture they want summarized
  - Ask them to provide the material/notes if needed
- Use the student's course names from context when suggesting topics

- If a student asked you to "summarize this topic for me", ask clarifying questions about which aspects they want summarized before providing an answer
- Never make up information not in the context
- If asked anything that is not related to learning or courses, politely decline and steer back to academic topics
- Always prioritize the student's learning and well-being
- Current date: {datetime.utcnow().date().isoformat()}
- Respond to the user's messages based on this context and the conversation history.
"""

    # Build messages array
    messages = [{"role": "system", "content": system_prompt}]
    
    # Add conversation history
    for msg in conversation_history:
        messages.append({
            "role": msg.get("role", "user"),
            "content": msg.get("content", "")
        })
    
    # Add current user message (if not already in history)
    if not conversation_history or conversation_history[-1].get("content") != user_message:
        messages.append({"role": "user", "content": user_message})
    
    try:
        client = OpenAI(api_key=api_key)
        
        response = client.chat.completions.create(
            model=app_config.get("AI_MODEL", "gpt-4o-mini"),
            messages=messages,
            temperature=app_config.get("AI_TEMPERATURE", 0.6),
            max_tokens=app_config.get("AI_MAX_TOKENS", 500)
        )
        
        return response.choices[0].message.content
    
    except Exception as e:
        print(f"OpenAI API error: {e}")
        return _fallback_chat_response(user_message)


def _format_courses_context(courses: list, active_course_id: int | None) -> str:
    """Format courses for system prompt."""
    if not courses:
        return "No courses enrolled."
    
    lines = ["COURSES:"]
    for course in courses:
        marker = "→ " if course.get("id") == active_course_id else "  "
        score_str = f", Avg: {course.get('averageScore')}%" if course.get('averageScore') else ""
        lines.append(
            f"{marker}{course.get('name', 'Unknown')} - Progress: {course.get('progress', 0)}%{score_str}"
        )
    
    return "\n".join(lines)


def _format_assignments_context(assignments: list) -> str:
    """Format assignments with due dates and submission status for system prompt."""
    if not assignments:
        return "ASSIGNMENTS:\nNo assignments found."
    
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    
    pending_lines = ["PENDING ASSIGNMENTS (not yet submitted):"]
    submitted_lines = ["SUBMITTED/COMPLETED ASSIGNMENTS:"]
    has_pending = False
    has_submitted = False
    
    for a in assignments:
        name = a.get('name', 'Unknown')
        course = a.get('course', 'Unknown')
        duedate_ts = a.get('duedate_ts', 0)
        status = a.get('status', 'not submitted')
        
        if duedate_ts:
            due_dt = datetime.utcfromtimestamp(duedate_ts).replace(tzinfo=timezone.utc)
            due_str = due_dt.strftime('%B %d, %Y at %I:%M %p')
            
            # Calculate days until due
            days_diff = (due_dt - now).days
            if days_diff < 0:
                time_label = f"(was due {abs(days_diff)} days ago)"
            elif days_diff == 0:
                time_label = "(DUE TODAY)"
            elif days_diff == 1:
                time_label = "(DUE TOMORROW)"
            else:
                time_label = f"(due in {days_diff} days)"
        else:
            due_str = "No due date set"
            time_label = ""
        
        if status == "submitted":
            has_submitted = True
            submitted_lines.append(f"  ✅ {name} [{course}] — Due: {due_str} — SUBMITTED")
        else:
            has_pending = True
            if duedate_ts and days_diff < 0:
                pending_lines.append(f"  ⚠️ {name} [{course}] — Due: {due_str} {time_label} — OVERDUE, NOT SUBMITTED")
            else:
                pending_lines.append(f"  📌 {name} [{course}] — Due: {due_str} {time_label}")
    
    result_lines = []
    if has_pending:
        result_lines.extend(pending_lines)
    else:
        result_lines.append("PENDING ASSIGNMENTS: None — all assignments are submitted! 🎉")
    
    result_lines.append("")  # blank separator
    
    if has_submitted:
        result_lines.extend(submitted_lines)
    
    return "\n".join(result_lines)


def _fallback_chat_response(user_message: str) -> str:
    """Fallback response when AI is unavailable."""
    return (
        "I'm currently operating in limited mode. While I can't provide AI-powered responses right now, "
        "here are some general tips:\n\n"
        "• Check your course materials and syllabus for guidance\n"
        "• Review your progress dashboard for insights\n"
        "• Reach out to your instructor for specific questions\n\n"
        "Please try again later for personalized AI assistance."
    )
