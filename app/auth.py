"""Authentication & role-based access control.

Sessions are Flask's signed, HttpOnly cookies (itsdangerous under the hood) —
the cookie only ever carries the user id, never the password, and is
tamper-evident because it's signed with SECRET_KEY. Passwords are hashed with
werkzeug's PBKDF2-SHA256 (generate_password_hash / check_password_hash) —
never stored or logged in plain text.
"""
import datetime
from functools import wraps

from flask import session, jsonify, g
from werkzeug.security import generate_password_hash, check_password_hash

from . import db

ROLES = ("admin", "editor", "viewer")


def hash_password(raw):
    return generate_password_hash(raw)


def verify_password(raw, hashed):
    return check_password_hash(hashed, raw)


def now_iso():
    return datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


def log_action(username, action, detail=""):
    db.execute(
        "INSERT INTO audit_log (ts, username, action, detail) VALUES (?,?,?,?)",
        (now_iso(), username or "?", action, detail),
    )


def current_user():
    if getattr(g, "_user_loaded", False):
        return g._user
    uid = session.get("uid")
    user = None
    if uid:
        user = db.query_one(
            "SELECT id, username, full_name, role, scope_phu_trach, active, "
            "must_change_password, created_at, last_login FROM users WHERE id=?",
            (uid,),
        )
        if user and not user["active"]:
            user = None
    g._user = user
    g._user_loaded = True
    return user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user():
            return jsonify({"error": "unauthorized", "message": "Vui lòng đăng nhập."}), 401
        return fn(*args, **kwargs)
    return wrapper


def roles_required(*allowed_roles):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = current_user()
            if not user:
                return jsonify({"error": "unauthorized", "message": "Vui lòng đăng nhập."}), 401
            if user["role"] not in allowed_roles:
                return jsonify({"error": "forbidden", "message": "Bạn không có quyền thực hiện thao tác này."}), 403
            return fn(*args, **kwargs)
        return wrapper
    return deco


def can_edit(user):
    return user and user["role"] in ("admin", "editor")


def is_admin(user):
    return user and user["role"] == "admin"


def student_in_scope(user, nguoi_phu_trach):
    """Editors/viewers can be scoped to a single coordinator's own students."""
    if not user:
        return False
    if user["role"] == "admin":
        return True
    scope = (user["scope_phu_trach"] or "").strip()
    if not scope:
        return True
    return (nguoi_phu_trach or "").strip() == scope
