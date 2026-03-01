"""Routes package for NeoBright backend."""

from api.moodle_routes import moodle_bp
from routes.pluginfile import pluginfile_bp

__all__ = ["moodle_bp", "pluginfile_bp"]