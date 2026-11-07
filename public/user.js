'use strict';
const $ = (id) => document.getElementById(id);
let mode = 'login';
let me = null;
let countdownTimer = null;
function toast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2600); }
async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || '요청을 처리하지 못했습니다.');
  return data;
}
function setMode(next) { mode = next; $('loginTab').classList.toggle('active', mode === 'login'); $('registerTab').classList.toggle('active', mode === 'register'); $('authSubmit').textContent = mode === 'login' ? '로그인' : '회원가입'; $('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password'; }
$('loginTab').addEventListener('click', () => setMode('login'));
$('registerTab').addEventListener('click', () => setMode('register'));
$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api(mode === 'login' ? '/api/auth/login' : '/api/auth/register', { method: 'POST', body: JSON.stringify({ username: $('username').value.trim(), password: $('password').value }) });
    if (mode === 'register') { toast('회원가입이 완료되었습니다. 로그인해 주세요.'); setMode('login'); return; }
    if (data.user.role === 'ADMIN') { location.href = '/admin'; return; }
    me = data.user; $('password').value = ''; await showApp();
  } catch (err) { toast(err.message); }
});
async function boot() {
  try { const data = await api('/api/me'); if (data.user.role === 'ADMIN') { location.href = '/admin'; return; } me = data.user; await showApp(data); }
  catch { $('authView').classList.remove('hidden'); $('appView').classList.add('hidden'); $('chatFab').classList.add('hidden'); }
}
async function showApp(initial) {
  $('authView').classList.add('hidden'); $('appView').classList.remove('hidden'); $('chatFab').classList.remove('hidden');
  $('userBadge').textContent = me.username;
  await refreshDashboard(initial); await loadAnnouncements(); await loadTasks(); await loadChat();
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(updateCountdown, 1000);
}
function updateCountdown() {
  const expiry = me && me.license && me.license.expires_at ? new Date(me.license.expires_at).getTime() : 0;
  if (!expiry || me.license.status !== 'REDEEMED' || expiry <= Date.now()) { $('licenseCountdown').textContent = '0일 00:00:00'; $('statDays').textContent = '0일'; $('licenseStatus').textContent = expiry ? '만료' : '미등록'; $('licenseStatus').className = 'badge warn'; return; }
  let ms = expiry - Date.now(); const days = Math.floor(ms / 86400000); ms %= 86400000; const hours = Math.floor(ms / 3600000); ms %= 3600000; const mins = Math.floor(ms / 60000); ms %= 60000; const secs = Math.floor(ms / 1000);
  $('licenseCountdown').textContent = `${days}일 ${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  $('statDays').textContent = `${days}일`; $('licenseStatus').textContent = '사용 중'; $('licenseStatus').className = 'badge good';
}
async function refreshDashboard() {
  try {
    const data = await api('/api/me'); me = data.user; me.license = data.license; me.stats = data.stats;
    $('statTotal').textContent = data.stats.total ?? 0; $('statCompleted').textContent = data.stats.completed ?? 0; $('statRunning').textContent = data.stats.running ?? 0;
    $('licenseDetail').innerHTML = data.license ? `<div class="license-box"><div><div class="small muted">라이선스 코드</div><strong>${escapeHtml(data.license.code_hint)}</strong><div class="small muted" style="margin-top:6px">만료일: ${fmt(data.license.expires_at)}</div></div><span class="badge ${data.license.status === 'REDEEMED' ? 'good' : 'warn'}">${data.license.status === 'REDEEMED' ? '활성' : data.license.status}</span></div>` : '<div class="empty">등록된 라이선스가 없습니다.</div>';
    $('accountDetails').innerHTML = `<div class="split"><div><div class="small muted">회원 아이디</div><strong>${escapeHtml(data.user.username)}</strong></div><div><div class="small muted">회원 유형</div><strong>일반 회원</strong></div><div><div class="small muted">가입일</div><strong>${fmt(data.user.created_at)}</strong></div><div><div class="small muted">라이선스 만료</div><strong>${fmt(data.license?.expires_at)}</strong></div></div>`;
    updateCountdown();
  } catch (err) { toast(err.message); }
}
function fmt(value) { if (!value) return '-'; return new Date(value).toLocaleString('ko-KR'); }
function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function showPage(name) { document.querySelectorAll('.page').forEach(x => x.classList.add('hidden')); const page = $('page-' + name); if (page) page.classList.remove('hidden'); document.querySelectorAll('[data-page]').forEach(x => x.classList.toggle('active', x.dataset.page === name)); $('pageTitle').textContent = ({dashboard:'대시보드',tasks:'작업 관리',license:'라이선스',announcements:'공지사항',account:'내 계정'})[name] || '대시보드'; if (name === 'tasks') loadTasks(); if (name === 'announcements') loadAnnouncements(); }
document.querySelectorAll('[data-page]').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.goto)));
$('collapseBtn').addEventListener('click', () => { $('sidebar').classList.toggle('collapsed'); $('collapseBtn').textContent = $('sidebar').classList.contains('collapsed') ? '⇥' : '⇤　메뉴 접기'; });
$('mobileMenu').addEventListener('click', () => $('sidebar').classList.toggle('mobile-open'));
$('themeBtn').addEventListener('click', () => { document.body.classList.toggle('light'); localStorage.setItem('krsms-theme', document.body.classList.contains('light') ? 'light' : 'dark'); });
if (localStorage.getItem('krsms-theme') === 'light') document.body.classList.add('light');
$('logoutBtn').addEventListener('click', async () => { try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch {} location.reload(); });
$('redeemBtn').addEventListener('click', async () => { const code = $('redeemCode').value.trim(); if (!code) return toast('라이선스 코드를 입력해 주세요.'); try { await api('/api/licenses/redeem', { method: 'POST', body: JSON.stringify({ code }) }); $('redeemCode').value = ''; toast('라이선스가 등록되었습니다.'); await refreshDashboard(); } catch (err) { toast(err.message); } });
$('taskForm').addEventListener('submit', async (e) => { e.preventDefault(); const phone = $('phone').value.replace(/\D/g, ''); const durationMinutes = Number($('duration').value); if (!$('consent').checked) return toast('번호 사용 권한 확인에 동의해 주세요.'); try { await api('/api/tasks', { method: 'POST', body: JSON.stringify({ phone, durationMinutes, consent: true }) }); toast('작업이 등록되었습니다.'); $('taskForm').reset(); $('duration').value = 5; await loadTasks(); await refreshDashboard(); } catch (err) { toast(err.message); } });
$('phone').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g,'').slice(0,11); });
function renderTasks(items, target) { if (!items.length) { target.innerHTML = '<div class="empty">등록된 작업이 없습니다.</div>'; return; } target.innerHTML = `<div class="table-wrap"><table><thead><tr><th>휴대전화</th><th>작업 시간</th><th>상태</th><th>등록일</th><th>종료 예정</th><th></th></tr></thead><tbody>${items.map(t => `<tr><td>${escapeHtml(t.phone)}</td><td>${t.duration_minutes}분</td><td><span class="badge ${t.status==='COMPLETED'?'good':t.status==='STOPPED'?'bad':'warn'}">${statusKo(t.status)}</span></td><td>${fmt(t.created_at)}</td><td>${fmt(t.ends_at)}</td><td>${['PENDING','RUNNING'].includes(t.status)?`<button class="table-action" data-stop="${t.id}">중지</button>`:''}</td></tr>`).join('')}</tbody></table></div>`; target.querySelectorAll('[data-stop]').forEach(b => b.addEventListener('click', async () => { try { await api(`/api/tasks/${b.dataset.stop}/stop`, { method: 'POST', body: '{}' }); toast('작업이 중지되었습니다.'); loadTasks(); } catch(err) { toast(err.message); } })); }
function statusKo(s) { return ({NOT_CONFIGURED:'연동 대기',PENDING:'대기',RUNNING:'진행 중',COMPLETED:'완료',EXPIRED:'시간 만료',STOPPED:'중지',FAILED:'실패'})[s] || s; }
async function loadTasks() { try { const data = await api('/api/tasks'); renderTasks(data.tasks, $('allTasks')); renderTasks(data.tasks.slice(0,5), $('recentTasks')); } catch (err) { $('allTasks').textContent = err.message; } }
$('refreshTasks').addEventListener('click', loadTasks);
async function loadAnnouncements() { try { const data = await api('/api/announcements'); const items = data.announcements; $('tickerText').textContent = items.length ? items.map(x => `${x.title} — ${x.body}`).join('　　●　　') : '등록된 공지사항이 없습니다.'; $('announcementList').innerHTML = items.length ? items.map(x => `<div style="padding:14px 0;border-bottom:1px solid var(--line)"><div class="row between"><strong>${escapeHtml(x.title)}</strong><span class="small muted">${fmt(x.created_at)}</span></div><p class="muted small">${escapeHtml(x.body)}</p></div>`).join('') : '<div class="empty">등록된 공지사항이 없습니다.</div>'; } catch {} }
$('chatFab').addEventListener('click', async () => { $('chatPanel').classList.add('open'); await loadChat(); });
$('chatClose').addEventListener('click', () => $('chatPanel').classList.remove('open'));
$('chatForm').addEventListener('submit', async e => { e.preventDefault(); const message = $('chatInput').value.trim(); if (!message) return; try { await api('/api/support/messages', { method: 'POST', body: JSON.stringify({ message }) }); $('chatInput').value = ''; await loadChat(); } catch(err) { toast(err.message); } });
async function loadChat() { try { const data = await api('/api/support/messages'); $('chatMessages').innerHTML = data.messages.length ? data.messages.map(m => `<div class="bubble ${m.sender_role==='USER'?'mine':''}"><div class="sender">${m.sender_role==='ADMIN'?'상담원':'나'}</div>${escapeHtml(m.message)}<div class="small muted" style="margin-top:5px">${fmt(m.created_at)}</div></div>`).join('') : '<div class="empty">상담 메시지가 없습니다. 문의 내용을 남겨 주세요.</div>'; $('chatMessages').scrollTop = $('chatMessages').scrollHeight; } catch {} }
setInterval(() => { if ($('chatPanel').classList.contains('open') && me) loadChat(); }, 5000);
boot();
