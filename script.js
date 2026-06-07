/* ═══════════════════════════════════════════════
   DLMS v2 — script.js
   Production-ready SPA
═══════════════════════════════════════════════ */

'use strict';

// ─── CONFIG ────────────────────────────────────────────────────────────────
const CFG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbxtK-anMghpiAzNHgX-prdvCd__gMs_sywWh39a-uujDuXK8rGde65Kpjq9Ub5OmTM/exec',
  CACHE_TTL: 10 * 60 * 1000,
  CENTERS: ['ศูนย์วิจัยไร่สาม','ศูนย์ปรับปรุงพันธุ์สัตว์น้ำหาดเจ้า','ศูนย์วิจัยหาดเจ้า','ศูนย์วิจัยหัวกุญแจ','ศูนย์วิจัยเพชรบุรี'],
  CENTER_SHORT: {
    'ศูนย์วิจัยไร่สาม':'ไร่สาม',
    'ศูนย์ปรับปรุงพันธุ์สัตว์น้ำหาดเจ้า':'ปรับปรุงฯ',
    'ศูนย์วิจัยหาดเจ้า':'หาดเจ้า',
    'ศูนย์วิจัยหัวกุญแจ':'หัวกุญแจ',
    'ศูนย์วิจัยเพชรบุรี':'เพชรบุรี',
  },
};

// ─── STATE ─────────────────────────────────────────────────────────────────
const S = {
  page: 'dashboard',
  subPage: null,
  filterStatus: '',
  filterCenter: '',
  filterLicType: '',
  empList: [],
  licList: [],
  dashData: null,
  centerData: null,
  empDetail: null,
  notifList: [],
  reportData: null,
  sidebarOpen: false,
  cache: {},
  charts: {},
};

// ─── UTILS ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const qs = (sel, ctx = document) => ctx.querySelector(sel);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fdate(d) {
  if (!d || d === '-' || d === '' || d === 'undefined') return '-';
  try {
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d)) {
      const [dd, mm, yy] = d.split('/').map(Number);
      return `${String(dd).padStart(2,'0')}/${String(mm).padStart(2,'0')}/${yy}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [yy, mm, dd] = d.split('-').map(Number);
      return `${String(dd).padStart(2,'0')}/${String(mm).padStart(2,'0')}/${yy}`;
    }
    if (d.includes('T')) {
      const [yy, mm, dd] = d.split('T')[0].split('-').map(Number);
      return `${String(dd).padStart(2,'0')}/${String(mm).padStart(2,'0')}/${yy}`;
    }
    return d;
  } catch { return d; }
}

function daysLeft(d) {
  if (!d) return null;
  try {
    const now = new Date(); now.setHours(0,0,0,0);
    let exp;
    if (d.includes('T')) exp = new Date(d.split('T')[0]);
    else if (/\d{4}-\d{2}-\d{2}/.test(d)) exp = new Date(d);
    else if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(d)) {
      const [dd,mm,yy] = d.split('/'); exp = new Date(+yy, +mm-1, +dd);
    } else return null;
    exp.setHours(0,0,0,0);
    return Math.floor((exp - now) / 86400000);
  } catch { return null; }
}

function getStatus(days) {
  if (days === null) return 'normal';
  if (days < 0)    return 'expired';
  if (days <= 15)  return '15d';
  if (days <= 30)  return '30d';
  if (days <= 45)  return '45d';
  return 'normal';
}

const STATUS_CFG = {
  normal:  { cls: 's-normal',  bg: '#DCFCE7', border: '#86EFAC', dot: '#16A34A', label: 'ปกติ',     barColor: '#16A34A' },
  '45d':   { cls: 's-45d',    bg: '#FEF3C7', border: '#FCD34D', dot: '#D97706', label: '45 วัน',  barColor: '#D97706' },
  '30d':   { cls: 's-30d',    bg: '#FED7AA', border: '#FDBA74', dot: '#EA580C', label: '30 วัน',  barColor: '#EA580C' },
  '15d':   { cls: 's-15d',    bg: '#FEE2E2', border: '#FCA5A5', dot: '#DC2626', label: '15 วัน',  barColor: '#DC2626' },
  expired: { cls: 's-expired', bg: '#FEE2E2', border: '#F87171', dot: '#991B1B', label: 'หมดอายุ', barColor: '#991B1B' },
};

function badge(status, days, sm = false) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.normal;
  const lbl = (days !== undefined && days !== null)
    ? (days < 0 ? `เกิน ${Math.abs(days)} วัน` : days === 0 ? 'วันนี้!' : `${days} วัน`)
    : cfg.label;
  return `<span class="badge ${cfg.cls}${sm ? ' badge-sm' : ''}"><span class="badge-dot"></span>${lbl}</span>`;
}

function spinner(text = 'กำลังโหลด...') {
  return `<div class="spinner-wrap"><div class="spinner"></div><span class="spinner-text">${text}</span></div>`;
}

function empty(text = 'ไม่มีข้อมูล', icon = '📭') {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><div class="empty-text">${text}</div></div>`;
}

