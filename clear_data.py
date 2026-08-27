#!/usr/bin/env python3
"""Xóa toàn bộ dữ liệu học sinh / học kỳ / mục cần kiểm tra để chuẩn bị nạp
dữ liệu mới. KHÔNG xóa tài khoản người dùng (users) — bạn vẫn đăng nhập được
bằng các tài khoản đã tạo trước đó.

Cách dùng:
    python3 clear_data.py            # sẽ hỏi xác nhận trước khi xóa
    python3 clear_data.py --yes      # xóa ngay, không hỏi (dùng khi chạy tự động)

An toàn: script sẽ in ra số lượng bản ghi hiện có trước khi xóa, và không
đụng đến bảng users hay audit_log.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import db


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--yes", action="store_true", help="Xóa ngay, không hỏi xác nhận.")
    args = ap.parse_args()

    db.init_db()

    counts = {
        "students": db.query_one("SELECT COUNT(*) AS c FROM students")["c"],
        "semesters": db.query_one("SELECT COUNT(*) AS c FROM semesters")["c"],
        "review_flags": db.query_one("SELECT COUNT(*) AS c FROM review_flags")["c"],
    }
    print("Dữ liệu hiện có:")
    print(f"  - Học sinh:          {counts['students']}")
    print(f"  - Dòng học kỳ:       {counts['semesters']}")
    print(f"  - Mục cần kiểm tra:  {counts['review_flags']}")
    print("(Tài khoản người dùng và nhật ký sẽ được giữ nguyên, không bị xóa.)")

    if counts["students"] == 0 and counts["semesters"] == 0 and counts["review_flags"] == 0:
        print("Không có dữ liệu học sinh nào để xóa — không cần làm gì thêm.")
        return

    if not args.yes:
        answer = input("\nXóa TOÀN BỘ dữ liệu học sinh ở trên? Không thể hoàn tác. Gõ 'XOA' để xác nhận: ")
        if answer.strip() != "XOA":
            print("Đã hủy — không có gì bị xóa.")
            return

    # review_flags and semesters both have ON DELETE CASCADE from students,
    # but we clear them explicitly too in case any orphaned rows exist.
    db.execute("DELETE FROM review_flags")
    db.execute("DELETE FROM semesters")
    db.execute("DELETE FROM students")
    print("\nĐã xóa toàn bộ dữ liệu học sinh, học kỳ và mục cần kiểm tra.")
    print("Tài khoản người dùng vẫn còn nguyên — đăng nhập bình thường để nạp dữ liệu mới")
    print("(qua nút \"Nhập từ file mẫu\" trong tab Danh sách, hoặc thêm từng học sinh thủ công).")


if __name__ == "__main__":
    main()
