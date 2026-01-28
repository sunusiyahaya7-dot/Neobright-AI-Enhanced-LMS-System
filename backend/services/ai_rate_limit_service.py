"""
AI Rate Limiting Service for NeoBright LMS.

Prevents abuse by limiting AI API calls per user.
Simple implementation using Firestore for tracking.
"""
from datetime import datetime, timedelta
from typing import Optional
from functools import wraps
from flask import g, jsonify
from services.firestore_service import FirestoreService
import logging


class AiRateLimitService:
    """Service for rate limiting AI API calls."""
    
    logger = logging.getLogger(__name__)
    
    # Configuration
    MAX_CALLS_PER_MINUTE = 2  # Max 2 calls per minute per user
    MAX_CALLS_PER_HOUR = 20   # Max 20 calls per hour per user
    
    @staticmethod
    def check_rate_limit(user_id: str, endpoint: str) -> tuple[bool, Optional[str]]:
        """
        Check if user is within rate limits.
        
        Args:
            user_id: Firebase UID
            endpoint: API endpoint being called
            
        Returns:
            Tuple of (is_allowed: bool, error_message: Optional[str])
        """
        try:
            fs = FirestoreService()
            
            # Get user's rate limit document
            rate_limit_ref = fs.db.collection("ai_rate_limits").document(user_id)
            rate_limit_doc = rate_limit_ref.get()
            
            now = datetime.utcnow()
            
            if not rate_limit_doc.exists:
                # First call for this user - create record
                rate_limit_ref.set({
                    "last_call_timestamp": now.isoformat() + "Z",
                    "calls_last_minute": 1,
                    "calls_last_hour": 1,
                    "minute_window_start": now.isoformat() + "Z",
                    "hour_window_start": now.isoformat() + "Z"
                })
                return True, None
            
            data = rate_limit_doc.to_dict()
            last_call = datetime.fromisoformat(data.get("last_call_timestamp", "").replace("Z", ""))
            minute_start = datetime.fromisoformat(data.get("minute_window_start", "").replace("Z", ""))
            hour_start = datetime.fromisoformat(data.get("hour_window_start", "").replace("Z", ""))
            
            calls_last_minute = data.get("calls_last_minute", 0)
            calls_last_hour = data.get("calls_last_hour", 0)
            
            # Check minute window
            if (now - minute_start).total_seconds() < 60:
                if calls_last_minute >= AiRateLimitService.MAX_CALLS_PER_MINUTE:
                    wait_time = 60 - (now - minute_start).total_seconds()
                    return False, f"Rate limit exceeded. Please wait {int(wait_time)} seconds."
                # Still in same minute window
                calls_last_minute += 1
            else:
                # New minute window
                minute_start = now
                calls_last_minute = 1
            
            # Check hour window
            if (now - hour_start).total_seconds() < 3600:
                if calls_last_hour >= AiRateLimitService.MAX_CALLS_PER_HOUR:
                    wait_time = 3600 - (now - hour_start).total_seconds()
                    return False, f"Hourly rate limit exceeded. Please wait {int(wait_time/60)} minutes."
                # Still in same hour window
                calls_last_hour += 1
            else:
                # New hour window
                hour_start = now
                calls_last_hour = 1
            
            # Update rate limit record
            rate_limit_ref.set({
                "last_call_timestamp": now.isoformat() + "Z",
                "calls_last_minute": calls_last_minute,
                "calls_last_hour": calls_last_hour,
                "minute_window_start": minute_start.isoformat() + "Z",
                "hour_window_start": hour_start.isoformat() + "Z"
            })
            
            return True, None
            
        except Exception as e:
            AiRateLimitService.logger.error(f"Rate limit check failed: {e}")
            # On error, allow the request (fail open)
            return True, None
    
    @staticmethod
    def reset_user_limits(user_id: str) -> None:
        """
        Reset rate limits for a user (admin use).
        
        Args:
            user_id: Firebase UID
        """
        try:
            fs = FirestoreService()
            rate_limit_ref = fs.db.collection("ai_rate_limits").document(user_id)
            rate_limit_ref.delete()
            AiRateLimitService.logger.info(f"Reset rate limits for user {user_id}")
        except Exception as e:
            AiRateLimitService.logger.error(f"Failed to reset rate limits: {e}")


def ai_rate_limit(f):
    """
    Decorator to apply rate limiting to AI endpoints.
    
    Usage:
        @ai_rate_limit
        @firebase_required
        def my_ai_endpoint():
            ...
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Get user ID from Flask global context
        user_id = getattr(g, 'firebase_uid', None)
        
        if not user_id:
            return jsonify({"error": "Authentication required"}), 401
        
        # Check rate limit
        is_allowed, error_message = AiRateLimitService.check_rate_limit(
            user_id, 
            f.__name__
        )
        
        if not is_allowed:
            return jsonify({
                "error": "Rate limit exceeded",
                "message": error_message
            }), 429  # Too Many Requests
        
        # Proceed with the request
        return f(*args, **kwargs)
    
    return decorated_function