function today() {
  return new Date().toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// ─── API ───────────────────────────────────────────────────────────────────
async function api(action, params = {}) {
  const key = action + JSON.stringify(params);
  const now = Date.now();
  if (S.cache[key] && now - S.cache[key].t < CFG.CACHE_TTL) return S.cache[key].d;
  const url = new URL(CFG.GAS_URL);
  url.searchParams.set('action', action);
  url.searchParams.set('params', JSON.stringify(params));
  const res = await fetch(url.toString(), { redirect: 'follow' });
  const json = await res.json();
  if (!json.ok) throw new Error(json.message || 'API Error');
  S.cache[key] = { d: json.data, t: now };
  return json.data;
}

function clearCache() { S.cache = {}; }

// ─── NAV ───────────────────────────────────────────────────────────────────
const PAGES = [
  { id: 'dashboard', icon: '🏠', label: 'หน้าหลัก' },
  { id: 'employees', icon: '👥', label: 'พนักงาน' },
  { id: 'reports',   icon: '📊', label: 'รายงาน' },
  { id: 'notifs',    icon: '🔔', label: 'แจ้งเตือน' },
  { id: 'settings',  icon: '⚙️', label: 'ตั้งค่า' },
  { id: 'executive', icon: '📈', label: 'ภาพรวมผู้บริหาร' },
];

const PAGE_TITLES = {
  dashboard: 'หน้าหลัก', employees: 'รายชื่อพนักงาน',
  reports: 'รายงาน', notifs: 'การแจ้งเตือน',
  settings: 'ตั้งค่า', executive: 'ภาพรวมผู้บริหาร',
  empDetail: 'รายละเอียดพนักงาน',
};

function renderNav() {
  const bnav = $('bottom-nav');
  bnav.innerHTML = PAGES.map(p => `
    <button class="nav-item ${S.page === p.id ? 'active' : ''}" onclick="go('${p.id}')">
      <span class="nav-icon">${p.icon}</span>
      <span class="nav-label">${p.label}</span>
    </button>`).join('');

  const snav = $('sidebar-nav');
  snav.innerHTML = PAGES.map(p => `
    <button class="sidebar-item ${S.page === p.id ? 'active' : ''}" onclick="go('${p.id}');closeSidebar()">
      <span class="sidebar-item-icon">${p.icon}</span>${p.label}
    </button>`).join('');

  $('page-title').textContent = PAGE_TITLES[S.subPage || S.page] || 'DLMS';
  $('today-date').textContent = today();
}

function go(page) {
  // destroy charts before leaving
  Object.values(S.charts).forEach(c => { try { c.destroy(); } catch {} });
  S.charts = {};
  S.page = page;
  S.subPage = null;
  S.empDetail = null;
  closeSidebar();
  renderNav();
  renderPage();
}

function goEmpDetail(empId) {
  S.subPage = 'empDetail';
  renderNav();
  openEmployee(empId);
}

function openSidebar()  { S.sidebarOpen = true;  $('sidebar').classList.add('open');    $('sidebar-overlay').classList.add('show'); }
function closeSidebar() { S.sidebarOpen = false; $('sidebar').classList.remove('open'); $('sidebar-overlay').classList.remove('show'); }

// ─── RENDER ROUTER ─────────────────────────────────────────────────────────
function renderPage() {
  const c = $('content');
  c.innerHTML = spinner();
  if      (S.page === 'dashboard')  pgDashboard(c);
  else if (S.page === 'employees')  pgEmployees(c);
  else if (S.page === 'reports')    pgReports(c);
  else if (S.page === 'notifs')     pgNotifs(c);
  else if (S.page === 'settings')   pgSettings(c);
  else if (S.page === 'executive')  pgExecutive(c);
}

// ─── PAGE: DASHBOARD ───────────────────────────────────────────────────────
async function pgDashboard(c) {
  c.innerHTML = spinner('กำลังโหลด Dashboard...');
  try {
    const [sum, centers] = await Promise.all([
      api('dashboard.summary'),
      api('dashboard.centerStats'),
    ]);
    S.dashData = sum;
    S.centerData = centers;
    const ls = sum.license_status || {};
    const total = Object.values(ls).reduce((a,b)=>a+b,0) || 1;

    c.innerHTML = `
    <!-- KPI -->
    <div class="kpi-grid">
      ${kpiCard('พนักงานทั้งหมด', sum.total_employees, '5 ศูนย์วิจัย', 'var(--blue)', '#DBEAFE', '👥', `go('employees');setFilter('','','')`)}
      ${kpiCard('ใกล้หมดอายุ', sum.near_expiry, 'ภายใน 45 วัน', 'var(--amber)', '#FEF3C7', '⚠️', `go('employees');setFilter('45d','','')`)}
      ${kpiCard('หมดอายุแล้ว', sum.expired, 'ต้องดำเนินการด่วน', 'var(--red)', '#FEE2E2', '🚨', `go('employees');setFilter('expired','','')`)}
      ${kpiCard('Compliance', sum.compliance_rate + '%', 'ใบขับขี่ปกติ', 'var(--green)', '#DCFCE7', '✅', `go('employees');setFilter('normal','','')`)}
    </div>

    <!-- Center bars -->
    <div class="card card-p mb-14">
      <div class="card-title">📊 สถานะตามศูนย์วิจัย</div>
      <div id="center-bars"></div>
      <div class="legend">
        <div class="legend-item"><div class="legend-dot" style="background:#16A34A"></div>ปกติ</div>
        <div class="legend-item"><div class="legend-dot" style="background:#D97706"></div>ใกล้หมด</div>
        <div class="legend-item"><div class="legend-dot" style="background:#DC2626"></div>หมดอายุ</div>
      </div>
    </div>

    <!-- Donut Charts - 2 types -->
    <div class="card card-p mb-14">
      <div class="card-title">🪪 สัดส่วนใบขับขี่ตามประเภท</div>
      <div id="donut-tabs" class="tabs-wrap mb-8">
        <button class="tab-btn active" onclick="switchDonut('all')">รวม</button>
        <button class="tab-btn" onclick="switchDonut('corp')">เครือฯ</button>
        <button class="tab-btn" onclick="switchDonut('gov')">ราชการ</button>
      </div>
      <div id="donut-area"></div>
    </div>

    <!-- Recent alerts -->
    <div class="card card-p mb-14">
      <div class="card-title">🔔 รายการแจ้งเตือนล่าสุด</div>
      <div id="alert-list"></div>
      <button class="btn btn-ghost btn-full" onclick="go('notifs')" style="margin-top:8px;font-size:12px">ดูทั้งหมด →</button>
    </div>`;

    // Render center bars
    renderCenterBars(centers, $('center-bars'));
    // Render donut
    renderDonut('all', sum.license_status, sum.license_status);
    // Render alerts
    renderAlerts(sum.recent_alerts || [], $('alert-list'));

  } catch(e) {
    c.innerHTML = `<div class="card card-p" style="color:var(--red);font-size:13px">❌ ${e.message}</div>`;
  }
}

function kpiCard(label, val, sub, color, bgColor, icon, onclick) {
  return `<div class="kpi-card" onclick="${onclick}" style="border-top: 3px solid ${color}">
    <div class="kpi-card-top">
      <div>
        <div class="kpi-label">${label}</div>
        <div class="kpi-val" style="color:${color}">${val}</div>
        <div class="kpi-sub">${sub}</div>
      </div>
      <div class="kpi-icon" style="background:${bgColor}">${icon}</div>
    </div>
    <div class="kpi-ripple"></div>
  </div>`;
}

function renderCenterBars(centers, el) {
  if (!el) return;
  el.innerHTML = centers.map(c => {
    const tot = (c.normal + c.near_expiry + c.expired) || 1;
    const pw = v => Math.max(Math.round(v/tot*100), v>0?2:0);
    const short = CFG.CENTER_SHORT[c.center] || c.center;
    return `<div class="prog-row" onclick="go('employees');setFilter('','${c.center}','')" style="cursor:pointer">
      <div class="prog-label">${short}</div>
      <div class="prog-track">
        <div class="prog-seg" style="width:${pw(c.normal)}%;background:#16A34A"></div>
        <div class="prog-seg" style="width:${pw(c.near_expiry)}%;background:#D97706"></div>
        <div class="prog-seg" style="width:${pw(c.expired)}%;background:#DC2626"></div>
      </div>
      <div class="prog-num">${c.total}</div>
    </div>`;
  }).join('');
}

window._donutData = {};
function switchDonut(type) {
  document.querySelectorAll('#donut-tabs .tab-btn').forEach((b,i)=>b.classList.toggle('active',['all','corp','gov'][i]===type));
  renderDonut(type, window._donutData.all, window._donutData.all);
}

function renderDonut(type, allData, rawData) {
  if (!allData) return;
  window._donutData.all = allData;
  const area = $('donut-area');
  if (!area) return;

  if (S.charts.donut) { try { S.charts.donut.destroy(); } catch {} }

  const items = [
    { label: 'ปกติ',    key: 'normal',  color: '#16A34A' },
    { label: '45 วัน',  key: '45d',     color: '#D97706' },
    { label: '30 วัน',  key: '30d',     color: '#EA580C' },
    { label: '15 วัน',  key: '15d',     color: '#DC2626' },
    { label: 'หมดอายุ', key: 'expired', color: '#991B1B' },
  ];

  const typeLabel = { all: 'รวมทั้งหมด', corp: 'ใบขับขี่เครือฯ', gov: 'ใบขับขี่ราชการ' };
  const vals = items.map(i => allData[i.key] || 0);
  const total = vals.reduce((a,b)=>a+b,0);

  area.innerHTML = `
    <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
      <div style="position:relative;width:160px;height:160px;flex-shrink:0;margin:0 auto">
        <canvas id="donut-canvas" width="160" height="160"></canvas>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div style="font-size:22px;font-weight:700;color:var(--text-primary)">${total}</div>
          <div style="font-size:10px;color:var(--text-muted)">${typeLabel[type]}</div>
        </div>
      </div>
      <div style="flex:1;min-width:120px">
        ${items.filter(i=>allData[i.key]>0).map(i=>`
          <div class="stat-row-link" onclick="go('employees');setFilter('${i.key}','','${type==='all'?'':type==='corp'?'ใบขับขี่เครือฯ':'ใบขับขี่ราชการ'}')">
            <div class="legend-item"><div class="legend-dot" style="background:${i.color}"></div>${i.label}</div>
            <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${allData[i.key] || 0}</div>
          </div>`).join('')}
      </div>
    </div>`;

  const ctx = $('donut-canvas');
  if (!ctx || typeof Chart === 'undefined') return;
  S.charts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: items.map(i=>i.label), datasets: [{ data: vals, backgroundColor: items.map(i=>i.color), borderWidth: 0, hoverOffset: 6 }] },
    options: { cutout: '72%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}` } } }, animation: { duration: 600 } },
  });
}

