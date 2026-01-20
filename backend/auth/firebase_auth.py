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
            decoded_token = firebase_auth.verify_id_token(id_token)
        except Exception as e:
            return jsonify({"error": "Invalid or expired token", "details": str(e)}), 401
        
        # Attach user info to flask.g
        g.firebase_uid = decoded_token["uid"]
        g.firebase_email = decoded_token.get("email")
        
        return f(*args, **kwargs)
    return wrapper