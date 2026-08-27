import csv
import io
import re

from flask import Blueprint, request, jsonify, session

from . import db, auth
from .lookups import TINH_34, CAP_HOC, HOC_LUC, TRANG_THAI, GIOI_TINH, KHU_VUC, cap_hoc_from_truong

bp = Blueprint("api", __name__, url_prefix="/api")


def user_public(u):
    return {
        "id": u["id"], "username": u["username"], "full_name": u["full_name"],
        "role": u["role"], "scope_phu_trach": u["scope_phu_trach"],
        "active": bool(u["active"]), "must_change_password": bool(u.get("must_change_password", 0)),
        "created_at": u.get("created_at"), "last_login": u.get("last_login"),
    }


# ---------------------------------------------------------------- auth ----
@bp.post("/login")
def login():
    body = request.get_json(force=True, silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    user = db.query_one("SELECT * FROM users WHERE username=?", (username,))
    if not user or not user["active"] or not auth.verify_password(password, user["password_hash"]):
        auth.log_action(username, "login_failed")
        return jsonify({"error": "invalid_credentials", "message": "Sai tên đăng nhập hoặc mật khẩu."}), 401
    session.clear()
    session["uid"] = user["id"]
    session.permanent = True
    db.execute("UPDATE users SET last_login=? WHERE id=?", (auth.now_iso(), user["id"]))
    auth.log_action(username, "login")
    user = db.query_one("SELECT * FROM users WHERE id=?", (user["id"],))
    return jsonify({"user": user_public(user)})


@bp.post("/logout")
def logout():
    user = auth.current_user()
    if user:
        auth.log_action(user["username"], "logout")
    session.clear()
    return jsonify({"ok": True})


@bp.get("/me")
@auth.login_required
def me():
    return jsonify({"user": user_public(auth.current_user())})


@bp.post("/me/change_password")
@auth.login_required
def change_password():
    user = auth.current_user()
    body = request.get_json(force=True, silent=True) or {}
    old = body.get("old_password") or ""
    new = body.get("new_password") or ""
    row = db.query_one("SELECT * FROM users WHERE id=?", (user["id"],))
    if not row["must_change_password"] and not auth.verify_password(old, row["password_hash"]):
        return jsonify({"error": "wrong_password", "message": "Mật khẩu hiện tại không đúng."}), 400
    if len(new) < 8:
        return jsonify({"error": "weak_password", "message": "Mật khẩu mới cần ít nhất 8 ký tự."}), 400
    db.execute("UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?",
               (auth.hash_password(new), user["id"]))
    auth.log_action(user["username"], "change_password")
    return jsonify({"ok": True})


# ------------------------------------------------------------ bootstrap ----
def _scope_clause(user):
    if user["role"] == "admin" or not (user["scope_phu_trach"] or "").strip():
        return "", ()
    return " WHERE nguoi_phu_trach = ?", (user["scope_phu_trach"],)


@bp.get("/bootstrap")
@auth.login_required
def bootstrap():
    user = auth.current_user()
    clause, params = _scope_clause(user)
    students = db.query(f"SELECT * FROM students{clause} ORDER BY ho_ten COLLATE NOCASE", params)
    sids = [s["sid"] for s in students]
    if sids:
        placeholders = ",".join("?" * len(sids))
        semesters = db.query(f"SELECT * FROM semesters WHERE sid IN ({placeholders})", sids)
        review = db.query(f"SELECT * FROM review_flags WHERE sid IN ({placeholders})", sids) \
            if user["role"] == "admin" else []
    else:
        semesters, review = [], []
    phutrach_list = [r["nguoi_phu_trach"] for r in db.query(
        "SELECT DISTINCT nguoi_phu_trach FROM students WHERE nguoi_phu_trach IS NOT NULL AND nguoi_phu_trach<>'' ORDER BY nguoi_phu_trach")]
    return jsonify({
        "students": students,
        "semesters": semesters,
        "review": review,
        "lookups": {"tinh": TINH_34, "caphoc": CAP_HOC, "hocluc": HOC_LUC, "trangthai": TRANG_THAI,
                    "gioitinh": GIOI_TINH, "khuvuc": KHU_VUC, "phutrach": phutrach_list},
        "can_edit": auth.can_edit(user),
        "is_admin": auth.is_admin(user),
    })


# ------------------------------------------------------------- students ----
def _next_sid():
    return f"HS{_current_max_sid_num() + 1:04d}"


STUDENT_FIELDS = ["ho_ten", "gioi_tinh", "ngay_sinh", "ten_cha", "ten_me", "dia_chi", "tinh_chuan_hoa",
                  "khu_vuc", "so_dien_thoai", "cap_hoc", "truong", "hoan_canh", "nguoi_phu_trach",
                  "ma_so_goc", "ghi_chu"]


@bp.post("/students")
@auth.roles_required("admin", "editor")
def create_student():
    user = auth.current_user()
    body = request.get_json(force=True, silent=True) or {}
    if not (body.get("ho_ten") or "").strip():
        return jsonify({"error": "missing_name", "message": "Thiếu họ tên học sinh."}), 400
    sid = _next_sid()
    values = [body.get(f) for f in STUDENT_FIELDS]
    db.execute(
        f"""INSERT INTO students (sid, {", ".join(STUDENT_FIELDS)}, anh, updated_at, updated_by)
            VALUES (?, {", ".join("?" for _ in STUDENT_FIELDS)}, ?, ?, ?)""",
        [sid] + values + [body.get("anh"), auth.now_iso(), user["username"]],
    )
    auth.log_action(user["username"], "create_student", sid)
    return jsonify({"sid": sid})


@bp.put("/students/<sid>")
@auth.roles_required("admin", "editor")
def update_student(sid):
    user = auth.current_user()
    row = db.query_one("SELECT * FROM students WHERE sid=?", (sid,))
    if not row:
        return jsonify({"error": "not_found"}), 404
    if not auth.student_in_scope(user, row["nguoi_phu_trach"]):
        return jsonify({"error": "forbidden", "message": "Học sinh này ngoài phạm vi phụ trách của bạn."}), 403
    body = request.get_json(force=True, silent=True) or {}
    new_phu_trach = body.get("nguoi_phu_trach", row["nguoi_phu_trach"])
    if not auth.student_in_scope(user, new_phu_trach):
        return jsonify({"error": "forbidden", "message": "Bạn không thể chuyển học sinh ra ngoài phạm vi phụ trách của mình."}), 403
    sets, values = [], []
    for f in STUDENT_FIELDS:
        if f in body:
            sets.append(f"{f}=?")
            values.append(body[f])
    if not sets:
        return jsonify({"ok": True})
    values += [auth.now_iso(), user["username"], sid]
    db.execute(f"UPDATE students SET {', '.join(sets)}, updated_at=?, updated_by=? WHERE sid=?", values)
    auth.log_action(user["username"], "update_student", sid)
    return jsonify({"ok": True})


@bp.delete("/students/<sid>")
@auth.roles_required("admin")
def delete_student(sid):
    user = auth.current_user()
    db.execute("DELETE FROM students WHERE sid=?", (sid,))
    db.execute("DELETE FROM semesters WHERE sid=?", (sid,))
    db.execute("DELETE FROM review_flags WHERE sid=?", (sid,))
    auth.log_action(user["username"], "delete_student", sid)
    return jsonify({"ok": True})


@bp.put("/students/<sid>/photo")
@auth.roles_required("admin", "editor")
def update_photo(sid):
    user = auth.current_user()
    row = db.query_one("SELECT * FROM students WHERE sid=?", (sid,))
    if not row:
        return jsonify({"error": "not_found"}), 404
    if not auth.student_in_scope(user, row["nguoi_phu_trach"]):
        return jsonify({"error": "forbidden"}), 403
    body = request.get_json(force=True, silent=True) or {}
    anh = body.get("anh")
    if anh and len(anh) > 6_000_000:
        return jsonify({"error": "too_large", "message": "Ảnh quá lớn."}), 400
    db.execute("UPDATE students SET anh=?, updated_at=?, updated_by=? WHERE sid=?",
               (anh, auth.now_iso(), user["username"], sid))
    return jsonify({"ok": True})


@bp.put("/students/<sid>/semesters")
@auth.roles_required("admin", "editor")
def replace_semesters(sid):
    user = auth.current_user()
    row = db.query_one("SELECT * FROM students WHERE sid=?", (sid,))
    if not row:
        return jsonify({"error": "not_found"}), 404
    if not auth.student_in_scope(user, row["nguoi_phu_trach"]):
        return jsonify({"error": "forbidden"}), 403
    body = request.get_json(force=True, silent=True) or {}
    sems = body.get("semesters") or []
    db.execute("DELETE FROM semesters WHERE sid=?", (sid,))
    rows = []
    for sm in sems:
        nam = (sm.get("nam_hoc") or "").strip()
        if not nam:
            continue
        rows.append((sid, nam, sm.get("lop"), sm.get("hoc_luc_hki"), sm.get("hoc_luc_hkii"),
                     float(sm.get("tien_hki") or 0), float(sm.get("tien_hkii") or 0),
                     sm.get("trang_thai_hb"), sm.get("ghi_chu")))
    if rows:
        db.executemany(
            """INSERT OR REPLACE INTO semesters (sid, nam_hoc, lop, hoc_luc_hki, hoc_luc_hkii,
               tien_hki, tien_hkii, trang_thai_hb, ghi_chu) VALUES (?,?,?,?,?,?,?,?,?)""",
            rows,
        )
    db.execute("UPDATE students SET updated_at=?, updated_by=? WHERE sid=?",
               (auth.now_iso(), user["username"], sid))
    auth.log_action(user["username"], "update_semesters", sid)
    return jsonify({"ok": True})


# ----------------------------------------------------------- bulk import ----
#: Keys must match the header row produced by the frontend's downloadable CSV template
#: (buildImportTemplateCsv() in app.js) EXACTLY — this is how uploaded rows get recognized.
IMPORT_HEADER_MAP = {
    "Mã học sinh (để trống nếu là học sinh mới)": "sid",
    "Họ và tên (bắt buộc)": "ho_ten",
    "Giới tính (Nam/Nữ)": "gioi_tinh",
    "Ngày sinh (yyyy-mm-dd)": "ngay_sinh",
    "Tên cha": "ten_cha",
    "Tên mẹ": "ten_me",
    "Địa chỉ": "dia_chi",
    "Tỉnh/Thành (theo 34 tỉnh/thành hiện hành)": "tinh_chuan_hoa",
    "Khu vực": "khu_vuc",
    "Số điện thoại": "so_dien_thoai",
    "Cấp học (Tiểu học/THCS/THPT/Đại học/Cao đẳng)": "cap_hoc",
    "Trường": "truong",
    "Hoàn cảnh gia đình": "hoan_canh",
    "Người phụ trách": "nguoi_phu_trach",
    "Mã số gốc": "ma_so_goc",
    "Ghi chú": "ghi_chu",
    "Năm học (vd 2025-2026)": "nam_hoc",
    "Lớp": "lop",
    "Học lực học kỳ I": "hoc_luc_hki",
    "Học lực học kỳ II": "hoc_luc_hkii",
    "Tiền tài trợ học kỳ I (đ)": "tien_hki",
    "Tiền tài trợ học kỳ II (đ)": "tien_hkii",
    "Học bổng (Có/Không)": "trang_thai_hb",
}


@bp.post("/import")
@auth.roles_required("admin", "editor")
def import_csv():
    user = auth.current_user()
    body = request.get_json(force=True, silent=True) or {}
    text = body.get("csv") or ""
    dry_run = bool(body.get("dry_run"))
    result = _run_import(text, user, dry_run)
    if not dry_run:
        auth.log_action(user["username"], "bulk_import",
                         f"new={result['newStudents']} upd={result['updatedStudents']} sem={result['semesterUpserts']}")
    return jsonify(result)


def _run_import(text, user, dry_run):
    text = text.lstrip("﻿")
    reader = csv.DictReader(io.StringIO(text))
    new_count, upd_count, sem_count = 0, 0, 0
    flags = []
    touched_students = {}
    sid_counter = _current_max_sid_num()
    for line_no, raw in enumerate(reader, start=2):
        row = {}
        for k, v in raw.items():
            key = IMPORT_HEADER_MAP.get((k or "").strip())
            if key:
                row[key] = (v or "").strip()
        if not row.get("ho_ten") and not row.get("sid"):
            continue
        sid = row.get("sid") or ""
        reused_new_sid = touched_students.get(("__new__", row.get("ho_ten"))) if not sid else None
        existing = db.query_one("SELECT * FROM students WHERE sid=?", (sid,)) if sid else None
        if reused_new_sid and not existing:
            # Same new student repeated on another row (multi-year entry) — attach this row's
            # semester data to the student already inserted earlier in this same import.
            sid = reused_new_sid
        elif not existing:
            if not row.get("ho_ten"):
                flags.append(f"Dòng {line_no}: thiếu họ tên, đã bỏ qua.")
                continue
            if not auth.student_in_scope(user, row.get("nguoi_phu_trach")):
                flags.append(f"Dòng {line_no}: ngoài phạm vi phụ trách của bạn, đã bỏ qua.")
                continue
            sid_counter += 1
            sid = f"HS{sid_counter:04d}"
            touched_students[("__new__", row["ho_ten"])] = sid
            if not row.get("cap_hoc"):
                row["cap_hoc"] = cap_hoc_from_truong(row.get("truong"))
            if not dry_run:
                db.execute(
                    f"""INSERT INTO students (sid, {", ".join(STUDENT_FIELDS)}, updated_at, updated_by)
                        VALUES (?, {", ".join("?" for _ in STUDENT_FIELDS)}, ?, ?)""",
                    [sid] + [row.get(f) for f in STUDENT_FIELDS] + [auth.now_iso(), user["username"]],
                )
            new_count += 1
        else:
            if not auth.student_in_scope(user, existing["nguoi_phu_trach"]):
                flags.append(f"Dòng {line_no}: mã {sid} ngoài phạm vi phụ trách của bạn, đã bỏ qua.")
                continue
            sets, values = [], []
            for f in STUDENT_FIELDS:
                if row.get(f):
                    sets.append(f"{f}=?")
                    values.append(row[f])
            if sets:
                if not dry_run:
                    values2 = values + [auth.now_iso(), user["username"], sid]
                    db.execute(f"UPDATE students SET {', '.join(sets)}, updated_at=?, updated_by=? WHERE sid=?", values2)
                upd_count += 1
        if row.get("nam_hoc"):
            try:
                tien_hki = float(row.get("tien_hki") or 0)
                tien_hkii = float(row.get("tien_hkii") or 0)
            except ValueError:
                tien_hki = tien_hkii = 0
                flags.append(f"Dòng {line_no}: số tiền không hợp lệ, đã đặt về 0.")
            if not dry_run:
                db.execute(
                    """INSERT INTO semesters (sid, nam_hoc, lop, hoc_luc_hki, hoc_luc_hkii, tien_hki, tien_hkii, trang_thai_hb)
                       VALUES (?,?,?,?,?,?,?,?)
                       ON CONFLICT(sid, nam_hoc) DO UPDATE SET
                         lop=excluded.lop, hoc_luc_hki=excluded.hoc_luc_hki, hoc_luc_hkii=excluded.hoc_luc_hkii,
                         tien_hki=excluded.tien_hki, tien_hkii=excluded.tien_hkii, trang_thai_hb=excluded.trang_thai_hb""",
                    (sid, row["nam_hoc"], row.get("lop"), row.get("hoc_luc_hki"), row.get("hoc_luc_hkii"),
                     tien_hki, tien_hkii, row.get("trang_thai_hb")),
                )
            sem_count += 1
    return {"newStudents": new_count, "updatedStudents": upd_count,
            "semesterUpserts": sem_count, "flags": flags}


def _current_max_sid_num():
    row = db.query_one("SELECT sid FROM students ORDER BY CAST(SUBSTR(sid,3) AS INTEGER) DESC LIMIT 1")
    return int(row["sid"][2:]) if row and row["sid"][2:].isdigit() else 0


# ---------------------------------------------------------------- users ----
@bp.get("/users")
@auth.roles_required("admin")
def list_users():
    return jsonify({"users": [user_public(u) for u in db.query("SELECT * FROM users ORDER BY username")]})


@bp.post("/users")
@auth.roles_required("admin")
def create_user():
    body = request.get_json(force=True, silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    role = body.get("role")
    if not re.match(r"^[a-zA-Z0-9_.\-]{3,32}$", username):
        return jsonify({"error": "invalid_username", "message": "Tên đăng nhập cần 3-32 ký tự (chữ, số, _, ., -)."}), 400
    if role not in auth.ROLES:
        return jsonify({"error": "invalid_role"}), 400
    if len(password) < 8:
        return jsonify({"error": "weak_password", "message": "Mật khẩu cần ít nhất 8 ký tự."}), 400
    if db.query_one("SELECT id FROM users WHERE username=?", (username,)):
        return jsonify({"error": "duplicate", "message": "Tên đăng nhập đã tồn tại."}), 400
    db.execute(
        """INSERT INTO users (username, password_hash, full_name, role, scope_phu_trach, active,
                               must_change_password, created_at)
           VALUES (?,?,?,?,?,1,1,?)""",
        (username, auth.hash_password(password), body.get("full_name"), role,
         (body.get("scope_phu_trach") or "").strip() or None, auth.now_iso()),
    )
    auth.log_action(auth.current_user()["username"], "create_user", username)
    return jsonify({"ok": True})


@bp.put("/users/<int:uid>")
@auth.roles_required("admin")
def update_user(uid):
    current = auth.current_user()
    row = db.query_one("SELECT * FROM users WHERE id=?", (uid,))
    if not row:
        return jsonify({"error": "not_found"}), 404
    body = request.get_json(force=True, silent=True) or {}

    if "active" in body and not body["active"] and row["id"] == current["id"]:
        return jsonify({"error": "cannot_deactivate_self", "message": "Bạn không thể tự khóa tài khoản của mình."}), 400
    if "role" in body and body["role"] != "admin" and row["role"] == "admin":
        remaining = db.query_one("SELECT COUNT(*) c FROM users WHERE role='admin' AND active=1 AND id<>?", (uid,))
        if remaining["c"] == 0:
            return jsonify({"error": "last_admin", "message": "Cần giữ lại ít nhất một quản trị viên đang hoạt động."}), 400

    sets, values = [], []
    if "full_name" in body:
        sets.append("full_name=?"); values.append(body["full_name"])
    if "role" in body and body["role"] in auth.ROLES:
        sets.append("role=?"); values.append(body["role"])
    if "scope_phu_trach" in body:
        sets.append("scope_phu_trach=?"); values.append((body["scope_phu_trach"] or "").strip() or None)
    if "active" in body:
        sets.append("active=?"); values.append(1 if body["active"] else 0)
    if body.get("password"):
        if len(body["password"]) < 8:
            return jsonify({"error": "weak_password", "message": "Mật khẩu cần ít nhất 8 ký tự."}), 400
        sets.append("password_hash=?"); values.append(auth.hash_password(body["password"]))
        sets.append("must_change_password=1")
    if not sets:
        return jsonify({"ok": True})
    values.append(uid)
    db.execute(f"UPDATE users SET {', '.join(sets)} WHERE id=?", values)
    auth.log_action(current["username"], "update_user", row["username"])
    return jsonify({"ok": True})


@bp.delete("/users/<int:uid>")
@auth.roles_required("admin")
def delete_user(uid):
    current = auth.current_user()
    row = db.query_one("SELECT * FROM users WHERE id=?", (uid,))
    if not row:
        return jsonify({"error": "not_found"}), 404
    if row["id"] == current["id"]:
        return jsonify({"error": "cannot_delete_self", "message": "Bạn không thể tự xóa tài khoản của mình."}), 400
    if row["role"] == "admin":
        remaining = db.query_one("SELECT COUNT(*) c FROM users WHERE role='admin' AND active=1 AND id<>?", (uid,))
        if remaining["c"] == 0:
            return jsonify({"error": "last_admin", "message": "Cần giữ lại ít nhất một quản trị viên."}), 400
    db.execute("DELETE FROM users WHERE id=?", (uid,))
    auth.log_action(current["username"], "delete_user", row["username"])
    return jsonify({"ok": True})