function renderAlerts(alerts, el) {
  if (!el) return;
  if (!alerts.length) { el.innerHTML = empty('ไม่มีรายการแจ้งเตือน 🎉'); return; }
  el.innerHTML = alerts.slice(0,6).map(a => {
    const cfg = STATUS_CFG[a.status] || STATUS_CFG.normal;
    return `<div class="alert-row" style="background:${cfg.bg};border-color:${cfg.border}" onclick="goEmpDetail('${a.employee_id||''}')">
      <div class="alert-info">
        <span class="alert-icon">${a.type==='license'?'🪪':'🎓'}</span>
        <div>
          <div class="alert-name">${a.employee_name}</div>
          <div class="alert-sub">${a.research_center} · ${a.license_type||a.course_name||''}</div>
        </div>
      </div>
      ${badge(a.status, a.days_remaining, true)}
    </div>`;
  }).join('');
}

// ─── PAGE: EMPLOYEES ───────────────────────────────────────────────────────
async function pgEmployees(c) {
  c.innerHTML = spinner('กำลังโหลดรายชื่อ...');
  try {
    S.empList = await api('employees.list', { pageSize: 100 });
    renderEmpList(c);
  } catch(e) {
    c.innerHTML = `<div class="card card-p" style="color:var(--red);font-size:13px">❌ ${e.message}</div>`;
  }
}

function setFilter(status, center, licType) {
  S.filterStatus = status;
  S.filterCenter = center;
  S.filterLicType = licType;
}

function renderEmpList(c) {
  const statFilters = [['','ทั้งหมด'],['normal','ปกติ'],['45d','45 วัน'],['30d','30 วัน'],['15d','15 วัน'],['expired','หมดอายุ']];
  const counts = { '': S.empList.length };
  S.empList.forEach(e => { const s = e.overall_status||'normal'; counts[s]=(counts[s]||0)+1; });

  c.innerHTML = `
  <div class="card card-p mb-14">
    <div class="search-wrap">
      <span class="search-ico">🔍</span>
      <input class="search-input" id="emp-search" placeholder="ค้นหาชื่อ, รหัส, ศูนย์..." oninput="filterEmps()">
    </div>
    <div class="filter-row">
      <select class="fsel" id="emp-center" onchange="filterEmps()">
        <option value="">ทุกศูนย์วิจัย</option>
        ${CFG.CENTERS.map(c=>`<option${c===S.filterCenter?' selected':''}>${c}</option>`).join('')}
      </select>
    </div>
    <div class="filter-row" id="stat-pills">
      ${statFilters.map(([v,l])=>`<button class="filter-pill${S.filterStatus===v?' active':''}" id="pill-${v||'all'}" onclick="setEmpStatus('${v}')">${l}${counts[v]!==undefined?` <b>${counts[v]}</b>`:''}</button>`).join('')}
    </div>
  </div>
  <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;padding-left:2px" id="emp-count">พบ ${S.empList.length} คน</div>
  <div id="emp-list"></div>`;

  filterEmps();
}

function setEmpStatus(v) {
  S.filterStatus = v;
  document.querySelectorAll('[id^="pill-"]').forEach(b => b.classList.remove('active'));
  $(`pill-${v||'all'}`)?.classList.add('active');
  filterEmps();
}

function filterEmps() {
  const q = ($('emp-search')?.value||'').toLowerCase();
  const center = $('emp-center')?.value || S.filterCenter || '';
  const filtered = S.empList.filter(e => {
    const mq = !q || e.full_name.toLowerCase().includes(q) || e.employee_id.toLowerCase().includes(q) || (e.research_center||'').toLowerCase().includes(q);
    const mc = !center || e.research_center === center;
    const ms = !S.filterStatus || e.overall_status === S.filterStatus;
    return mq && mc && ms;
  });
  const listEl = $('emp-list');
  if (listEl) listEl.innerHTML = filtered.length ? filtered.map(empCard).join('') : empty('ไม่พบรายชื่อ', '🔍');
  const countEl = $('emp-count');
  if (countEl) countEl.textContent = `พบ ${filtered.length} จาก ${S.empList.length} คน`;
}

function empCard(e) {
  const corp = e.licenses?.corporate;
  const govt = e.licenses?.government;
  const status = e.overall_status || 'normal';
  const cfg = STATUS_CFG[status];
  return `<div class="emp-card" onclick="goEmpDetail('${e.employee_id}')" style="border-left:4px solid ${cfg.dot}">
    <div style="display:flex;align-items:center;gap:12px;flex:1">
      <div class="emp-avatar">${e.full_name.charAt(2)||'?'}</div>
      <div>
        <div class="emp-name">${e.full_name}</div>
        <div class="emp-id">${e.employee_id} · ${CFG.CENTER_SHORT[e.research_center]||e.research_center}</div>
      </div>
    </div>
    <div class="emp-badges">
      ${corp ? `<div style="text-align:center"><div style="font-size:9.5px;color:var(--text-muted);margin-bottom:2px">เครือฯ</div>${badge(corp.expiry_status,corp.days_remaining,true)}</div>` : ''}
      ${govt ? `<div style="text-align:center"><div style="font-size:9.5px;color:var(--text-muted);margin-bottom:2px">ราชการ</div>${badge(govt.expiry_status,govt.days_remaining,true)}</div>` : ''}
      <span style="color:var(--text-muted);font-size:18px">›</span>
    </div>
  </div>`;
}

// ─── EMPLOYEE DETAIL ───────────────────────────────────────────────────────
async function openEmployee(empId) {
  const c = $('content');
  c.innerHTML = spinner();
  try {
    const [emp, lics, trns] = await Promise.all([
      api('employees.get', { employee_id: empId }),
      api('licenses.getByEmployee', { employee_id: empId }),
      api('trainings.getByEmployee', { employee_id: empId }),
    ]);
    S.empDetail = { emp, lics, trns };
    renderEmpDetail(c, emp, lics, trns);
  } catch(e) {
    c.innerHTML = `<div class="card card-p" style="color:var(--red);font-size:13px">❌ ${e.message}</div>`;
  }
}

