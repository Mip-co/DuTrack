
// ============================================================
// FINTRACK - Personal Finance Tracker
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
  document.getElementById('logoutBtn').style.display = 'flex';
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
    category: 'Lainnya',
    date,
    receipt_url: receiptUrl
  };

  transactions.unshift(tx);

  saveLocalData();

  await pushToSupabase(tx);

  await fetch(
  'https://script.google.com/macros/s/AKfycbw-dRNNXXpYqRSmhZAFc2eCaNbeL-p_1emfsznTrTxwVajRLwAB2F2_MnS--nf2X8Ku/exec',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(tx)
  }
);

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
// ===== EXPORT CSV =====
function exportCSV() {
  const txs = getFilteredTx();
  if (!txs.length) { showToast('Tidak ada data untuk diexport', 'info'); return; }
  const header = ['ID', 'Tipe', 'Nominal', 'Keterangan', 'Kategori', 'Tanggal'];
  const rows = txs.map(t => [t.id, t.type, t.amount, `"${(t.description||'').replace(/"/g,'""')}"`, t.category, t.date]);
  const csv = [header, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fintrack_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV berhasil diexport!', 'success');
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
