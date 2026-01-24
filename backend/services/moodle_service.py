import requests
from flask import current_app

class MoodleService:
    @staticmethod
    def _build_url(wsfunction: str) -> str:
        """
        Build full Moodle REST URL for a given function.
        """
        base_url = current_app.config["MOODLE_BASE_URL"].rstrip("/")
        token = current_app.config["MOODLE_TOKEN"]

        if not token:
            raise ValueError("MOODLE_TOKEN is not set in environment")

        return (
            f"{base_url}/webservice/rest/server.php"
            f"?wstoken={token}"
            f"&wsfunction={wsfunction}"
            f"&moodlewsrestformat=json"
        )

    @staticmethod
    def get_courses():
        """
        Call Moodle core_course_get_courses and return parsed JSON.
        """
        url = MoodleService._build_url("core_course_get_courses")

        response = requests.get(url, timeout=10)
        response.raise_for_status()  # raises if HTTP error

        data = response.json()

        # If Moodle returns an 'exception', handle it
        if isinstance(data, dict) and "exception" in data:
            raise RuntimeError(
                f"Moodle error: {data.get('exception')} - {data.get('message')}"
            )

        return data

    @staticmethod
    def get_user_courses(moodle_user_id: int):
        """Fetch only the courses a specific Moodle user is enrolled in.

        Uses Moodle core_enrol_get_users_courses.
        """
        url = MoodleService._build_url("core_enrol_get_users_courses")
        params = {"userid": moodle_user_id}

        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()

        data = response.json()

        if isinstance(data, dict) and "exception" in data:
            raise RuntimeError(
                f"Moodle error: {data.get('exception')} - {data.get('message')}"
            )

        return data

    @staticmethod
    def get_course_contents(course_id: int):
        """Fetch course contents (sections + modules + files) from Moodle."""
        url = MoodleService._build_url("core_course_get_contents")
        params = {"courseid": course_id}

        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()

        data = response.json()

        if isinstance(data, dict) and "exception" in data:
            raise RuntimeError(f"Moodle error: {data.get('exception')}")

        return data

    @staticmethod
    def get_assignment_details(course_id: int):
        """
        Fetch assignment details including introattachments.
        Uses mod_assign_get_assignments.
        """
        url = MoodleService._build_url("mod_assign_get_assignments")
        params = {"courseids[0]": course_id}

        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()

        data = response.json()

        if isinstance(data, dict) and "exception" in data:
            raise RuntimeError(
                f"Moodle error: {data.get('exception')} - {data.get('message')}"
            )

        return data

    @staticmethod
    def get_file_url(file_path: str) -> str:
        """Build secure Moodle file URL using server-side token."""
        base_url = current_app.config["MOODLE_BASE_URL"].rstrip("/")
        token = current_app.config["MOODLE_TOKEN"]
        
        if not token:
            raise ValueError("MOODLE_TOKEN is not set in environment")
         
        return f"{base_url}/webservice/pluginfile.php/{file_path}?token={token}"

    @staticmethod
    def fetch_file_stream(file_url: str):
        """Stream a file from Moodle without loading it fully into memory."""
        response = requests.get(file_url, stream=True, timeout=30)
        response.raise_for_status()

        return response
    
    @staticmethod
    def submit_assignment(assignment_id: int, file_data, filename: str):
        """
        Submit a file to a Moodle assignment.
        
        Process:
        1. Upload file to Moodle draft file area
        2. Save submission with uploaded file via mod_assign_save_submission
        3. Submit for grading via mod_assign_submit_for_grading
        
        Returns submission response from Moodle or raises exception on failure.
        """
        try:
            # Step 1: Upload file to draft area
            print(f"Uploading file {filename} to Moodle draft area...")
            upload_url = MoodleService._build_upload_url()
            
            # Reset file pointer to beginning in case it was read
            if hasattr(file_data, 'seek'):
                file_data.seek(0)
            
            files = {'file': (filename, file_data)}
            upload_response = requests.post(upload_url, files=files, timeout=30)
            upload_response.raise_for_status()
            
            upload_data = upload_response.json()
            print(f"Upload response: {upload_data}")
            
            # Check if upload was successful
            if not upload_data or len(upload_data) == 0:
                raise ValueError("File upload failed - no response from Moodle")
            
            draft_item_id = upload_data[0].get('itemid')
            if not draft_item_id:
                raise ValueError(f"File upload failed - no itemid returned. Response: {upload_data}")
            
            print(f"File uploaded successfully with draft_item_id: {draft_item_id}")
            
            # Step 2: Save submission with uploaded file
            print(f"Saving submission for assignment {assignment_id}...")
            save_url = MoodleService._build_url("mod_assign_save_submission")
            save_params = {
                'assignmentid': assignment_id,
                'plugindata[files_filemanager]': draft_item_id
            }
            
            save_response = requests.post(save_url, data=save_params, timeout=10)
            save_response.raise_for_status()
            save_data = save_response.json()
            
            if isinstance(save_data, dict) and "exception" in save_data:
                raise RuntimeError(f"Moodle error: {save_data.get('exception')} - {save_data.get('message')}")
            
            print(f"Submission saved: {save_data}")
            
            # Step 3: Submit for grading
            print(f"Submitting for grading...")
            submit_url = MoodleService._build_url("mod_assign_submit_for_grading")
            submit_params = {
                'assignmentid': assignment_id,
                'acceptsubmissionstatement': 1
            }
            
            submit_response = requests.post(submit_url, data=submit_params, timeout=10)
            submit_response.raise_for_status()
            submit_data = submit_response.json()
            
            if isinstance(submit_data, dict) and "exception" in submit_data:
                raise RuntimeError(f"Moodle error: {submit_data.get('exception')} - {submit_data.get('message')}")
            
            print(f"Assignment submitted successfully: {submit_data}")
            
            # Return success response
            return {
                "success": True,
                "message": "Assignment submitted successfully to Moodle",
                "filename": filename,
                "timestamp": MoodleService._get_timestamp(),
                "draft_item_id": draft_item_id,
                "moodle_response": submit_data
            }
        
        except Exception as e:
            print(f"Error submitting assignment to Moodle: {e}")
            import traceback
            traceback.print_exc()
            # Still return a response so Firestore can log it, but indicate Moodle submission failed
            return {
                "success": False,
                "message": f"Failed to submit to Moodle: {str(e)}",
                "filename": filename,
                "timestamp": MoodleService._get_timestamp(),
                "error": str(e)
            }
    
    @staticmethod
    def _build_upload_url() -> str:
        """Build Moodle file upload URL for draft files."""
        base_url = current_app.config["MOODLE_BASE_URL"].rstrip("/")
        token = current_app.config["MOODLE_TOKEN"]
        
        if not token:
            raise ValueError("MOODLE_TOKEN is not set in environment")
        
        return f"{base_url}/webservice/upload.php?token={token}"
    
    @staticmethod
    def get_submission_status(assignment_id: int):
        """
        Fetch submission status and grading details from Moodle.
        
        Returns detailed submission info including:
        - Submission status (draft, submitted, etc.)
        - Grade (if graded)
        - Feedback/comments from teacher
        - Whether student can edit/delete submission
        """
        try:
            print(f"Fetching submission status for assignment {assignment_id}...")
            url = MoodleService._build_url("mod_assign_get_submission_status")
            params = {"assignid": assignment_id}
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            print(f"Submission status response: {data}")
            
            # Check for Moodle errors
            if isinstance(data, dict) and "exception" in data:
                error_msg = f"Moodle error: {data.get('exception')} - {data.get('message')}"
                print(f"Error from Moodle: {error_msg}")
                raise RuntimeError(error_msg)
            
            return data
        
        except Exception as e:
            print(f"Error fetching submission status for assignment {assignment_id}: {e}")
            import traceback
            traceback.print_exc()
            # Return empty response instead of failing
            return {"submission": None, "feedback": None}
    
    @staticmethod
    def delete_submission(assignment_id: int):
        """
        Delete a student's submission from Moodle.
        
        Returns response from Moodle or raises exception on failure.
        """
        try:
            print(f"Attempting to delete submission for assignment {assignment_id}...")
            url = MoodleService._build_url("mod_assign_delete_submission")
            params = {"assignmentid": assignment_id}
            
            response = requests.post(url, data=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            print(f"Delete response from Moodle: {data}")
            
            # Check for Moodle errors
            if isinstance(data, dict) and "exception" in data:
                raise RuntimeError(
                    f"Moodle error: {data.get('exception')} - {data.get('message')}"
                )
            
            return {
                "success": True,
                "message": "Submission deleted successfully",
                "timestamp": MoodleService._get_timestamp()
            }
        
        except Exception as e:
            print(f"Error deleting submission for assignment {assignment_id}: {e}")
            import traceback
            traceback.print_exc()
            return {
                "success": False,
                "message": f"Failed to delete submission: {str(e)}",
                "error": str(e)
            }
    
    @staticmethod
    def _get_timestamp():
        """Get current timestamp in Moodle format."""
        from datetime import datetime
        return int(datetime.utcnow().timestamp())
