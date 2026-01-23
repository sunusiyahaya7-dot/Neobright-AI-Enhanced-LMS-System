"""Unified materials endpoint combining Moodle contents + Firestore processed materials."""

from flask import Blueprint, jsonify, g, current_app
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
        return f"/api/pluginfile/{file_path}"
    return None


@materials_bp.route("/<int:course_id>/materials", methods=["GET"])
@firebase_required
def get_unified_materials(course_id: int):
    """
    Unified endpoint: return Moodle course contents + Firestore processed materials.

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

                for content in module.get("contents", []):
                    module_data["files"].append({
                        "filename": content.get("filename"),
                        "fileurl": content.get("fileurl"),
                        "proxy_url": _to_proxy_url(content.get("fileurl")),
                        "mimetype": content.get("mimetype"),
                        "filesize": content.get("filesize")
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
