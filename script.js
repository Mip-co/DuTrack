
// ============================================================
// DuTrack - Personal Finance Tracker
// ============================================================

// ===== STATE =====
let transactions = [];
let currentPage = 1;
const PER_PAGE = 10;
let currentType = 'income';
let editingId = null;
let filterMonth = '';
let supabaseClient = null;
let currentUser = null;
let isGuest = false;
let charts = {};
window.currentReceiptFile = null;

// ===== BEASISWA CONSTANTS =====
var BEASISWA_CATEGORIES = [
  'Makanan & Minuman',
  'Transport',
  'Kosan',
  'Belanja',
  'Hiburan',
  'Kesehatan',
  'Pendidikan',
  'Tagihan & Utilitas',
  'Lainnya',
];

var CAT_COLORS_HEX = [
  '7C6AF5','2ECC8E','F05E6A','F5B942','42D4F5',
  'F59C42','C942F5','42F5A4','A8A8C8',
];

// ===== SUPABASE CONFIG =====
let SUPABASE_URL = localStorage.getItem('ft_supabase_url') || '';
let SUPABASE_KEY = localStorage.getItem('ft_supabase_key') || '';

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  loadLocalData();
  initMonthFilter();
  checkAuth();
  setDefaultDate();
  updateLocalDataInfo();
  setupDragDrop();
});

function setDefaultDate() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('txDate').value = today;
  document.getElementById('ocrDate').value = today;
}

// ===== SUPABASE INIT =====
async function initSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  try {
    const { createClient } = await import(`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`);
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
    return true;
  } catch(e) {
    console.warn('Supabase init failed:', e);
    return false;
  }
}

// ===== AUTH =====
async function checkAuth() {
  const cfgOk = await initSupabase();
  if (!cfgOk || !supabaseClient) {
    // No supabase config, show auth with guest option
    showAuthScreen();
    return;
  }
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      currentUser = session.user;
      onLoginSuccess();
    } else {
      showAuthScreen();
    }
  } catch(e) {
    showAuthScreen();
  }
}

function showAuthScreen() {
  document.getElementById('authScreen').classList.add('visible');
}
function hideAuthScreen() {
  document.getElementById('authScreen').classList.remove('visible');
}
function showLogin() {
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('registerForm').style.display = 'none';
}
function showRegister() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = 'block';
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  if (!email || !pass) { showToast('Isi email dan password', 'error'); return; }
  if (!supabaseClient) { showToast('Konfigurasi Supabase belum diisi', 'error'); return; }
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    currentUser = data.user;
    onLoginSuccess();
    showToast('Login berhasil!', 'success');
  } catch(e) {
    showToast(e.message || 'Login gagal', 'error');
  }
}

async function handleRegister() {
  const email = document.getElementById('regEmail').value.trim();
  const pass = document.getElementById('regPass').value;
  if (!email || !pass) { showToast('Isi email dan password', 'error'); return; }
  if (!supabaseClient) { showToast('Konfigurasi Supabase belum diisi', 'error'); return; }
  try {
    const { data, error } = await supabaseClient.auth.signUp({ email, password: pass });
    if (error) throw error;
    showToast('Daftar berhasil! Cek email untuk verifikasi.', 'success');
    showLogin();
  } catch(e) {
    showToast(e.message || 'Registrasi gagal', 'error');
  }
}

function loginGuest() {
  isGuest = true;
  currentUser = null;
  onLoginSuccess();
  showToast('Mode lokal — data hanya tersimpan di browser', 'info');
}

async function onLoginSuccess() {

  hideAuthScreen();

  document.getElementById(
    'logoutBtn'
  ).style.display = 'flex';

  // ===== ACCOUNT INFO =====

  if (currentUser) {

    document.getElementById(
      'accountEmail'
    ).textContent =
      currentUser.email;

    document.getElementById(
      'accountAvatar'
    ).textContent =
      currentUser.email
        .charAt(0)
        .toUpperCase();
  }

  // ===== SYNC =====

  if (supabaseClient && currentUser) {
    await syncFromSupabase();
  }

  renderAll();
}

async function handleLogout() {
  if (supabaseClient && !isGuest) {
    await supabaseClient.auth.signOut();
  }
  currentUser = null;
  isGuest = false;
  document.getElementById('logoutBtn').style.display = 'none';
  showAuthScreen();
}

// ===== LOCAL DATA =====
function loadLocalData() {
  const stored = localStorage.getItem('ft_transactions');
  if (stored) {
    try { transactions = JSON.parse(stored); } catch(e) { transactions = []; }
  }
}
function saveLocalData() {
  localStorage.setItem('ft_transactions', JSON.stringify(transactions));
  updateLocalDataInfo();
}
function updateLocalDataInfo() {
  const el = document.getElementById('localDataInfo');
  if (el) {
    el.textContent = `${transactions.length} transaksi tersimpan lokal · ${(JSON.stringify(transactions).length / 1024).toFixed(1)} KB`;
  }
}

// ===== SUPABASE SYNC =====
async function syncFromSupabase() {
  if (!supabaseClient || !currentUser) return;
  try {
    const { data, error } = await supabaseClient
      .from('transactions')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('date', { ascending: false });
    if (error) throw error;
    if (data) {
      transactions = data.map(r => ({
        id: r.id,
        type: r.type,
        amount: r.amount,
        description: r.description,
        category: r.category,
        date: r.date
      }));
      saveLocalData();
    }
  } catch(e) {
    console.warn('Sync failed, using local:', e);
    showToast('Sync gagal, menggunakan data lokal', 'info');
  }
}

async function pushToSupabase(tx) {
  if (!supabaseClient || !currentUser) return;
  try {
    const { error } = await 
supabaseClient.from('transactions').upsert({
  user_id: currentUser.id,
  type: tx.type,
  amount: tx.amount,
  description: tx.description,
  category: tx.category,
  date: tx.date,
  receipt_url: tx.receipt_url
});
    if (error) throw error;
  } catch(e) {
    console.warn('Push failed:', e);
  }
}

async function deleteFromSupabase(id) {
  if (!supabaseClient || !currentUser) return;
  try {
    await supabaseClient.from('transactions').delete().eq('id', id);
  } catch(e) {
    console.warn('Delete failed:', e);
  }
}

// ===== TRANSACTION CRUD =====
function openModal(editId = null) {
  editingId = editId;
  const modal = document.getElementById('txModal');
  const title = document.getElementById('modalTitle');
  if (editId) {
    const tx = transactions.find(t => t.id === editId);
    if (!tx) return;
    title.textContent = 'Edit Transaksi';
    setType(tx.type);
    document.getElementById('txAmount').value = tx.amount;
    document.getElementById('txDesc').value = tx.description || '';
    document.getElementById('txCat').value = tx.category || 'Lainnya';
    document.getElementById('txDate').value = tx.date;
  } else {
    title.textContent = 'Tambah Transaksi';
    setType('expense');
    document.getElementById('txAmount').value = '';
    document.getElementById('txDesc').value = '';
    document.getElementById('txCat').value = 'Makanan';
    setDefaultDate();
  }
  modal.classList.add('open');
}

function closeModal() {
  document.getElementById('txModal').classList.remove('open');
  editingId = null;
}

function setType(type) {
  currentType = type;
  document.getElementById('btnIncome').classList.toggle('active', type === 'income');
  document.getElementById('btnExpense').classList.toggle('active', type === 'expense');
}

async function saveTransaction() {
  const amount = parseFloat(document.getElementById('txAmount').value);
  const desc = document.getElementById('txDesc').value.trim();
  const cat = document.getElementById('txCat').value;
  const date = document.getElementById('txDate').value;

  if (!amount || amount <= 0) { showToast('Nominal harus lebih dari 0', 'error'); return; }
  if (!desc) { showToast('Keterangan harus diisi', 'error'); return; }
  if (!date) { showToast('Tanggal harus diisi', 'error'); return; }

  const tx = {
    id: editingId || generateId(),
    type: currentType,
    amount,
    description: desc,
    category: cat,
    date
  };

  if (editingId) {
    transactions = transactions.map(t => t.id === editingId ? tx : t);
  } else {
    transactions.unshift(tx);
  }

  saveLocalData();
  await pushToSupabase(tx);
  closeModal();
  renderAll();
  showToast(editingId ? 'Transaksi diperbarui!' : 'Transaksi ditambahkan!', 'success');
}

async function deleteTransaction(id) {
  if (!confirm('Hapus transaksi ini?')) return;
  transactions = transactions.filter(t => t.id !== id);
  saveLocalData();
  await deleteFromSupabase(id);
  renderAll();
  showToast('Transaksi dihapus', 'info');
}

function generateId() {
  return crypto.randomUUID();
}

// ===== FILTER =====
function getFilteredTx() {
  let txs = [...transactions];
  if (filterMonth) {
    txs = txs.filter(t => t.date && t.date.startsWith(filterMonth));
  }
  return txs;
}

function filterByMonth() {
  filterMonth = document.getElementById('monthFilter').value;
  renderAll();
}

// ===== RENDER ALL =====
function renderAll() {
  updateStats();
  renderRecentTx();
  renderTransactions();
  renderCharts();
  renderAnalytics();
  renderMonthlyTable();
  updateCategoryFilter();
  initMonthFilter();
}

