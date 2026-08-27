TINH_34 = [
    'Hà Nội', 'TP. Hồ Chí Minh', 'Hải Phòng', 'Đà Nẵng', 'Huế', 'Cần Thơ',
    'An Giang', 'Bắc Ninh', 'Thái Nguyên', 'Cà Mau', 'Vĩnh Long', 'Đồng Nai', 'Lâm Đồng', 'Đắk Lắk',
    'Cao Bằng', 'Điện Biên', 'Đồng Tháp', 'Tuyên Quang', 'Ninh Bình', 'Phú Thọ', 'Hưng Yên', 'Khánh Hòa',
    'Lào Cai', 'Tây Ninh', 'Quảng Ngãi', 'Quảng Trị', 'Hà Tĩnh', 'Nghệ An', 'Thanh Hóa', 'Quảng Ninh',
    'Lạng Sơn', 'Lai Châu', 'Sơn La', 'Gia Lai',
]
CAP_HOC = ['Tiểu học', 'THCS', 'THPT', 'Đại học/Cao đẳng']
HOC_LUC = ['Kém', 'Yếu', 'Trung bình', 'Đạt', 'Tiên tiến', 'Khá', 'Giỏi', 'Xuất sắc', 'Không có kết quả/Ở lại lớp']
TRANG_THAI = ['Có', 'Không']
GIOI_TINH = ['Nam', 'Nữ']
KHU_VUC = ['Miền Bắc', 'Miền Trung', 'Miền Tây', 'Tây Nguyên', 'Lưu Tộc', 'Francis Hội']


def cap_hoc_from_truong(truong):
    if not truong:
        return ''
    s = truong.lower()
    if 'đại học' in s or 'cao đẳng' in s:
        return 'Đại học/Cao đẳng'
    if 'thpt' in s or 'trung học phổ thông' in s:
        return 'THPT'
    if 'thcs' in s or 'trung học cơ sở' in s:
        return 'THCS'
    if 'tiểu học' in s:
        return 'Tiểu học'
    return ''
