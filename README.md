# Sổ Học Bổng — Hệ thống quản lý học bổng (Backend + Database)

Đây là phiên bản đầy đủ, có tài khoản đăng nhập và phân quyền thật sự — thay
thế cho bản Claude Artifact/file HTML tĩnh trước đây. Vì dữ liệu học sinh có
hình ảnh, hoàn cảnh gia đình và các thông tin nhạy cảm khác, hệ thống cần một
máy chủ và cơ sở dữ liệu riêng để có thể kiểm soát ai được xem, ai được sửa.

## Bạn cần tự triển khai (deploy) ở đâu đó

Đây không còn là một file HTML mở trực tiếp trong trình duyệt. Đây là một
ứng dụng web thật sự (Python + Flask + SQLite) — bạn cần một nơi để "chạy"
nó liên tục, ví dụ:

- Một VPS (DigitalOcean, Vultr, AWS Lightsail...) — linh hoạt nhất
- Render.com, Railway.app — dễ triển khai, có gói miễn phí/giá rẻ
- PythonAnywhere — đơn giản, phù hợp nếu bạn chưa quen dòng lệnh server

Tôi (Claude) không thể tự lưu trữ ứng dụng này giúp bạn lâu dài — môi trường
của tôi chỉ tồn tại tạm thời trong phiên làm việc và không kết nối internet
công khai. Bạn hoặc người phụ trách kỹ thuật cần thực hiện các bước bên dưới
trên hạ tầng của bạn.

## Cài đặt lần đầu

Bản này đã được **nạp sẵn dữ liệu thật** từ file `DSHS 2.xlsx` bạn gửi:
**879 học sinh**, **1.841 dòng học kỳ**, tổng cộng **7.913.500.000 đ** đã
tài trợ. Xem mục "Kết quả nhập dữ liệu lần này" bên dưới để biết chi tiết và
những chỗ cần bạn/nhân viên kiểm tra lại.

```bash
# 1) Cài Python 3.9+ nếu chưa có, sau đó cài thư viện cần thiết:
pip install -r requirements.txt

# 2) Chạy thử ở máy cá nhân (KHÔNG cần chạy lại seed.py — tài khoản admin
#    và dữ liệu học sinh đã có sẵn trong data/qlhb.db):
python3 run.py
# Mở trình duyệt: http://localhost:8000
```

Đăng nhập bằng `admin` / `ChangeMe123!`. Hệ thống sẽ bắt buộc đổi mật khẩu
ngay lần đăng nhập đầu tiên — **hãy đổi ngay** sang mật khẩu mạnh của riêng
bạn, đừng dùng lại mật khẩu ở nơi khác.

Chỉ chạy `seed.py` nếu bạn muốn tạo thêm tài khoản khác ngay từ dòng lệnh;
lệnh này an toàn khi chạy lại nhiều lần (bỏ qua nếu tài khoản đã tồn tại,
không đụng đến dữ liệu học sinh).

### Trường thông tin mới được bổ sung khi nhập dữ liệu này

So với bản trống trước đó, ứng dụng đã được bổ sung thêm các trường sau để
khớp với dữ liệu trong file gốc: **Giới tính**, **Khu vực** (Miền Bắc/Miền
Trung/Miền Tây/Tây Nguyên/Lưu Tộc/Francis Hội), **Số điện thoại**, và **Mã số
gốc** (mã số học sinh trong file Excel gốc, để đối chiếu khi cần). Các trường
này đã có trong màn hình chi tiết học sinh, bộ lọc danh sách/báo cáo, và file
mẫu nhập liệu. Vì file gốc phần lớn không có sẵn Giới tính/Số điện thoại/Khu
vực nên các trường này hiện đang trống ở phần lớn học sinh — bạn có thể bổ
sung dần qua giao diện.

### Nạp thêm dữ liệu học sinh mới hoặc cập nhật

Vào tab **"Danh sách"** → **"Nhập từ file mẫu"**: tải file mẫu CSV, mở bằng
Excel/Google Sheets, điền dữ liệu thật (mỗi dòng là một học sinh trong một
năm học — nếu một em có nhiều năm học thì lặp lại tên ở nhiều dòng), rồi tải
file đã điền lên. Hệ thống sẽ hiện bản xem trước (số học sinh mới, số dòng
học kỳ, các dòng cần chú ý) trước khi bạn xác nhận nhập — có thể nhập nhiều
lần, mỗi lần một phần dữ liệu. Bạn cũng có thể thêm từng học sinh thủ công
bằng nút "+ Thêm học sinh".

### Kết quả nhập dữ liệu lần này (từ file DSHS 2.xlsx)