// ===== STATS =====
function updateStats() {
  const txs = getFilteredTx();
  const income = txs.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
  const balance = income - expense;
  const savings = income > 0 ? income - expense : 0;
  const savingsRate = income > 0 ? ((savings / income) * 100).toFixed(1) : 0;

  document.getElementById('totalBalance').textContent = formatRp(balance);
  document.getElementById('totalIncome').textContent = formatRp(income);
  document.getElementById('totalExpense').textContent = formatRp(expense);
  document.getElementById('totalSavings').textContent = formatRp(savings < 0 ? 0 : savings);
  document.getElementById('incomeCount').textContent = `${txs.filter(t=>t.type==='income').length} transaksi`;
  document.getElementById('expenseCount').textContent = `${txs.filter(t=>t.type==='expense').length} transaksi`;
  document.getElementById('savingsRate').textContent = `${savingsRate}% dari pemasukan`;
  document.getElementById('balanceChange').textContent = balance >= 0 ? '▲ Positif' : '▼ Defisit';
}

// ===== RECENT TX =====
function renderRecentTx() {
  const txs = getFilteredTx().slice(0, 5);
  const el = document.getElementById('recentTxList');
  if (txs.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">⊙</div><h3>Belum ada transaksi</h3><p>Klik "+ Transaksi" untuk mulai</p></div>';
    return;
  }
  el.innerHTML = txs.map(t => txItemHTML(t, false)).join('');
}

// ===== TRANSACTIONS LIST =====
function renderTransactions() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const typeF = document.getElementById('filterType').value;
  const catF = document.getElementById('filterCat').value;

  let txs = getFilteredTx().filter(t => {
    const matchSearch = !search || (t.description && t.description.toLowerCase().includes(search)) || (t.category && t.category.toLowerCase().includes(search));
    const matchType = !typeF || t.type === typeF;
    const matchCat = !catF || t.category === catF;
    return matchSearch && matchType && matchCat;
  });

  const total = txs.length;
  const pages = Math.ceil(total / PER_PAGE) || 1;
  if (currentPage > pages) currentPage = pages;

  const start = (currentPage - 1) * PER_PAGE;
  const pageTxs = txs.slice(start, start + PER_PAGE);

  const el = document.getElementById('txList');
  if (pageTxs.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">⊙</div><h3>Tidak ada transaksi</h3><p>Coba ubah filter pencarian</p></div>';
  } else {
    el.innerHTML = pageTxs.map(t => txItemHTML(t, true)).join('');
  }

  // Pagination
  document.getElementById('paginationInfo').textContent = total > 0 ? `${start+1}–${Math.min(start+PER_PAGE,total)} dari ${total} transaksi` : '';
  const btns = document.getElementById('paginationBtns');
  let html = '';
  html += `<button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage<=1?'disabled':''}>‹</button>`;
  for (let i = 1; i <= pages; i++) {
    if (pages <= 7 || Math.abs(i - currentPage) <= 2 || i === 1 || i === pages) {
      html += `<button class="page-btn ${i===currentPage?'active':''}" onclick="goPage(${i})">${i}</button>`;
    } else if (Math.abs(i - currentPage) === 3) {
      html += `<span style="padding:0 4px;color:var(--text3);line-height:32px;">…</span>`;
    }
  }
  html += `<button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage>=pages?'disabled':''}>›</button>`;
  btns.innerHTML = html;
}

function goPage(p) {
  const txs = getFilteredTx();
  const pages = Math.ceil(txs.length / PER_PAGE) || 1;
  if (p < 1 || p > pages) return;
  currentPage = p;
  renderTransactions();
}

function txItemHTML(tx, showActions) {
  const icon = tx.type === 'income' ? '↑' : '↓';
  const actions = showActions ? `
    <div class="tx-actions">
      <button class="icon-btn" onclick="openModal('${tx.id}')" title="Edit">✎</button>
      <button class="icon-btn danger" onclick="deleteTransaction('${tx.id}')" title="Hapus">⊘</button>
    </div>` : '';
  return `
    <div class="tx-item">
      <div class="tx-icon ${tx.type}">${icon}</div>
      <div class="tx-info">
        <div class="tx-name">${escHtml(tx.description || '—')}</div>
        <div class="tx-meta">
          <span>${formatDate(tx.date)}</span>
          <span class="tx-cat-badge">${escHtml(tx.category || 'Lainnya')}</span>
        </div>
      </div>
      <div class="tx-amount ${tx.type}">${tx.type === 'income' ? '+' : '-'}${formatRp(tx.amount)}</div>
      ${actions}
    </div>`;
}

// ===== CHARTS =====
function renderCharts() {
  renderTrendChart();
  renderCategoryChart();
}

function renderTrendChart() {
  const months = getLast6Months();
  const incomeData = months.map(m => {
    return transactions.filter(t => t.type==='income' && t.date && t.date.startsWith(m)).reduce((s,t) => s+t.amount, 0);
  });
  const expenseData = months.map(m => {
    return transactions.filter(t => t.type==='expense' && t.date && t.date.startsWith(m)).reduce((s,t) => s+t.amount, 0);
  });
  const labels = months.map(m => {
    const [y, mo] = m.split('-');
    return new Date(y, mo-1).toLocaleDateString('id', { month: 'short' });
  });

  if (charts.trend) charts.trend.destroy();
  const ctx = document.getElementById('trendChart').getContext('2d');
  charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Pemasukan', data: incomeData, borderColor: '#2ecc8e', backgroundColor: 'rgba(46,204,142,0.1)', fill: true, tension: 0.4, pointBackgroundColor: '#2ecc8e', pointRadius: 4 },
        { label: 'Pengeluaran', data: expenseData, borderColor: '#f05e6a', backgroundColor: 'rgba(240,94,106,0.1)', fill: true, tension: 0.4, pointBackgroundColor: '#f05e6a', pointRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#9090a8', font: { family: 'DM Mono' } } } },
      scales: {
        x: { ticks: { color: '#9090a8', font: { family: 'DM Mono', size: 11 } }, grid: { color: '#2a2a38' } },
        y: { ticks: { color: '#9090a8', font: { family: 'DM Mono', size: 11 }, callback: v => 'Rp'+formatNum(v) }, grid: { color: '#2a2a38' } }
      }
    }
  });
}

function renderCategoryChart() {
  const txs = getFilteredTx().filter(t => t.type === 'expense');
  const catMap = {};
  txs.forEach(t => { catMap[t.category] = (catMap[t.category]||0) + t.amount; });
  const labels = Object.keys(catMap);
  const data = Object.values(catMap);
  const colors = ['#7c6af5','#2ecc8e','#f05e6a','#f5b942','#42d4f5','#f59c42','#c942f5','#42f5a4','#f54242','#a8f542'];

  if (charts.category) charts.category.destroy();
  const ctx = document.getElementById('categoryChart').getContext('2d');
  if (!labels.length) {
    charts.category = new Chart(ctx, { type: 'doughnut', data: { labels: ['Belum ada data'], datasets: [{ data: [1], backgroundColor: ['#2a2a38'], borderColor: 'transparent' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
    return;
  }
  charts.category = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, labels.length), borderColor: 'transparent', hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#9090a8', font: { family: 'DM Mono', size: 10 }, padding: 10, boxWidth: 10 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${formatRp(ctx.raw)}` } }
      }
    }
  });
}

// ===== ANALYTICS =====
function renderAnalytics() {
  renderAnalyticsCatChart();
  renderAnalyticsBarChart();
  renderCatBreakdown();
}

function renderAnalyticsCatChart() {
  const txs = getFilteredTx().filter(t => t.type === 'expense');
  const catMap = {};
  txs.forEach(t => { catMap[t.category] = (catMap[t.category]||0) + t.amount; });
  const labels = Object.keys(catMap);
  const data = Object.values(catMap);
  const colors = ['#7c6af5','#2ecc8e','#f05e6a','#f5b942','#42d4f5','#f59c42','#c942f5','#42f5a4'];

  if (charts.analyticsCat) charts.analyticsCat.destroy();
  const ctx = document.getElementById('analyticsCatChart').getContext('2d');
  if (!labels.length) { return; }
  charts.analyticsCat = new Chart(ctx, {
    type: 'pie',
    data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, labels.length), borderColor: 'transparent' }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#9090a8', font: { family: 'DM Mono', size: 10 }, padding: 10 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${formatRp(ctx.raw)}` } }
      }
    }
  });
}

function renderCatBreakdown() {
  const txs = getFilteredTx().filter(t => t.type === 'expense');
  const catMap = {};
  txs.forEach(t => { catMap[t.category] = (catMap[t.category]||0) + t.amount; });
  const total = Object.values(catMap).reduce((s,v) => s+v, 0);
  const sorted = Object.entries(catMap).sort((a,b) => b[1]-a[1]);
  const colors = ['#7c6af5','#2ecc8e','#f05e6a','#f5b942','#42d4f5','#f59c42','#c942f5','#42f5a4'];
  const el = document.getElementById('catBreakdown');
  if (!sorted.length) { el.innerHTML = '<div style="color:var(--text3);font-size:0.78rem;">Belum ada data pengeluaran</div>'; return; }
  el.innerHTML = sorted.map(([cat, amt], i) => {
    const pct = total > 0 ? ((amt / total) * 100).toFixed(1) : 0;
    return `<div class="cat-row">
      <div class="cat-dot" style="background:${colors[i % colors.length]}"></div>
      <div class="cat-label">${escHtml(cat)}</div>
      <div class="cat-bar-wrap"><div class="cat-bar" style="width:${pct}%;background:${colors[i % colors.length]}"></div></div>
      <div class="cat-pct">${pct}%</div>
      <div class="cat-amount">${formatRp(amt)}</div>
    </div>`;
  }).join('');
}

