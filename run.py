#!/usr/bin/env python3
"""Sổ Học Bổng — backend entrypoint.

Local run:
    pip install -r requirements.txt
    python3 seed.py --admin-password 'ChooseAStrongPassword!'   # first time only
    python3 run.py
    -> open http://localhost:8000

Production: put this behind a real WSGI server (gunicorn/waitress) and HTTPS —
see README.md. Do not expose the Flask dev server directly on the internet.
"""
import os
import secrets

from flask import Flask, send_from_directory, session

from app import db
from app.api import bp as api_bp

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = Flask(__name__, static_folder=None)

# SECRET_KEY signs the session cookie. Set QLHB_SECRET_KEY in your environment
# for a real deployment (a random key here means every restart logs everyone
# out, which is fine for local testing but not what you want in production).
app.config["SECRET_KEY"] = os.environ.get("QLHB_SECRET_KEY") or secrets.token_hex(32)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
# Set QLHB_FORCE_HTTPS=1 once your deployment is served over HTTPS so session
# cookies are marked Secure (browsers then refuse to send them over plain HTTP).
app.config["SESSION_COOKIE_SECURE"] = os.environ.get("QLHB_FORCE_HTTPS") == "1"
app.config["MAX_CONTENT_LENGTH"] = 12 * 1024 * 1024  # 12MB request cap (covers photo uploads)

app.register_blueprint(api_bp)

# Chạy ở module-level (không chỉ trong khối __main__) để migration cũng được
# áp dụng khi app chạy qua gunicorn/WSGI server thật (không phải chỉ khi chạy
# trực tiếp bằng `python3 run.py`) — nếu không, các cột mới thêm vào schema
# ở các bản cập nhật sau sẽ không bao giờ được tạo trên server production.
db.init_db()


@app.before_request
def _init():
    db.get_db()


@app.route("/")
@app.route("/<path:path>")
def spa(path="index.html"):
    # Single-page app: every non-API path serves index.html; client-side JS
    # decides whether to show the login screen or the app shell.
    if path.startswith("api/"):
        return {"error": "not_found"}, 404
    full = os.path.join(STATIC_DIR, path)
    if os.path.isfile(full):
        return send_from_directory(STATIC_DIR, path)
    return send_from_directory(STATIC_DIR, "index.html")


@app.after_request
def _security_headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "same-origin"
    return resp


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    debug = os.environ.get("QLHB_DEBUG") == "1"
    print(f"Sổ Học Bổng chạy tại http://0.0.0.0:{port}  (Ctrl+C để dừng)")
    app.run(host="0.0.0.0", port=port, debug=debug)
