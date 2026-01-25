"""Firebase authentication middleware for Flask."""

from functools import wraps
from flask import request, jsonify, g
import os
import firebase_admin
from firebase_admin import auth

# Firebase Admin SDK is initialized in app.py - no need to initialize here

def verify_firebase_token(f):
    """Decorator to verify Firebase ID token from Authorization header."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = None
        
        # Extract token from Authorization header
        if "Authorization" in request.headers:
            auth_header = request.headers["Authorization"]
            try:
                token = auth_header.split(" ")[1]  # "Bearer <token>"
            except IndexError:
                return jsonify({"error": "Invalid authorization header"}), 401
        
        if not token:
            return jsonify({"error": "Missing authorization token"}), 401
        
        try:
            # Verify token with Firebase
            decoded_token = auth.verify_id_token(token)
            request.user = decoded_token  # Attach user info to request
            return f(*args, **kwargs)
        except Exception as e:
            return jsonify({"error": f"Invalid token: {str(e)}"}), 401
    
    return decorated_function