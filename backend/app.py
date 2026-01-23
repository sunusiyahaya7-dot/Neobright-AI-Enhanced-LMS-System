# Flask entry point
from flask import Flask, jsonify
from flask_cors import CORS
from config import Config
from api.moodle_routes import moodle_bp
from routes.pluginfile import pluginfile_bp
from routes.enrollment_routes import enrollment_bp
from routes.materials_routes import materials_bp
import firebase_admin
from firebase_admin import credentials
import os

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    
    # Enable CORS
    CORS(app)

    # Firebase Admin init (once)
    if not firebase_admin._apps:
        cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
        if not cred_path:
            cred_path = os.path.join(os.path.dirname(__file__), "firebase-service-account.json")

        if cred_path and os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        else:
            raise ValueError(
                "Firebase service account file not found. Set FIREBASE_SERVICE_ACCOUNT_PATH or place file at: "
                + str(cred_path)
            )

    # Register blueprints
    app.register_blueprint(moodle_bp)
    app.register_blueprint(materials_bp)
    app.register_blueprint(pluginfile_bp)
    app.register_blueprint(enrollment_bp)  

    # Simple health check route
    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({
            "status": "ok",
            "moodle_base_url": app.config["MOODLE_BASE_URL"]
        })
    

    return app

if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=app.config["PORT"])