function renderEmpDetail(c, emp, lics, trns) {
  const licHTML = lics.length ? lics.map(l => {
    const days = l.days_remaining ?? daysLeft(l.expiry_date);
    const status = l.expiry_status || getStatus(days);
    const cfg = STATUS_CFG[status];
    return `<div class="lic-card" style="border-left:4px solid ${cfg.dot}">
      <div class="flex-between mb-8">
        <div>
          <div style="font-size:14px;font-weight:600;color:var(--text-primary)">${l.license_type==='ใบขับขี่เครือฯ'?'🏢':'🏛️'} ${l.license_type}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">เลขที่: ${l.license_number||'-'}</div>
        </div>
        ${badge(status, days)}
      </div>
      <div class="info-grid">
        <div class="info-item"><div class="info-label">วันออกบัตร</div><div class="info-val">${fdate(l.issue_date)}</div></div>
        <div class="info-item"><div class="info-label">วันหมดอายุ</div><div class="info-val${status!=='normal'?' danger':''}">${fdate(l.expiry_date)}</div></div>
        <div class="info-item"><div class="info-label">สถานะอบรม</div><div class="info-val">${l.training_status||'-'}</div></div>
        <div class="info-item"><div class="info-label">วันอัพเดต</div><div class="info-val">${fdate(l.updated_at)}</div></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-amber" style="font-size:12px;padding:7px 12px" onclick="editLicModal('${l.license_id}','${emp.employee_id}','${l.license_type}','${l.license_number}','${l.expiry_date}')">✏️ แก้ไข</button>
        ${l.file_url?`<a href="${l.file_url}" target="_blank" class="btn btn-ghost" style="font-size:12px;padding:7px 12px;text-decoration:none">📎 ไฟล์แนบ</a>`:''}
      </div>
    </div>`;
  }).join('') : empty('ยังไม่มีข้อมูลใบขับขี่', '🪪');

  const trnHTML = trns.length ? trns.map(t => {
    const days = daysLeft(t.next_due_date);
    return `<div class="card card-p mb-8">
      <div style="font-size:14px;font-weight:600;margin-bottom:10px">🎓 ${t.course_name}</div>
      <div class="info-grid">
        <div class="info-item"><div class="info-label">วันอบรม</div><div class="info-val">${fdate(t.training_date)}</div></div>
        <div class="info-item"><div class="info-label">ผู้สอน</div><div class="info-val">${t.trainer||'-'}</div></div>
        <div class="info-item"><div class="info-label">ครบกำหนด</div><div class="info-val${days!==null&&days<=45?' danger':''}">${fdate(t.next_due_date)}</div></div>
        <div class="info-item"><div class="info-label">สถานะ</div><div class="info-val">${badge(t.due_status||getStatus(days),days,true)}</div></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn btn-amber" style="font-size:12px;padding:7px 12px" onclick="editTrnModal('${t.training_id}','${emp.employee_id}','${t.course_name}','${t.training_date}','${t.trainer||''}','${t.next_due_date||''}')">✏️ แก้ไข</button>
        ${t.certificate_url?`<a href="${t.certificate_url}" target="_blank" class="btn btn-ghost" style="font-size:12px;padding:7px 12px;text-decoration:none">📜 ใบรับรอง</a>`:''}
      </div>
    </div>`;
  }).join('') : empty('ยังไม่มีประวัติการอบรม', '🎓');

  c.innerHTML = `
  <button class="back-btn" onclick="go('employees')">← กลับ</button>
  <div class="card card-p mb-14">
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div class="emp-avatar" style="width:56px;height:56px;font-size:22px;border-radius:14px">${emp.full_name.charAt(2)||'?'}</div>
      <div style="flex:1">
        <div style="font-size:17px;font-weight:700;color:var(--text-primary)">${emp.full_name}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${emp.employee_id} · ${emp.research_center}</div>
        ${emp.position?`<div style="font-size:12px;color:var(--text-muted)">${emp.position}</div>`:''}
      </div>
      ${badge(emp.overall_status||'normal')}
    </div>
    ${emp.phone||emp.email?`<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:4px">
      ${emp.phone?`<div style="font-size:12.5px;color:var(--text-secondary)">📞 ${emp.phone}</div>`:''}
      ${emp.email?`<div style="font-size:12.5px;color:var(--text-secondary)">✉️ ${emp.email}</div>`:''}
    </div>`:''}
  </div>

  <div class="tabs-wrap" id="detail-tabs">
    <button class="tab-btn active" onclick="switchDetailTab('lic')">🪪 ใบขับขี่ (${lics.length})</button>
    <button class="tab-btn" onclick="switchDetailTab('trn')">🎓 การอบรม (${trns.length})</button>
  </div>

  <div id="tab-lic">${licHTML}</div>
  <div id="tab-trn" style="display:none">
    ${trnHTML}
    <button class="btn btn-primary btn-full" onclick="addTrnModal('${emp.employee_id}')" style="margin-top:4px">➕ บันทึกการอบรมใหม่</button>
  </div>

  <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
    <button class="btn btn-danger flex:1" style="flex:1" onclick="sendReminder('${emp.employee_id}')">🔔 ส่งแจ้งเตือน Telegram</button>
  </div>`;
}

function switchDetailTab(t) {
  document.querySelectorAll('#detail-tabs .tab-btn').forEach((b,i)=>b.classList.toggle('active',['lic','trn'][i]===t));
  $('tab-lic').style.display = t==='lic'?'block':'none';
  $('tab-trn').style.display = t==='trn'?'block':'none';
}

async function sendReminder(empId) {
  try {
    const msg = `🔔 ส่งแจ้งเตือนด่วนไปยัง Telegram...`;
    showToast(msg);
    await api('notifications.sendManual', { message: `🔔 แจ้งเตือนด่วน: EMP ${empId} — กรุณาตรวจสอบใบขับขี่` });
    showToast('✅ ส่งแจ้งเตือนสำเร็จ');
  } catch(e) { showToast('❌ ' + e.message); }
}

// ─── LICENSE EDIT MODAL ────────────────────────────────────────────────────
function editLicModal(licId, empId, licType, licNo, expiryDate) {
  let dateVal = '';
  if (expiryDate && expiryDate !== 'undefined') {
    try { dateVal = expiryDate.includes('T') ? expiryDate.split('T')[0] : expiryDate.match(/\d{4}-\d{2}-\d{2}/) ? expiryDate : ''; } catch {}
  }
  showModal('modal-lic', `✏️ แก้ไขใบขับขี่<br><span style="font-size:12px;color:var(--text-muted);font-weight:400">${licType}</span>`, `
    <div class="form-group"><div class="form-label">เลขที่ใบขับขี่</div>
      <input class="form-input" id="ml-licno" value="${licNo||''}" placeholder="เลขที่ใบขับขี่"></div>
    <div class="form-group"><div class="form-label">วันหมดอายุ</div>
      <input class="form-input" type="date" id="ml-expiry" value="${dateVal}"></div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-primary" style="flex:1" onclick="submitLic('${licId}','${empId}')">💾 บันทึก</button>
      <button class="btn btn-ghost" style="flex:1" onclick="closeModal('modal-lic')">ยกเลิก</button>
    </div>`);
}

async function submitLic(licId, empId) {
  const licNo = $('ml-licno').value.trim();
  const expiry = $('ml-expiry').value;
  if (!expiry) { showToast('กรุณาเลือกวันหมดอายุ'); return; }
  try {
    await api('licenses.upsert', { license_id: licId, employee_id: empId, license_number: licNo, expiry_date: expiry });
    clearCache(); closeModal('modal-lic');
    showToast('✅ บันทึกสำเร็จ');
    openEmployee(empId);
  } catch(e) { showToast('❌ ' + e.message); }
}

// ─── TRAINING MODALS ───────────────────────────────────────────────────────
function addTrnModal(empId) { editTrnModal('', empId, '', '', '', ''); }
function editTrnModal(trnId, empId, course, trnDate, trainer, nextDue) {
  const toDate = d => {
    if (!d || d==='undefined') return '';
    try { return d.includes('T') ? d.split('T')[0] : /\d{4}-\d{2}-\d{2}/.test(d) ? d : ''; } catch { return ''; }
  };
  showModal('modal-trn', `${trnId?'✏️ แก้ไข':'➕ บันทึก'}การอบรม`, `
    <div class="form-group"><div class="form-label">หลักสูตร *</div>
      <input class="form-input" id="mt-course" value="${course||''}" placeholder="ชื่อหลักสูตร"></div>
    <div class="form-group"><div class="form-label">วันที่อบรม *</div>
      <input class="form-input" type="date" id="mt-date" value="${toDate(trnDate)}"></div>
    <div class="form-group"><div class="form-label">ผู้สอน / หน่วยงาน</div>
      <input class="form-input" id="mt-trainer" value="${trainer||''}" placeholder="SHE&En Center"></div>
    <div class="form-group"><div class="form-label">วันครบกำหนดครั้งต่อไป</div>
      <input class="form-input" type="date" id="mt-due" value="${toDate(nextDue)}"></div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-primary" style="flex:1" onclick="submitTrn('${trnId}','${empId}')">💾 บันทึก</button>
      <button class="btn btn-ghost" style="flex:1" onclick="closeModal('modal-trn')">ยกเลิก</button>
    </div>`);
}

