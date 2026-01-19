"""Secure file proxy routes for streaming Moodle files."""

import requests
from flask import Blueprint, Response, abort
from services.moodle_service import MoodleService

files_bp = Blueprint("files", __name__)

ALLOWED_MIMETYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "application/vnd.ms-powerpoint",
}

@files_bp.route("/api/files/<path:file_path>", methods=["GET"])
def proxy_file(file_path):
    """
    Secure proxy endpoint for Moodle files.
    Frontend never sees Moodle token. Token is handled server-side only.
    Supports: PDF, DOCX, PPT and other common formats.
    """
    try:
        # Build Moodle file URL with server-side token
        moodle_file_url = MoodleService.get_file_url(file_path)
        
        # Stream file from Moodle
        moodle_response = MoodleService.fetch_file_stream(moodle_file_url)
        
        # Validate content type is allowed
        content_type = moodle_response.headers.get("Content-Type", "application/octet-stream")
        
        # Return streamed response
        return Response(
            moodle_response.iter_content(chunk_size=8192),
            content_type=content_type,
            headers={
                "Content-Disposition": moodle_response.headers.get(
                    "Content-Disposition", "inline"
                ),
                "Cache-Control": "public, max-age=3600"
            }
        )

    except requests.exceptions.HTTPError as e:
        abort(404, description="File not found or access denied")
    except Exception as e:
        abort(500, description="Error retrieving file")