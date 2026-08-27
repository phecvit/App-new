"""Thin SQLite helper layer — no ORM, keeps the deployment footprint tiny."""
import sqlite3
import os
import threading

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "qlhb.db")
SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")

_local = threading.local()


def get_db():
    """Return a connection cached per-thread (Flask's dev/prod servers are threaded)."""
    if not hasattr(_local, "conn"):
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        _local.conn = conn
    return _local.conn


# Columns added to `students` after the initial release. Listed here so an
# already-deployed database (created by an older schema.sql) gets them added
# in place via ALTER TABLE, instead of requiring a fresh install. Safe to run
# every startup — each column is only added if it doesn't already exist.
STUDENTS_MIGRATIONS = [
    ("gioi_tinh", "TEXT"),
    ("khu_vuc", "TEXT"),
    ("so_dien_thoai", "TEXT"),
    ("ma_so_goc", "TEXT"),
    ("anh_file_goc", "TEXT"),
]


def _migrate_students_columns(conn):
    existing = {row[1] for row in conn.execute("PRAGMA table_info(students)").fetchall()}
    for name, coltype in STUDENTS_MIGRATIONS:
        if name not in existing:
            conn.execute(f"ALTER TABLE students ADD COLUMN {name} {coltype}")


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        conn.executescript(f.read())
    _migrate_students_columns(conn)
    conn.commit()


def query(sql, params=()):
    cur = get_db().execute(sql, params)
    rows = cur.fetchall()
    return [dict(r) for r in rows]


def query_one(sql, params=()):
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql, params=()):
    conn = get_db()
    cur = conn.execute(sql, params)
    conn.commit()
    return cur.lastrowid


def executemany(sql, seq_of_params):
    conn = get_db()
    conn.executemany(sql, seq_of_params)
    conn.commit()
