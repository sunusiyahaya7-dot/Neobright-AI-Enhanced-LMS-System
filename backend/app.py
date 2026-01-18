# Flask entry point
from flask import Flask, jsonify
from config import Config

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

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