function renderAnalyticsBarChart() {
  const months = getLast6Months();
  const incomeData = months.map(m => transactions.filter(t => t.type==='income' && t.date && t.date.startsWith(m)).reduce((s,t) => s+t.amount, 0));
  const expenseData = months.map(m => transactions.filter(t => t.type==='expense' && t.date && t.date.startsWith(m)).reduce((s,t) => s+t.amount, 0));
  const labels = months.map(m => { const [y,mo] = m.split('-'); return new Date(y,mo-1).toLocaleDateString('id',{month:'short'}); });

  if (charts.analyticsBar) charts.analyticsBar.destroy();
  const ctx = document.getElementById('analyticsBarChart').getContext('2d');
  charts.analyticsBar = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Pemasukan', data: incomeData, backgroundColor: 'rgba(46,204,142,0.7)', borderRadius: 6 },
      { label: 'Pengeluaran', data: expenseData, backgroundColor: 'rgba(240,94,106,0.7)', borderRadius: 6 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#9090a8', font: { family: 'DM Mono' } } } },
      scales: {
        x: { ticks: { color: '#9090a8', font: { family: 'DM Mono', size: 11 } }, grid: { display: false } },
        y: { ticks: { color: '#9090a8', font: { family: 'DM Mono', size: 11 }, callback: v => 'Rp'+formatNum(v) }, grid: { color: '#2a2a38' } }
      }
    }
  });
}

function renderMonthlyTable() {
  const months = getLast6Months().reverse();
  const tbody = document.getElementById('monthlyTableBody');
  tbody.innerHTML = months.map(m => {
    const txs = transactions.filter(t => t.date && t.date.startsWith(m));
    const income = txs.filter(t => t.type==='income').reduce((s,t) => s+t.amount, 0);
    const expense = txs.filter(t => t.type==='expense').reduce((s,t) => s+t.amount, 0);
    const balance = income - expense;
    const savRate = income > 0 ? ((Math.max(0, balance) / income) * 100).toFixed(0) : 0;
    const [y,mo] = m.split('-');
    const label = new Date(y,mo-1).toLocaleDateString('id',{month:'long',year:'numeric'});
    return `<tr>
      <td>${label}</td>
      <td class="positive">${formatRp(income)}</td>
      <td class="negative">${formatRp(expense)}</td>
      <td class="${balance>=0?'positive':'negative'}">${formatRp(balance)}</td>
      <td style="color:var(--yellow)">${savRate}%</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px;">Belum ada data</td></tr>';
}

// ===== MONTH FILTER =====
function initMonthFilter() {
  const select = document.getElementById('monthFilter');
  const current = select.value;
  const months = getLast12Months();
  select.innerHTML = '<option value="">Semua Bulan</option>' +
    months.map(m => {
      const [y,mo] = m.split('-');
      const label = new Date(y,mo-1).toLocaleDateString('id',{month:'long',year:'numeric'});
      return `<option value="${m}" ${m===current?'selected':''}>${label}</option>`;
    }).join('');
}

function updateCategoryFilter() {
  const cats = [...new Set(transactions.map(t => t.category).filter(Boolean))];
  const select = document.getElementById('filterCat');
  const current = select.value;
  select.innerHTML = '<option value="">Semua Kategori</option>' +
    cats.map(c => `<option value="${c}" ${c===current?'selected':''}>${c}</option>`).join('');
}

// ===== NAVIGATION =====
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');
  const titles = { dashboard: 'Dashboard', transactions: 'Transaksi', analytics: 'Analitik', scanner: 'Scan Struk', settings: 'Pengaturan' };
  document.getElementById('pageTitle').textContent = titles[page] || page;
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.textContent.trim().toLowerCase().includes(page === 'dashboard' ? 'dashboard' : page === 'scanner' ? 'scan' : page)) {
      n.classList.add('active');
    }
  });
  closeSidebar();
  if (page === 'analytics') { renderAnalytics(); renderMonthlyTable(); }
  if (page === 'settings') {
    document.getElementById('cfgUrl').value = SUPABASE_URL;
    document.getElementById('cfgKey').value = SUPABASE_KEY;
  }
}

function toggleSidebar() {
  const s = document.getElementById('sidebar');
  const o = document.getElementById('sidebarOverlay');
  s.classList.toggle('open');
  o.style.display = s.classList.contains('open') ? 'block' : 'none';
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').style.display = 'none';
}

// ===== THEME =====
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  document.getElementById('themeIcon').textContent = isDark ? '☽' : '☀';
  document.getElementById('themeLabel').textContent = isDark ? 'Mode Gelap' : 'Mode Terang';
  localStorage.setItem('ft_theme', isDark ? 'light' : 'dark');
  setTimeout(() => renderCharts(), 100);
}

// Apply saved theme
(function() {
  const saved = localStorage.getItem('ft_theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    document.getElementById('themeIcon').textContent = saved === 'light' ? '☽' : '☀';
    document.getElementById('themeLabel').textContent = saved === 'light' ? 'Mode Gelap' : 'Mode Terang';
  }
})();

// ===== OCR SCANNER =====
function setupDragDrop() {
  const zone = document.getElementById('scannerZone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) processReceiptFile(file);
  });
}

function processReceipt(event) {
  const file = event.target.files[0];
  if (file) processReceiptFile(file);
}

async function processReceiptFile(file) {

  window.currentReceiptFile = file;

  const progress = document.getElementById('ocrProgress');
  const preview = document.getElementById('ocrPreview');
  const bar = document.getElementById('progressBar');
  const status = document.getElementById('progressStatus');
  const label = document.getElementById('ocrLabel');

  // Show preview image
  const reader = new FileReader();

  reader.onload = e => {
    document.getElementById('previewImg').src =
      e.target.result;
  };

  reader.readAsDataURL(file);

  progress.classList.add('visible');
  preview.classList.remove('visible');

  bar.style.width = '0%';

  label.textContent =
    'Memproses OCR dengan Tesseract.js...';

  status.textContent = 'Menginisialisasi...';

  try {

    const { createWorker } = Tesseract;

    const worker = await createWorker('ind+eng', 1, {
      logger: m => {

        if (m.status === 'recognizing text') {

          bar.style.width =
            (m.progress * 100).toFixed(0) + '%';

          status.textContent =
            `Membaca teks: ${(m.progress * 100).toFixed(0)}%`;

        } else {
          status.textContent = m.status;
        }
      }
    });

    const {
      data: { text }
    } = await worker.recognize(file);

    await worker.terminate();

    bar.style.width = '100%';

    status.textContent = 'OCR selesai!';

    const amount = extractAmount(text);
    const date = extractDate(text);

    document.getElementById('ocrRaw').value = text;

    document.getElementById('ocrAmount').value =
      amount || '';

    document.getElementById('ocrDate').value =
      date || new Date().toISOString().split('T')[0];

    document.getElementById('ocrDesc').value =
      'Pengeluaran dari struk';

    progress.classList.remove('visible');

    preview.classList.add('visible');

    showToast(
      'OCR berhasil! Periksa dan edit data jika perlu.',
      'success'
    );

  } catch(e) {

    status.textContent = 'Error: ' + e.message;

    bar.style.width = '0%';

    showToast(
      'OCR gagal: ' + e.message,
      'error'
    );
  }
}

function extractAmount(text) {
  // Try to find total/amount in receipt text
  const patterns = [
    /total[:\s]+rp?\s*([0-9.,]+)/i,
    /jumlah[:\s]+rp?\s*([0-9.,]+)/i,
    /grand\s*total[:\s]+rp?\s*([0-9.,]+)/i,
    /amount[:\s]+rp?\s*([0-9.,]+)/i,
    /bayar[:\s]+rp?\s*([0-9.,]+)/i,
    /rp\s*([0-9]{4,}[.,][0-9]{3})/i,
    /([0-9]{1,3}(?:[.,][0-9]{3})+)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      return m[1].replace(/[.,]/g, '').replace(/[^0-9]/g, '');
    }
  }
  return '';
}

function extractDate(text) {
  const patterns = [
    /(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/,
    /(\d{4})[\/\-\.](\d{2})[\/\-\.](\d{2})/,
    /(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{2})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      if (m[3] && m[3].length === 4) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
      if (m[1] && m[1].length === 4) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
      const year = new Date().getFullYear();
      return `${year}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    }
  }
  return null;
}

async function insertOCRTransaction() {

  const amount = parseFloat(
    document.getElementById('ocrAmount').value
  );

  const date =
    document.getElementById('ocrDate').value;

  const desc =
    document.getElementById('ocrDesc').value.trim();

  if (!amount || amount <= 0) {
    showToast('Nominal tidak valid', 'error');
    return;
  }

  if (!date) {
    showToast('Tanggal harus diisi', 'error');
    return;
  }

  // ===== UPLOAD RECEIPT =====

  let receiptUrl = null;

  if (
    window.currentReceiptFile &&
    supabaseClient
  ) {

    try {

      const fileExt =
        window.currentReceiptFile.name
          .split('.')
          .pop();

      const fileName =
        `${Date.now()}.${fileExt}`;

      const { error: uploadError } =
        await supabaseClient.storage
          .from('receipts')
          .upload(
            fileName,
            window.currentReceiptFile
          );

      if (uploadError) {

        console.error(uploadError);

      } else {

        const { data } =
          supabaseClient.storage
            .from('receipts')
            .getPublicUrl(fileName);

        receiptUrl = data.publicUrl;
      }

    } catch(err) {
      console.error(err);
    }
  }

  // ===== CREATE TX =====

  const tx = {
    id: generateId(),
    type: 'expense',
    amount,
    description:
      desc || 'Pengeluaran struk',
    category:
      document.getElementById('ocrCategory').value,
    date,
    receipt_url: receiptUrl
  };

  transactions.unshift(tx);

  saveLocalData();

  await pushToSupabase(tx);

  renderAll();

  document.getElementById('ocrPreview')
    .classList.remove('visible');

  document.getElementById('receiptFile').value = '';

  window.currentReceiptFile = null;

  showToast(
    'Transaksi + struk berhasil disimpan!',
    'success'
  );

  navigate('transactions');
}