async function submitTrn(trnId, empId) {
  const course = $('mt-course').value.trim();
  const date = $('mt-date').value;
  if (!course || !date) { showToast('กรุณากรอกข้อมูลที่จำเป็น'); return; }
  try {
    const payload = { employee_id: empId, course_name: course, training_date: date, trainer: $('mt-trainer').value.trim(), next_due_date: $('mt-due').value };
    if (trnId) payload.training_id = trnId;
    await api(trnId ? 'trainings.update' : 'trainings.create', payload);
    clearCache(); closeModal('modal-trn');
    showToast('✅ บันทึกการอบรมสำเร็จ');
    openEmployee(empId);
  } catch(e) { showToast('❌ ' + e.message); }
}

// ─── PAGE: NOTIFICATIONS ───────────────────────────────────────────────────
async function pgNotifs(c) {
  c.innerHTML = spinner();
  try {
    const data = await api('notifications.list', { page: 1 });
    const arr = Array.isArray(data) ? data : (data?.data || []);
    S.notifList = arr;

    const tabs = [['all','ทั้งหมด'],['license_corp','เครือฯ'],['license_gov','ราชการ'],['near','ใกล้หมด'],['expired','หมดอายุ']];
    let activeTab = 'all';

    const render = () => {
      let filtered = arr;
      if (activeTab === 'license_corp') filtered = arr.filter(n => (n.message||'').includes('เครือ'));
      else if (activeTab === 'license_gov') filtered = arr.filter(n => (n.message||'').includes('ราชการ'));
      else if (activeTab === 'near') filtered = arr.filter(n => ['45d','30d','15d'].includes(n.notif_type));
      else if (activeTab === 'expired') filtered = arr.filter(n => n.notif_type === 'expired');

      const unread = arr.filter(n => n.is_read !== 'true').length;
      c.innerHTML = `
      <div class="flex-between mb-8">
        <div style="font-size:13px;color:var(--text-secondary)">ยังไม่อ่าน <strong style="color:var(--blue)">${unread}</strong> รายการ</div>
        ${unread>0?`<button class="btn btn-ghost" style="font-size:12px;padding:6px 12px" onclick="markAllRead()">✓ อ่านทั้งหมด</button>`:''}
      </div>
      <div class="tabs-wrap mb-8">${tabs.map(([v,l])=>`<button class="tab-btn${activeTab===v?' active':''}" onclick="window._notifTab='${v}';pgNotifs(document.getElementById('content'))">${l}</button>`).join('')}</div>
      ${filtered.length ? filtered.map(notifCard).join('') : empty('ไม่มีการแจ้งเตือน', '📬')}`;
    };

    window._notifTab = window._notifTab || 'all';
    activeTab = window._notifTab;
    render();

  } catch(e) {
    c.innerHTML = `<div class="card card-p" style="color:var(--red);font-size:13px">❌ ${e.message}</div>`;
  }
}

function notifCard(n) {
  const isRead = n.is_read === 'true';
  const hasExpired = n.notif_type === 'expired';
  const dotColor = hasExpired ? '#991B1B' : ['15d'].includes(n.notif_type) ? '#DC2626' : ['30d'].includes(n.notif_type) ? '#EA580C' : '#D97706';
  const msg = (n.message||'').replace(/<[^>]*>/g,'');
  return `<div class="notif-item${isRead?'':' unread'}" onclick="this.classList.remove('unread')">
    <div class="notif-dot" style="background:${dotColor}"></div>
    <div class="notif-text">
      <div class="notif-name">${msg.split('\n')[0].replace(/[🔔⛔🔴🟠🟡✅]/g,'').trim()}</div>
      <div class="notif-meta">${(msg.split('\n').slice(1,3).join(' · ')).trim()}</div>
      <div class="notif-time">${fdate(n.sent_at)} · ${n.channel||'telegram'}${!isRead?' · <span style="color:var(--blue);font-weight:600">● ใหม่</span>':''}</div>
    </div>
  </div>`;
}

async function markAllRead() {
  try { await api('notifications.markRead', { all: true }); clearCache(); window._notifTab = 'all'; pgNotifs($('content')); } catch(e) {}
}

// ─── PAGE: REPORTS ─────────────────────────────────────────────────────────
async function pgReports(c) {
  c.innerHTML = spinner();
  const tabs = [['summary','สรุปภาพรวม'],['center','ตามศูนย์'],['urgent','รายการเร่งด่วน'],['export','ส่งออกข้อมูล']];
  window._reportTab = window._reportTab || 'summary';

  try {
    const [sum, centers, nearExp] = await Promise.all([
      api('dashboard.summary'),
      api('dashboard.centerStats'),
      api('licenses.nearExpiry', { days: 45 }),
    ]);
    const arr = Array.isArray(nearExp) ? nearExp : (nearExp?.data || []);

    const renderTab = async (tab) => {
      window._reportTab = tab;
      const area = $('report-area');
      if (!area) return;
      area.innerHTML = spinner();

      if (tab === 'summary') {
        area.innerHTML = summaryReport(sum, arr);
        renderTrendChart(sum);
      } else if (tab === 'center') {
        area.innerHTML = centerReport(centers, arr);
      } else if (tab === 'urgent') {
        const empMap = {};
        (S.empList.length ? S.empList : await api('employees.list',{pageSize:100})).forEach(e => empMap[e.employee_id]=e);
        area.innerHTML = urgentReport(arr, empMap);
      } else if (tab === 'export') {
        area.innerHTML = exportPanel();
      }
    };

    c.innerHTML = `
    <div class="tabs-wrap mb-8" id="report-tabs">
      ${tabs.map(([v,l])=>`<button class="tab-btn${window._reportTab===v?' active':''}" onclick="switchReportTab('${v}')">${l}</button>`).join('')}
    </div>
    <div id="report-area"></div>`;

    window.switchReportTab = (tab) => {
      document.querySelectorAll('#report-tabs .tab-btn').forEach((b,i)=>b.classList.toggle('active',tabs[i][0]===tab));
      renderTab(tab);
    };

    renderTab(window._reportTab);

  } catch(e) {
    c.innerHTML = `<div class="card card-p" style="color:var(--red);font-size:13px">❌ ${e.message}</div>`;
  }
}

function summaryReport(s, nearExp) {
  const ls = s.license_status || {};
  return `
  <!-- Risk Cards -->
  <div class="risk-grid mb-14">
    ${riskCard('⛔','หมดอายุแล้ว',nearExp.filter(l=>l.days_remaining<0).length,'#FEE2E2','#DC2626','expired','')}
    ${riskCard('🔴','เหลือ ≤ 15 วัน',nearExp.filter(l=>l.days_remaining>=0&&l.days_remaining<=15).length,'#FEE2E2','#DC2626','15d','')}
    ${riskCard('🟠','เหลือ 16-30 วัน',nearExp.filter(l=>l.days_remaining>15&&l.days_remaining<=30).length,'#FEF3C7','#D97706','30d','')}
    ${riskCard('🟡','เหลือ 31-45 วัน',nearExp.filter(l=>l.days_remaining>30&&l.days_remaining<=45).length,'#FEF3C7','#D97706','45d','')}
  </div>
  <div class="card card-p mb-14">
    <div class="card-title">📈 สถิติภาพรวม</div>
    <div class="stat-row-link"><span style="color:var(--text-secondary)">พนักงานทั้งหมด</span><strong>${s.total_employees} คน</strong></div>
    <div class="stat-row-link"><span style="color:var(--text-secondary)">ใบขับขี่รวม</span><strong>${Object.values(ls).reduce((a,b)=>a+b,0)} ใบ</strong></div>
    <div class="stat-row-link"><span style="color:var(--text-secondary)">Compliance Rate</span><strong style="color:var(--green)">${s.compliance_rate}%</strong></div>
    <div class="stat-row-link"><span style="color:var(--text-secondary)">ปกติ</span><strong style="color:var(--green)">${ls.normal||0}</strong></div>
    <div class="stat-row-link"><span style="color:var(--text-secondary)">ใกล้หมดอายุ (≤45 วัน)</span><strong style="color:var(--amber)">${s.near_expiry}</strong></div>
    <div class="stat-row-link"><span style="color:var(--text-secondary)">หมดอายุแล้ว</span><strong style="color:var(--red)">${s.expired}</strong></div>
  </div>
  <div class="card card-p mb-14">
    <div class="card-title">📅 แนวโน้ม (จำลอง 6 เดือน)</div>
    <div class="chart-container" style="height:160px"><canvas id="trend-chart"></canvas></div>
  </div>`;
}

