"""
Application entry point.

Run in development::

    python run.py

Or via Flask CLI::

    flask --app run:app run --debug
"""

from backend.app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