// ===== EXPORT XLSX =====
// Multi-sheet: Ringkasan, Semua Transaksi, Pemasukan,
//              Pengeluaran, Per Kategori, Per Bulan

// function exportXLSX() {

//   const txs = getFilteredTx();

//   if (!txs.length) {
//     showToast('Tidak ada data untuk diexport', 'info');
//     return;
//   }

//   const workbook = XLSX.utils.book_new();

//   // ----------------------------------------------------------
//   // HELPER: style header row (bold + bg color)
//   // SheetJS community edition tidak support cell styling,
//   // tapi kita bisa pakai format angka & lebar kolom.
//   // ----------------------------------------------------------

//   const rp = n => Math.round(n); // simpan sebagai angka supaya bisa diformat di Excel

//   const income  = txs.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
//   const expense = txs.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
//   const balance = income - expense;
//   const savingsRate = income > 0 ? ((Math.max(0, balance) / income) * 100).toFixed(1) : 0;

//   // ==========================================================
//   // SHEET 1 — RINGKASAN
//   // ==========================================================

//   const summaryRows = [
//     ['DuTrack — Laporan Keuangan'],
//     ['Tanggal Export', new Date().toLocaleDateString('id', { dateStyle: 'long' })],
//     ['Filter Bulan', filterMonth || 'Semua Bulan'],
//     [],
//     ['RINGKASAN'],
//     ['Total Pemasukan',  rp(income)],
//     ['Total Pengeluaran', rp(expense)],
//     ['Saldo',            rp(balance)],
//     ['Tabungan (bersih)', rp(Math.max(0, balance))],
//     ['Savings Rate',     `${savingsRate}%`],
//     [],
//     ['Jumlah Transaksi Pemasukan',  txs.filter(t => t.type === 'income').length],
//     ['Jumlah Transaksi Pengeluaran', txs.filter(t => t.type === 'expense').length],
//     ['Total Transaksi', txs.length],
//   ];

//   const wsRingkasan = XLSX.utils.aoa_to_sheet(summaryRows);
//   wsRingkasan['!cols'] = [{ wch: 30 }, { wch: 24 }];
//   XLSX.utils.book_append_sheet(workbook, wsRingkasan, 'Ringkasan');

//   // ==========================================================
//   // SHEET 2 — SEMUA TRANSAKSI
//   // ==========================================================

//   const allRows = txs.map(t => ({
//     Tanggal:     t.date || '-',
//     Tipe:        t.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
//     Keterangan:  t.description || '-',
//     Kategori:    t.category || '-',
//     Nominal:     rp(t.amount),
//     'Nominal (Signed)': t.type === 'income' ? rp(t.amount) : rp(-t.amount),
//   }));

//   const wsAll = XLSX.utils.json_to_sheet(allRows);
//   wsAll['!cols'] = [
//     { wch: 14 }, { wch: 14 }, { wch: 36 },
//     { wch: 20 }, { wch: 18 }, { wch: 18 },
//   ];
//   XLSX.utils.book_append_sheet(workbook, wsAll, 'Semua Transaksi');

//   // ==========================================================
//   // SHEET 3 — PEMASUKAN
//   // ==========================================================

//   const incomeRows = txs
//     .filter(t => t.type === 'income')
//     .map(t => ({
//       Tanggal:    t.date || '-',
//       Keterangan: t.description || '-',
//       Kategori:   t.category || '-',
//       Nominal:    rp(t.amount),
//     }));

//   const wsIncome = XLSX.utils.json_to_sheet(
//     incomeRows.length ? incomeRows : [{ Info: 'Tidak ada data pemasukan' }]
//   );
//   wsIncome['!cols'] = [{ wch: 14 }, { wch: 36 }, { wch: 20 }, { wch: 18 }];
//   XLSX.utils.book_append_sheet(workbook, wsIncome, 'Pemasukan');

//   // ==========================================================
//   // SHEET 4 — PENGELUARAN
//   // ==========================================================

//   const expenseRows = txs
//     .filter(t => t.type === 'expense')
//     .map(t => ({
//       Tanggal:    t.date || '-',
//       Keterangan: t.description || '-',
//       Kategori:   t.category || '-',
//       Nominal:    rp(t.amount),
//     }));

//   const wsExpense = XLSX.utils.json_to_sheet(
//     expenseRows.length ? expenseRows : [{ Info: 'Tidak ada data pengeluaran' }]
//   );
//   wsExpense['!cols'] = [{ wch: 14 }, { wch: 36 }, { wch: 20 }, { wch: 18 }];
//   XLSX.utils.book_append_sheet(workbook, wsExpense, 'Pengeluaran');

//   // ==========================================================
//   // SHEET 5 — RINGKASAN PER KATEGORI
//   // ==========================================================

//   const expTxs = txs.filter(t => t.type === 'expense');
//   const catMap = {};
//   expTxs.forEach(t => {
//     const c = t.category || 'Lainnya';
//     if (!catMap[c]) catMap[c] = { total: 0, count: 0 };
//     catMap[c].total += t.amount;
//     catMap[c].count += 1;
//   });

//   const totalExp = Object.values(catMap).reduce((s,v) => s + v.total, 0);
//   const catRows = Object.entries(catMap)
//     .sort((a, b) => b[1].total - a[1].total)
//     .map(([cat, v]) => ({
//       Kategori:           cat,
//       'Jumlah Transaksi': v.count,
//       'Total Pengeluaran': rp(v.total),
//       'Persentase':       totalExp > 0 ? `${((v.total / totalExp) * 100).toFixed(1)}%` : '0%',
//     }));

//   const wsCat = XLSX.utils.json_to_sheet(
//     catRows.length ? catRows : [{ Info: 'Tidak ada data pengeluaran' }]
//   );
//   wsCat['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 22 }, { wch: 14 }];
//   XLSX.utils.book_append_sheet(workbook, wsCat, 'Per Kategori');

//   // ==========================================================
//   // SHEET 6 — RINGKASAN PER BULAN
//   // ==========================================================

//   const months = getLast12Months().reverse(); // urut dari terlama
//   const monthRows = months.map(m => {
//     const mTxs   = transactions.filter(t => t.date && t.date.startsWith(m));
//     const mInc   = mTxs.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
//     const mExp   = mTxs.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
//     const mBal   = mInc - mExp;
//     const mRate  = mInc > 0 ? `${((Math.max(0, mBal) / mInc) * 100).toFixed(0)}%` : '-';
//     const [y, mo] = m.split('-');
//     return {
//       Bulan:        new Date(y, mo-1).toLocaleDateString('id', { month: 'long', year: 'numeric' }),
//       Pemasukan:    rp(mInc),
//       Pengeluaran:  rp(mExp),
//       Saldo:        rp(mBal),
//       'Savings Rate': mRate,
//       'Jml Transaksi': mTxs.length,
//     };
//   }).filter(r => r['Jml Transaksi'] > 0);

//   const wsMonthly = XLSX.utils.json_to_sheet(
//     monthRows.length ? monthRows : [{ Info: 'Belum ada data' }]
//   );
//   wsMonthly['!cols'] = [
//     { wch: 22 }, { wch: 18 }, { wch: 18 },
//     { wch: 18 }, { wch: 14 }, { wch: 16 },
//   ];
//   XLSX.utils.book_append_sheet(workbook, wsMonthly, 'Per Bulan');

//   // ==========================================================
//   // SAVE
//   // ==========================================================

//   XLSX.writeFile(
//     workbook,
//     `DuTrack_${new Date().toISOString().split('T')[0]}.xlsx`
//   );

//   showToast('XLSX berhasil diexport! (6 sheet)', 'success');
// }


// ===== EXPORT PDF =====
// Halaman 1 : Ringkasan + tabel per kategori + per bulan
// Halaman 2+ : Tabel semua transaksi dengan auto page break

// async function exportPDF() {

//   const { jsPDF } = window.jspdf;
//   const pdf = new jsPDF('p', 'mm', 'a4');

//   const txs     = getFilteredTx();
//   const income  = txs.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
//   const expense = txs.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
//   const balance = income - expense;
//   const savRate = income > 0 ? ((Math.max(0, balance) / income) * 100).toFixed(1) : 0;

//   // ----------------------------------------------------------
//   // WARNA
//   // ----------------------------------------------------------
//   const C = {
//     purple:  [124, 106, 245],
//     green:   [46,  204, 142],
//     red:     [240, 94,  106],
//     yellow:  [245, 185, 66],
//     dark:    [20,  20,  30],
//     grey:    [100, 100, 120],
//     light:   [240, 240, 248],
//     white:   [255, 255, 255],
//     border:  [210, 210, 220],
//   };

//   // ----------------------------------------------------------
//   // HELPER
//   // ----------------------------------------------------------
//   const W = 210; // A4 width mm
//   const ML = 14; // margin left
//   const MR = 14; // margin right
//   const CW = W - ML - MR; // content width