function riskCard(icon, label, val, bg, color, status, licType) {
  return `<div class="risk-card" style="background:${bg};border-color:${color}40" onclick="go('employees');setFilter('${status}','','${licType}')">
    <span style="font-size:22px">${icon}</span>
    <div><div class="risk-val" style="color:${color}">${val}</div><div class="risk-label" style="color:${color}">${label}</div></div>
  </div>`;
}

function renderTrendChart(s) {
  const canvas = $('trend-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (S.charts.trend) { try { S.charts.trend.destroy(); } catch {} }
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.'];
  const base = s.compliance_rate || 97;
  const data = months.map((_,i) => Math.min(100, Math.max(85, base - (5-i)*0.5 + (Math.random()-0.5))));
  S.charts.trend = new Chart(canvas, {
    type: 'line',
    data: {
      labels: months,
      datasets: [{ label: 'Compliance %', data, borderColor: '#16A34A', backgroundColor: 'rgba(22,163,74,.1)', fill: true, tension: 0.4, pointBackgroundColor: '#16A34A', pointRadius: 4 }],
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { min: 80, max: 100, ticks: { callback: v=>v+'%', font:{size:10} }, grid: { color: 'rgba(0,0,0,.05)' } }, x: { ticks: { font:{size:10} }, grid: { display: false } } }, animation: { duration: 600 } },
  });
}

