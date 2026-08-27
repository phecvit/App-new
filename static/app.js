
  "use strict";

  // DATA is populated from the server after login (see loadBootstrapAndRender).
  // Kept as a stable object reference (mutated in place) since render functions
  // throughout this file close over `DATA` rather than re-reading a global.
  var DATA = { students: [], semesters: [], review: [], lookups: { tinh: [], caphoc: [], hocluc: [], trangthai: [], phutrach: [] } };

  var isReadOnly = true;
  var isAdmin = false;
  var CURRENT_USER = null;

  // ---------- API helper ----------
  function apiFetch(path, opts) {
    opts = opts || {};
    var headers = Object.assign({}, opts.headers || {});
    if (opts.body && typeof opts.body === 'string') headers['Content-Type'] = 'application/json';
    return fetch('/api' + path, {
      method: opts.method || 'GET',
      credentials: 'include',
      headers: headers,
      body: opts.body
    }).then(function(res){
      return res.text().then(function(text){
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON response */ }
        if (!res.ok) {
          var msg = (data && (data.message || data.error)) || ('HTTP ' + res.status);
          var err = new Error(msg);
          err.status = res.status;
          err.code = data && data.error;
          throw err;
        }
        return data;
      });
    });
  }

  // ---------- boot / auth ----------
  function boot() {
    apiFetch('/me').then(function(res){
      afterLogin(res.user);
    }).catch(function(){
      showLoginScreen();
    });
  }

  function showLoginScreen(message) {
    var overlay = document.getElementById('loginScreen');
    var app = document.getElementById('appRoot');
    if (app) app.style.display = 'none';
    if (overlay) overlay.style.display = 'flex';
    var err = document.getElementById('loginError');
    if (err) { err.textContent = message || ''; err.style.display = message ? 'block' : 'none'; }
  }

  function hideLoginScreen() {
    var overlay = document.getElementById('loginScreen');
    var app = document.getElementById('appRoot');
    if (overlay) overlay.style.display = 'none';
    if (app) app.style.display = '';
  }

  function wireLoginForm() {
    var form = document.getElementById('loginForm');
    if (!form) return;
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var username = document.getElementById('loginUsername').value.trim();
      var password = document.getElementById('loginPassword').value;
      var btn = document.getElementById('btnLogin');
      if (!username || !password) { showLoginScreen('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.'); return; }
      if (btn) { btn.disabled = true; btn.textContent = 'Đang đăng nhập...'; }
      apiFetch('/login', { method: 'POST', body: JSON.stringify({ username: username, password: password }) })
        .then(function(res){ afterLogin(res.user); })
        .catch(function(err){
          showLoginScreen(err.status === 401 ? 'Sai tên đăng nhập hoặc mật khẩu.' : ('Không đăng nhập được: ' + err.message));
        })
        .finally(function(){ if (btn) { btn.disabled = false; btn.textContent = 'Đăng nhập'; } });
    });
  }

  function afterLogin(user) {
    CURRENT_USER = user;
    hideLoginScreen();
    renderUserBadge();
    if (user.must_change_password) {
      openChangePasswordModal(true);
    }
    loadBootstrapAndRender();
  }

  function renderUserBadge() {
    var badge = document.getElementById('userBadge');
    if (!badge || !CURRENT_USER) return;
    var roleLabel = { admin: 'Quản trị', editor: 'Biên tập', viewer: 'Chỉ xem' }[CURRENT_USER.role] || CURRENT_USER.role;
    badge.innerHTML = '<span class="ub-name">' + esc(CURRENT_USER.full_name || CURRENT_USER.username) + '</span>' +
      '<span class="ub-role">' + esc(roleLabel) + '</span>';
    var usersTab = document.querySelector('.tabbtn[data-tab="users"]');
    if (usersTab) usersTab.style.display = CURRENT_USER.role === 'admin' ? '' : 'none';
  }

  function logout() {
    apiFetch('/logout', { method: 'POST' }).catch(function(){}).finally(function(){
      CURRENT_USER = null;
      location.reload();
    });
  }

  function loadBootstrapAndRender() {
    return apiFetch('/bootstrap').then(function(res){
      DATA.students = res.students;
      DATA.semesters = res.semesters;
      DATA.review = res.review || [];
      DATA.lookups = res.lookups;
      isReadOnly = !res.can_edit;
      isAdmin = !!res.is_admin;
      var banner = document.getElementById('roBanner');
      if (banner) {
        if (isReadOnly) {
          banner.textContent = 'Chế độ chỉ xem — tài khoản của bạn không có quyền chỉnh sửa dữ liệu này.';
          banner.classList.add('show');
        } else {
          banner.classList.remove('show');
        }
      }
      renderUserBadge();
      populateLookupSelects();
      renderTopStats();
      renderList();
      var activeTab = document.querySelector('.tabbtn.active');
      var tabName = activeTab ? activeTab.dataset.tab : 'home';
      if (tabName === 'home' || !activeTab) renderHome();
      if (tabName === 'stats') renderStats();
      if (tabName === 'review') renderReview();
      if (tabName === 'report') renderReport();
      if (tabName === 'users') renderUsersPanel();
    });
  }

  function refreshBootstrap() {
    return loadBootstrapAndRender();
  }

  function fmtMoney(n) {
    n = Number(n) || 0;
    return n.toLocaleString('vi-VN') + ' đ';
  }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function(){ t.classList.remove('show'); }, 2400);
  }
  function uid(prefix) {
    var n = 1;
    var existing = {};
    DATA.students.forEach(function(s){ existing[s.sid] = true; });
    while (existing[prefix + String(n).padStart(4,'0')]) n++;
    return prefix + String(n).padStart(4,'0');
  }

  // ---------- derived helpers ----------
  function semestersFor(sid) {
    return DATA.semesters.filter(function(sm){ return sm.sid === sid; })
      .sort(function(a,b){ return a.nam_hoc < b.nam_hoc ? -1 : 1; });
  }
  function totalTaiTro(sid) {
    return semestersFor(sid).reduce(function(sum, sm){ return sum + (Number(sm.tien_hki)||0) + (Number(sm.tien_hkii)||0); }, 0);
  }
  function latestSemester(sid) {
    var sems = semestersFor(sid);
    return sems.length ? sems[sems.length-1] : null;
  }
  function studentBySid(sid) {
    return DATA.students.find(function(s){ return s.sid === sid; });
  }

  // ---------- lookups into filter selects ----------
  function fillSelect(sel, items) {
    if (!sel) return;
    while (sel.options.length > 1) sel.remove(1); // keep the first "Tất cả" option, drop the rest
    items.forEach(function(v){
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
  }
  function distinctPhuTrach() {
    var set = {};
    DATA.students.forEach(function(s){ if (s.nguoi_phu_trach) set[s.nguoi_phu_trach] = true; });
    return Object.keys(set).sort(function(a,b){ return a.localeCompare(b, 'vi'); });
  }
  function distinctNamHoc() {
    var set = {};
    DATA.semesters.forEach(function(sm){ if (sm.nam_hoc) set[sm.nam_hoc] = true; });
    return Object.keys(set).sort();
  }
  function populateLookupSelects() {
    var phuTrachList = (DATA.lookups.phutrach && DATA.lookups.phutrach.length) ? DATA.lookups.phutrach : distinctPhuTrach();
    fillSelect(document.getElementById('fTinh'), DATA.lookups.tinh);
    fillSelect(document.getElementById('fCap'), DATA.lookups.caphoc);
    fillSelect(document.getElementById('fKhuVuc'), DATA.lookups.khuvuc);
    fillSelect(document.getElementById('fHocluc'), DATA.lookups.hocluc);
    fillSelect(document.getElementById('fPhuTrach'), phuTrachList);
    fillSelect(document.getElementById('rTinh'), DATA.lookups.tinh);
    fillSelect(document.getElementById('rCap'), DATA.lookups.caphoc);
    fillSelect(document.getElementById('rKhuVuc'), DATA.lookups.khuvuc);
    fillSelect(document.getElementById('rHocluc'), DATA.lookups.hocluc);
    fillSelect(document.getElementById('rPhuTrach'), phuTrachList);
    fillSelect(document.getElementById('rNamHoc'), distinctNamHoc());
    fillSelect(document.getElementById('d_phutrach_scope'), phuTrachList);
  }

  // ---------- tabs ----------
  document.querySelectorAll('.tabbtn').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.tabbtn').forEach(function(b){ b.classList.remove('active'); });
      document.querySelectorAll('.view').forEach(function(v){ v.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById('view-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'home') renderHome();
      if (btn.dataset.tab === 'stats') renderStats();
      if (btn.dataset.tab === 'review') renderReview();
      if (btn.dataset.tab === 'report') renderReport();
      if (btn.dataset.tab === 'users') renderUsersPanel();
    });
  });

  // ---------- home view ----------
  function pickSpread(arr, n) {
    if (arr.length <= n) return arr.slice();
    var out = [];
    var step = arr.length / n;
    for (var i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
    return out;
  }

  var homeWired = false;
  function renderHome() {
    var total = DATA.students.length;
    var grand = DATA.semesters.reduce(function(s,sm){ return s + (Number(sm.tien_hki)||0) + (Number(sm.tien_hkii)||0); }, 0);
    var receiving = DATA.students.filter(function(s){ var l = latestSemester(s.sid); return l && l.trang_thai_hb === 'Có'; }).length;
    var tinhSet = {};
    DATA.students.forEach(function(s){ if (s.tinh_chuan_hoa) tinhSet[s.tinh_chuan_hoa] = 1; });

    document.getElementById('homeStats').innerHTML =
      '<div class="statcard"><div class="n">' + total.toLocaleString('vi-VN') + '</div><div class="l">Học sinh đang theo dõi</div></div>' +
      '<div class="statcard"><div class="n">' + fmtMoney(grand) + '</div><div class="l">Tổng đã tài trợ</div></div>' +
      '<div class="statcard"><div class="n">' + receiving.toLocaleString('vi-VN') + '</div><div class="l">Đang nhận học bổng</div></div>' +
      '<div class="statcard"><div class="n">' + Object.keys(tinhSet).length.toLocaleString('vi-VN') + '</div><div class="l">Tỉnh/thành có mặt</div></div>';

    var withPhoto = DATA.students.filter(function(s){ return !!s.anh; });

    var mosaicPics = pickSpread(withPhoto, 24);
    document.getElementById('heroMosaic').innerHTML = mosaicPics.map(function(s){
      return '<div class="tile" style="background-image:url(\'' + s.anh + '\');"></div>';
    }).join('');

    var faces = pickSpread(withPhoto.length ? withPhoto : DATA.students, 12);
    document.getElementById('homeRecent').innerHTML = faces.map(function(s){
      var lastWord = (s.ho_ten || s.sid || '?').trim().split(/\s+/).pop();
      var initials = lastWord ? lastWord.charAt(0).toUpperCase() : '?';
      var photoHtml = s.anh ? '<img class="ph" src="' + s.anh + '" alt="" />' : '<div class="ph-placeholder">' + esc(initials) + '</div>';
      return '<button class="facecard" data-sid="' + esc(s.sid) + '">' + photoHtml +
        '<div class="fn">' + esc(s.ho_ten || s.sid) + '</div>' +
        '<div class="fs">' + esc(s.cap_hoc || '—') + '</div></button>';
    }).join('');
    document.querySelectorAll('#homeRecent .facecard').forEach(function(btn){
      btn.addEventListener('click', function(){
        document.querySelector('.tabbtn[data-tab="list"]').click();
        openDrawer(btn.dataset.sid);
      });
    });

    document.getElementById('homeQuickNav').innerHTML =
      '<button class="homecard" data-goto="list"><div class="ic">🔎</div><div class="t">Danh sách học sinh</div><div class="d">Tìm kiếm, lọc và cập nhật hồ sơ từng em.</div></button>' +
      '<button class="homecard" data-goto="dashboard"><div class="ic">📊</div><div class="t">Dashboard phân tích</div><div class="d">So sánh theo tỉnh, cấp học, học lực, người phụ trách và xu hướng theo năm.</div></button>' +
      '<button class="homecard" data-goto="report-table"><div class="ic">🧾</div><div class="t">Báo cáo &amp; xuất file</div><div class="d">Lọc theo nhiều tiêu chí, xuất Excel/Word/PowerPoint/PDF.</div></button>' +
      '<button class="homecard" data-goto="review"><div class="ic">⚠️</div><div class="t">Cần kiểm tra' + (DATA.review.length ? ' <span class="badge2">' + DATA.review.length + '</span>' : '') + '</div><div class="d">Dữ liệu gốc lệch cột hoặc thiếu thông tin cần rà soát.</div></button>' +
      '<button class="homecard" data-goto="stats"><div class="ic">📈</div><div class="t">Thống kê tổng quan</div><div class="d">Toàn bộ số liệu chương trình, không theo bộ lọc.</div></button>' +
      (isAdmin ? '<button class="homecard" data-goto="users"><div class="ic">👥</div><div class="t">Quản lý người dùng</div><div class="d">Tạo tài khoản, phân quyền xem/cập nhật cho từng người.</div></button>' : '');

    if (!homeWired) {
      homeWired = true;
      document.getElementById('homeQuickNav').addEventListener('click', function(e){
        var btn = e.target.closest('.homecard');
        if (!btn) return;
        var target = btn.dataset.goto;
        if (target === 'report-table' || target === 'dashboard') {
          document.querySelector('.tabbtn[data-tab="report"]').click();
          var sub = document.querySelector('#reportSubtabs .subtabbtn[data-rtab="' + (target === 'dashboard' ? 'dashboard' : 'table') + '"]');
          if (sub) sub.click();
          return;
        }
        document.querySelector('.tabbtn[data-tab="' + target + '"]').click();
      });
    }
  }

  // ---------- top stat strip ----------
  function renderTopStats() {
    var total = DATA.students.length;
    var grand = DATA.semesters.reduce(function(s,sm){ return s + (Number(sm.tien_hki)||0) + (Number(sm.tien_hkii)||0); }, 0);
    var el = document.getElementById('statStrip');
    el.innerHTML =
      '<div class="stat"><div class="n">' + total.toLocaleString('vi-VN') + '</div><div class="l">Học sinh</div></div>' +
      '<div class="stat"><div class="n">' + fmtMoney(grand) + '</div><div class="l">Tổng đã tài trợ</div></div>';
    document.getElementById('reviewBadge').textContent = DATA.review.length;
  }

  // ---------- list view ----------
  function matchesFilters(s) {
    var q = document.getElementById('fSearch').value.trim().toLowerCase();
    var tinh = document.getElementById('fTinh').value;
    var cap = document.getElementById('fCap').value;
    var khuvuc = document.getElementById('fKhuVuc') ? document.getElementById('fKhuVuc').value : '';
    var phutrach = document.getElementById('fPhuTrach').value;
    var hocluc = document.getElementById('fHocluc').value;
    var tt = document.getElementById('fTrangthai').value;
    if (q) {
      var hay = [s.ho_ten, s.truong, s.dia_chi, s.nguoi_phu_trach].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    if (tinh && s.tinh_chuan_hoa !== tinh) return false;
    if (cap && s.cap_hoc !== cap) return false;
    if (khuvuc && s.khu_vuc !== khuvuc) return false;
    if (phutrach && s.nguoi_phu_trach !== phutrach) return false;
    var latest = latestSemester(s.sid);
    if (hocluc) {
      var hl = latest ? (latest.hoc_luc_hkii || latest.hoc_luc_hki) : null;
      if (hl !== hocluc) return false;
    }
    if (tt) {
      var st = latest ? latest.trang_thai_hb : null;
      if (st !== tt) return false;
    }
    return true;
  }

  function pillForTrangThai(tt) {
    if (tt === 'Có') return '<span class="pill good">Đang nhận</span>';
    if (tt === 'Không') return '<span class="pill bad">Không nhận</span>';
    return '<span class="pill neutral">Chưa rõ</span>';
  }

  function renderList() {
    var body = document.getElementById('listBody');
    var rows = DATA.students.filter(matchesFilters);
    document.getElementById('resultCount').textContent = rows.length.toLocaleString('vi-VN') + ' / ' + DATA.students.length.toLocaleString('vi-VN') + ' học sinh';
    body.innerHTML = '';
    document.getElementById('listEmpty').style.display = rows.length ? 'none' : 'block';
    var frag = document.createDocumentFragment();
    rows.slice(0, 500).forEach(function(s){
      var latest = latestSemester(s.sid);
      var hl = latest ? (latest.hoc_luc_hkii || latest.hoc_luc_hki) : null;
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="name-cell"><div class="name">' + esc(s.ho_ten) + '</div><div class="sub">' + esc(s.sid) + '</div></td>' +
        '<td>' + esc(s.tinh_chuan_hoa || s.tinh_goc || '—') + '</td>' +
        '<td>' + esc(s.truong || '—') + (s.cap_hoc ? '<div class="sub">' + esc(s.cap_hoc) + '</div>' : '') + '</td>' +
        '<td>' + (hl ? esc(hl) : '<span class="pill neutral">Chưa có</span>') + '</td>' +
        '<td>' + pillForTrangThai(latest ? latest.trang_thai_hb : null) + '</td>' +
        '<td class="num">' + fmtMoney(totalTaiTro(s.sid)) + '</td>';
      tr.addEventListener('click', function(){ openDrawer(s.sid); });
      frag.appendChild(tr);
    });
    body.appendChild(frag);
  }
  ['fSearch','fTinh','fCap','fKhuVuc','fPhuTrach','fHocluc','fTrangthai'].forEach(function(id){
    document.getElementById(id).addEventListener('input', renderList);
    document.getElementById(id).addEventListener('change', renderList);
  });
  document.getElementById('btnClearFilters').addEventListener('click', function(){
    document.getElementById('fSearch').value = '';
    document.getElementById('fTinh').value = '';
    document.getElementById('fCap').value = '';
    document.getElementById('fKhuVuc').value = '';
    document.getElementById('fPhuTrach').value = '';
    document.getElementById('fHocluc').value = '';
    document.getElementById('fTrangthai').value = '';
    renderList();
  });

  // ---------- drawer (detail / edit) ----------
  var overlay = document.getElementById('drawerOverlay');
  var drawer = document.getElementById('drawer');
  var pendingNewStudent = false;
  var currentPhotoDataUri = null;

  function closeDrawer() { overlay.classList.remove('open'); drawer.innerHTML=''; pendingNewStudent = false; }
  overlay.addEventListener('click', function(e){ if (e.target === overlay) closeDrawer(); });

  function fieldRow(label, inputHtml) {
    return '<div class="field">' + '<label>' + esc(label) + '</label>' + inputHtml + '</div>';
  }

  function openDrawer(sid) {
    var s = studentBySid(sid);
    if (!s) return;
    pendingNewStudent = false;
    var sems = semestersFor(sid);
    drawer.innerHTML = drawerTemplate(s, sems, false);
    wireDrawer(s, sems);
    overlay.classList.add('open');
  }

  function openNewStudentDrawer() {
    var s = { sid: uid('HS'), ho_ten:'', ngay_sinh:'', ngay_sinh_goc:'', ten_cha:'', ten_me:'', dia_chi:'',
      tinh_chuan_hoa:'', tinh_goc:'', cap_hoc:'', truong:'', hoan_canh:'', nguoi_phu_trach:'', ghi_chu:'' };
    pendingNewStudent = true;
    drawer.innerHTML = drawerTemplate(s, [], true);
    wireDrawer(s, []);
    overlay.classList.add('open');
  }

  function optionsHtml(list, current) {
    var html = '<option value="">—</option>';
    list.forEach(function(v){
      html += '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>';
    });
    return html;
  }

  function drawerTemplate(s, sems, isNew) {
    var html = '';
    html += '<div class="drawer-head"><div><h2>' + (isNew ? 'Thêm học sinh mới' : esc(s.ho_ten || '(chưa có tên)')) + '</h2>' +
      '<div class="meta">Mã: ' + esc(s.sid) + (s.nguoi_phu_trach ? ' · Người phụ trách: ' + esc(s.nguoi_phu_trach) : '') + '</div></div>' +
      '<button class="close-x" id="drawerClose" aria-label="Đóng">×</button></div>';

    html += photoBoxHtml(s.anh);

    html += '<div class="grid2">';
    html += fieldRow('Họ và tên', '<input id="d_ho_ten" value="' + esc(s.ho_ten) + '" />');
    html += fieldRow('Giới tính', '<select id="d_gioitinh">' + optionsHtml(DATA.lookups.gioitinh, s.gioi_tinh) + '</select>');
    html += fieldRow('Ngày sinh', '<input id="d_ngay_sinh" type="date" value="' + esc(s.ngay_sinh||'') + '" />');
    html += fieldRow('Số điện thoại', '<input id="d_sdt" value="' + esc(s.so_dien_thoai||'') + '" />');
    html += fieldRow('Tên cha', '<input id="d_ten_cha" value="' + esc(s.ten_cha||'') + '" />');
    html += fieldRow('Tên mẹ', '<input id="d_ten_me" value="' + esc(s.ten_me||'') + '" />');
    html += '</div>';

    html += fieldRow('Địa chỉ', '<input id="d_dia_chi" value="' + esc(s.dia_chi||'') + '" />');

    html += '<div class="grid2">';
    html += fieldRow('Tỉnh/Thành (chuẩn hóa)', '<select id="d_tinh">' + optionsHtml(DATA.lookups.tinh, s.tinh_chuan_hoa) + '</select>');
    html += fieldRow('Khu vực', '<select id="d_khuvuc">' + optionsHtml(DATA.lookups.khuvuc, s.khu_vuc) + '</select>');
    html += fieldRow('Cấp học', '<select id="d_cap">' + optionsHtml(DATA.lookups.caphoc, s.cap_hoc) + '</select>');
    html += fieldRow('Mã số gốc (đối chiếu file gốc, nếu có)', '<input id="d_masogoc" value="' + esc(s.ma_so_goc||'') + '" />');
    html += '</div>';

    html += fieldRow('Trường', '<input id="d_truong" value="' + esc(s.truong||'') + '" />');
    html += fieldRow('Hoàn cảnh gia đình', '<textarea id="d_hoancanh" rows="2">' + esc(s.hoan_canh||'') + '</textarea>');
    html += fieldRow('Người phụ trách', '<input id="d_phutrach" value="' + esc(s.nguoi_phu_trach||'') + '" />');
    html += fieldRow('Ghi chú', '<textarea id="d_ghichu" rows="2">' + esc(s.ghi_chu||'') + '</textarea>');

    if (!isNew) {
      html += '<div class="section-title">Lịch sử học kỳ <button class="btn small" id="btnAddSem">+ Thêm năm học</button></div>';
      html += '<div class="tablewrap"><table class="sem" id="semTable"><thead><tr>' +
        '<th>Năm học</th><th>Lớp</th><th>Học lực HKI</th><th>Học lực HKII</th>' +
        '<th>Tiền HKI</th><th>Tiền HKII</th><th>Học bổng</th><th></th></tr></thead><tbody>';
      sems.forEach(function(sm, idx){
        html += semRowHtml(sm, idx);
      });
      html += '</tbody></table></div>';
      html += '<div style="margin-top:10px;font-weight:700;">Tổng đã tài trợ: <span class="num">' + fmtMoney(totalTaiTro(s.sid)) + '</span></div>';
    }

    html += '<div class="drawer-actions">' +
      (isNew || !isAdmin ? '' : '<button class="btn danger" id="btnDeleteStudent">Xóa học sinh</button>') +
      '<button class="btn" id="btnExportProfilePdf">Xuất hồ sơ (PDF)</button>' +
      '<button class="btn" id="btnCancelDrawer">Hủy</button>' +
      '<button class="btn primary" id="btnSaveDrawer">Lưu thay đổi</button>' +
      '</div>';
    return html;
  }

  function photoPreviewInner(anh) {
    return anh ? '<img src="' + anh + '" alt="Ảnh học sinh" />' : '<div class="photo-placeholder">Chưa có ảnh</div>';
  }
  function photoBoxHtml(anh) {
    return '<div class="photo-box"><div class="photo-preview" id="photoPreview">' + photoPreviewInner(anh) + '</div>' +
      '<div class="photo-actions">' +
      '<label class="btn small" for="d_photo_input">Chọn ảnh</label>' +
      '<input type="file" id="d_photo_input" accept="image/*" style="display:none" />' +
      '<button type="button" class="btn ghost small" id="btnRemovePhoto">Xóa ảnh</button>' +
      '</div></div>';
  }
  function resizeImageFile(file, maxW, quality) {
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(e){
        var img = new Image();
        img.onload = function(){
          var w = img.width, h = img.height;
          if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = function(){ reject(new Error('load error')); };
        img.src = e.target.result;
      };
      reader.onerror = function(){ reject(new Error('read error')); };
      reader.readAsDataURL(file);
    });
  }

  function semRowHtml(sm, idx) {
    var cls = sm.can_kiem_tra ? ' class="review-row"' : '';
    return '<tr' + cls + ' data-idx="' + idx + '">' +
      '<td><input class="sem-nam" value="' + esc(sm.nam_hoc) + '" /></td>' +
      '<td><input class="sem-lop" value="' + esc(sm.lop||'') + '" /></td>' +
      '<td><select class="sem-hki">' + optionsHtml(DATA.lookups.hocluc, sm.hoc_luc_hki) + '</select></td>' +
      '<td><select class="sem-hkii">' + optionsHtml(DATA.lookups.hocluc, sm.hoc_luc_hkii) + '</select></td>' +
      '<td><input class="sem-tienhki num" type="number" value="' + (sm.tien_hki||0) + '" /></td>' +
      '<td><input class="sem-tienhkii num" type="number" value="' + (sm.tien_hkii||0) + '" /></td>' +
      '<td><select class="sem-tt">' + optionsHtml(DATA.lookups.trangthai, sm.trang_thai_hb) + '</select></td>' +
      '<td><button class="btn ghost small sem-remove" title="Xóa dòng">✕</button></td>' +
      '</tr>';
  }

  function collectLiveSems(sid) {
    var tbody = document.querySelector('#semTable tbody');
    if (!tbody) return [];
    var sems = [];
    tbody.querySelectorAll('tr').forEach(function(row){
      var nam = row.querySelector('.sem-nam').value.trim();
      if (!nam) return;
      sems.push({
        sid: sid,
        nam_hoc: nam,
        lop: row.querySelector('.sem-lop').value.trim(),
        hoc_luc_hki: row.querySelector('.sem-hki').value,
        hoc_luc_hkii: row.querySelector('.sem-hkii').value,
        tien_hki: Number(row.querySelector('.sem-tienhki').value) || 0,
        tien_hkii: Number(row.querySelector('.sem-tienhkii').value) || 0,
        trang_thai_hb: row.querySelector('.sem-tt').value,
        can_kiem_tra: false,
        ghi_chu: null
      });
    });
    return sems;
  }

  function wireDrawer(s, sems) {
    currentPhotoDataUri = s.anh || null;
    document.getElementById('drawerClose').addEventListener('click', closeDrawer);
    document.getElementById('btnCancelDrawer').addEventListener('click', closeDrawer);

    document.getElementById('btnExportProfilePdf').addEventListener('click', function(){
      var liveStudent = Object.assign({}, s, {
        ho_ten: document.getElementById('d_ho_ten').value.trim() || s.ho_ten,
        gioi_tinh: document.getElementById('d_gioitinh').value,
        ngay_sinh: document.getElementById('d_ngay_sinh').value || s.ngay_sinh,
        so_dien_thoai: document.getElementById('d_sdt').value.trim(),
        ten_cha: document.getElementById('d_ten_cha').value.trim(),
        ten_me: document.getElementById('d_ten_me').value.trim(),
        dia_chi: document.getElementById('d_dia_chi').value.trim(),
        tinh_chuan_hoa: document.getElementById('d_tinh').value,
        khu_vuc: document.getElementById('d_khuvuc').value,
        cap_hoc: document.getElementById('d_cap').value,
        ma_so_goc: document.getElementById('d_masogoc').value.trim(),
        truong: document.getElementById('d_truong').value.trim(),
        hoan_canh: document.getElementById('d_hoancanh').value.trim(),
        nguoi_phu_trach: document.getElementById('d_phutrach').value.trim(),
        ghi_chu: document.getElementById('d_ghichu').value.trim(),
        anh: currentPhotoDataUri
      });
      exportStudentProfilePdf(liveStudent, collectLiveSems(s.sid));
    });

    if (isReadOnly) {
      drawer.querySelectorAll('input,select,textarea,button').forEach(function(el){
        if (el.id !== 'drawerClose' && el.id !== 'btnCancelDrawer' && el.id !== 'btnExportProfilePdf') el.disabled = true;
      });
      return;
    }
    document.getElementById('d_photo_input').addEventListener('change', function(e){
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      resizeImageFile(file, 320, 0.72).then(function(dataUri){
        currentPhotoDataUri = dataUri;
        document.getElementById('photoPreview').innerHTML = photoPreviewInner(dataUri);
      }).catch(function(){ toast('Không đọc được ảnh.'); });
    });
    document.getElementById('btnRemovePhoto').addEventListener('click', function(){
      currentPhotoDataUri = null;
      document.getElementById('photoPreview').innerHTML = photoPreviewInner(null);
    });
    if (document.getElementById('btnAddSem')) {
      document.getElementById('btnAddSem').addEventListener('click', function(){
        var tbody = document.querySelector('#semTable tbody');
        var newRow = { nam_hoc:'', lop:'', hoc_luc_hki:'', hoc_luc_hkii:'', tien_hki:0, tien_hkii:0, trang_thai_hb:'', can_kiem_tra:false };
        var wrapper = document.createElement('tbody');
        wrapper.innerHTML = semRowHtml(newRow, tbody.children.length);
        var row = wrapper.firstElementChild;
        tbody.appendChild(row);
        wireSemRow(row);
      });
    }
    drawer.querySelectorAll('#semTable tbody tr').forEach(wireSemRow);

    if (document.getElementById('btnDeleteStudent')) {
      document.getElementById('btnDeleteStudent').addEventListener('click', function(){
        if (!confirm('Xóa học sinh "' + s.ho_ten + '" và toàn bộ lịch sử học kỳ? Không thể hoàn tác.')) return;
        deleteStudentOnServer(s.sid, 'Đã xóa học sinh ' + s.ho_ten);
      });
    }

    document.getElementById('btnSaveDrawer').addEventListener('click', function(){
      var fields = {
        ho_ten: document.getElementById('d_ho_ten').value.trim(),
        gioi_tinh: document.getElementById('d_gioitinh').value,
        ngay_sinh: document.getElementById('d_ngay_sinh').value || null,
        so_dien_thoai: document.getElementById('d_sdt').value.trim(),
        ten_cha: document.getElementById('d_ten_cha').value.trim(),
        ten_me: document.getElementById('d_ten_me').value.trim(),
        dia_chi: document.getElementById('d_dia_chi').value.trim(),
        tinh_chuan_hoa: document.getElementById('d_tinh').value,
        khu_vuc: document.getElementById('d_khuvuc').value,
        cap_hoc: document.getElementById('d_cap').value,
        ma_so_goc: document.getElementById('d_masogoc').value.trim(),
        truong: document.getElementById('d_truong').value.trim(),
        hoan_canh: document.getElementById('d_hoancanh').value.trim(),
        nguoi_phu_trach: document.getElementById('d_phutrach').value.trim(),
        ghi_chu: document.getElementById('d_ghichu').value.trim()
      };
      if (!fields.ho_ten) { toast('Vui lòng nhập họ tên.'); return; }

      var sems = pendingNewStudent ? [] : collectLiveSems(s.sid);
      var isNewStudent = pendingNewStudent;
      var successMsg = isNewStudent ? 'Đã thêm học sinh ' + fields.ho_ten : 'Đã lưu thay đổi cho ' + fields.ho_ten;

      function afterCoreSave(finalSid) {
        return apiFetch('/students/' + encodeURIComponent(finalSid) + '/photo', {
          method: 'PUT', body: JSON.stringify({ anh: currentPhotoDataUri })
        });
      }

      var btn = document.getElementById('btnSaveDrawer');
      if (btn) { btn.disabled = true; btn.textContent = 'Đang lưu...'; }
      var chain = isNewStudent
        ? apiFetch('/students', { method: 'POST', body: JSON.stringify(fields) }).then(function(res){ return res.sid; })
        : apiFetch('/students/' + encodeURIComponent(s.sid), { method: 'PUT', body: JSON.stringify(fields) }).then(function(){ return s.sid; });

      chain
        .then(function(finalSid){ return afterCoreSave(finalSid).then(function(){ return finalSid; }); })
        .then(function(finalSid){
          return apiFetch('/students/' + encodeURIComponent(finalSid) + '/semesters', {
            method: 'PUT', body: JSON.stringify({ semesters: sems })
          });
        })
        .then(function(){ return refreshBootstrap(); })
        .then(function(){ toast(successMsg); closeDrawer(); })
        .catch(function(err){ toast('Không lưu được: ' + (err && err.message ? err.message : 'lỗi không xác định')); })
        .finally(function(){ if (btn) { btn.disabled = false; btn.textContent = 'Lưu thay đổi'; } });
    });
  }

  function wireSemRow(row) {
    var btn = row.querySelector('.sem-remove');
    if (btn) btn.addEventListener('click', function(){ row.remove(); });
  }

  document.getElementById('btnAddStudent').addEventListener('click', function(){
    if (isReadOnly) { toast('Chế độ chỉ xem — không thể thêm học sinh.'); return; }
    openNewStudentDrawer();
  });

  // ---------- import from template file ----------
  var IMPORT_HEADERS = ['Mã học sinh (để trống nếu là học sinh mới)','Họ và tên (bắt buộc)','Giới tính (Nam/Nữ)',
    'Ngày sinh (yyyy-mm-dd)','Tên cha','Tên mẹ','Địa chỉ','Tỉnh/Thành (theo 34 tỉnh/thành hiện hành)','Khu vực',
    'Số điện thoại','Cấp học (Tiểu học/THCS/THPT/Đại học/Cao đẳng)',
    'Trường','Hoàn cảnh gia đình','Người phụ trách','Mã số gốc','Ghi chú','Năm học (vd 2025-2026)','Lớp','Học lực học kỳ I',
    'Học lực học kỳ II','Tiền tài trợ học kỳ I (đ)','Tiền tài trợ học kỳ II (đ)','Học bổng (Có/Không)'];

  function buildImportTemplateCsv() {
    var lines = [IMPORT_HEADERS.map(csvEscape).join(',')];
    var guide = ['#HUONGDAN', 'Nguyễn Văn A (đây là dòng ví dụ — hãy xóa trước khi nhập)', 'Nam', '2015-09-01', 'Nguyễn Văn B',
      'Trần Thị C', '123 đường ABC, xã X', DATA.lookups.tinh[0], (DATA.lookups.khuvuc && DATA.lookups.khuvuc[0]) || '', '',
      DATA.lookups.caphoc[0], 'Trường Tiểu học X',
      'Mồ côi cha, mẹ làm nông', 'Chị Hằng', '', '', '2025-2026', '5A', DATA.lookups.hocluc[5], DATA.lookups.hocluc[6],
      '5000000', '5000000', 'Có'];
    lines.push(guide.map(csvEscape).join(','));
    return '﻿' + lines.join('\r\n');
  }
  document.getElementById('btnImportStudents').addEventListener('click', function(){
    if (isReadOnly) { toast('Chế độ chỉ xem — không thể nhập dữ liệu.'); return; }
    openImportDrawer();
  });

  // CSV parsing, validation and upserting now all happen server-side (POST /api/import) so
  // permission scoping and sid assignment stay correct even with several people importing at
  // once. The client just previews (dry_run:true) then confirms (dry_run:false).
  var pendingImportCsv = null;

  function importDrawerTemplate() {
    return '<div class="drawer-head"><div><h2>Nhập danh sách học sinh từ file mẫu</h2>' +
      '<div class="meta">Thêm mới hoặc cập nhật hàng loạt bằng file CSV</div></div>' +
      '<button class="close-x" id="drawerClose" aria-label="Đóng">×</button></div>' +
      '<div class="section-title">Bước 1 — Tải file mẫu</div>' +
      '<p style="color:var(--muted); font-size:13px; margin:0 0 12px;">Mở được bằng Excel hoặc Google Sheets. Mỗi dòng là một học sinh trong một năm học — nếu một học sinh có nhiều năm học, lặp lại họ tên ở nhiều dòng. Xóa dòng ví dụ trước khi điền dữ liệu thật.</p>' +
      '<button class="btn small" id="btnDownloadTemplate">Tải file mẫu (.csv)</button>' +
      '<div class="section-title">Bước 2 — Chọn file đã điền</div>' +
      '<input type="file" id="importFileInput" accept=".csv,text/csv" />' +
      '<div id="importPreview"></div>' +
      '<div class="drawer-actions">' +
      '<button class="btn ghost" id="btnCancelImport">Hủy</button>' +
      '<button class="btn primary" id="btnConfirmImport" disabled>Xác nhận nhập</button>' +
      '</div>';
  }

  function renderImportPreview(result) {
    var total = result.newStudents + result.updatedStudents;
    var html = '<div class="reportgrid" style="margin-top:14px;">' +
      '<div class="reportcard"><div class="n">' + result.newStudents + '</div><div class="l">Học sinh mới</div></div>' +
      '<div class="reportcard"><div class="n">' + result.updatedStudents + '</div><div class="l">Học sinh cập nhật</div></div>' +
      '<div class="reportcard"><div class="n">' + result.semesterUpserts + '</div><div class="l">Dòng học kỳ</div></div>' +
      '<div class="reportcard"><div class="n">' + result.flags.length + '</div><div class="l">Cần kiểm tra</div></div></div>';
    if (result.flags.length) {
      html += '<div class="section-title">Các dòng cần chú ý</div>' +
        result.flags.slice(0, 30).map(function(f){ return '<div class="flagline"><div class="what">' + esc(f) + '</div></div>'; }).join('') +
        (result.flags.length > 30 ? '<div class="reportnote">và ' + (result.flags.length - 30) + ' dòng khác — vẫn sẽ được ghi nhận vào mục Cần kiểm tra.</div>' : '');
    }
    document.getElementById('importPreview').innerHTML = html;
    document.getElementById('btnConfirmImport').disabled = total === 0;
    if (total === 0) toast('Không tìm thấy dòng dữ liệu hợp lệ trong file.');
  }

  function wireImportDrawer() {
    document.getElementById('drawerClose').addEventListener('click', closeDrawer);
    document.getElementById('btnCancelImport').addEventListener('click', closeDrawer);
    document.getElementById('btnDownloadTemplate').addEventListener('click', function(){
      saveDownload('Mau_Nhap_Hoc_Sinh.csv', buildImportTemplateCsv());
    });
    document.getElementById('importFileInput').addEventListener('change', function(e){
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev){
        var text = String(ev.target.result);
        pendingImportCsv = text;
        document.getElementById('importPreview').innerHTML = '<div class="reportnote">Đang kiểm tra file...</div>';
        document.getElementById('btnConfirmImport').disabled = true;
        apiFetch('/import', { method: 'POST', body: JSON.stringify({ csv: text, dry_run: true }) })
          .then(renderImportPreview)
          .catch(function(err){
            pendingImportCsv = null;
            document.getElementById('importPreview').innerHTML = '<div class="reportnote">Không đọc được file: ' + esc(err.message) + '</div>';
          });
      };
      reader.onerror = function(){ toast('Không đọc được file.'); };
      reader.readAsText(file, 'utf-8');
    });
    document.getElementById('btnConfirmImport').addEventListener('click', function(){
      if (!pendingImportCsv) return;
      var btn = document.getElementById('btnConfirmImport');
      if (btn) { btn.disabled = true; btn.textContent = 'Đang nhập...'; }
      apiFetch('/import', { method: 'POST', body: JSON.stringify({ csv: pendingImportCsv, dry_run: false }) })
        .then(function(result){
          return refreshBootstrap().then(function(){
            var msg = 'Đã nhập ' + result.newStudents + ' học sinh mới';
            if (result.updatedStudents) msg += ', cập nhật ' + result.updatedStudents + ' học sinh';
            pendingImportCsv = null;
            toast(msg);
            closeDrawer();
          });
        })
        .catch(function(err){ toast('Không nhập được: ' + err.message); })
        .finally(function(){ if (btn) { btn.disabled = false; btn.textContent = 'Xác nhận nhập'; } });
    });
  }

  function openImportDrawer() {
    pendingNewStudent = false;
    pendingImportCsv = null;
    drawer.innerHTML = importDrawerTemplate();
    wireImportDrawer();
    overlay.classList.add('open');
  }

  // ---------- shared bar-chart helper ----------
  function bars(containerId, entries, formatValue) {
    var max = Math.max.apply(null, entries.map(function(e){ return e[1]; }).concat([1]));
    var html = '';
    entries.forEach(function(e){
      html += '<div class="barrow"><div>' + esc(e[0]) + '</div><div class="bar"><span style="width:' + (100*e[1]/max) + '%"></span></div><div class="num">' + formatValue(e[1]) + '</div></div>';
    });
    document.getElementById(containerId).innerHTML = html || '<div style="color:var(--muted)">Chưa có dữ liệu</div>';
  }

  // ---------- stats view ----------
  function renderStats() {
    var total = DATA.students.length;
    var grand = DATA.semesters.reduce(function(s,sm){ return s + (Number(sm.tien_hki)||0) + (Number(sm.tien_hkii)||0); }, 0);
    var receiving = DATA.students.filter(function(s){ var l = latestSemester(s.sid); return l && l.trang_thai_hb === 'Có'; }).length;
    document.getElementById('statCards').innerHTML =
      '<div class="statcard"><div class="n">' + total.toLocaleString('vi-VN') + '</div><div class="l">Tổng học sinh</div></div>' +
      '<div class="statcard"><div class="n">' + fmtMoney(grand) + '</div><div class="l">Tổng đã tài trợ</div></div>' +
      '<div class="statcard"><div class="n">' + receiving.toLocaleString('vi-VN') + '</div><div class="l">Đang nhận học bổng (năm gần nhất)</div></div>' +
      '<div class="statcard"><div class="n">' + DATA.review.length.toLocaleString('vi-VN') + '</div><div class="l">Cần kiểm tra</div></div>';

    var byYear = {};
    DATA.semesters.forEach(function(sm){ byYear[sm.nam_hoc] = (byYear[sm.nam_hoc]||0) + (Number(sm.tien_hki)||0) + (Number(sm.tien_hkii)||0); });
    bars('bdYear', Object.keys(byYear).sort().map(function(k){ return [k, byYear[k]]; }), fmtMoney);

    var byCap = {};
    DATA.students.forEach(function(s){ var k = s.cap_hoc || 'Chưa rõ'; byCap[k] = (byCap[k]||0)+1; });
    bars('bdCap', Object.keys(byCap).map(function(k){ return [k, byCap[k]]; }).sort(function(a,b){return b[1]-a[1];}), function(v){ return v.toLocaleString('vi-VN'); });

    var byTinh = {};
    DATA.students.forEach(function(s){ var k = s.tinh_chuan_hoa || 'Chưa xác định'; byTinh[k] = (byTinh[k]||0)+1; });
    var tinhEntries = Object.keys(byTinh).map(function(k){ return [k, byTinh[k]]; }).sort(function(a,b){return b[1]-a[1];}).slice(0,12);
    bars('bdTinh', tinhEntries, function(v){ return v.toLocaleString('vi-VN'); });

    var byHocluc = {};
    DATA.students.forEach(function(s){ var l = latestSemester(s.sid); var hl = l ? (l.hoc_luc_hkii || l.hoc_luc_hki) : null; var k = hl || 'Chưa có'; byHocluc[k] = (byHocluc[k]||0)+1; });
    bars('bdHocluc', DATA.lookups.hocluc.concat(['Chưa có']).filter(function(k){return byHocluc[k];}).map(function(k){ return [k, byHocluc[k]]; }), function(v){ return v.toLocaleString('vi-VN'); });
  }

  // ---------- review view ----------
  function renderReview() {
    var el = document.getElementById('reviewList');
    document.getElementById('reviewEmpty').style.display = DATA.review.length ? 'none' : 'block';
    el.innerHTML = DATA.review.map(function(r){
      var s = studentBySid(r.sid);
      return '<div class="flagline"><div style="flex:1;"><div class="who">' + esc(s ? s.ho_ten : r.sid) + ' <span style="color:var(--muted);font-weight:400;">(' + esc(r.sid) + ')</span></div>' +
        '<div class="what">' + esc(r.loai) + ' — ' + esc(r.chi_tiet) + '</div></div>' +
        '<button class="btn small btnGoto" data-sid="' + esc(r.sid) + '">Xem hồ sơ</button></div>';
    }).join('');
    el.querySelectorAll('.btnGoto').forEach(function(b){
      b.addEventListener('click', function(){
        document.querySelector('.tabbtn[data-tab="list"]').click();
        openDrawer(b.dataset.sid);
      });
    });
  }

  // ---------- report view ----------
  function matchesReportFilters(s) {
    var q = document.getElementById('rSearch').value.trim().toLowerCase();
    var tinh = document.getElementById('rTinh').value;
    var cap = document.getElementById('rCap').value;
    var khuvuc = document.getElementById('rKhuVuc') ? document.getElementById('rKhuVuc').value : '';
    var phutrach = document.getElementById('rPhuTrach').value;
    var nam = document.getElementById('rNamHoc').value;
    var hocluc = document.getElementById('rHocluc').value;
    var tt = document.getElementById('rTrangthai').value;
    if (q) {
      var hay = [s.ho_ten, s.truong, s.dia_chi, s.nguoi_phu_trach].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    if (tinh && s.tinh_chuan_hoa !== tinh) return false;
    if (cap && s.cap_hoc !== cap) return false;
    if (khuvuc && s.khu_vuc !== khuvuc) return false;
    if (phutrach && s.nguoi_phu_trach !== phutrach) return false;
    var sems = semestersFor(s.sid);
    var target = nam ? sems.find(function(sm){ return sm.nam_hoc === nam; }) : (sems.length ? sems[sems.length-1] : null);
    if (nam && !target) return false;
    if (hocluc) {
      var hl = target ? (target.hoc_luc_hkii || target.hoc_luc_hki) : null;
      if (hl !== hocluc) return false;
    }
    if (tt) {
      var st = target ? target.trang_thai_hb : null;
      if (st !== tt) return false;
    }
    return true;
  }

  var lastReportRows = []; // full (uncapped) rows for the current report, built for export
  var lastReportMeta = { namHoc: '', count: 0, tong: 0 };

  function reportRowForStudent(s, nam) {
    var sems = semestersFor(s.sid);
    var target = nam ? sems.find(function(sm){ return sm.nam_hoc === nam; }) : (sems.length ? sems[sems.length-1] : null);
    var hl = target ? (target.hoc_luc_hkii || target.hoc_luc_hki) : null;
    var tienNam = target ? ((Number(target.tien_hki)||0) + (Number(target.tien_hkii)||0)) : null;
    return {
      sid: s.sid,
      ho_ten: s.ho_ten,
      tinh: s.tinh_chuan_hoa || s.tinh_goc || '',
      cap: s.cap_hoc || '',
      truong: s.truong || '',
      phutrach: s.nguoi_phu_trach || '',
      hocluc: hl || '',
      trangthai: target ? (target.trang_thai_hb === 'Có' ? 'Đang nhận' : (target.trang_thai_hb === 'Không' ? 'Không nhận' : 'Chưa rõ')) : 'Chưa rõ',
      tienNam: tienNam,
      tongtien: totalTaiTro(s.sid)
    };
  }

  function renderReport() {
    var nam = document.getElementById('rNamHoc').value;
    var rows = DATA.students.filter(matchesReportFilters).map(function(s){ return reportRowForStudent(s, nam); })
      .sort(function(a,b){ return a.ho_ten.localeCompare(b.ho_ten, 'vi'); });
    lastReportRows = rows;
    lastReportMeta = { namHoc: nam, count: rows.length,
      tong: rows.reduce(function(sum,r){ return sum + (nam ? (Number(r.tienNam)||0) : r.tongtien); }, 0) };

    document.getElementById('reportCount').textContent = rows.length.toLocaleString('vi-VN') + ' / ' + DATA.students.length.toLocaleString('vi-VN') + ' học sinh';

    var uniqTinhCount = {};
    rows.forEach(function(r){ if (r.tinh) uniqTinhCount[r.tinh] = 1; });
    var avgPerStudent = rows.length ? Math.round(lastReportMeta.tong / rows.length) : 0;
    document.getElementById('reportSummary').innerHTML =
      '<div class="reportcard"><div class="n">' + rows.length.toLocaleString('vi-VN') + '</div><div class="l">Học sinh khớp bộ lọc</div></div>' +
      '<div class="reportcard"><div class="n">' + fmtMoney(lastReportMeta.tong) + '</div><div class="l">' + (nam ? 'Tổng tài trợ năm ' + esc(nam) : 'Tổng đã tài trợ (lũy kế)') + '</div></div>' +
      '<div class="reportcard"><div class="n">' + rows.filter(function(r){ return r.trangthai === 'Đang nhận'; }).length.toLocaleString('vi-VN') + '</div><div class="l">Đang nhận học bổng</div></div>' +
      '<div class="reportcard"><div class="n">' + fmtMoney(avgPerStudent) + '</div><div class="l">Trung bình / học sinh</div></div>' +
      '<div class="reportcard"><div class="n">' + Object.keys(uniqTinhCount).length.toLocaleString('vi-VN') + '</div><div class="l">Tỉnh/thành có mặt</div></div>';

    renderReportDashboard(rows, nam);

    var body = document.getElementById('reportBody');
    body.innerHTML = '';
    document.getElementById('reportEmpty').style.display = rows.length ? 'none' : 'block';
    var frag = document.createDocumentFragment();
    var CAP = 300;
    rows.slice(0, CAP).forEach(function(r){
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="name-cell"><div class="name">' + esc(r.ho_ten) + '</div><div class="sub">' + esc(r.sid) + '</div></td>' +
        '<td>' + esc(r.tinh || '—') + '</td>' +
        '<td>' + esc(r.truong || '—') + (r.cap ? '<div class="sub">' + esc(r.cap) + '</div>' : '') + '</td>' +
        '<td>' + esc(r.phutrach || '—') + '</td>' +
        '<td>' + (r.hocluc ? esc(r.hocluc) : '<span class="pill neutral">Chưa có</span>') + '</td>' +
        '<td>' + pillForTrangThai(r.trangthai === 'Đang nhận' ? 'Có' : (r.trangthai === 'Không nhận' ? 'Không' : null)) + '</td>' +
        '<td class="num">' + fmtMoney(nam ? (r.tienNam||0) : r.tongtien) + '</td>';
      tr.addEventListener('click', function(){ document.querySelector('.tabbtn[data-tab="list"]').click(); openDrawer(r.sid); });
      frag.appendChild(tr);
    });
    body.appendChild(frag);
    document.getElementById('reportNote').textContent = rows.length > CAP ?
      ('Xem trước ' + CAP + ' / ' + rows.length + ' dòng — xuất file để xem đầy đủ.') : '';
  }

  // ---------- report dashboard: analysis & comparison charts over the current filtered set ----------
  function computeAgg(rows, keyFn, order) {
    var m = {};
    rows.forEach(function(r){
      var k = keyFn(r);
      k = (k === null || k === undefined || k === '') ? 'Chưa rõ' : k;
      m[k] = (m[k] || 0) + 1;
    });
    if (order) {
      return order.concat(['Chưa rõ']).filter(function(k){ return m[k]; }).map(function(k){ return [k, m[k]]; });
    }
    return Object.keys(m).map(function(k){ return [k, m[k]]; }).sort(function(a,b){ return b[1] - a[1]; });
  }

  function renderDonut(containerId, segments) {
    var total = segments.reduce(function(s,seg){ return s + seg[1]; }, 0);
    var el = document.getElementById(containerId);
    if (!total) { el.innerHTML = '<div class="bd-empty">Chưa có dữ liệu</div>'; return; }
    var acc = 0, stops = [];
    segments.forEach(function(seg){
      var start = acc / total * 360;
      acc += seg[1];
      var end = acc / total * 360;
      if (seg[1] > 0) stops.push(seg[2] + ' ' + start.toFixed(2) + 'deg ' + end.toFixed(2) + 'deg');
    });
    var legend = segments.filter(function(seg){ return seg[1] > 0; }).map(function(seg){
      var pct = (seg[1] / total * 100).toFixed(1);
      return '<div class="item"><span class="dot" style="background:' + seg[2] + ';"></span>' + esc(seg[0]) +
        '<span class="val">' + seg[1].toLocaleString('vi-VN') + ' (' + pct + '%)</span></div>';
    }).join('');
    el.innerHTML = '<div class="donutrow">' +
      '<div class="donut" style="background:conic-gradient(' + stops.join(',') + ');"></div>' +
      '<div class="donut-legend">' + legend + '</div></div>';
  }

  function renderReportDashboard(rows, nam) {
    var amountOf = function(r){ return nam ? (Number(r.tienNam) || 0) : r.tongtien; };

    bars('dashByCap', computeAgg(rows, function(r){ return r.cap; }, DATA.lookups.caphoc),
      function(v){ return v.toLocaleString('vi-VN'); });

    bars('dashByTinh', computeAgg(rows, function(r){ return r.tinh; }).slice(0, 10),
      function(v){ return v.toLocaleString('vi-VN'); });

    bars('dashByHocluc', computeAgg(rows, function(r){ return r.hocluc; }, DATA.lookups.hocluc),
      function(v){ return v.toLocaleString('vi-VN'); });

    var statusOrder = ['Đang nhận', 'Không nhận', 'Chưa rõ'];
    var statusColor = { 'Đang nhận': 'var(--good)', 'Không nhận': 'var(--border)', 'Chưa rõ': 'var(--warn)' };
    var statusCount = { 'Đang nhận': 0, 'Không nhận': 0, 'Chưa rõ': 0 };
    rows.forEach(function(r){ statusCount[r.trangthai] = (statusCount[r.trangthai] || 0) + 1; });
    renderDonut('dashDonut', statusOrder.map(function(k){ return [k, statusCount[k], statusColor[k]]; }));

    var byPT = {};
    rows.forEach(function(r){
      var k = r.phutrach || 'Chưa rõ';
      byPT[k] = (byPT[k] || 0) + amountOf(r);
    });
    var ptEntries = Object.keys(byPT).map(function(k){ return [k, byPT[k]]; })
      .sort(function(a,b){ return b[1] - a[1]; }).slice(0, 10);
    bars('dashByPhuTrach', ptEntries, fmtMoney);

    // Year trend: reapply every filter except the year itself, so the chart can compare across years.
    var q = document.getElementById('rSearch').value.trim().toLowerCase();
    var tinh = document.getElementById('rTinh').value;
    var cap = document.getElementById('rCap').value;
    var phutrach = document.getElementById('rPhuTrach').value;
    var trendSids = {};
    DATA.students.forEach(function(s){
      if (q) { var hay = [s.ho_ten, s.truong, s.dia_chi, s.nguoi_phu_trach].join(' ').toLowerCase(); if (hay.indexOf(q) === -1) return; }
      if (tinh && s.tinh_chuan_hoa !== tinh) return;
      if (cap && s.cap_hoc !== cap) return;
      if (phutrach && s.nguoi_phu_trach !== phutrach) return;
      trendSids[s.sid] = 1;
    });
    var byYear = {};
    DATA.semesters.forEach(function(sm){
      if (!trendSids[sm.sid]) return;
      byYear[sm.nam_hoc] = (byYear[sm.nam_hoc] || 0) + (Number(sm.tien_hki) || 0) + (Number(sm.tien_hkii) || 0);
    });
    var yearEntries = Object.keys(byYear).sort().map(function(k){ return [k, byYear[k]]; });
    bars('dashByYear', yearEntries, fmtMoney);
  }

  document.querySelectorAll('#reportSubtabs .subtabbtn').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('#reportSubtabs .subtabbtn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      var isDash = btn.dataset.rtab === 'dashboard';
      document.getElementById('reportTableWrap').style.display = isDash ? 'none' : 'block';
      document.getElementById('reportDashboardWrap').style.display = isDash ? 'block' : 'none';
    });
  });

  ['rSearch','rTinh','rCap','rKhuVuc','rPhuTrach','rNamHoc','rHocluc','rTrangthai'].forEach(function(id){
    document.getElementById(id).addEventListener('input', renderReport);
    document.getElementById(id).addEventListener('change', renderReport);
  });
  document.getElementById('btnClearReportFilters').addEventListener('click', function(){
    ['rSearch','rTinh','rCap','rKhuVuc','rPhuTrach','rNamHoc','rHocluc','rTrangthai'].forEach(function(id){ document.getElementById(id).value = ''; });
    renderReport();
  });

  function reportFileBase() {
    var d = new Date();
    var pad = function(n){ return String(n).padStart(2,'0'); };
    return 'BaoCao_HocBong_' + d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate());
  }
  function reportColumns() {
    return ['Mã học sinh','Họ tên','Tỉnh/Thành','Cấp học','Trường','Người phụ trách','Học lực','Học bổng','Tổng đã tài trợ (đ)'];
  }
  function reportRowArray(r) {
    return [r.sid, r.ho_ten, r.tinh, r.cap, r.truong, r.phutrach, r.hocluc, r.trangthai, String(lastReportMeta.namHoc ? (r.tienNam||0) : r.tongtien)];
  }

  // ---------- generic file-save: the downloads capability on claude.ai, or a native
  // browser download when this file was opened directly (standalone distributed copy) ----------
  function mimeForFilename(filename) {
    var ext = (filename.split('.').pop() || '').toLowerCase();
    return {
      csv: 'text/csv;charset=utf-8',
      html: 'text/html;charset=utf-8',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    }[ext] || 'application/octet-stream';
  }
  function nativeBrowserDownload(filename, data) {
    try {
      var blob = new Blob([data], { type: mimeForFilename(filename) });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
      return true;
    } catch (e) {
      return false;
    }
  }
  function saveDownload(filename, data, successMsg) {
    if (nativeBrowserDownload(filename, data)) {
      toast(successMsg || ('Đã lưu ' + filename));
      return;
    }
    toast('Không tạo được file để tải xuống.');
  }

  // ---------- standalone printable HTML wrapper (for PDF-via-browser-print exports) ----------
  // The artifact viewer's sandboxed frame does not reliably support window.print() or file
  // downloads triggered from script. So "PDF" exports are delivered as a self-contained .html
  // file (via the downloads capability) that the user opens in their own browser and prints —
  // fully outside the sandbox, where window.print() and Save-as-PDF always work normally.
  function standalonePrintableHtml(title, innerHtml, extraCss) {
    return '<!doctype html><html lang="vi"><head><meta charset="UTF-8" />' +
      '<title>' + esc(title) + '</title><style>' +
      'body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px;background:#f4f3ef;color:#111;}' +
      '.doc-toolbar{max-width:900px;margin:0 auto 14px;display:flex;align-items:center;gap:14px;}' +
      '.doc-toolbar .hint{color:#555;font-size:12.5px;}' +
      '.doc-toolbar button{margin-left:auto;background:#2F6F62;color:#fff;border:none;border-radius:8px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer;flex-shrink:0;}' +
      '.doc-toolbar button:hover{filter:brightness(1.08);}' +
      '.doc-sheet{max-width:900px;margin:0 auto;background:#fff;padding:28px 32px;box-shadow:0 4px 20px rgba(0,0,0,.08);}' +
      (extraCss || '') +
      '@media print{body{background:#fff;padding:0;}.doc-toolbar{display:none;}.doc-sheet{box-shadow:none;padding:0;max-width:none;}@page{size:A4 portrait;margin:14mm;}}' +
      '</style></head><body>' +
      '<div class="doc-toolbar"><span class="hint">Bấm nút để mở hộp thoại in, sau đó chọn "Save as PDF / Lưu thành PDF" làm máy in (hoặc nhấn Ctrl+P, Mac: Cmd+P).</span>' +
      '<button onclick="window.print()">In / Lưu thành PDF</button></div>' +
      '<div class="doc-sheet">' + innerHtml + '</div>' +
      '</body></html>';
  }

  // ---------- CSV (Excel) export ----------
  function csvEscape(v) {
    v = v === null || v === undefined ? '' : String(v);
    if (/[",\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }
  function buildReportCsv() {
    var lines = [reportColumns().map(csvEscape).join(',')];
    lastReportRows.forEach(function(r){ lines.push(reportRowArray(r).map(csvEscape).join(',')); });
    return '﻿' + lines.join('\r\n');
  }
  document.getElementById('btnExportCsv').addEventListener('click', function(){
    saveDownload(reportFileBase() + '.csv', buildReportCsv());
  });

  // ---------- minimal ZIP writer (STORE method) — shared by DOCX/PPTX export ----------
  function zipCrc32(bytes) {
    var table = zipCrc32.table || (zipCrc32.table = (function(){
      var t = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
      }
      return t;
    })());
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function zipStrToBytes(str) { return new TextEncoder().encode(str); }
  function zipDosDateTime(d) {
    d = d || new Date();
    var time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((d.getSeconds() >> 1) & 0x1F);
    var date = (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0xF) << 5) | (d.getDate() & 0x1F);
    return { time: time, date: date };
  }
  function zipU16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
  function zipU32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
  function zipConcat(arrays) {
    var total = 0;
    for (var i = 0; i < arrays.length; i++) total += arrays[i].length;
    var out = new Uint8Array(total);
    var off = 0;
    for (i = 0; i < arrays.length; i++) { out.set(arrays[i], off); off += arrays[i].length; }
    return out;
  }
  function buildZip(files) {
    var dt = zipDosDateTime();
    var localParts = [];
    var centralParts = [];
    var offset = 0;
    files.forEach(function(f){
      var nameBytes = zipStrToBytes(f.name);
      var data = typeof f.data === 'string' ? zipStrToBytes(f.data) : f.data;
      var crc = zipCrc32(data);
      var size = data.length;
      var localHeader = zipConcat([
        new Uint8Array(zipU32(0x04034b50)), new Uint8Array(zipU16(20)), new Uint8Array(zipU16(0)), new Uint8Array(zipU16(0)),
        new Uint8Array(zipU16(dt.time)), new Uint8Array(zipU16(dt.date)), new Uint8Array(zipU32(crc)),
        new Uint8Array(zipU32(size)), new Uint8Array(zipU32(size)), new Uint8Array(zipU16(nameBytes.length)), new Uint8Array(zipU16(0)), nameBytes
      ]);
      localParts.push(localHeader, data);
      var centralHeader = zipConcat([
        new Uint8Array(zipU32(0x02014b50)), new Uint8Array(zipU16(20)), new Uint8Array(zipU16(20)), new Uint8Array(zipU16(0)), new Uint8Array(zipU16(0)),
        new Uint8Array(zipU16(dt.time)), new Uint8Array(zipU16(dt.date)), new Uint8Array(zipU32(crc)),
        new Uint8Array(zipU32(size)), new Uint8Array(zipU32(size)), new Uint8Array(zipU16(nameBytes.length)), new Uint8Array(zipU16(0)), new Uint8Array(zipU16(0)),
        new Uint8Array(zipU16(0)), new Uint8Array(zipU16(0)), new Uint8Array(zipU32(0)), new Uint8Array(zipU32(offset)), nameBytes
      ]);
      centralParts.push(centralHeader);
      offset += localHeader.length + data.length;
    });
    var centralDir = zipConcat(centralParts);
    var centralStart = offset;
    var eocd = zipConcat([
      new Uint8Array(zipU32(0x06054b50)), new Uint8Array(zipU16(0)), new Uint8Array(zipU16(0)),
      new Uint8Array(zipU16(files.length)), new Uint8Array(zipU16(files.length)),
      new Uint8Array(zipU32(centralDir.length)), new Uint8Array(zipU32(centralStart)), new Uint8Array(zipU16(0))
    ]);
    return zipConcat(localParts.concat([centralDir, eocd]));
  }

  function xmlEsc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c];
    });
  }
  function xmlCoreProps(title) {
    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + xmlEsc(title) + '</dc:title>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created>' +
      '<dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified>' +
      '</cp:coreProperties>';
  }
  var xmlAppProps = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
    '<Application>Sổ Học Bổng</Application></Properties>';

  // ---------- Word (.docx) export ----------
  function docxParaXml(text, style) {
    var pPr = style ? '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' : '';
    var runs = String(text === null || text === undefined ? '' : text).split('\n').map(function(line, i){
      var br = i > 0 ? '<w:br/>' : '';
      return '<w:r>' + br + '<w:t xml:space="preserve">' + xmlEsc(line) + '</w:t></w:r>';
    }).join('');
    return '<w:p>' + pPr + runs + '</w:p>';
  }
  function docxTableXml(headers, rows) {
    var cols = headers.length;
    var colW = Math.floor(9350 / cols);
    var gridCols = '';
    for (var i = 0; i < cols; i++) gridCols += '<w:gridCol w:w="' + colW + '"/>';
    function cell(text, isHeader) {
      var shd = isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="2F6F62"/>' : '';
      var rPr = isHeader ? '<w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr>' : '';
      return '<w:tc><w:tcPr><w:tcW w:w="' + colW + '" w:type="dxa"/>' + shd + '</w:tcPr>' +
        '<w:p><w:r>' + rPr + '<w:t xml:space="preserve">' + xmlEsc(text) + '</w:t></w:r></w:p></w:tc>';
    }
    function row(cells, isHeader) { return '<w:tr>' + cells.map(function(c){ return cell(c, isHeader); }).join('') + '</w:tr>'; }
    var xml = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="9350" w:type="dxa"/>' +
      '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="CCCCCC"/><w:left w:val="single" w:sz="4" w:color="CCCCCC"/>' +
      '<w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/><w:right w:val="single" w:sz="4" w:color="CCCCCC"/>' +
      '<w:insideH w:val="single" w:sz="4" w:color="CCCCCC"/><w:insideV w:val="single" w:sz="4" w:color="CCCCCC"/></w:tblBorders>' +
      '</w:tblPr><w:tblGrid>' + gridCols + '</w:tblGrid>';
    xml += row(headers, true);
    rows.forEach(function(r){ xml += row(r, false); });
    xml += '</w:tbl>';
    return xml;
  }
  var DOCX_STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="2F6F62"/><w:sz w:val="32"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr><w:rPr><w:b/><w:color w:val="B5791F"/><w:sz w:val="26"/></w:rPr></w:style>' +
    '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style></w:styles>';
  var DOCX_CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
  var DOCX_RELS_ROOT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
  var DOCX_RELS_DOC = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';

  function buildDocx(blocks, title) {
    var body = blocks.map(function(b){
      if (b.type === 'h1') return docxParaXml(b.text, 'Heading1');
      if (b.type === 'h2') return docxParaXml(b.text, 'Heading2');
      if (b.type === 'table') return docxTableXml(b.headers, b.rows);
      return docxParaXml(b.text);
    }).join('');
    var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>' +
      '</w:body></w:document>';
    return buildZip([
      { name: '[Content_Types].xml', data: DOCX_CONTENT_TYPES },
      { name: '_rels/.rels', data: DOCX_RELS_ROOT },
      { name: 'docProps/core.xml', data: xmlCoreProps(title || 'Báo cáo') },
      { name: 'docProps/app.xml', data: xmlAppProps },
      { name: 'word/document.xml', data: documentXml },
      { name: 'word/styles.xml', data: DOCX_STYLES_XML },
      { name: 'word/_rels/document.xml.rels', data: DOCX_RELS_DOC }
    ]);
  }

  function reportDocxBlocks() {
    var nam = lastReportMeta.namHoc;
    var blocks = [
      { type: 'h1', text: 'Báo cáo Quỹ Học Bổng' },
      { type: 'p', text: 'Ngày xuất: ' + new Date().toLocaleDateString('vi-VN') +
          '\nSố học sinh: ' + lastReportMeta.count.toLocaleString('vi-VN') +
          '\n' + (nam ? 'Tổng tài trợ năm ' + nam : 'Tổng đã tài trợ (lũy kế)') + ': ' + fmtMoney(lastReportMeta.tong) },
      { type: 'h2', text: 'Danh sách chi tiết' },
      { type: 'table', headers: reportColumns(), rows: lastReportRows.map(reportRowArray) }
    ];
    return blocks;
  }
  document.getElementById('btnExportDocx').addEventListener('click', function(){
    var zip = buildDocx(reportDocxBlocks(), 'Báo cáo học bổng');
    saveDownload(reportFileBase() + '.docx', zip);
  });

  // ---------- PowerPoint (.pptx) export ----------
  var PPTX_EMU_W = 12192000, PPTX_EMU_H = 6858000;
  function pptxTitleXml(text) {
    return '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' +
      '<p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' +
      '<p:spPr><a:xfrm><a:off x="609600" y="365760"/><a:ext cx="10972800" cy="914400"/></a:xfrm></p:spPr>' +
      '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="vi-VN" b="1" sz="3200"><a:solidFill><a:srgbClr val="2F6F62"/></a:solidFill></a:rPr>' +
      '<a:t>' + xmlEsc(text) + '</a:t></a:r></a:p></p:txBody></p:sp>';
  }
  function pptxBulletsXml(bullets) {
    var paras = bullets.map(function(b){
      return '<a:p><a:pPr marL="285750" indent="-285750"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>' +
        '<a:r><a:rPr lang="vi-VN" sz="2000"/><a:t>' + xmlEsc(b) + '</a:t></a:r></a:p>';
    }).join('');
    return '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' +
      '<p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>' +
      '<p:spPr><a:xfrm><a:off x="609600" y="1371600"/><a:ext cx="10972800" cy="5100000"/></a:xfrm></p:spPr>' +
      '<p:txBody><a:bodyPr/><a:lstStyle/>' + paras + '</p:txBody></p:sp>';
  }
  function pptxStatsXml(stats) {
    var n = stats.length, cols = n <= 3 ? n : (n <= 4 ? 4 : 3), gap = 228600, totalW = 10972800;
    var cardW = Math.floor((totalW - gap * (cols - 1)) / cols), cardH = 1600200, startX = 609600, startY = 1600200;
    var shapes = '';
    stats.forEach(function(s, i){
      var col = i % cols, row = Math.floor(i / cols);
      var x = startX + col * (cardW + gap), y = startY + row * (cardH + gap), id = 10 + i;
      shapes += '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="Card' + id + '"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>' +
        '<p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + cardW + '" cy="' + cardH + '"/></a:xfrm>' +
        '<a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="F1EFE7"/></a:solidFill>' +
        '<a:ln><a:solidFill><a:srgbClr val="D9D4C7"/></a:solidFill></a:ln></p:spPr>' +
        '<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/>' +
        '<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="vi-VN" b="1" sz="2400"><a:solidFill><a:srgbClr val="B5791F"/></a:solidFill></a:rPr>' +
        '<a:t>' + xmlEsc(s.value) + '</a:t></a:r></a:p>' +
        '<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="vi-VN" sz="1400"><a:solidFill><a:srgbClr val="5A5648"/></a:solidFill></a:rPr>' +
        '<a:t>' + xmlEsc(s.label) + '</a:t></a:r></a:p></p:txBody></p:sp>';
    });
    return shapes;
  }
  function pptxTableXml(headers, rows) {
    var cols = headers.length, totalW = 10972800, colW = Math.floor(totalW / cols), rowH = 400000;
    function cell(text, isHeader) {
      var fill = isHeader ? '<a:solidFill><a:srgbClr val="2F6F62"/></a:solidFill>' : '<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>';
      var color = isHeader ? 'FFFFFF' : '2A2A28', b = isHeader ? ' b="1"' : '';
      return '<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="vi-VN" sz="1200"' + b + '>' +
        '<a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill></a:rPr><a:t>' + xmlEsc(text) + '</a:t></a:r></a:p></a:txBody>' +
        '<a:tcPr>' + fill + '</a:tcPr></a:tc>';
    }
    var gridCols = '';
    for (var i = 0; i < cols; i++) gridCols += '<a:gridCol w="' + colW + '"/>';
    var trs = '<a:tr h="' + rowH + '">' + headers.map(function(h){ return cell(h, true); }).join('') + '</a:tr>';
    rows.forEach(function(r){ trs += '<a:tr h="' + rowH + '">' + r.map(function(c){ return cell(c, false); }).join('') + '</a:tr>'; });
    return '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="20" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>' +
      '<p:xfrm><a:off x="609600" y="1371600"/><a:ext cx="' + totalW + '" cy="4800600"/></p:xfrm>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">' +
      '<a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>' + gridCols + '</a:tblGrid>' + trs + '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
  }
  function pptxSlideXml(slide) {
    var body = pptxTitleXml(slide.title || '');
    if (slide.bullets) body += pptxBulletsXml(slide.bullets);
    else if (slide.stats) body += pptxStatsXml(slide.stats);
    else if (slide.table) body += pptxTableXml(slide.table.headers, slide.table.rows);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FBFAF6"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
      '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' + body + '</p:spTree></p:cSld>' +
      '<p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>';
  }
  var PPTX_CT_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>';

  function buildPptx(slides, title) {
    var n = slides.length, slideOverrides = '';
    for (var i = 1; i <= n; i++) slideOverrides += '<Override PartName="/ppt/slides/slide' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
    var contentTypes = PPTX_CT_HEAD + slideOverrides + '</Types>';
    var relsRoot = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
    var sldIdLst = '', presRelsSlides = '';
    for (i = 1; i <= n; i++) {
      sldIdLst += '<p:sldId id="' + (255 + i) + '" r:id="rId' + (10 + i) + '"/>';
      presRelsSlides += '<Relationship Id="rId' + (10 + i) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + i + '.xml"/>';
    }
    var presentationXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>' + sldIdLst + '</p:sldIdLst>' +
      '<p:sldSz cx="' + PPTX_EMU_W + '" cy="' + PPTX_EMU_H + '" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>';
    var presRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>' +
      presRelsSlides + '</Relationships>';
    var slideMasterXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FBFAF6"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
      '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' +
      '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' +
      '<p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="vi-VN"/></a:p></p:txBody></p:sp>' +
      '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Body Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' +
      '<p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="vi-VN"/></a:p></p:txBody></p:sp>' +
      '</p:spTree></p:cSld>' +
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>';
    var slideMasterRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>';
    var slideLayoutXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="title" preserve="1">' +
      '<p:cSld name="Title and Content"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' +
      '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' +
      '<p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="vi-VN"/></a:p></p:txBody></p:sp>' +
      '</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sldLayout>';
    var slideLayoutRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>';
    var themeXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="QLHB"><a:themeElements><a:clrScheme name="QLHB">' +
      '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
      '<a:dk2><a:srgbClr val="2A2A28"/></a:dk2><a:lt2><a:srgbClr val="F6F4EF"/></a:lt2>' +
      '<a:accent1><a:srgbClr val="2F6F62"/></a:accent1><a:accent2><a:srgbClr val="B5791F"/></a:accent2>' +
      '<a:accent3><a:srgbClr val="5A5648"/></a:accent3><a:accent4><a:srgbClr val="8FA998"/></a:accent4>' +
      '<a:accent5><a:srgbClr val="D9D4C7"/></a:accent5><a:accent6><a:srgbClr val="E3A94A"/></a:accent6>' +
      '<a:hlink><a:srgbClr val="2F6F62"/></a:hlink><a:folHlink><a:srgbClr val="B5791F"/></a:folHlink></a:clrScheme>' +
      '<a:fontScheme name="QLHB"><a:majorFont><a:latin typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme>' +
      '<a:fmtScheme name="QLHB"><a:fillStyleLst><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:fillStyleLst>' +
      '<a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln></a:lnStyleLst>' +
      '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
      '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="lt2"/></a:solidFill><a:solidFill><a:schemeClr val="lt2"/></a:solidFill><a:solidFill><a:schemeClr val="lt2"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>' +
      '</a:themeElements></a:theme>';
    var files = [
      { name: '[Content_Types].xml', data: contentTypes },
      { name: '_rels/.rels', data: relsRoot },
      { name: 'docProps/core.xml', data: xmlCoreProps(title || 'Báo cáo') },
      { name: 'docProps/app.xml', data: xmlAppProps },
      { name: 'ppt/presentation.xml', data: presentationXml },
      { name: 'ppt/_rels/presentation.xml.rels', data: presRels },
      { name: 'ppt/slideMasters/slideMaster1.xml', data: slideMasterXml },
      { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: slideMasterRels },
      { name: 'ppt/slideLayouts/slideLayout1.xml', data: slideLayoutXml },
      { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: slideLayoutRels },
      { name: 'ppt/theme/theme1.xml', data: themeXml }
    ];
    slides.forEach(function(s, idx){ files.push({ name: 'ppt/slides/slide' + (idx + 1) + '.xml', data: pptxSlideXml(s) }); });
    return buildZip(files);
  }

  function reportPptxSlides() {
    var nam = lastReportMeta.namHoc;
    var byTinh = {}, byPhuTrach = {};
    lastReportRows.forEach(function(r){
      var kt = r.tinh || 'Chưa xác định'; byTinh[kt] = (byTinh[kt]||0) + 1;
      var kp = r.phutrach || 'Chưa rõ'; byPhuTrach[kp] = (byPhuTrach[kp]||0) + 1;
    });
    var topTinh = Object.keys(byTinh).map(function(k){ return [k, byTinh[k]]; }).sort(function(a,b){ return b[1]-a[1]; }).slice(0, 8);
    var topPhuTrach = Object.keys(byPhuTrach).map(function(k){ return [k, byPhuTrach[k]]; }).sort(function(a,b){ return b[1]-a[1]; }).slice(0, 8);
    var slides = [
      { title: 'Báo cáo Quỹ Học Bổng', stats: [
        { label: 'Học sinh khớp bộ lọc', value: lastReportMeta.count.toLocaleString('vi-VN') },
        { label: (nam ? 'Tổng tài trợ năm ' + nam : 'Tổng đã tài trợ'), value: fmtMoney(lastReportMeta.tong) },
        { label: 'Ngày xuất báo cáo', value: new Date().toLocaleDateString('vi-VN') }
      ] },
      { title: 'Theo tỉnh/thành', table: { headers: ['Tỉnh/Thành', 'Số học sinh'], rows: topTinh.map(function(e){ return [e[0], String(e[1])]; }) } },
      { title: 'Theo người phụ trách', table: { headers: ['Người phụ trách', 'Số học sinh'], rows: topPhuTrach.map(function(e){ return [e[0], String(e[1])]; }) } }
    ];
    var sample = lastReportRows.slice(0, 12);
    if (sample.length) {
      slides.push({ title: 'Danh sách chi tiết' + (lastReportRows.length > 12 ? ' (12 / ' + lastReportRows.length + ')' : ''),
        table: { headers: ['Họ tên', 'Tỉnh/Thành', 'Cấp học', 'Người phụ trách'], rows: sample.map(function(r){ return [r.ho_ten, r.tinh, r.cap, r.phutrach]; }) } });
    }
    return slides;
  }
  document.getElementById('btnExportPptx').addEventListener('click', function(){
    var zip = buildPptx(reportPptxSlides(), 'Báo cáo học bổng');
    saveDownload(reportFileBase() + '.pptx', zip);
  });

  // ---------- PDF export (standalone HTML → user prints/saves as PDF in their own browser) ----------
  var REPORT_SHEET_CSS =
    '.doc-sheet h1{font-size:19px;margin:0 0 2px;}' +
    '.doc-sheet .meta{color:#555;font-size:11px;margin-bottom:14px;}' +
    '.doc-sheet table{width:100%;border-collapse:collapse;font-size:10.5px;}' +
    '.doc-sheet th,.doc-sheet td{border:1px solid #ccc;padding:5px 7px;text-align:left;}' +
    '.doc-sheet th{background:#eee;}' +
    '.doc-sheet .psummary{display:flex;gap:22px;margin-bottom:16px;}' +
    '.doc-sheet .psummary div b{display:block;font-size:15px;}';

  document.getElementById('btnExportPdf').addEventListener('click', function(){
    var nam = lastReportMeta.namHoc;
    var rowsHtml = lastReportRows.map(function(r){
      return '<tr><td>' + esc(r.ho_ten) + '</td><td>' + esc(r.tinh) + '</td><td>' + esc(r.cap) + '</td><td>' + esc(r.phutrach) + '</td>' +
        '<td>' + esc(r.hocluc) + '</td><td>' + esc(r.trangthai) + '</td><td>' + fmtMoney(nam ? (r.tienNam||0) : r.tongtien) + '</td></tr>';
    }).join('');
    var inner = '<h1>Báo cáo Quỹ Học Bổng</h1>' +
      '<div class="meta">Ngày xuất: ' + esc(new Date().toLocaleDateString('vi-VN')) + (nam ? ' · Năm học: ' + esc(nam) : '') + '</div>' +
      '<div class="psummary"><div>Số học sinh<b>' + lastReportMeta.count.toLocaleString('vi-VN') + '</b></div>' +
      '<div>' + (nam ? 'Tổng tài trợ năm ' + esc(nam) : 'Tổng đã tài trợ') + '<b>' + fmtMoney(lastReportMeta.tong) + '</b></div></div>' +
      '<table><thead><tr><th>Họ tên</th><th>Tỉnh/Thành</th><th>Cấp học</th><th>Người phụ trách</th><th>Học lực</th><th>Học bổng</th><th>Tiền tài trợ</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table>';
    var html = standalonePrintableHtml('Báo cáo Quỹ Học Bổng', inner, REPORT_SHEET_CSS);
    saveDownload(reportFileBase() + '.html', html,
      'Đã tải file — mở file vừa tải và bấm "In / Lưu thành PDF" để xuất PDF.');
  });

  // ---------- per-student profile PDF (standalone HTML → user prints/saves as PDF) ----------
  var PROFILE_SHEET_CSS =
    '.profile-sheet .phead{display:flex;gap:18px;align-items:flex-start;border-bottom:2px solid #2F6F62;padding-bottom:12px;margin-bottom:16px;}' +
    '.profile-sheet .pphoto{width:108px;height:140px;object-fit:cover;border:1px solid #ccc;border-radius:4px;flex-shrink:0;}' +
    '.profile-sheet .pphoto.placeholder{display:flex;align-items:center;justify-content:center;text-align:center;font-size:10.5px;color:#888;background:#f0f0f0;}' +
    '.profile-sheet h1{font-size:22px;margin:4px 0 6px;}' +
    '.profile-sheet .psub{color:#555;font-size:11.5px;line-height:1.6;}' +
    '.profile-sheet .pinfo{display:grid;grid-template-columns:140px 1fr 140px 1fr;gap:7px 10px;font-size:12px;margin-bottom:18px;align-items:baseline;}' +
    '.profile-sheet .pinfo .k{color:#777;font-size:10px;text-transform:uppercase;letter-spacing:.02em;}' +
    '.profile-sheet .pinfo .v{font-size:12.5px;}' +
    '.profile-sheet .pinfo .v.wide{grid-column:2 / span 3;}' +
    '.profile-sheet .psection{font-weight:700;font-size:13px;margin:4px 0 8px;color:#2F6F62;}' +
    '.profile-sheet table{width:100%;border-collapse:collapse;font-size:10.5px;}' +
    '.profile-sheet th,.profile-sheet td{border:1px solid #ccc;padding:5px 7px;text-align:left;}' +
    '.profile-sheet th{background:#eee;}' +
    '.profile-sheet .ptotal{margin-top:14px;font-size:13.5px;font-weight:bold;text-align:right;}' +
    '.profile-sheet .pfoot{margin-top:26px;color:#888;font-size:10px;text-align:right;}';

  function buildProfileSheetHtml(s, sems) {
    var total = sems.reduce(function(sum, sm){ return sum + (Number(sm.tien_hki)||0) + (Number(sm.tien_hkii)||0); }, 0);
    var photoHtml = s.anh ? '<img class="pphoto" src="' + s.anh + '" alt="Ảnh học sinh" />' :
      '<div class="pphoto placeholder">Chưa có<br/>ảnh</div>';
    var ngaySinhText = s.ngay_sinh ? new Date(s.ngay_sinh).toLocaleDateString('vi-VN') : (s.ngay_sinh_goc || '—');
    var infoPairs = [
      ['Ngày sinh', ngaySinhText], ['Người phụ trách', s.nguoi_phu_trach || '—'],
      ['Tên cha', s.ten_cha || '—'], ['Tên mẹ', s.ten_me || '—'],
      ['Tỉnh/Thành', s.tinh_chuan_hoa || s.tinh_goc || '—'], ['Cấp học', s.cap_hoc || '—']
    ];
    var infoHtml = infoPairs.map(function(p){
      return '<div class="k">' + esc(p[0]) + '</div><div class="v">' + esc(p[1]) + '</div>';
    }).join('');
    infoHtml += '<div class="k">Địa chỉ</div><div class="v wide">' + esc(s.dia_chi || '—') + '</div>';
    infoHtml += '<div class="k">Trường</div><div class="v wide">' + esc(s.truong || '—') + '</div>';
    if (s.hoan_canh) infoHtml += '<div class="k">Hoàn cảnh gia đình</div><div class="v wide">' + esc(s.hoan_canh) + '</div>';
    if (s.ghi_chu) infoHtml += '<div class="k">Ghi chú</div><div class="v wide">' + esc(s.ghi_chu) + '</div>';

    var sortedSems = sems.slice().sort(function(a,b){ return a.nam_hoc < b.nam_hoc ? -1 : 1; });
    var semRowsHtml = sortedSems.map(function(sm){
      var tt = sm.trang_thai_hb === 'Có' ? 'Đang nhận' : (sm.trang_thai_hb === 'Không' ? 'Không nhận' : '—');
      return '<tr><td>' + esc(sm.nam_hoc) + '</td><td>' + esc(sm.lop || '—') + '</td>' +
        '<td>' + esc(sm.hoc_luc_hki || '—') + '</td><td>' + esc(sm.hoc_luc_hkii || '—') + '</td>' +
        '<td>' + fmtMoney(sm.tien_hki||0) + '</td><td>' + fmtMoney(sm.tien_hkii||0) + '</td><td>' + tt + '</td></tr>';
    }).join('') || '<tr><td colspan="7" style="text-align:center;color:#888;">Chưa có dữ liệu học kỳ</td></tr>';

    return '<div class="profile-sheet">' +
      '<div class="phead">' + photoHtml +
      '<div><h1>' + esc(s.ho_ten || '(chưa có tên)') + '</h1>' +
      '<div class="psub">Mã học sinh: ' + esc(s.sid) + '<br/>Ngày xuất hồ sơ: ' + esc(new Date().toLocaleDateString('vi-VN')) + '</div></div>' +
      '</div>' +
      '<div class="pinfo">' + infoHtml + '</div>' +
      '<div class="psection">Kết quả học tập &amp; tài trợ theo năm học</div>' +
      '<table><thead><tr><th>Năm học</th><th>Lớp</th><th>Học lực HKI</th><th>Học lực HKII</th>' +
      '<th>Tiền HKI</th><th>Tiền HKII</th><th>Học bổng</th></tr></thead><tbody>' + semRowsHtml + '</tbody></table>' +
      '<div class="ptotal">Tổng cộng đã tài trợ: ' + fmtMoney(total) + '</div>' +
      '<div class="pfoot">Sổ Học Bổng — hồ sơ tài trợ học sinh</div>' +
      '</div>';
  }

  function exportStudentProfilePdf(s, sems) {
    var inner = buildProfileSheetHtml(s, sems);
    var html = standalonePrintableHtml('Hồ sơ - ' + (s.ho_ten || s.sid), inner, PROFILE_SHEET_CSS);
    saveDownload('HoSo_' + s.sid + '.html', html,
      'Đã tải file — mở file vừa tải và bấm "In / Lưu thành PDF" để xuất PDF.');
  }

  // ---------- delete (backend API) ----------
  function deleteStudentOnServer(sid, successMsg) {
    apiFetch('/students/' + encodeURIComponent(sid), { method: 'DELETE' })
      .then(function(){ return refreshBootstrap(); })
      .then(function(){ toast(successMsg); closeDrawer(); })
      .catch(function(err){ toast('Không xóa được: ' + (err && err.message ? err.message : 'lỗi không xác định')); });
  }

  // ---------- users admin panel ----------
  var ROLE_LABELS = { admin: 'Quản trị', editor: 'Biên tập', viewer: 'Chỉ xem' };

  function renderUsersPanel() {
    var wrap = document.getElementById('usersTableWrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="reportnote">Đang tải...</div>';
    apiFetch('/users').then(function(res){
      var users = res.users || res;
      wrap.innerHTML = '<table class="datatable"><thead><tr>' +
        '<th>Tên đăng nhập</th><th>Họ tên</th><th>Vai trò</th><th>Phạm vi</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th></th>' +
        '</tr></thead><tbody>' +
        users.map(function(u){
          return '<tr data-id="' + u.id + '">' +
            '<td>' + esc(u.username) + '</td>' +
            '<td>' + esc(u.full_name || '') + '</td>' +
            '<td>' + esc(ROLE_LABELS[u.role] || u.role) + '</td>' +
            '<td>' + esc(u.scope_phu_trach || 'Tất cả') + '</td>' +
            '<td>' + (u.active ? 'Đang hoạt động' : '<span style="color:var(--danger,#c0392b)">Đã khóa</span>') + '</td>' +
            '<td>' + esc(u.last_login || '—') + '</td>' +
            '<td><button class="btn small ghost btn-edit-user" data-id="' + u.id + '">Sửa</button> ' +
            '<button class="btn small danger btn-del-user" data-id="' + u.id + '">Xóa</button></td>' +
            '</tr>';
        }).join('') + '</tbody></table>';
      wrap.querySelectorAll('.btn-edit-user').forEach(function(btn){
        btn.addEventListener('click', function(){
          var u = users.find(function(x){ return String(x.id) === btn.dataset.id; });
          if (u) openUserDrawer(u);
        });
      });
      wrap.querySelectorAll('.btn-del-user').forEach(function(btn){
        btn.addEventListener('click', function(){
          var u = users.find(function(x){ return String(x.id) === btn.dataset.id; });
          if (!u) return;
          if (!confirm('Xóa tài khoản "' + u.username + '"? Không thể hoàn tác.')) return;
          apiFetch('/users/' + u.id, { method: 'DELETE' })
            .then(function(){ toast('Đã xóa tài khoản ' + u.username); renderUsersPanel(); })
            .catch(function(err){ toast('Không xóa được: ' + err.message); });
        });
      });
    }).catch(function(err){
      wrap.innerHTML = '<div class="reportnote">Không tải được danh sách người dùng: ' + esc(err.message) + '</div>';
    });
  }

  function userDrawerTemplate(u) {
    var isNew = !u;
    var phuTrachList = (DATA.lookups.phutrach || []);
    return '<div class="drawer-head"><div><h2>' + (isNew ? 'Thêm người dùng' : 'Sửa người dùng — ' + esc(u.username)) + '</h2></div>' +
      '<button class="close-x" id="drawerClose" aria-label="Đóng">×</button></div>' +
      fieldRow('Tên đăng nhập', '<input type="text" id="u_username" ' + (isNew ? '' : 'disabled') + ' value="' + esc(u ? u.username : '') + '" placeholder="vd: coord_an" />') +
      fieldRow('Họ tên', '<input type="text" id="u_fullname" value="' + esc(u ? (u.full_name || '') : '') + '" />') +
      fieldRow('Vai trò', '<select id="u_role">' +
        ['admin', 'editor', 'viewer'].map(function(r){ return '<option value="' + r + '"' + (u && u.role === r ? ' selected' : '') + '>' + ROLE_LABELS[r] + '</option>'; }).join('') +
        '</select>') +
      fieldRow('Chỉ phụ trách khu vực/nhóm (để trống = xem tất cả)', '<select id="u_scope"><option value="">— Tất cả —</option>' +
        phuTrachList.map(function(p){ return '<option value="' + esc(p) + '"' + (u && u.scope_phu_trach === p ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') +
        '</select>') +
      fieldRow(isNew ? 'Mật khẩu' : 'Đặt lại mật khẩu (để trống nếu không đổi)', '<input type="password" id="u_password" autocomplete="new-password" placeholder="ít nhất 8 ký tự" />') +
      (isNew ? '' : fieldRow('Trạng thái', '<label style="font-weight:400;"><input type="checkbox" id="u_active" ' + (u.active ? 'checked' : '') + ' /> Đang hoạt động (bỏ chọn để khóa tài khoản)</label>')) +
      '<div class="drawer-actions">' +
      '<button class="btn ghost" id="btnCancelUser">Hủy</button>' +
      '<button class="btn primary" id="btnSaveUser">Lưu</button>' +
      '</div>';
  }

  function openUserDrawer(u) {
    drawer.innerHTML = userDrawerTemplate(u);
    document.getElementById('drawerClose').addEventListener('click', closeDrawer);
    document.getElementById('btnCancelUser').addEventListener('click', closeDrawer);
    document.getElementById('btnSaveUser').addEventListener('click', function(){
      var payload = {
        full_name: document.getElementById('u_fullname').value.trim(),
        role: document.getElementById('u_role').value,
        scope_phu_trach: document.getElementById('u_scope').value || null
      };
      var pw = document.getElementById('u_password').value;
      if (pw) payload.password = pw;
      var btn = document.getElementById('btnSaveUser');
      var chain;
      if (u) {
        var activeEl = document.getElementById('u_active');
        if (activeEl) payload.active = activeEl.checked;
        chain = apiFetch('/users/' + u.id, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        payload.username = document.getElementById('u_username').value.trim();
        if (!payload.username) { toast('Vui lòng nhập tên đăng nhập.'); return; }
        if (!pw) { toast('Vui lòng đặt mật khẩu cho tài khoản mới.'); return; }
        chain = apiFetch('/users', { method: 'POST', body: JSON.stringify(payload) });
      }
      if (btn) { btn.disabled = true; btn.textContent = 'Đang lưu...'; }
      chain.then(function(){
        toast(u ? 'Đã cập nhật tài khoản.' : 'Đã tạo tài khoản mới.');
        closeDrawer();
        renderUsersPanel();
      }).catch(function(err){
        toast('Không lưu được: ' + err.message);
      }).finally(function(){ if (btn) { btn.disabled = false; btn.textContent = 'Lưu'; } });
    });
    overlay.classList.add('open');
  }

  var btnAddUser = document.getElementById('btnAddUser');
  if (btnAddUser) btnAddUser.addEventListener('click', function(){ openUserDrawer(null); });

  // ---------- change password ----------
  function changePasswordDrawerTemplate(force) {
    return '<div class="drawer-head"><div><h2>Đổi mật khẩu</h2>' +
      (force ? '<div class="meta">Đây là lần đăng nhập đầu tiên — vui lòng đặt mật khẩu mới trước khi tiếp tục.</div>' : '') + '</div>' +
      (force ? '' : '<button class="close-x" id="drawerClose" aria-label="Đóng">×</button>') + '</div>' +
      (force ? '' : fieldRow('Mật khẩu hiện tại', '<input type="password" id="cp_old" autocomplete="current-password" />')) +
      fieldRow('Mật khẩu mới', '<input type="password" id="cp_new" autocomplete="new-password" placeholder="ít nhất 8 ký tự" />') +
      fieldRow('Nhập lại mật khẩu mới', '<input type="password" id="cp_confirm" autocomplete="new-password" />') +
      '<div class="drawer-actions">' +
      (force ? '' : '<button class="btn ghost" id="btnCancelCp">Hủy</button>') +
      '<button class="btn primary" id="btnSaveCp">Đổi mật khẩu</button>' +
      '</div>';
  }

  function openChangePasswordModal(force) {
    drawer.innerHTML = changePasswordDrawerTemplate(force);
    if (!force) {
      document.getElementById('drawerClose').addEventListener('click', closeDrawer);
      document.getElementById('btnCancelCp').addEventListener('click', closeDrawer);
    }
    document.getElementById('btnSaveCp').addEventListener('click', function(){
      var newPw = document.getElementById('cp_new').value;
      var confirmPw = document.getElementById('cp_confirm').value;
      if (newPw.length < 8) { toast('Mật khẩu mới cần ít nhất 8 ký tự.'); return; }
      if (newPw !== confirmPw) { toast('Mật khẩu nhập lại không khớp.'); return; }
      var payload = { new_password: newPw };
      var oldEl = document.getElementById('cp_old');
      if (oldEl) payload.old_password = oldEl.value;
      var btn = document.getElementById('btnSaveCp');
      if (btn) { btn.disabled = true; btn.textContent = 'Đang lưu...'; }
      apiFetch('/me/change_password', { method: 'POST', body: JSON.stringify(payload) })
        .then(function(){
          toast('Đã đổi mật khẩu.');
          if (CURRENT_USER) CURRENT_USER.must_change_password = false;
          closeDrawer();
        })
        .catch(function(err){ toast('Không đổi được mật khẩu: ' + err.message); })
        .finally(function(){ if (btn) { btn.disabled = false; btn.textContent = 'Đổi mật khẩu'; } });
    });
    overlay.classList.add('open');
  }

  var btnChangePassword = document.getElementById('btnChangePassword');
  if (btnChangePassword) btnChangePassword.addEventListener('click', function(){ openChangePasswordModal(false); });
  var btnLogout = document.getElementById('btnLogout');
  if (btnLogout) btnLogout.addEventListener('click', logout);

  // ---------- init ----------
  wireLoginForm();
  boot();