//   function setColor(rgb)   { pdf.setTextColor(...rgb); }
//   function setFill(rgb)    { pdf.setFillColor(...rgb); }
//   function setDraw(rgb)    { pdf.setDrawColor(...rgb); }
//   function rect(x,y,w,h,style='F') { pdf.rect(x,y,w,h,style); }
//   function rpFmt(n)  { return 'Rp ' + Math.round(Math.abs(n)).toLocaleString('id'); }
//   function truncate(str, max) {
//     if (!str) return '-';
//     return str.length > max ? str.slice(0, max - 1) + '…' : str;
//   }

//   // ----------------------------------------------------------
//   // HALAMAN 1 — HEADER
//   // ----------------------------------------------------------

//   // Background strip header
//   setFill(C.purple);
//   rect(0, 0, W, 28);

//   // Title
//   pdf.setFontSize(18);
//   pdf.setFont('helvetica', 'bold');
//   setColor(C.white);
//   pdf.text('DuTrack — Laporan Keuangan', ML, 13);

//   // Subtitle (tanggal & filter)
//   pdf.setFontSize(8);
//   pdf.setFont('helvetica', 'normal');
//   setColor([210, 200, 255]);
//   const filterLabel = filterMonth
//     ? (() => { const [y,m] = filterMonth.split('-'); return new Date(y,m-1).toLocaleDateString('id',{month:'long',year:'numeric'}); })()
//     : 'Semua Bulan';
//   pdf.text(`Diekspor: ${new Date().toLocaleDateString('id',{dateStyle:'long'})}   ·   Filter: ${filterLabel}`, ML, 21);

//   let y = 36;

//   // ----------------------------------------------------------
//   // KOTAK RINGKASAN (3 kolom)
//   // ----------------------------------------------------------

//   const boxW = (CW - 8) / 3;
//   const boxes = [
//     { label: 'Total Pemasukan',  value: rpFmt(income),  color: C.green,  bg: [236, 252, 245] },
//     { label: 'Total Pengeluaran', value: rpFmt(expense), color: C.red,    bg: [254, 242, 243] },
//     { label: 'Saldo Akhir',       value: rpFmt(balance), color: C.purple, bg: [243, 241, 255] },
//   ];

//   boxes.forEach((b, i) => {
//     const bx = ML + i * (boxW + 4);
//     setFill(b.bg);
//     setDraw(C.border);
//     pdf.roundedRect(bx, y, boxW, 20, 2, 2, 'FD');
//     pdf.setFontSize(7);
//     pdf.setFont('helvetica', 'normal');
//     setColor(C.grey);
//     pdf.text(b.label, bx + 4, y + 6);
//     pdf.setFontSize(11);
//     pdf.setFont('helvetica', 'bold');
//     setColor(b.color);
//     pdf.text(b.value, bx + 4, y + 14);
//   });

//   y += 26;

//   // Baris savings rate kecil
//   pdf.setFontSize(8);
//   pdf.setFont('helvetica', 'normal');
//   setColor(C.grey);
//   pdf.text(`Savings Rate: ${savRate}%   ·   Total Transaksi: ${txs.length}   ·   Pemasukan: ${txs.filter(t=>t.type==='income').length} tx   ·   Pengeluaran: ${txs.filter(t=>t.type==='expense').length} tx`, ML, y);

//   y += 10;

//   // ----------------------------------------------------------
//   // SECTION: RINGKASAN PER KATEGORI
//   // ----------------------------------------------------------

//   const expTxs = txs.filter(t => t.type === 'expense');
//   const catMap = {};
//   expTxs.forEach(t => {
//     const c = t.category || 'Lainnya';
//     if (!catMap[c]) catMap[c] = { total: 0, count: 0 };
//     catMap[c].total += t.amount;
//     catMap[c].count += 1;
//   });
//   const totalExp = Object.values(catMap).reduce((s,v) => s + v.total, 0);
//   const catEntries = Object.entries(catMap).sort((a,b) => b[1].total - a[1].total);

//   if (catEntries.length) {
//     // Section title
//     pdf.setFontSize(10);
//     pdf.setFont('helvetica', 'bold');
//     setColor(C.dark);
//     pdf.text('Pengeluaran per Kategori', ML, y);
//     y += 5;

//     // Table header
//     setFill(C.purple);
//     rect(ML, y, CW, 6);
//     pdf.setFontSize(7.5);
//     pdf.setFont('helvetica', 'bold');
//     setColor(C.white);
//     pdf.text('Kategori',           ML + 2, y + 4.2);
//     pdf.text('Jml Tx',             ML + 60, y + 4.2);
//     pdf.text('Total',              ML + 90, y + 4.2);
//     pdf.text('%',                  ML + 135, y + 4.2);
//     y += 6;

//     catEntries.forEach(([cat, v], i) => {
//       const bg = i % 2 === 0 ? C.white : C.light;
//       setFill(bg);
//       rect(ML, y, CW, 5.5);
//       pdf.setFontSize(7.5);
//       pdf.setFont('helvetica', 'normal');
//       setColor(C.dark);
//       pdf.text(truncate(cat, 28),   ML + 2, y + 3.8);
//       pdf.text(String(v.count),     ML + 60, y + 3.8);
//       pdf.text(rpFmt(v.total),      ML + 90, y + 3.8);
//       const pct = totalExp > 0 ? ((v.total / totalExp) * 100).toFixed(1) + '%' : '-';
//       pdf.text(pct,                 ML + 135, y + 3.8);
//       y += 5.5;
//     });

//     y += 6;
//   }

//   // ----------------------------------------------------------
//   // SECTION: RINGKASAN PER BULAN
//   // ----------------------------------------------------------

//   const months = getLast6Months().reverse();
//   const monthData = months.map(m => {
//     const mTxs  = transactions.filter(t => t.date && t.date.startsWith(m));
//     const mInc  = mTxs.filter(t => t.type==='income').reduce((s,t)=>s+t.amount,0);
//     const mExp  = mTxs.filter(t => t.type==='expense').reduce((s,t)=>s+t.amount,0);
//     const mBal  = mInc - mExp;
//     const [yr, mo] = m.split('-');
//     return {
//       label:   new Date(yr, mo-1).toLocaleDateString('id',{month:'short',year:'2-digit'}),
//       income:  mInc,
//       expense: mExp,
//       balance: mBal,
//     };
//   }).filter(r => r.income > 0 || r.expense > 0);

//   if (monthData.length) {
//     if (y > 240) { pdf.addPage(); y = 16; }

//     pdf.setFontSize(10);
//     pdf.setFont('helvetica', 'bold');
//     setColor(C.dark);
//     pdf.text('Ringkasan per Bulan (6 Bulan Terakhir)', ML, y);
//     y += 5;

//     // Table header
//     setFill(C.purple);
//     rect(ML, y, CW, 6);
//     pdf.setFontSize(7.5);
//     pdf.setFont('helvetica', 'bold');
//     setColor(C.white);
//     pdf.text('Bulan',      ML + 2,  y + 4.2);
//     pdf.text('Pemasukan',  ML + 40, y + 4.2);
//     pdf.text('Pengeluaran',ML + 90, y + 4.2);
//     pdf.text('Saldo',      ML + 140, y + 4.2);
//     y += 6;

//     monthData.forEach((r, i) => {
//       const bg = i % 2 === 0 ? C.white : C.light;
//       setFill(bg);
//       rect(ML, y, CW, 5.5);
//       pdf.setFontSize(7.5);
//       pdf.setFont('helvetica', 'normal');
//       setColor(C.dark);
//       pdf.text(r.label,         ML + 2,  y + 3.8);
//       setColor(C.green);
//       pdf.text(rpFmt(r.income), ML + 40, y + 3.8);
//       setColor(C.red);
//       pdf.text(rpFmt(r.expense),ML + 90, y + 3.8);
//       setColor(r.balance >= 0 ? C.green : C.red);
//       pdf.text(rpFmt(r.balance),ML + 140, y + 3.8);
//       y += 5.5;
//     });
//   }

//   // ----------------------------------------------------------
//   // HALAMAN BARU — TABEL SEMUA TRANSAKSI
//   // ----------------------------------------------------------

//   if (!txs.length) {
//     pdf.save(`DuTrack_${new Date().toISOString().split('T')[0]}.pdf`);
//     showToast('PDF berhasil diexport!', 'success');
//     return;
//   }

//   pdf.addPage();
//   y = 16;

//   // Section title
//   pdf.setFontSize(13);
//   pdf.setFont('helvetica', 'bold');
//   setColor(C.dark);
//   pdf.text('Daftar Transaksi', ML, y);
//   y += 7;

//   // Kolom: Tanggal | Tipe | Keterangan | Kategori | Nominal
//   const cols = [
//     { label: 'Tanggal',    x: ML,       w: 24 },
//     { label: 'Tipe',       x: ML + 24,  w: 20 },
//     { label: 'Keterangan', x: ML + 44,  w: 62 },
//     { label: 'Kategori',   x: ML + 106, w: 38 },
//     { label: 'Nominal',    x: ML + 144, w: 38 },
//   ];

//   function drawTableHeader() {
//     setFill(C.purple);
//     rect(ML, y, CW, 6.5);
//     pdf.setFontSize(7.5);
//     pdf.setFont('helvetica', 'bold');
//     setColor(C.white);
//     cols.forEach(c => pdf.text(c.label, c.x + 1.5, y + 4.5));
//     y += 6.5;
//   }

//   drawTableHeader();

//   txs.forEach((tx, i) => {
//     // Auto page break
//     if (y > 272) {
//       pdf.addPage();
//       y = 16;
//       drawTableHeader();
//     }

