from functools import wraps
from flask import request, jsonify, g
from firebase_admin import auth as firebase_auth

def firebase_required(f):
    """
    Decorator to protect routes with Firebase authentication.
    Verifies the Firebase ID token from the Authorization header.
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401
        
        id_token = auth_header.split(" ", 1)[1].strip()
        try:
            # check_revoked=False for faster validation; clock skew handled by retry
            decoded_token = firebase_auth.verify_id_token(id_token, check_revoked=False)
        except firebase_auth.InvalidIdTokenError as e:
            error_msg = str(e)
            # Handle clock skew: "Token used too early" - token is valid, just clock drift
            if "used too early" in error_msg.lower():
                import time
                time.sleep(2)  # Wait for clock to catch up
                try:
                    decoded_token = firebase_auth.verify_id_token(id_token, check_revoked=False)
                except Exception as retry_e:
                    return jsonify({"error": "Invalid or expired token", "details": str(retry_e)}), 401
            else:
                return jsonify({"error": "Invalid or expired token", "details": error_msg}), 401
        except Exception as e:
            return jsonify({"error": "Invalid or expired token", "details": str(e)}), 401
        
        # Attach user info to flask.g
        g.firebase_uid = decoded_token["uid"]
        g.firebase_email = decoded_token.get("email")
        
        return f(*args, **kwargs)
    return wrapper