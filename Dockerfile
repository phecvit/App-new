# Ảnh Docker để deploy Sổ Học Bổng qua Coolify (hoặc bất kỳ nền tảng nào
# hiểu Dockerfile). Dùng gunicorn thay cho Flask dev server — an toàn và ổn
# định hơn khi có nhiều người dùng cùng lúc.
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY . .
RUN chmod +x entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
