#!/bin/sh
# Chạy khi container khởi động. Nếu thư mục dữ liệu (Volume gắn từ Coolify)
# chưa có file qlhb.db — tức là lần deploy đầu tiên, Volume còn trống — thì
# tự động nạp bản "hạt giống" đã có sẵn 879 học sinh (từ DSHS 2.xlsx) vào.
# Những lần chạy sau, file đã tồn tại trong Volume nên sẽ KHÔNG bị ghi đè,
# giữ nguyên mọi thay đổi người dùng đã lưu.
set -e

mkdir -p /app/data

if [ ! -f /app/data/qlhb.db ]; then
    echo "[entrypoint] Chưa có cơ sở dữ liệu trong Volume — nạp dữ liệu gốc (879 học sinh) lần đầu..."
    cp /app/data_seed/qlhb.db /app/data/qlhb.db
else
    echo "[entrypoint] Đã có cơ sở dữ liệu trong Volume — giữ nguyên, không ghi đè."
fi

exec gunicorn -w 2 -b 0.0.0.0:8000 --timeout 120 run:app