function centerReport(centers, nearExp) {
  return `<div class="card mb-14">
    <div class="card-p"><div class="card-title">🏢 สรุปตามศูนย์วิจัย</div></div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>ศูนย์วิจัย</th><th>พนักงาน</th><th style="color:var(--green)">ปกติ</th><th style="color:var(--amber)">ใกล้หมด</th><th style="color:var(--red)">หมดอายุ</th><th>Compliance</th></tr></thead>
        <tbody>
          ${centers.map(c => {
            const tot = (c.normal+c.near_expiry+c.expired)||1;
            const comp = Math.round(c.normal/tot*100);
            const cc = comp>=90?'var(--green)':comp>=70?'var(--amber)':'var(--red)';
            return `<tr onclick="go('employees');setFilter('','${c.center}','')" style="cursor:pointer">
              <td style="font-weight:500">${c.center.replace('ศูนย์วิจัย','').replace('ศูนย์ปรับปรุงพันธุ์สัตว์น้ำหาดเจ้า','ปรับปรุงพันธุ์ฯ')}</td>
              <td>${c.total}</td>
              <td style="color:var(--green);font-weight:600">${c.normal}</td>
              <td style="color:var(--amber);font-weight:600">${c.near_expiry}</td>
              <td style="color:var(--red);font-weight:600">${c.expired}</td>
              <td style="font-weight:700;color:${cc}">${comp}%</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function urgentReport(nearExp, empMap) {
  const urgent = nearExp.filter(l => l.days_remaining <= 15 || l.days_remaining < 0);
  if (!urgent.length) return empty('ไม่มีรายการเร่งด่วน 🎉', '✅');
  return `<div class="section-title">⚠️ รายการเร่งด่วน (${urgent.length} รายการ)</div>
  ${urgent.map(l => {
    const emp = empMap[l.employee_id] || {};
    const days = l.days_remaining;
    const status = getStatus(days);
    const cfg = STATUS_CFG[status];
    return `<div class="alert-row" style="background:${cfg.bg};border-color:${cfg.border}" onclick="goEmpDetail('${l.employee_id}')">
      <div class="alert-info">
        <span class="alert-icon">🪪</span>
        <div>
          <div class="alert-name">${emp.full_name||l.employee_id}</div>
          <div class="alert-sub">${emp.research_center||''} · ${l.license_type||''} · เลขที่ ${l.license_number||'-'}</div>
          <div class="alert-sub">หมดอายุ: ${fdate(l.expiry_date)}</div>
        </div>
      </div>
      ${badge(status, days, true)}
    </div>`;
  }).join('')}`;
}

function exportPanel() {
  return `<div class="card card-p mb-10">
    <div class="card-title">📤 ส่งออกข้อมูล</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <button class="btn btn-primary btn-full btn-lg" onclick="exportPDF()">📄 Export PDF (ภาพรวม + ตามศูนย์ + เร่งด่วน)</button>
      <button class="btn btn-green btn-full btn-lg" onclick="exportExcel('full')">📊 Export Excel — รายงานรวม</button>
      <button class="btn btn-ghost btn-full btn-lg" onclick="exportExcel('expiry')">📊 Export Excel — ใบขับขี่ใกล้หมด</button>
      <button class="btn btn-ghost btn-full btn-lg" onclick="exportExcel('training')">📊 Export Excel — การอบรม</button>
    </div>
  </div>
  <div class="card card-p">
    <div class="card-title" style="font-size:12px;color:var(--text-muted)">ℹ️ หมายเหตุ</div>
    <div style="font-size:12px;color:var(--text-muted);line-height:1.8">
      • PDF — สร้างจาก browser print dialog (บันทึกเป็น PDF)<br>
      • Excel — ดาวน์โหลดเป็นไฟล์ CSV เปิดได้กับ Excel และ Google Sheets<br>
      • ข้อมูล ณ วันที่ดาวน์โหลด
    </div>
  </div>`;
}

// ─── EXPORT PDF ────────────────────────────────────────────────────────────
async function exportPDF() {
  showToast('กำลังสร้าง PDF...');
  try {
    const [sum, centers, nearExp, empListData] = await Promise.all([
      api('dashboard.summary'),
      api('dashboard.centerStats'),
      api('licenses.nearExpiry', { days: 45 }),
      api('employees.list', { pageSize: 100 }),
    ]);
    const arr = Array.isArray(nearExp) ? nearExp : (nearExp?.data || []);
    const empMap = {};
    empListData.forEach(e => empMap[e.employee_id] = e);
    const urgent = arr.filter(l => (l.days_remaining ?? 999) <= 15);
    const ls = sum.license_status || {};

    const pdfWin = window.open('', '_blank');
    pdfWin.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8">
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet">
      <title>DLMS Report — ${todayISO()}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Sarabun', sans-serif; font-size: 13px; color: #1A2942; background: #fff; padding: 30px; }
        h1 { font-size: 22px; font-weight: 700; color: #1D4ED8; margin-bottom: 4px; }
        h2 { font-size: 15px; font-weight: 700; color: #1A2942; margin: 24px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #E8ECF0; }
        .meta { font-size: 12px; color: #6B7C93; margin-bottom: 20px; }
        .kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 20px; }
        .kpi-box { border: 1px solid #E8ECF0; border-radius: 10px; padding: 14px; }
        .kpi-label { font-size: 11px; color: #6B7C93; margin-bottom: 4px; }
        .kpi-val { font-size: 26px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
        th { padding: 8px 10px; background: #F8FAFC; border-bottom: 2px solid #E8ECF0; text-align: left; font-weight: 600; color: #6B7C93; }
        td { padding: 8px 10px; border-bottom: 1px solid #F0F2F5; }
        tr:last-child td { border-bottom: none; }
        .c-green { color: #16A34A; font-weight: 600; }
        .c-red   { color: #DC2626; font-weight: 600; }
        .c-amber { color: #D97706; font-weight: 600; }
        .badge { display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600; }
        .badge-red { background:#FEE2E2;color:#991B1B; }
        .badge-amber { background:#FEF3C7;color:#92400E; }
        .footer { margin-top: 30px; padding-top: 14px; border-top: 1px solid #E8ECF0; font-size: 11px; color: #9AABBD; text-align: center; }
        @media print { body { padding: 15px; } }
      </style>
    </head><body>
      <h1>🚗 DLMS — รายงานสถานะใบขับขี่</h1>
      <div class="meta">วันที่ออกรายงาน: ${today()} | ระบบ DLMS v2.0</div>

      <h2>📊 ส่วนที่ 1 — ภาพรวม</h2>
      <div class="kpi-grid">
        <div class="kpi-box"><div class="kpi-label">พนักงานทั้งหมด</div><div class="kpi-val" style="color:#1D4ED8">${sum.total_employees}</div></div>
        <div class="kpi-box"><div class="kpi-label">ใกล้หมดอายุ</div><div class="kpi-val" style="color:#D97706">${sum.near_expiry}</div></div>
        <div class="kpi-box"><div class="kpi-label">หมดอายุแล้ว</div><div class="kpi-val" style="color:#DC2626">${sum.expired}</div></div>
        <div class="kpi-box"><div class="kpi-label">Compliance Rate</div><div class="kpi-val" style="color:#16A34A">${sum.compliance_rate}%</div></div>
      </div>
      <table>
        <tr><th>สถานะ</th><th>จำนวน</th><th>%</th></tr>
        ${[['ปกติ','normal','c-green'],['45 วัน','45d','c-amber'],['30 วัน','30d','c-amber'],['15 วัน','15d','c-red'],['หมดอายุ','expired','c-red']].map(([l,k,c])=>`<tr><td>${l}</td><td class="${c}">${ls[k]||0}</td><td>${Math.round((ls[k]||0)/Math.max(Object.values(ls).reduce((a,b)=>a+b,0),1)*100)}%</td></tr>`).join('')}
      </table>

      <h2>🏢 ส่วนที่ 2 — สรุปตามศูนย์วิจัย</h2>
      <table>
        <tr><th>ศูนย์วิจัย</th><th>พนักงาน</th><th class="c-green">ปกติ</th><th class="c-amber">ใกล้หมด</th><th class="c-red">หมดอายุ</th><th>Compliance</th></tr>
        ${centers.map(c=>{
          const tot=(c.normal+c.near_expiry+c.expired)||1;
          const comp=Math.round(c.normal/tot*100);
          return `<tr><td style="font-weight:500">${c.center}</td><td>${c.total}</td><td class="c-green">${c.normal}</td><td class="c-amber">${c.near_expiry}</td><td class="c-red">${c.expired}</td><td style="font-weight:700;color:${comp>=90?'#16A34A':comp>=70?'#D97706':'#DC2626'}">${comp}%</td></tr>`;
        }).join('')}
      </table>

      ${urgent.length ? `<h2>⚠️ ส่วนที่ 3 — รายการเร่งด่วน (≤15 วัน)</h2>
      <table>
        <tr><th>ชื่อ-นามสกุล</th><th>รหัสพนักงาน</th><th>ศูนย์วิจัย</th><th>ประเภทใบขับขี่</th><th>เลขที่</th><th>หมดอายุ</th><th>วันคงเหลือ</th></tr>
        ${urgent.map(l=>{
          const emp=empMap[l.employee_id]||{};
          const days=l.days_remaining;
          return `<tr><td style="font-weight:600">${emp.full_name||'-'}</td><td>${l.employee_id}</td><td>${emp.research_center||'-'}</td><td>${l.license_type||'-'}</td><td>${l.license_number||'-'}</td><td>${fdate(l.expiry_date)}</td><td><span class="badge badge-red">${days<0?`เกิน ${Math.abs(days)} วัน`:`${days} วัน`}</span></td></tr>`;
        }).join('')}
      </table>` : '<h2>✅ ไม่มีรายการเร่งด่วน</h2>'}

      <div class="footer">ออกรายงานโดย DLMS — Driver License Management System | ${today()}</div>
      <script>setTimeout(()=>window.print(),600);<\/script>
    </body></html>`);
    pdfWin.document.close();
  } catch(e) { showToast('❌ ' + e.message); }
}

// ─── EXPORT EXCEL (CSV) ────────────────────────────────────────────────────
async function exportExcel(type) {
  showToast('กำลังโหลดข้อมูล...');
  try {
    const actions = { full: 'reports.fullExport', expiry: 'reports.licenseExpiry', training: 'reports.trainingDue' };
    const res = await api(actions[type] || 'reports.fullExport');
    const data = res?.data || (Array.isArray(res) ? res : []);
    if (!data.length) { showToast('ไม่มีข้อมูล'); return; }

    const dateKeys = ['expiry_date','corp_expiry','govt_expiry','last_training_date','next_training_due','next_due_date','training_date'];
    const statusMap = { normal:'ปกติ','45d':'45 วัน','30d':'30 วัน','15d':'15 วัน',expired:'หมดอายุ' };
    const headers = Object.keys(data[0]);
    const thMap = { full_name:'ชื่อ-นามสกุล',employee_id:'รหัสพนักงาน',research_center:'ศูนย์วิจัย',position:'ตำแหน่ง',phone:'เบอร์โทร',corp_license_no:'เลขใบเครือฯ',corp_expiry:'หมดอายุเครือฯ',corp_status:'สถานะเครือฯ',corp_training_status:'สถานะอบรม',govt_license_no:'เลขใบราชการ',govt_expiry:'หมดอายุราชการ',govt_status:'สถานะราชการ',license_type:'ประเภทใบขับขี่',license_number:'เลขที่ใบขับขี่',expiry_date:'วันหมดอายุ',days_remaining:'วันคงเหลือ',status:'สถานะ',course_name:'หลักสูตร',training_date:'วันอบรม',trainer:'ผู้สอน',next_due_date:'ครบกำหนด' };

    const rows = data.map(r => headers.map(h => {
      let v = r[h] ?? '';
      if (dateKeys.includes(h)) v = fdate(String(v));
      if (h === 'status' || h === 'corp_status' || h === 'govt_status') v = statusMap[v] || v;
      return `"${String(v).replace(/"/g,'""')}"`;
    }).join(','));

    const csv = '\uFEFF' + [headers.map(h=>thMap[h]||h).join(','), ...rows].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `DLMS_${type}_${todayISO()}.csv`;
    a.click();
    showToast('✅ ดาวน์โหลดสำเร็จ');
  } catch(e) { showToast('❌ ' + e.message); }
}

// ─── PAGE: EXECUTIVE ───────────────────────────────────────────────────────
async function pgExecutive(c) {
  c.innerHTML = spinner('กำลังสร้างรายงานผู้บริหาร...');
  try {
    const [sum, centers, nearExp] = await Promise.all([
      api('dashboard.summary'),
      api('dashboard.centerStats'),
      api('licenses.nearExpiry', { days: 45 }),
    ]);
    const arr = Array.isArray(nearExp) ? nearExp : [];
    const empList2 = S.empList.length ? S.empList : await api('employees.list', { pageSize: 100 });
    const empMap = {};
    empList2.forEach(e => empMap[e.employee_id] = e);

    const urgent = arr.filter(l => l.days_remaining <= 15);
    const ls = sum.license_status || {};

    c.innerHTML = `
    <!-- Header Banner -->
    <div style="background:linear-gradient(135deg,#1a2942,#1D4ED8);border-radius:var(--radius-lg);padding:20px;margin-bottom:14px;color:#fff">
      <div style="font-size:11px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Executive Dashboard</div>
      <div style="font-size:19px;font-weight:700">DLMS — ภาพรวมผู้บริหาร</div>
      <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:4px">${today()}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px">
        ${[['พนักงานทั้งหมด',sum.total_employees,'คน','rgba(255,255,255,.15)','#fff'],
           ['Compliance',sum.compliance_rate+'%','','rgba(34,197,94,.25)','#4ADE80'],
           ['ต้องดำเนินการ',(sum.near_expiry+sum.expired),'รายการ','rgba(239,68,68,.25)','#F87171']].map(([l,v,u,bg,c])=>`
          <div style="background:${bg};border-radius:10px;padding:11px;text-align:center;backdrop-filter:blur(4px)">
            <div style="font-size:20px;font-weight:700;color:${c}">${v}</div>
            <div style="font-size:10px;color:rgba(255,255,255,.6);margin-top:1px">${l} ${u}</div>
          </div>`).join('')}
      </div>
    </div>

    <!-- Risk Summary -->
    <div class="risk-grid mb-14">
      ${riskCard('⛔','หมดอายุแล้ว',arr.filter(l=>l.days_remaining<0).length,'#FEE2E2','#DC2626','expired','')}
      ${riskCard('🔴','≤ 15 วัน',arr.filter(l=>l.days_remaining>=0&&l.days_remaining<=15).length,'#FEE2E2','#DC2626','15d','')}
      ${riskCard('🟠','16-30 วัน',arr.filter(l=>l.days_remaining>15&&l.days_remaining<=30).length,'#FEF3C7','#D97706','30d','')}
      ${riskCard('🟡','31-45 วัน',arr.filter(l=>l.days_remaining>30&&l.days_remaining<=45).length,'#FEF3C7','#D97706','45d','')}
    </div>

    <!-- Center Table -->
    <div class="card mb-14">
      <div class="card-p"><div class="card-title">🏢 สรุปตามศูนย์วิจัย</div></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>ศูนย์วิจัย</th><th>พนักงาน</th><th>ปกติ</th><th>ใกล้หมด</th><th>หมดอายุ</th><th>%</th></tr></thead>
          <tbody>
            ${centers.map(c=>{
              const tot=(c.normal+c.near_expiry+c.expired)||1;
              const comp=Math.round(c.normal/tot*100);
              return `<tr onclick="go('employees');setFilter('','${c.center}','')" style="cursor:pointer">
                <td style="font-weight:500">${c.center.replace('ศูนย์วิจัย','').replace('ศูนย์ปรับปรุงพันธุ์สัตว์น้ำหาดเจ้า','ปรับปรุงฯ')}</td>
                <td>${c.total}</td>
                <td class="color-green fw-600">${c.normal}</td>
                <td class="color-amber fw-600">${c.near_expiry}</td>
                <td class="color-red fw-600">${c.expired}</td>
                <td style="font-weight:700;color:${comp>=90?'var(--green)':comp>=70?'var(--amber)':'var(--red)'}">${comp}%</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Urgent -->
    ${urgent.length ? `<div class="card card-p mb-14">
      <div class="card-title">⚠️ รายการเร่งด่วน (${urgent.length} รายการ)</div>
      ${urgent.slice(0,6).map(l=>{
        const emp=empMap[l.employee_id]||{};
        const days=l.days_remaining;
        const cfg=STATUS_CFG[getStatus(days)];
        return `<div class="alert-row" style="background:${cfg.bg};border-color:${cfg.border}" onclick="goEmpDetail('${l.employee_id}')">
          <div class="alert-info">
            <span class="alert-icon">🪪</span>
            <div>
              <div class="alert-name">${emp.full_name||l.employee_id}</div>
              <div class="alert-sub">${emp.research_center||''} · ${l.license_type||''}</div>
            </div>
          </div>
          ${badge(getStatus(days),days,true)}
        </div>`;
      }).join('')}
    </div>` : ''}

    <!-- Export -->
    <button class="btn btn-primary btn-full btn-lg" onclick="exportPDF()">📄 Export PDF รายงานผู้บริหาร</button>
    <button class="btn btn-green btn-full btn-lg" onclick="exportExcel('full')" style="margin-top:8px">📊 Export Excel รายงานรวม</button>`;

  } catch(e) {
    c.innerHTML = `<div class="card card-p" style="color:var(--red);font-size:13px">❌ ${e.message}</div>`;
  }
}

// ─── PAGE: SETTINGS ────────────────────────────────────────────────────────
function pgSettings(c) {
  c.innerHTML = `
  <div class="card card-p mb-14">
    <div class="card-title">⚙️ การตั้งค่าระบบ</div>
    ${[['🤖 Telegram Bot','เชื่อมต่อแล้ว','var(--green)'],
       ['📢 Group ID','-5242820803','var(--text-secondary)'],
       ['⏰ Daily Trigger','08:00 น. ทุกวัน','var(--text-secondary)'],
       ['🔔 แจ้งเตือน 45/30/15/0 วัน','เปิดทั้งหมด','var(--green)']].map(([k,v,c])=>`
      <div class="stat-row-link"><span style="color:var(--text-secondary)">${k}</span><span style="font-weight:600;color:${c}">${v}</span></div>`).join('')}
  </div>
  <div class="card card-p mb-14">
    <div class="card-title">🔗 ลิงก์สำคัญ</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <a href="https://docs.google.com/spreadsheets/d/1YXSj-3Hw_4uS6HylFzJnuEJ-2rxaxDe76ACb83VC91c" target="_blank" class="btn btn-ghost btn-full" style="text-decoration:none">📊 เปิด Google Sheet</a>
      <a href="https://drive.google.com/drive/folders/1-iyX93SyB2YEWL1IG_n9EGLe3NHWG2Ex" target="_blank" class="btn btn-ghost btn-full" style="text-decoration:none">📁 เปิด Google Drive</a>
    </div>
  </div>
  <div class="card card-p">
    <div class="card-title">📋 เกี่ยวกับระบบ</div>
    <div style="font-size:13px;color:var(--text-secondary);line-height:2">DLMS v2.0 · ศูนย์วิจัย 5 แห่ง · พนักงาน 47 คน · ใบขับขี่ 94 ใบ<br>Backend: Google Apps Script · DB: Google Sheets · Notification: Telegram</div>
  </div>`;
}

// ─── MODAL HELPERS ─────────────────────────────────────────────────────────
function showModal(id, title, body) {
  let overlay = $(id);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'modal-overlay';
    overlay.onclick = e => { if (e.target === overlay) closeModal(id); };
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="modal-box">
    <div class="modal-handle"></div>
    <div class="modal-title">${title}</div>
    ${body}
  </div>`;
  overlay.classList.add('show');
}
function closeModal(id) { const el = $(id); if (el) el.classList.remove('show'); }

// ─── TOAST ─────────────────────────────────────────────────────────────────
function showToast(msg, dur = 2800) {
  let t = $('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:calc(var(--nav-h)+16px);left:50%;transform:translateX(-50%);background:#1A2942;color:#fff;padding:10px 18px;border-radius:20px;font-size:13px;font-weight:500;z-index:400;opacity:0;transition:opacity .2s;white-space:nowrap;max-width:90vw;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.3)';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.opacity = '0'; }, dur);
}

// ─── DARK MODE ─────────────────────────────────────────────────────────────
function toggleDark() {
  const dark = document.body.classList.toggle('dark');
  $('dark-btn').textContent = dark ? '☀️' : '🌙';
  localStorage.setItem('dlms-dark', dark ? '1' : '0');
  showToast(dark ? '🌙 Dark Mode' : '☀️ Light Mode');
}

// ─── INIT ──────────────────────────────────────────────────────────────────
function init() {
  // Dark mode
  if (localStorage.getItem('dlms-dark') === '1') {
    document.body.classList.add('dark');
    setTimeout(() => { const b = $('dark-btn'); if (b) b.textContent = '☀️'; }, 50);
  }
  // Build sidebar items
  renderNav();
  // Render first page
  renderPage();
  // Preload in background
  setTimeout(() => {
    api('dashboard.summary').catch(() => {});
    api('dashboard.centerStats').catch(() => {});
    api('employees.list', { pageSize: 100 }).then(d => { S.empList = d; }).catch(() => {});
  }, 800);
}

document.addEventListener('DOMContentLoaded', init);
