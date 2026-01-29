"""Moodle pluginfile.php proxy - Secure file streaming with server-side token."""

import requests
from flask import Blueprint, request, Response, stream_with_context, abort
from services.moodle_service import MoodleService
from auth.firebase_auth import firebase_required

pluginfile_bp = Blueprint("pluginfile", __name__, url_prefix="/api/pluginfile")

@pluginfile_bp.route("/<path:file_path>", methods=["GET"])
def proxy_file(file_path):
    """
    Secure proxy for Moodle pluginfile.php endpoint.
    Frontend never sees Moodle token - handled server-side only.
    Streams files efficiently without loading into memory.
    
    No Firebase auth required here since:
    1. Moodle token is hidden server-side
    2. User already authenticated when fetching course contents
    3. File URLs are time-limited in Moodle
    
    Frontend calls: GET /api/pluginfile/<file_path>
    Backend adds token and proxies to Moodle: /webservice/pluginfile.php?token=<token>
    """
    try:
        # Build Moodle file URL with server-side token (hidden from frontend)
        file_url = MoodleService.get_file_url(file_path)
        
        # Stream file from Moodle
        moodle_response = MoodleService.fetch_file_stream(file_url)

        # Force download with attachment disposition (don't render inline)
        content_disposition = moodle_response.headers.get("Content-Disposition", "")
        # Extract filename from Moodle response or use default
        filename = "file"
        if "filename=" in content_disposition:
            filename = content_disposition.split("filename=")[-1].strip('"\'')
        
        # Return streamed response with proper headers to force download
        return Response(
            stream_with_context(moodle_response.iter_content(chunk_size=8192)),
            content_type=moodle_response.headers.get("Content-Type", "application/octet-stream"),
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "public, max-age=3600"
            }
        )
    
    except requests.exceptions.HTTPError:
        abort(404, description="File not found or access denied")
    except RuntimeError as e:
        abort(502, description=str(e))
    except Exception:
        abort(500, description="Error retrieving file")