- **879 học sinh**, **1.841 dòng học kỳ**, tổng **7.913.500.000 đ** đã tài trợ.
- **506 mục cần kiểm tra** — vào tab **"Cần kiểm tra"** trong ứng dụng để xem
  chi tiết từng học sinh và sửa trực tiếp. Chia theo loại:
  - **464** học sinh chỉ có năm sinh, thiếu ngày/tháng sinh (file gốc chỉ ghi
    "Sinh năm 20xx") — không sai, chỉ là thiếu chi tiết nếu cần đầy đủ.
  - **14** trường hợp có thể trùng hồ sơ (trùng cả họ tên và ngày sinh) — nên
    kiểm tra xem có phải nhập hai lần hay chỉ là hai em trùng tên.
  - **14** học sinh Đại học/Cao đẳng thiếu năm học cho một số học kỳ trong
    file gốc.
  - **8** trường hợp file gốc ghi trùng tên năm học cho hai học kỳ khác nhau
    của cùng một học sinh — hệ thống đã tạm phân biệt bằng nhãn lớp/năm để
    không mất dữ liệu, cần sửa lại năm học chính xác.
  - **3** học sinh có Tỉnh/Thành ghi là "Nước Lào" — không thuộc 34 tỉnh/thành
    hiện hành nên chưa map được, cần xác nhận thủ công.
  - **3** dòng có dữ liệu tiền tài trợ bất thường (ô số tiền lẫn chữ) — đã
    tạm ghi 0đ, cần kiểm tra lại số tiền đúng.
- Ngoài ra, **90 học sinh** hệ thống chưa xác định được rõ Trường/Cấp học
  (không có dòng năm học nào có đủ thông tin) — không nằm trong tab "Cần
  kiểm tra" nhưng đáng chú ý khi rà soát; xem cột "Trường / Cấp học" ghi
  "Chưa rõ" trong danh sách để tìm các em này.

Toàn bộ định danh tỉnh/thành trong dữ liệu cũ (theo 63 tỉnh/thành trước đây)
đã được quy đổi sang 34 tỉnh/thành hiện hành theo đợt sáp nhập hành chính
2025 (ví dụ Thừa Thiên Huế → Huế, Kon Tum → Quảng Ngãi...).

### Xóa dữ liệu cũ để nạp lại từ đầu

Nếu hệ thống đã có sẵn dữ liệu (ví dụ dữ liệu thử nghiệm) và bạn muốn xóa
sạch để nạp bộ dữ liệu mới, chạy:

```bash
python3 clear_data.py
```

Lệnh này sẽ hiện số lượng học sinh/học kỳ hiện có và hỏi xác nhận (gõ `XOA`)
trước khi xóa. Nó **chỉ xóa dữ liệu học sinh — không đụng đến tài khoản
người dùng đã tạo**, nên không cần tạo lại tài khoản admin sau khi xóa. Có
thể thêm `--yes` để xóa ngay không cần hỏi (khi chạy tự động trong script).

## Deploy qua Coolify (Docker) — nếu bạn có server/VPS riêng

Nếu bạn tự quản lý một server riêng và đã cài Coolify (bảng điều khiển
hosting mã nguồn mở, giao diện giống PythonAnywiere/Render), thư mục này đã
có sẵn `Dockerfile` và `entrypoint.sh` để deploy trực tiếp — không cần làm
theo phần "Cài đặt lần đầu" ở trên nữa. Lưu ý quan trọng:

- File `data/qlhb.db` **cố tình không nằm trong Git** (xem `.gitignore`) —
  dữ liệu thật phải sống trong một Volume của Coolify, gắn vào đường dẫn
  `/app/data` trong container, để không bị ghi đè mỗi lần deploy lại.
- `data_seed/qlhb.db` là bản sao dữ liệu gốc (879 học sinh từ DSHS 2.xlsx) —
  **có** nằm trong Git, dùng để tự động nạp vào Volume trống ở lần deploy
  đầu tiên (xem logic trong `entrypoint.sh`). Từ lần thứ hai trở đi, nếu
  Volume đã có `qlhb.db`, nó sẽ được giữ nguyên.
- Nhớ cấu hình biến môi trường `QLHB_SECRET_KEY` (chuỗi ngẫu nhiên dài) và
  `QLHB_FORCE_HTTPS=1` trong phần Environment Variables của Coolify.

## Đưa lên internet thật (production)

Máy chủ chạy bằng `python3 run.py` chỉ dùng để thử nghiệm — **không** để
chạy thật trên internet vì không đủ an toàn/ổn định khi có nhiều người dùng
cùng lúc. Khi triển khai thật:

1. Cài thêm một WSGI server thật, ví dụ `gunicorn` (Linux/macOS) hoặc
   `waitress` (Windows). Bỏ dấu `#` ở dòng tương ứng trong `requirements.txt`
   rồi `pip install -r requirements.txt` lại.

   ```bash
   pip install gunicorn
   gunicorn -w 2 -b 0.0.0.0:8000 run:app
   ```

