#!/usr/bin/env python3
"""One-time migration: load students.json / semesters.json / photos.json
(exported earlier from the original Excel workbook) into the SQLite database,
and create the initial admin account.

Usage:
    python3 seed.py --source-dir /path/to/json/files --admin-password 'ChangeMe123!'

Safe to re-run: it only seeds student/semester data when the students table is
empty, so it will never clobber edits made through the app. Re-running with
--admin-password on a database that already has users will just print a notice
and leave existing accounts untouched — use the admin panel (or reset_admin.py)
to change a password later.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import db, auth
from app.lookups import CAP_HOC, cap_hoc_from_truong  # noqa: F401


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def seed_students(source_dir):
    existing = db.query_one("SELECT COUNT(*) AS c FROM students")
    if existing and existing["c"] > 0:
        print(f"students table already has {existing['c']} rows — skipping data seed.")
        return

    students = load_json(os.path.join(source_dir, "students.json"))
    semesters = load_json(os.path.join(source_dir, "semesters.json"))
    photos_path = os.path.join(source_dir, "photos.json")
    photos = load_json(photos_path) if os.path.exists(photos_path) else {}

    now = auth.now_iso()
    student_rows = []
    review_rows = []
    for s in students:
        notes = []
        if s.get("ngay_sinh_ghichu"):
            notes.append(s["ngay_sinh_ghichu"])
        student_rows.append((
            s["sid"], s.get("ho_ten"), s.get("ngay_sinh"), s.get("ngay_sinh_goc"),
            s.get("ten_cha"), s.get("ten_me"), s.get("dia_chi"),
            s.get("tinh_chuan_hoa"), s.get("tinh_goc"),
            cap_hoc_from_truong(s.get("truong")), s.get("truong"), s.get("hoan_canh"),
            s.get("nguoi_phu_trach"), "; ".join(notes) if notes else None,
            photos.get(s["sid"]), now, "seed",
        ))
        if s.get("tinh_goc") and not s.get("tinh_chuan_hoa"):
            review_rows.append((s["sid"], "Tỉnh/Thành chưa xác định",
                                 f'Giá trị gốc: "{s["tinh_goc"]}" — {s.get("tinh_ghichu") or "cần kiểm tra thủ công"}'))

    db.executemany(
        """INSERT INTO students
           (sid, ho_ten, ngay_sinh, ngay_sinh_goc, ten_cha, ten_me, dia_chi,
            tinh_chuan_hoa, tinh_goc, cap_hoc, truong, hoan_canh, nguoi_phu_trach,
            ghi_chu, anh, updated_at, updated_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        student_rows,
    )

    sem_rows = []
    for sm in semesters:
        sem_rows.append((
            sm["sid"], sm["nam_hoc"], sm.get("lop"),
            sm.get("hoc_luc_hki"), sm.get("hoc_luc_hkii"),
            sm.get("tien_hki") or 0, sm.get("tien_hkii") or 0,
            sm.get("trang_thai_hb"), 1 if sm.get("can_kiem_tra") else 0, sm.get("ghi_chu"),
        ))
        if sm.get("can_kiem_tra"):
            review_rows.append((sm["sid"], f'Lệch cột dữ liệu năm {sm["nam_hoc"]}',
                                 sm.get("ghi_chu") or "Số tiền tài trợ tạm đặt về 0 do dữ liệu gốc nằm sai cột"))

    db.executemany(
        """INSERT OR IGNORE INTO semesters
           (sid, nam_hoc, lop, hoc_luc_hki, hoc_luc_hkii, tien_hki, tien_hkii, trang_thai_hb, can_kiem_tra, ghi_chu)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        sem_rows,
    )

    db.executemany(
        "INSERT INTO review_flags (sid, loai, chi_tiet) VALUES (?,?,?)",
        review_rows,
    )

    print(f"Seeded {len(student_rows)} students, {len(sem_rows)} semester rows, {len(review_rows)} review flags.")


def seed_admin(username, password, full_name):
    existing = db.query_one("SELECT COUNT(*) AS c FROM users")
    if existing and existing["c"] > 0:
        print(f"users table already has {existing['c']} account(s) — not creating another admin. "
              f"Use the admin panel to add accounts.")
        return
    db.execute(
        """INSERT INTO users (username, password_hash, full_name, role, scope_phu_trach, active,
                               must_change_password, created_at)
           VALUES (?,?,?,?,?,1,1,?)""",
        (username, auth.hash_password(password), full_name, "admin", None, auth.now_iso()),
    )
    print(f"Created admin account: username='{username}'. It will be asked to change its password on first login.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_data"),
                     help="Directory containing students.json / semesters.json / photos.json")
    ap.add_argument("--admin-username", default="admin")
    ap.add_argument("--admin-password", default="ChangeMe123!")
    ap.add_argument("--admin-fullname", default="Quản trị viên")
    args = ap.parse_args()

    db.init_db()

    if os.path.exists(os.path.join(args.source_dir, "students.json")):
        seed_students(args.source_dir)
    else:
        print(f"No students.json found under {args.source_dir} — skipping data seed "
              f"(the database will start empty; add students from the app).")

    seed_admin(args.admin_username, args.admin_password, args.admin_fullname)
    print("Done.")


if __name__ == "__main__":
    main()