//     const rowH = 5.5;
//     const bg = i % 2 === 0 ? C.white : C.light;
//     setFill(bg);
//     rect(ML, y, CW, rowH);

//     pdf.setFontSize(7.5);
//     pdf.setFont('helvetica', 'normal');

//     // Tanggal
//     setColor(C.grey);
//     pdf.text(tx.date || '-', cols[0].x + 1.5, y + 3.8);

//     // Tipe
//     setColor(tx.type === 'income' ? C.green : C.red);
//     pdf.text(tx.type === 'income' ? 'Pemasukan' : 'Pengeluaran', cols[1].x + 1.5, y + 3.8);

//     // Keterangan
//     setColor(C.dark);
//     pdf.text(truncate(tx.description || '-', 34), cols[2].x + 1.5, y + 3.8);

//     // Kategori
//     setColor(C.grey);
//     pdf.text(truncate(tx.category || '-', 20), cols[3].x + 1.5, y + 3.8);

//     // Nominal
//     setColor(tx.type === 'income' ? C.green : C.red);
//     const sign = tx.type === 'income' ? '+' : '-';
//     pdf.text(sign + rpFmt(tx.amount), cols[4].x + 1.5, y + 3.8);

//     y += rowH;
//   });

//   // ----------------------------------------------------------
//   // FOOTER setiap halaman
//   // ----------------------------------------------------------

//   const totalPages = pdf.internal.getNumberOfPages();
//   for (let p = 1; p <= totalPages; p++) {
//     pdf.setPage(p);
//     pdf.setFontSize(7.5);
//     pdf.setFont('helvetica', 'normal');
//     setColor(C.grey);
//     pdf.text(`Halaman ${p} dari ${totalPages}`, ML, 290);
//     pdf.text('Generated by DuTrack', W - MR - 34, 290);
//   }

//   // ----------------------------------------------------------
//   // SAVE
//   // ----------------------------------------------------------

//   pdf.save(`DuTrack_${new Date().toISOString().split('T')[0]}.pdf`);
//   showToast('PDF berhasil diexport!', 'success');
// }


 
 
// ===== MODAL CONTROL ========================================

function openLpjModal() {
 
  // Populate semester options dari data transaksi yang ada
  const semesterSelect = document.getElementById('lpjSemester');
  semesterSelect.innerHTML = '';
 
  const monthsAvail = [...new Set(
    transactions
      .filter(t => t.type === 'expense' && t.date)
      .map(t => t.date.slice(0, 7))
  )].sort();
 
  if (!monthsAvail.length) {
    showToast('Belum ada transaksi pengeluaran', 'info');
    return;
  }
 
  // Build semester options (6-month groups)
  const semesterOptions = buildSemesterOptions(monthsAvail);
  semesterOptions.forEach(opt => {
    const el = document.createElement('option');
    el.value = JSON.stringify(opt.months);
    el.textContent = opt.label;
    semesterSelect.appendChild(el);
  });
 
  // Tambah opsi "Semua data"
  const allOpt = document.createElement('option');
  allOpt.value = JSON.stringify(monthsAvail);
  allOpt.textContent = `Semua Data (${monthsAvail.length} bulan)`;
  semesterSelect.appendChild(allOpt);
 
  document.getElementById('lpjModal').style.display = 'flex';
}
 
function closeLpjModal() {
  document.getElementById('lpjModal').style.display = 'none';
}
 
function buildSemesterOptions(months) {
  // Kelompokkan per 6 bulan
  const options = [];
  const semLabels = {
    '01': 'Genap', '02': 'Genap', '03': 'Genap', '04': 'Genap',
    '05': 'Genap', '06': 'Genap',
    '07': 'Ganjil', '08': 'Ganjil', '09': 'Ganjil', '10': 'Ganjil',
    '11': 'Ganjil', '12': 'Ganjil',
  };
  const monthNames = {
    '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'Mei','06':'Jun',
    '07':'Jul','08':'Agu','09':'Sep','10':'Okt','11':'Nov','12':'Des',
  };
 
  // Group by semester (Ganjil = Jul-Des, Genap = Jan-Jun)
  const semGroups = {};
  months.forEach(m => {
    const [y, mo] = m.split('-');
    const sem = semLabels[mo];
    const key = sem === 'Ganjil' ? `${y}-Ganjil` : `${y}-Genap`;
    if (!semGroups[key]) semGroups[key] = [];
    semGroups[key].push(m);
  });
 
  Object.entries(semGroups).sort().forEach(([key, mths]) => {
    const [y, sem] = key.split('-');
    const first = mths[0];
    const last  = mths[mths.length - 1];
    const [, fm] = first.split('-');
    const [ly, lm] = last.split('-');
    options.push({
      label: `Semester ${sem} ${y} (${monthNames[fm]} – ${monthNames[lm]} ${ly})`,
      months: mths,
    });
  });
 
  return options;
}
 
 
// ===== MAIN EXPORT FUNCTION =================================
 
