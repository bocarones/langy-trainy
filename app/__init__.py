from flask import Flask
from .db import init_db

def create_app():
    app = Flask(__name__, static_folder='static', template_folder='templates')

    with app.app_context():
        init_db()

    from .routes import bp
    app.register_blueprint(bp)

    return app
