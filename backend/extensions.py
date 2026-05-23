"""
Flask extension singletons.

Extensions are created here without an app instance and later
bound to the application in the factory (app.py) using init_app().
"""

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