function generateBeasiswa() {
 
  const semVal  = document.getElementById('lpjSemester').value;
  const dana    = parseFloat(document.getElementById('lpjDana').value) || 8400000;
  const buktiLink = document.getElementById('lpjLink').value.trim();
 
  if (!semVal) {
    showToast('Pilih semester dulu', 'error');
    return;
  }
 
  const selectedMonths = JSON.parse(semVal);
 
  // Filter transaksi: expense saja, bulan yang dipilih
  const txs = transactions.filter(t =>
    t.type === 'expense' &&
    t.date &&
    selectedMonths.includes(t.date.slice(0, 7))
  );
 
  if (!txs.length) {
    showToast('Tidak ada data pengeluaran di periode ini', 'info');
    return;
  }
 
  // Hitung per kategori
  const catTotals = {};
  const catCounts = {};
  txs.forEach(t => {
    const c = t.category || 'Lainnya';
    catTotals[c] = (catTotals[c] || 0) + t.amount;
    catCounts[c] = (catCounts[c] || 0) + 1;
  });
 
  const totalSpent = txs.reduce((s, t) => s + t.amount, 0);
 
  // Bulan label untuk title
  const sortedMonths = [...selectedMonths].sort();
  const semesterLabel = buildSemesterLabel(sortedMonths);
 
  // Build workbook
  const wb = XLSX.utils.book_new();
 
  _buildSheetDashboard(wb, txs, catTotals, catCounts, totalSpent, dana, semesterLabel, sortedMonths);
  _buildSheetDetail(wb, txs, catTotals, semesterLabel);
  _buildSheetLPJ(wb, catTotals, totalSpent, dana, buktiLink, semesterLabel);
 
  const filename = `DuTrack_LPJ_${semesterLabel.replace(/\s+/g,'-')}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, filename);
 
  closeLpjModal();
  showToast('📋 LPJ Beasiswa berhasil diexport!', 'success');
}
 
 
// ===== HELPERS ==============================================
 
function buildSemesterLabel(months) {
  const names = {
    '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'Mei','06':'Jun',
    '07':'Jul','08':'Agu','09':'Sep','10':'Okt','11':'Nov','12':'Des',
  };
  const first = months[0];
  const last  = months[months.length - 1];
  const [fy, fm] = first.split('-');
  const [ly, lm] = last.split('-');
  if (fy === ly) return `${names[fm]}-${names[lm]} ${fy}`;
  return `${names[fm]} ${fy}-${names[lm]} ${ly}`;
}
 
function rpFmt(n) {
  return 'Rp ' + Math.round(Math.abs(n)).toLocaleString('id');
}
 
function _makeStyle(bold, sz, color, bg, hAlign, vAlign, wrap) {
  return {
    font:      { bold: bold || false, sz: sz || 11, color: { rgb: color || '2D2D4E' }, name: 'Arial' },
    fill:      bg ? { patternType: 'solid', fgColor: { rgb: bg } } : undefined,
    alignment: { horizontal: hAlign || 'left', vertical: vAlign || 'center', wrapText: wrap || false },
    border: {
      top:    { style: 'thin', color: { rgb: 'D8D8E8' } },
      bottom: { style: 'thin', color: { rgb: 'D8D8E8' } },
      left:   { style: 'thin', color: { rgb: 'D8D8E8' } },
      right:  { style: 'thin', color: { rgb: 'D8D8E8' } },
    },
  };
}
 
function _cell(v, bold, sz, color, bg, hAlign, vAlign, wrap) {
  const s = _makeStyle(bold, sz, color, bg, hAlign, vAlign, wrap);
  const cell = { v, s };
  if (typeof v === 'number') cell.t = 'n';
  else if (v instanceof Date) { cell.t = 'd'; cell.z = 'DD/MM/YYYY'; }
  else cell.t = 's';
  return cell;
}
 
// SheetJS range string helper
function _range(r1,c1,r2,c2) {
  return { s: { r: r1, c: c1 }, e: { r: r2, c: c2 } };
}
function _addr(r, c) {
  return XLSX.utils.encode_cell({ r, c });
}
 
function _applyMerges(ws, merges) {
  if (!ws['!merges']) ws['!merges'] = [];
  ws['!merges'].push(...merges);
}
 
 
// ===== SHEET 1 — DASHBOARD ==================================
 
function _buildSheetDashboard(wb, txs, catTotals, catCounts, totalSpent, dana, semLabel, months) {
 
  const ws = {};
  ws['!cols'] = [
    { wch: 2 },  // A - spacer
    { wch: 26 }, // B
    { wch: 16 }, // C
    { wch: 14 }, // D
    { wch: 12 }, // E
    { wch: 16 }, // F
    { wch: 18 }, // G
  ];
 
  let row = 0;
 
  // Title
  ws[_addr(row,1)] = _cell(
    `💰 DuTrack — Laporan Beasiswa ${semLabel}`,
    true, 16, 'FFFFFF', '7C6AF5', 'left', 'center'
  );
  _applyMerges(ws, [_range(row,1,row,6)]);
  row += 2;
 
  // KPI Cards (2x2 layout)
  const sisa = dana - totalSpent;
  const pct  = dana > 0 ? (totalSpent / dana * 100).toFixed(1) + '%' : '0%';
  const kpis = [
    ['Dana Beasiswa',   rpFmt(dana),         '7C6AF5'],
    ['Total Digunakan', rpFmt(totalSpent),   'F05E6A'],
    ['Sisa Dana',       rpFmt(sisa),         '2ECC8E'],
    ['% Terpakai',      pct,                 'F5B942'],
  ];
  const kpiCols = [1, 2, 4, 5];
  kpis.forEach((k, i) => {
    ws[_addr(row, kpiCols[i])] = _cell(
      `${k[0]}\n${k[1]}`, true, 13, 'FFFFFF', k[2], 'center', 'center', true
    );
    if (i < 2) _applyMerges(ws, [_range(row, kpiCols[i], row+1, kpiCols[i])]);
    else        _applyMerges(ws, [_range(row, kpiCols[i], row+1, kpiCols[i])]);
  });
  row += 3;
 
  // Section: Per Kategori
  ws[_addr(row,1)] = _cell('📂 Pengeluaran per Kategori', true, 12, '7C6AF5', 'FFFFFF', 'left', 'center');
  _applyMerges(ws, [_range(row,1,row,6)]);
  ws[_addr(row,1)].s.border = {};
  row++;
 
  // Table header
  ['Kategori','Total','Jml Tx','% Dana','% Spent','Bar'].forEach((h, i) => {
    ws[_addr(row, i+1)] = _cell(h, true, 10, 'FFFFFF', '7C6AF5', 'center', 'center');
  });
  row++;
 
  (BEASISWA_CATEGORIES || []).forEach((cat, i) => {
    const amt   = catTotals[cat] || 0;
    const cnt   = catCounts[cat] || 0;
    const pDana = dana > 0 ? (amt / dana * 100).toFixed(1) + '%' : '0%';
    const pSpnt = totalSpent > 0 ? (amt / totalSpent * 100).toFixed(1) + '%' : '0%';
    const bars  = '█'.repeat(Math.floor((amt / totalSpent * 100) / 4));
    const bg    = i % 2 === 0 ? 'F5F5F8' : 'FFFFFF';
    ws[_addr(row,1)] = _cell(cat,   false, 10, '2D2D4E', bg, 'left',   'center');
    ws[_addr(row,2)] = _cell(rpFmt(amt), false, 10, '2D2D4E', bg, 'right',  'center');
    ws[_addr(row,3)] = _cell(cnt,   false, 10, '2D2D4E', bg, 'center', 'center');
    ws[_addr(row,4)] = _cell(pDana, false, 10, '2D2D4E', bg, 'center', 'center');
    ws[_addr(row,5)] = _cell(pSpnt, false, 10, '2D2D4E', bg, 'center', 'center');
    ws[_addr(row,6)] = _cell(bars,  false,  9, (CAT_COLORS_HEX || [])[i], bg, 'left', 'center');
    row++;
  });
 
  // Total row
  ws[_addr(row,1)] = _cell('TOTAL',       true, 10, 'FFFFFF', '7C6AF5', 'center', 'center');
  ws[_addr(row,2)] = _cell(rpFmt(totalSpent), true, 10, 'FFFFFF', '7C6AF5', 'right',  'center');
  ws[_addr(row,3)] = _cell(txs.length,    true, 10, 'FFFFFF', '7C6AF5', 'center', 'center');
  ws[_addr(row,4)] = _cell(pct,           true, 10, 'FFFFFF', '7C6AF5', 'center', 'center');
  ws[_addr(row,5)] = _cell('100%',        true, 10, 'FFFFFF', '7C6AF5', 'center', 'center');
  ws[_addr(row,6)] = _cell('',            true, 10, 'FFFFFF', '7C6AF5', 'center', 'center');
  row += 2;
 
  // Section: Per Bulan
  ws[_addr(row,1)] = _cell('📅 Pengeluaran per Bulan', true, 12, '7C6AF5', 'FFFFFF', 'left', 'center');
  _applyMerges(ws, [_range(row,1,row,6)]);
  ws[_addr(row,1)].s.border = {};
  row++;
 
  ['Bulan','Total','Jml Tx','Kategori Terbesar','Sisa Kumulatif'].forEach((h, i) => {
    ws[_addr(row, i+1)] = _cell(h, true, 10, 'FFFFFF', '1A1A2E', 'center', 'center');
  });
  row++;
 
  const monthNames = {
    '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'Mei','06':'Jun',
    '07':'Jul','08':'Agu','09':'Sep','10':'Okt','11':'Nov','12':'Des',
  };
 
  let cumulative = dana;
  months.forEach((m, i) => {
    const [y, mo] = m.split('-');
    const mTxs    = txs.filter(t => t.date && t.date.startsWith(m));
    const mTotal  = mTxs.reduce((s, t) => s + t.amount, 0);
    cumulative   -= mTotal;
    const mc = {};
    mTxs.forEach(t => { mc[t.category] = (mc[t.category]||0) + t.amount; });
    const biggest = Object.keys(mc).length
      ? Object.entries(mc).sort((a,b) => b[1]-a[1])[0][0]
      : '-';
    const bg = i % 2 === 0 ? 'F5F5F8' : 'FFFFFF';
    const sisaColor = cumulative >= 0 ? '2ECC8E' : 'F05E6A';
    ws[_addr(row,1)] = _cell(`${monthNames[mo]} ${y}`, false, 10, '2D2D4E', bg, 'left',   'center');
    ws[_addr(row,2)] = _cell(rpFmt(mTotal),            false, 10, '2D2D4E', bg, 'right',  'center');
    ws[_addr(row,3)] = _cell(mTxs.length,              false, 10, '2D2D4E', bg, 'center', 'center');
    ws[_addr(row,4)] = _cell(biggest,                  false, 10, '2D2D4E', bg, 'left',   'center');
    ws[_addr(row,5)] = _cell(rpFmt(cumulative),        false, 10, sisaColor, bg, 'right',  'center');
    row++;
  });
 
  ws['!ref'] = XLSX.utils.encode_range({ s: { r:0, c:0 }, e: { r: row, c: 6 } });
  XLSX.utils.book_append_sheet(wb, ws, '📊 Dashboard');
}
 
 
// ===== SHEET 2 — DETAIL TRANSAKSI ===========================
 
function _buildSheetDetail(wb, txs, catTotals, semLabel) {
 
  const ws = {};
  ws['!cols'] = [
    { wch: 2 },  // A spacer
    { wch: 5 },  // B No
    { wch: 13 }, // C Tanggal
    { wch: 22 }, // D Kategori
    { wch: 32 }, // E Keterangan
    { wch: 18 }, // F Nominal
    { wch: 50 }, // G Link Struk
  ];
 
  let row = 0;
 
  // Title
  ws[_addr(row,1)] = _cell(
    `📂 Detail Transaksi — ${semLabel}`,
    true, 14, 'FFFFFF', '7C6AF5', 'left', 'center'
  );
  _applyMerges(ws, [_range(row,1,row,6)]);
  row += 2;
 
  const totalSpent = txs.reduce((s,t) => s + t.amount, 0);
 
  (BEASISWA_CATEGORIES || []).forEach((cat, catIdx) => {
    const catTxs = txs
      .filter(t => (t.category || 'Lainnya') === cat)
      .sort((a,b) => a.date < b.date ? -1 : 1);
    if (!catTxs.length) return;
 
    const catTotal = catTxs.reduce((s,t) => s + t.amount, 0);
    const catColor = CAT_COLORS_HEX[catIdx % CAT_COLORS_HEX.length];
 
    // Category header
    ws[_addr(row,1)] = _cell(
      `  ${cat}  —  ${catTxs.length} transaksi  |  ${rpFmt(catTotal)}`,
      true, 11, 'FFFFFF', catColor, 'left', 'center'
    );
    _applyMerges(ws, [_range(row,1,row,6)]);
    row++;
 
    // Column headers
    ['No','Tanggal','Kategori','Keterangan','Nominal','Link Struk'].forEach((h,i) => {
      ws[_addr(row, i+1)] = _cell(h, true, 9, 'FFFFFF', '2D2D4E', 'center', 'center');
    });
    row++;
 
    // Data rows
    catTxs.forEach((tx, i) => {
      const bg = i % 2 === 0 ? 'F5F5F8' : 'FFFFFF';
      ws[_addr(row,1)] = _cell(i+1,                          false, 9, '2D2D4E', bg, 'center', 'center');
      ws[_addr(row,2)] = _cell(tx.date || '-',               false, 9, '2D2D4E', bg, 'center', 'center');
      ws[_addr(row,3)] = _cell(tx.category || '-',           false, 9, '2D2D4E', bg, 'left',   'center');
      ws[_addr(row,4)] = _cell(tx.description || '-',        false, 9, '2D2D4E', bg, 'left',   'center');
      ws[_addr(row,5)] = _cell(rpFmt(tx.amount),             false, 9, '2D2D4E', bg, 'right',  'center');
      // Link struk — biru jika ada
      const linkVal = tx.receipt_url || '-';
      ws[_addr(row,6)] = _cell(linkVal, false, 9,
        tx.receipt_url ? '0563C1' : 'A8A8C8', bg, 'left', 'center');
      if (tx.receipt_url) ws[_addr(row,6)].l = { Target: tx.receipt_url };
      row++;
    });
 
    // Subtotal
    ws[_addr(row,1)] = _cell(`Subtotal ${cat}`, true, 10, 'FFFFFF', catColor, 'right', 'center');
    _applyMerges(ws, [_range(row,1,row,4)]);
    ws[_addr(row,5)] = _cell(rpFmt(catTotal), true, 10, 'FFFFFF', catColor, 'right', 'center');
    ws[_addr(row,6)] = _cell('', false, 10, 'FFFFFF', catColor, 'left', 'center');
    row += 2;
  });
 
  // Grand total
  ws[_addr(row,1)] = _cell('GRAND TOTAL PENGELUARAN', true, 12, 'FFFFFF', '7C6AF5', 'right', 'center');
  _applyMerges(ws, [_range(row,1,row,4)]);
  ws[_addr(row,5)] = _cell(rpFmt(totalSpent), true, 12, 'FFFFFF', '7C6AF5', 'right', 'center');
  ws[_addr(row,6)] = _cell('', false, 12, 'FFFFFF', '7C6AF5', 'left', 'center');
 
  ws['!ref'] = XLSX.utils.encode_range({ s: { r:0, c:0 }, e: { r: row+1, c: 6 } });
  XLSX.utils.book_append_sheet(wb, ws, '📂 Detail Transaksi');
}
 
 
// ===== SHEET 3 — LPJ ========================================
 
function _buildSheetLPJ(wb, catTotals, totalSpent, dana, buktiLink, semLabel) {
 
  const ws = {};
  ws['!cols'] = [
    { wch: 3 },  // A spacer
    { wch: 6 },  // B No
    { wch: 38 }, // C Keperluan
    { wch: 22 }, // D Nominal
    { wch: 45 }, // E Bukti
  ];
 
  let row = 0;
 
  // Section title
  ws[_addr(row,1)] = _cell(
    'VII.  LAPORAN KEUANGAN PENGGUNAAN DANA BIAYA HIDUP',
    true, 12, '2D2D4E', 'FFFFFF', 'left', 'center'
  );
  ws[_addr(row,1)].s.border = {};
  _applyMerges(ws, [_range(row,1,row,4)]);
  row += 2;
 
  // Deskripsi
  ws[_addr(row,1)] = _cell(
    `Laporan rata-rata pemakaian dana biaya hidup yang diberikan sebesar Rp ${dana.toLocaleString('id')},- ` +
    `untuk mahasiswa angkatan 2022, 2023, 2024, & 2025 per semester oleh mahasiswa selama satu semester:`,
    false, 11, '2D2D4E', 'FFFFFF', 'justify', 'center', true
  );
  ws[_addr(row,1)].s.border = {};
  _applyMerges(ws, [_range(row,1,row,4)]);
  row += 2;
 
  // Table header (pink)
  ['No','Keperluan','Nominal','Kwitansi/Nota Bukti Pembelian & Pemakaian'].forEach((h, i) => {
    ws[_addr(row, i+1)] = _cell(h, true, 11, '2D2D4E', 'E8B4B8', 'center', 'center', true);
  });
  row++;
 
  // Data rows
  const catLPJ = BEASISWA_CATEGORIES
    .filter(cat => catTotals[cat] > 0)
    .map(cat => [cat, catTotals[cat]]);
  const totalLPJ = catLPJ.reduce((s, [,a]) => s + a, 0);
 
  const dataStart = row;
  catLPJ.forEach(([cat, amt], i) => {
    const bg = i % 2 === 0 ? 'FFFFFF' : 'F5F5F8';
    ws[_addr(row,1)] = _cell(i+1,                                       false, 11, '2D2D4E', bg, 'center', 'center');
    ws[_addr(row,2)] = _cell(cat,                                        false, 11, '2D2D4E', bg, 'left',   'center');
    ws[_addr(row,3)] = _cell(`Rp.  ${amt.toLocaleString('id')}`,        false, 11, '2D2D4E', bg, 'left',   'center');
    ws[_addr(row,4)] = _cell('', false, 11, '2D2D4E', bg, 'left', 'center');
    row++;
  });
 
  // Merge kolom Bukti & isi link
  const buktiEndRow = row - 1;
  _applyMerges(ws, [_range(dataStart, 4, buktiEndRow, 4)]);
  const linkVal = buktiLink || '(isi link bukti di sini)';
  ws[_addr(dataStart,4)] = _cell(linkVal, false, 11, buktiLink ? '0563C1' : 'A8A8C8', 'FFFFFF', 'left', 'center', true);
  if (buktiLink) ws[_addr(dataStart,4)].l = { Target: buktiLink };
 
  // Jumlah row
  ws[_addr(row,1)] = _cell('Jumlah', true, 11, '2D2D4E', 'F5F5F8', 'center', 'center');
  _applyMerges(ws, [_range(row,1,row,2)]);
  ws[_addr(row,3)] = _cell(`Rp ${totalLPJ.toLocaleString('id')}`, true, 11, '2D2D4E', 'F5F5F8', 'left', 'center');
  ws[_addr(row,4)] = _cell('', false, 11, '2D2D4E', 'F5F5F8', 'left', 'center');
  row += 2;
 
  // Footer notes
  ws[_addr(row,1)] = _cell('*) khusus mahasiswa beasiswa penerima KIP Kuliah', true, 10, '2D2D4E', 'FFFFFF', 'left', 'center');
  ws[_addr(row,1)].s.border = {};
  row++;
  ws[_addr(row,1)] = _cell('*) untuk beasiswa Yayasan tidak perlu isi laporan penggunaan dana', true, 10, '2D2D4E', 'FFFFFF', 'left', 'center');
  ws[_addr(row,1)].s.border = {};
 
  ws['!ref'] = XLSX.utils.encode_range({ s: { r:0, c:0 }, e: { r: row+1, c: 4 } });
  XLSX.utils.book_append_sheet(wb, ws, '📋 LPJ');
}

// ===== SETTINGS =====
function saveSupabaseConfig() {
  SUPABASE_URL = document.getElementById('cfgUrl').value.trim();
  SUPABASE_KEY = document.getElementById('cfgKey').value.trim();
  localStorage.setItem('ft_supabase_url', SUPABASE_URL);
  localStorage.setItem('ft_supabase_key', SUPABASE_KEY);
  supabaseClient = null;
  document.getElementById('connStatus').textContent = '✓ Konfigurasi disimpan. Muat ulang halaman untuk login.';
  showToast('Konfigurasi Supabase disimpan!', 'success');
}

async function testConnection() {
  document.getElementById('connStatus').textContent = 'Menguji koneksi...';
  const ok = await initSupabase();
  if (!ok || !supabaseClient) {
    document.getElementById('connStatus').textContent = '✗ Gagal inisialisasi Supabase. Periksa URL dan Key.';
    return;
  }
  try {
    const { error } = await supabaseClient.from('transactions').select('id').limit(1);
    if (error) throw error;
    document.getElementById('connStatus').textContent = '✓ Koneksi berhasil! Tabel transactions ditemukan.';
    showToast('Koneksi Supabase berhasil!', 'success');
  } catch(e) {
    document.getElementById('connStatus').textContent = '✗ Koneksi gagal: ' + (e.message || 'Periksa SQL setup.');
    showToast('Koneksi gagal: ' + e.message, 'error');
  }
}

function copySQL() {
  const sql = `create table transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  type text not null check (type in ('income','expense')),
  amount numeric not null,
  description text,
  category text,
  date date not null,
  created_at timestamptz default now()
);
alter table transactions enable row level security;
create policy "Users can manage own transactions"
  on transactions for all
  using (auth.uid() = user_id);`;
  navigator.clipboard.writeText(sql).then(() => showToast('SQL berhasil dicopy!', 'success'));
}

function clearLocalData() {
  if (!confirm('Hapus semua data lokal? Data di Supabase tidak terpengaruh.')) return;
  transactions = [];
  localStorage.removeItem('ft_transactions');
  renderAll();
  updateLocalDataInfo();
  showToast('Data lokal dihapus', 'info');
}

// ===== TOAST =====
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✓', error: '✗', info: '◈' };
  toast.innerHTML = `<span>${icons[type]||'◈'}</span><span>${escHtml(msg)}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.animation = 'none'; toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3300);
}

// ===== HELPERS =====
function formatRp(n) {
  if (n === undefined || n === null) return 'Rp 0';
  return 'Rp ' + formatNum(n);
}
function formatNum(n) {
  return Math.abs(Math.round(n)).toLocaleString('id');
}
function formatDate(d) {
  if (!d) return '—';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('id', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch(e) { return d; }
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function getLast6Months() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  return months;
}
function getLast12Months() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  return months;
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openModal(); }
});

window.addEventListener(
  'load',
  () => {

    const loader =
      document.getElementById(
        'loadingScreen'
      );

    loader.style.opacity = '0';

    setTimeout(() => {
      loader.remove();
    },300);

  }
);
function toggleExportMenu(event){

  event.stopPropagation();

  document
    .getElementById(
      'exportMenu'
    )
    .classList
    .toggle('show');

}

document.addEventListener(
  'click',
  function(e){

    const menu =
      document.getElementById(
        'exportMenu'
      );

    const dropdown =
      document.querySelector(
        '.export-dropdown'
      );

    if(
      !dropdown.contains(e.target)
    ){

      menu.classList.remove(
        'show'
      );

    }

  }
);