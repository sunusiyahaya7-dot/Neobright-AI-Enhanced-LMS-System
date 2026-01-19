"""Moodle pluginfile.php proxy - Secure file streaming with server-side token."""

import requests
from flask import Blueprint, Response, stream_with_context, abort
from services.moodle_service import MoodleService

pluginfile_bp = Blueprint("pluginfile", __name__)

@pluginfile_bp.route("/api/moodle/pluginfile.php/<path:file_path>", methods=["GET"])
def proxy_pluginfile(file_path):
    """
    Secure proxy for Moodle pluginfile.php endpoint.
    Frontend never sees Moodle token - handled server-side only.
    Streams files efficiently without loading into memory.
    
    Frontend calls: GET /api/moodle/pluginfile.php/<file_path>
    Backend adds token and proxies to Moodle: /webservice/pluginfile.php?token=<token>
    """
    try:
        # Build Moodle file URL with server-side token (hidden from frontend)
        file_url = MoodleService.get_file_url(file_path)
        
        # Stream file from Moodle
        moodle_response = requests.get(file_url, stream=True, timeout=30)
        moodle_response.raise_for_status()

        # Return streamed response with proper headers
        return Response(
            stream_with_context(moodle_response.iter_content(chunk_size=8192)),
            content_type=moodle_response.headers.get("Content-Type", "application/octet-stream"),
            headers={
                "Content-Disposition": moodle_response.headers.get("Content-Disposition", "inline"),
                "Cache-Control": "public, max-age=3600"
            }
        )
    
    except requests.exceptions.HTTPError as e:
        abort(404, description="File not found or access denied")
    except Exception as e:
        abort(500, description="Error retrieving file")