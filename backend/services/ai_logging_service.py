"""
AI Logging Service for NeoBright LMS.

Tracks all AI API calls for:
- Usage monitoring
- Cost tracking
- Debugging
- Analytics/reporting
"""
from datetime import datetime
from typing import Optional, Dict, Any
from services.firestore_service import FirestoreService
import logging


class AiLoggingService:
    """Service for logging AI API calls to Firestore."""
    
    logger = logging.getLogger(__name__)
    
    @staticmethod
    def log_ai_call(
        user_id: str,
        endpoint: str,
        model: str,
        success: bool,
        prompt_tokens: Optional[int] = None,
        completion_tokens: Optional[int] = None,
        total_tokens: Optional[int] = None,
        error_message: Optional[str] = None,
        response_time_ms: Optional[float] = None
    ) -> None:
        """
        Log an AI API call to Firestore.
        
        Args:
            user_id: Firebase UID of the user
            endpoint: API endpoint called (e.g., "/api/ai/insights")
            model: AI model used (e.g., "gpt-4o-mini")
            success: Whether the call succeeded
            prompt_tokens: Number of tokens in prompt (input)
            completion_tokens: Number of tokens in completion (output)
            total_tokens: Total tokens used
            error_message: Error message if failed
            response_time_ms: Response time in milliseconds
        """
        try:
            fs = FirestoreService()
            
            log_entry = {
                "user_id": user_id,
                "endpoint": endpoint,
                "model": model,
                "success": success,
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "prompt_tokens": prompt_tokens or 0,
                "completion_tokens": completion_tokens or 0,
                "total_tokens": total_tokens or 0,
                "error_message": error_message,
                "response_time_ms": response_time_ms
            }
            
            # Store in Firestore under ai_logs collection
            fs.db.collection("ai_logs").add(log_entry)
            
            AiLoggingService.logger.info(
                f"AI call logged: user={user_id}, endpoint={endpoint}, "
                f"success={success}, tokens={total_tokens}"
            )
            
        except Exception as e:
            # Don't fail the request if logging fails
            AiLoggingService.logger.error(f"Failed to log AI call: {e}")
    
    @staticmethod
    def get_user_usage_stats(user_id: str, days: int = 30) -> Dict[str, Any]:
        """
        Get usage statistics for a user.
        
        Args:
            user_id: Firebase UID
            days: Number of days to look back
            
        Returns:
            Dict with usage stats (total calls, tokens, success rate, etc.)
        """
        try:
            fs = FirestoreService()
            
            # Query logs for this user
            logs_ref = fs.db.collection("ai_logs").where("user_id", "==", user_id)
            logs = list(logs_ref.stream())
            
            if not logs:
                return {
                    "total_calls": 0,
                    "successful_calls": 0,
                    "failed_calls": 0,
                    "total_tokens": 0,
                    "avg_response_time_ms": 0
                }
            
            total_calls = len(logs)
            successful_calls = sum(1 for log in logs if log.to_dict().get("success"))
            failed_calls = total_calls - successful_calls
            total_tokens = sum(log.to_dict().get("total_tokens", 0) for log in logs)
            
            response_times = [
                log.to_dict().get("response_time_ms", 0) 
                for log in logs 
                if log.to_dict().get("response_time_ms")
            ]
            avg_response_time = sum(response_times) / len(response_times) if response_times else 0
            
            return {
                "total_calls": total_calls,
                "successful_calls": successful_calls,
                "failed_calls": failed_calls,
                "success_rate": successful_calls / total_calls if total_calls > 0 else 0,
                "total_tokens": total_tokens,
                "avg_tokens_per_call": total_tokens / total_calls if total_calls > 0 else 0,
                "avg_response_time_ms": avg_response_time
            }
            
        except Exception as e:
            AiLoggingService.logger.error(f"Failed to get usage stats: {e}")
            return {}