2. Đặt ứng dụng sau một reverse proxy có HTTPS (Nginx/Caddy, hoặc HTTPS có
   sẵn của Render/Railway/PythonAnywhere).

3. Đặt hai biến môi trường trước khi chạy:

   - `QLHB_SECRET_KEY` — một chuỗi ngẫu nhiên dài, bí mật (dùng để mã hóa
     phiên đăng nhập). Nếu không đặt, mỗi lần khởi động lại server mọi
     người sẽ bị đăng xuất. Tạo nhanh bằng: `python3 -c "import secrets; print(secrets.token_hex(32))"`
   - `QLHB_FORCE_HTTPS=1` — bật khi trang web đã chạy qua HTTPS, để cookie
     đăng nhập chỉ được gửi qua kết nối an toàn.

   ```bash
   export QLHB_SECRET_KEY="dán chuỗi ngẫu nhiên ở đây"
   export QLHB_FORCE_HTTPS=1
   gunicorn -w 2 -b 0.0.0.0:8000 run:app
   ```

4. Sao lưu định kỳ file `data/qlhb.db` — đây là toàn bộ dữ liệu (học sinh,
   học kỳ, tài khoản người dùng). Mất file này là mất dữ liệu.

## Quản lý người dùng và phân quyền

Đăng nhập bằng tài khoản `admin`, vào tab **"Người dùng"** để:

- Tạo tài khoản mới cho từng người (điều phối viên, tình nguyện viên...)
- Chọn vai trò cho mỗi tài khoản:
  - **Quản trị (admin)** — toàn quyền, kể cả xóa học sinh và quản lý tài khoản khác
  - **Biên tập (editor)** — thêm/sửa học sinh, nhập file Excel, nhưng không xóa được và không vào được trang quản lý người dùng
  - **Chỉ xem (viewer)** — chỉ xem, không sửa được gì
- Giới hạn phạm vi xem theo "người phụ trách" — nếu một tài khoản chỉ nên
  thấy học sinh của một khu vực/nhóm cụ thể, chọn tên người phụ trách tương
  ứng ở mục "Chỉ phụ trách khu vực/nhóm". Để trống nghĩa là được xem tất cả.
- Khóa tài khoản (bỏ chọn "Đang hoạt động") thay vì xóa, nếu muốn tạm ngưng
  quyền truy cập của ai đó mà vẫn giữ lịch sử.
- Đặt lại mật khẩu cho người dùng khác bất cứ lúc nào (họ sẽ phải đổi mật
  khẩu ngay lần đăng nhập kế tiếp).

Hệ thống luôn giữ lại ít nhất một tài khoản quản trị đang hoạt động — bạn sẽ
không thể tự khóa/xóa tài khoản của chính mình hoặc xóa quản trị viên cuối
cùng, để tránh bị khóa hoàn toàn khỏi hệ thống.

## Cấu trúc thư mục

```
qlhb_backend/
  app/                  Mã nguồn backend (Flask)
    schema.sql          Cấu trúc cơ sở dữ liệu
    db.py, auth.py, api.py, lookups.py
  static/               Giao diện web (HTML/CSS/JS) — được server phục vụ
  data/qlhb.db          Cơ sở dữ liệu SQLite — nơi lưu MỌI dữ liệu từ đây trở đi
  seed.py               Script khởi tạo cơ sở dữ liệu + tạo admin đầu tiên
  clear_data.py         Script xóa sạch dữ liệu học sinh để nạp lại từ đầu
  run.py                 Điểm khởi động server
  requirements.txt
```

## Câu hỏi thường gặp

**Quên mật khẩu admin duy nhất?** Nếu không còn tài khoản admin nào truy cập
được, cần chạy trực tiếp trên máy chủ (không qua giao diện web):

```bash
python3 -c "
from app import db, auth
db.execute('UPDATE users SET password_hash=?, must_change_password=1 WHERE username=?',
            (auth.hash_password('MatKhauTamThoi!123'), 'admin'))
print('Đã đặt lại mật khẩu cho admin.')
"
```

**Có thể vừa chạy bản cũ (Claude Artifact) vừa chạy bản này không?** Có,
nhưng dữ liệu của hai bản không đồng bộ với nhau. Từ nay nên dùng bản này
làm nguồn dữ liệu chính thức duy nhất để tránh nhầm lẫn.

**Ảnh học sinh có làm nặng cơ sở dữ liệu không?** Có — ảnh được lưu trực
tiếp trong `data/qlhb.db` dưới dạng dữ liệu mã hóa base64. Với ~900 học sinh
có ảnh, file này có thể nặng vài trăm MB, vẫn hoạt động tốt với SQLite
nhưng hãy đảm bảo hạ tầng bạn chọn có đủ dung lượng lưu trữ và sao lưu.
