"""Unified materials endpoint combining Moodle contents + Firestore processed materials."""

from flask import Blueprint, jsonify, g, current_app, request
from auth.firebase_auth import firebase_required
from services.moodle_service import MoodleService
from services.firestore_service import FirestoreService

materials_bp = Blueprint("materials", __name__, url_prefix="/api/courses")


def _to_proxy_url(fileurl: str | None) -> str | None:
    """Convert a Moodle pluginfile URL into our secure proxy URL."""
    if not fileurl:
        return None
    base_url = (current_app.config.get("MOODLE_BASE_URL") or "").rstrip("/")
    prefix = f"{base_url}/webservice/pluginfile.php/"
    if fileurl.startswith(prefix):
        file_path = fileurl[len(prefix):]
        # Use absolute URL to backend to avoid React Router catching it
        backend_url = current_app.config.get("BACKEND_URL", "http://localhost:5000")
        return f"{backend_url}/api/pluginfile/{file_path}"
    return None


@materials_bp.route("/<int:course_id>/materials", methods=["GET"])
@firebase_required
def get_unified_materials(course_id: int):
    """
    Unified endpoint: return Moodle course contents + assignment files + Firestore processed materials.

    Response shape:
    {
      "success": true,
      "moodle_sections": [ { section_id, section_name, modules: [ ... ] } ],
      "processed": {
        "<module_id>": {
          "summaries": [ { content, generated_at, ... } ],
          "extracted_text": "...",
          "ai_insights": [ ... ]
        }
      },
      "count": {
        "sections": 3,
        "modules": 8,
        "files": 15,
        "processed_modules": 2
      }
    }
    """
    try:
        # Fetch Moodle contents
        moodle_contents = MoodleService.get_course_contents(course_id)
        
        # Fetch assignment files separately
        try:
            assignment_data = MoodleService.get_assignment_details(course_id)
            assignments_by_id = {}
            if isinstance(assignment_data, dict) and "courses" in assignment_data:
                for course in assignment_data.get("courses", []):
                    for assignment in course.get("assignments", []):
                        assignments_by_id[assignment.get("id")] = assignment
        except Exception as assign_err:
            # Assignment fetch is optional; don't fail if it errors
            print(f"Warning: Could not fetch assignment details: {assign_err}")
            assignments_by_id = {}
        
        sections = []

        for section in moodle_contents:
            section_data = {
                "section_id": section.get("id"),
                "section_name": section.get("name"),
                "summary": section.get("summary"),
                "modules": []
            }

            for module in section.get("modules", []):
                module_data = {
                    "id": module.get("id"),
                    "name": module.get("name"),
                    "modname": module.get("modname"),
                    "description": module.get("description"),
                    "files": []
                }

                # Add files from module.contents (regular resources)
                for content in module.get("contents", []):
                    module_data["files"].append({
                        "filename": content.get("filename"),
                        "fileurl": content.get("fileurl"),
                        "proxy_url": _to_proxy_url(content.get("fileurl")),
                        "mimetype": content.get("mimetype"),
                        "filesize": content.get("filesize")
                    })

                # Add assignment files if this is an assignment module
                if module.get("modname") == "assign":
                    assign_id = module.get("instance")
                    if assign_id and assign_id in assignments_by_id:
                        assignment = assignments_by_id[assign_id]
                        # Add assignment-specific metadata
                        module_data["description"] = assignment.get("intro") or module.get("description")
                        module_data["duedate"] = assignment.get("duedate")
                        module_data["cutoffdate"] = assignment.get("cutoffdate")
                        module_data["allowsubmissionsfromdate"] = assignment.get("allowsubmissionsfromdate")
                        module_data["assignment_id"] = assign_id
                        # Add intro attachments (assignment description files)
                        for intro_file in assignment.get("introattachments", []):
                            module_data["files"].append({
                                "filename": intro_file.get("filename"),
                                "fileurl": intro_file.get("fileurl"),
                                "proxy_url": _to_proxy_url(intro_file.get("fileurl")),
                                "mimetype": intro_file.get("mimetype"),
                                "filesize": intro_file.get("filesize")
                            })

                section_data["modules"].append(module_data)

            sections.append(section_data)

        # Fetch Firestore processed materials by course_id
        fs = FirestoreService()
        firestore_materials = fs.get_course_materials(course_id)
        
        # Build processed map by module_id for quick lookup
        processed_map = {}
        for material in firestore_materials:
            module_id = material.get("moodle_module_id")
            if module_id:
                if module_id not in processed_map:
                    processed_map[module_id] = {
                        "summaries": [],
                        "extracted_text": material.get("extracted_text"),
                        "ai_insights": material.get("ai_insights", [])
                    }

                # Get summaries for this material
                material_id = material.get("id")
                if material_id:
                    summaries = fs.get_material_summaries(material_id)
                    processed_map[module_id]["summaries"].extend(summaries)

        # Count stats
        stats = {
            "sections": len(sections),
            "modules": sum(len(s.get("modules", [])) for s in sections),
            "files": sum(
                len(m.get("files", []))
                for s in sections
                for m in s.get("modules", [])
            ),
            "processed_modules": len(processed_map)
        }

        return jsonify({
            "success": True,
            "course_id": course_id,
            "moodle_sections": sections,
            "processed": processed_map,
            "count": stats
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@materials_bp.route("/<int:course_id>/assignments", methods=["GET"])
@firebase_required
def get_course_assignments(course_id: int):
    """
    Get all assignments in a course with full details (description, dates, files, etc.)
    Also checks Firestore for user submissions and updates status accordingly.
    """
    try:
        user_id = g.firebase_uid
        
        # Fetch Moodle contents first to find assignment modules
        moodle_contents = MoodleService.get_course_contents(course_id)
        
        # Fetch assignment details
        try:
            assignment_data = MoodleService.get_assignment_details(course_id)
            assignments_by_id = {}
            if isinstance(assignment_data, dict) and "courses" in assignment_data:
                for course in assignment_data.get("courses", []):
                    for assignment in course.get("assignments", []):
                        assignments_by_id[assignment.get("id")] = assignment
        except Exception as assign_err:
            print(f"Warning: Could not fetch assignment details: {assign_err}")
            assignments_by_id = {}
        
        # Fetch user submissions from Firestore
        fs = FirestoreService()
        user_submissions = fs.get_user_assignment_submissions(user_id, course_id)
        submissions_by_assignment_id = {}
        for submission in user_submissions:
            assignment_id = submission.get("assignment_id")
            if assignment_id:
                submissions_by_assignment_id[assignment_id] = submission
        
        # Extract assignments from course contents and merge with details
        assignments = []
        for section in moodle_contents:
            for module in section.get("modules", []):
                if module.get("modname") == "assign":
                    assign_id = module.get("instance")
                    assign_details = assignments_by_id.get(assign_id, {})
                    
                    # Check if user has submitted this assignment
                    user_submission = submissions_by_assignment_id.get(assign_id)
                    submission_status = user_submission.get("status", "Not submitted") if user_submission else "Not submitted"
                    
                    # Build assignment object
                    assignment_obj = {
                        "id": module.get("id"),
                        "module_id": module.get("id"),
                        "assignment_id": assign_id,
                        "name": module.get("name"),
                        "description": assign_details.get("intro") or module.get("description"),
                        "intro_files": [
                            {
                                "filename": f.get("filename"),
                                "fileurl": f.get("fileurl"),
                                "proxy_url": _to_proxy_url(f.get("fileurl")),
                                "filesize": f.get("filesize")
                            }
                            for f in assign_details.get("introattachments", [])
                        ],
                        "duedate": assign_details.get("duedate"),
                        "cutoffdate": assign_details.get("cutoffdate"),
                        "allowsubmissionsfromdate": assign_details.get("allowsubmissionsfromdate"),
                        "status": submission_status,  # Updated from Firestore
                        "section_name": section.get("name"),
                        "submitted_at": user_submission.get("submitted_at") if user_submission else None
                    }
                    assignments.append(assignment_obj)
        
        return jsonify({
            "success": True,
            "course_id": course_id,
            "assignments": assignments,
            "count": len(assignments)
        })
    
    except Exception as e:
        print(f"Error fetching assignments for course {course_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@materials_bp.route("/<int:course_id>/assignments/<int:assignment_id>/details", methods=["GET"])
@firebase_required
def get_submission_details(course_id: int, assignment_id: int):
    """
    Fetch detailed submission information from Moodle.
    
    Returns:
    - Submission status (draft, submitted, etc.)
    - Grade and grading information
    - Teacher feedback/comments
    - Whether student can edit/delete submission
    """
    try:
        user_id = g.firebase_uid
        print(f"Fetching submission details - User: {user_id}, Course: {course_id}, Assignment: {assignment_id}")
        
        # Fetch submission status from Moodle
        submission_status = MoodleService.get_submission_status(assignment_id)
        print(f"Retrieved submission details: {submission_status}")
        
        return jsonify({
            "success": True,
            "assignment_id": assignment_id,
            "course_id": course_id,
            "submission_details": submission_status
        })
    
    except Exception as e:
        print(f"Error fetching submission details for assignment {assignment_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@materials_bp.route("/<int:course_id>/assignments/<int:assignment_id>/delete", methods=["DELETE"])
@firebase_required
def delete_submission(course_id: int, assignment_id: int):
    """
    Delete a student's submission from Moodle and Firestore.
    """
    try:
        user_id = g.firebase_uid
        print(f"Deleting submission - User: {user_id}, Course: {course_id}, Assignment: {assignment_id}")
        
        # Delete from Moodle
        print(f"Attempting Moodle deletion...")
        moodle_result = MoodleService.delete_submission(assignment_id)
        print(f"Moodle deletion result: {moodle_result}")
        
        # Delete from Firestore
        print(f"Attempting Firestore deletion...")
        fs = FirestoreService()
        fs.delete_assignment_submission(user_id, course_id, assignment_id)
        print(f"Firestore deletion completed")
        
        return jsonify({
            "success": True,
            "message": "Submission deleted successfully",
            "moodle_success": moodle_result.get("success", False),
            "moodle_message": moodle_result.get("message", "")
        })
    
    except Exception as e:
        print(f"Error deleting submission for assignment {assignment_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@materials_bp.route("/<int:course_id>/assignments/<int:assignment_id>/submit", methods=["POST"])
@firebase_required
def submit_assignment(course_id: int, assignment_id: int):
    """
    Submit a file to a Moodle assignment and store submission record in Firestore.
    
    Expects multipart/form-data with 'file' field.
    """
    try:
        # Check if file is present
        if 'file' not in request.files:
            return jsonify({"success": False, "error": "No file provided"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"success": False, "error": "No file selected"}), 400
        
        # Submit to Moodle
        moodle_result = MoodleService.submit_assignment(
            assignment_id,
            file.stream,
            file.filename
        )
        
        # Check if Moodle submission was successful
        moodle_success = moodle_result.get("success", False)
        moodle_message = moodle_result.get("message", "Unknown result")
        
        print(f"Moodle submission result - Success: {moodle_success}, Message: {moodle_message}")
        
        # Store submission record in Firestore
        user_id = g.firebase_uid
        fs = FirestoreService()
        submission_data = {
            "user_id": user_id,
            "course_id": course_id,
            "assignment_id": assignment_id,
            "filename": file.filename,
            "submitted_at": fs.timestamp_now(),
            "status": "submitted",
            "moodle_submitted": moodle_success,
            "moodle_message": moodle_message,
            "moodle_response": moodle_result
        }
        
        fs.store_assignment_submission(user_id, course_id, assignment_id, submission_data)
        
        # Return response indicating submission status
        return jsonify({
            "success": True,
            "message": "Assignment submitted successfully" if moodle_success else "Submitted locally (Moodle sync pending)",
            "moodle_success": moodle_success,
            "moodle_message": moodle_message,
            "submission": submission_data
        })
    
    except Exception as e:
        print(f"Error submitting assignment {assignment_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e), "type": type(e).__name__}), 500
