-- Sổ Học Bổng — database schema (SQLite)

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  role          TEXT NOT NULL CHECK(role IN ('admin','editor','viewer')),
  scope_phu_trach TEXT,              -- NULL/blank = sees all students; otherwise restricted to this "người phụ trách"
  active        INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  last_login    TEXT
);

CREATE TABLE IF NOT EXISTS students (
  sid             TEXT PRIMARY KEY,
  ho_ten          TEXT,
  gioi_tinh       TEXT,               -- Nam/Nữ, có thể để trống
  ngay_sinh       TEXT,
  ngay_sinh_goc   TEXT,
  ten_cha         TEXT,
  ten_me          TEXT,
  dia_chi         TEXT,
  tinh_chuan_hoa  TEXT,
  tinh_goc        TEXT,
  khu_vuc         TEXT,               -- vùng miền (Miền Bắc/Miền Trung/...), độc lập với tỉnh/thành
  so_dien_thoai   TEXT,
  cap_hoc         TEXT,
  truong          TEXT,
  hoan_canh       TEXT,
  nguoi_phu_trach TEXT,
  ma_so_goc       TEXT,               -- mã số học sinh trong file nguồn (Excel) — để đối chiếu khi nhập lại
  anh_file_goc    TEXT,               -- tên file ảnh gốc ghi trong file nguồn (chỉ để tham khảo, chưa chắc có file ảnh thật)
  ghi_chu         TEXT,
  anh             TEXT,               -- data:image/...;base64,... or NULL
  updated_at      TEXT,
  updated_by      TEXT
);

CREATE TABLE IF NOT EXISTS semesters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sid           TEXT NOT NULL REFERENCES students(sid) ON DELETE CASCADE,
  nam_hoc       TEXT NOT NULL,
  lop           TEXT,
  hoc_luc_hki   TEXT,
  hoc_luc_hkii  TEXT,
  tien_hki      REAL DEFAULT 0,
  tien_hkii     REAL DEFAULT 0,
  trang_thai_hb TEXT,
  can_kiem_tra  INTEGER DEFAULT 0,
  ghi_chu       TEXT,
  UNIQUE(sid, nam_hoc)
);

CREATE TABLE IF NOT EXISTS review_flags (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  sid      TEXT,
  loai     TEXT,
  chi_tiet TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       TEXT NOT NULL,
  username TEXT,
  action   TEXT,
  detail   TEXT
);

CREATE INDEX IF NOT EXISTS idx_semesters_sid ON semesters(sid);
CREATE INDEX IF NOT EXISTS idx_students_phutrach ON students(nguoi_phu_trach);
