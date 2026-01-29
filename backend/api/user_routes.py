"""User profile routes backed by Firestore (server-side).

These endpoints allow the frontend to avoid direct browser calls to
firestore.googleapis.com (which can be blocked by ad blockers / privacy tools).
"""

from flask import Blueprint, jsonify, g, request

from auth.firebase_auth import firebase_required
from services.firestore_service import FirestoreService

user_bp = Blueprint("users", __name__, url_prefix="/api/users")


@user_bp.route("/me", methods=["GET"])
@firebase_required
def get_me():
    fs = FirestoreService()
    profile = fs.get_user(g.firebase_uid)
    return jsonify({"success": True, "profile": profile})


@user_bp.route("/me", methods=["POST"])
@firebase_required
def upsert_me():
    """Create/update the authenticated user's profile.

    Accepts optional fields like display_name and photo_url.
    Always ensures firebase_uid + email are stored.
    """

    body = request.get_json() or {}

    email = (g.firebase_email or "").strip()
    default_name = email.split("@")[0] if email else "Student"

    updates = {
        "firebase_uid": g.firebase_uid,
        "email": email,
        "display_name": (body.get("display_name") or default_name).strip() if isinstance(body.get("display_name"), str) else default_name,
        "photo_url": body.get("photo_url"),
    }

    fs = FirestoreService()
    existing = fs.get_user(g.firebase_uid)

    # Set created_at only when creating
    if not existing:
        updates["created_at"] = FirestoreService.timestamp_now()
        updates.setdefault("enrolled_courses", [])
        updates.setdefault("role", "student")

    fs.set_user_fields(g.firebase_uid, updates)

    profile = fs.get_user(g.firebase_uid)
    return jsonify({"success": True, "profile": profile})
