/* ============================================================
   EXPENSE & BUDGET VISUALIZER — script.js
   Vanilla JS | LocalStorage | Chart.js 4.x
   ============================================================ */

'use strict';

/* ── Constants ── */
const BUDGET_LIMIT   = 100;
const STORAGE_KEY    = 'budgetviz_transactions';
const THEME_KEY      = 'budgetviz_theme';

const CATEGORY_META = {
  Food:      { icon: '🍔', color: '#f97316', darkColor: '#fb923c', cssClass: 'food' },
  Transport: { icon: '🚌', color: '#3b82f6', darkColor: '#60a5fa', cssClass: 'transport' },
  Fun:       { icon: '🎉', color: '#a855f7', darkColor: '#c084fc', cssClass: 'fun' },
};

/* ── State ── */
let transactions = [];   // Array of { id, name, amount, category, date }
let pieChart     = null; // Chart.js instance

/* ── DOM References ── */
const $ = id => document.getElementById(id);

const dom = {
  html:           document.documentElement,
  themeToggle:    $('themeToggle'),
  themeIcon:      $('themeIcon'),
  themeLabel:     $('themeLabel'),
  totalBalance:   $('totalBalance'),
  balanceCard:    $('balanceCard'),
  budgetBarFill:  $('budgetBarFill'),
  budgetStatus:   $('budgetStatus'),
  budgetWarning:  $('budgetWarning'),
  form:           $('transactionForm'),
  itemName:       $('itemName'),
  amount:         $('amount'),
  category:       $('category'),
  itemNameError:  $('itemNameError'),
  amountError:    $('amountError'),
  categoryError:  $('categoryError'),
  txList:         $('transactionList'),
  emptyState:     $('emptyState'),
  sortSelect:     $('sortSelect'),
  pieCanvas:      $('pieChart'),
  chartWrapper:   $('chartWrapper'),
  chartEmpty:     $('chartEmpty'),
  chartLegend:    $('chartLegend'),
  summaryList:    $('summaryList'),
};

/* ═══════════════════════════════════════════
   1. THEME MANAGEMENT
═══════════════════════════════════════════ */

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'light';
  applyTheme(saved);
}

function applyTheme(theme) {
  dom.html.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);

  if (theme === 'dark') {
    dom.themeIcon.textContent  = '☀️';
    dom.themeLabel.textContent = 'Light Mode';
  } else {
    dom.themeIcon.textContent  = '🌙';
    dom.themeLabel.textContent = 'Dark Mode';
  }

  // Re-render chart so colours match theme
  if (pieChart) updateChart();
}

function toggleTheme() {
  const current = dom.html.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* ═══════════════════════════════════════════
   2. LOCAL STORAGE
═══════════════════════════════════════════ */

function loadTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    transactions = raw ? JSON.parse(raw) : [];
  } catch {
    transactions = [];
  }
}

function saveTransactions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

/* ═══════════════════════════════════════════
   3. FORM VALIDATION & SUBMISSION
═══════════════════════════════════════════ */

function clearErrors() {
  dom.itemNameError.textContent  = '';
  dom.amountError.textContent    = '';
  dom.categoryError.textContent  = '';
  dom.itemName.classList.remove('error');
  dom.amount.classList.remove('error');
  dom.category.classList.remove('error');
}

function validateForm() {
  clearErrors();
  let valid = true;

  const name   = dom.itemName.value.trim();
  const amt    = parseFloat(dom.amount.value);
  const cat    = dom.category.value;

  if (!name) {
    dom.itemNameError.textContent = 'Item name is required.';
    dom.itemName.classList.add('error');
    valid = false;
  } else if (name.length > 60) {
    dom.itemNameError.textContent = 'Name must be 60 characters or fewer.';
    dom.itemName.classList.add('error');
    valid = false;
  }

  if (!dom.amount.value.trim()) {
    dom.amountError.textContent = 'Amount is required.';
    dom.amount.classList.add('error');
    valid = false;
  } else if (isNaN(amt) || amt <= 0) {
    dom.amountError.textContent = 'Enter a valid amount greater than 0.';
    dom.amount.classList.add('error');
    valid = false;
  } else if (amt > 1_000_000) {
    dom.amountError.textContent = 'Amount is too large.';
    dom.amount.classList.add('error');
    valid = false;
  }

  if (!cat) {
    dom.categoryError.textContent = 'Please select a category.';
    dom.category.classList.add('error');
    valid = false;
  }

  return valid;
}

function handleFormSubmit(e) {
  e.preventDefault();
  if (!validateForm()) return;

  const transaction = {
    id:       crypto.randomUUID(),
    name:     dom.itemName.value.trim(),
    amount:   parseFloat(parseFloat(dom.amount.value).toFixed(2)),
    category: dom.category.value,
    date:     new Date().toISOString(),
  };

  transactions.unshift(transaction);
  saveTransactions();
  render();

  // Reset form
  dom.form.reset();
  clearErrors();
  dom.itemName.focus();
}

/* ═══════════════════════════════════════════
   4. DELETE TRANSACTION
═══════════════════════════════════════════ */

function deleteTransaction(id) {
  transactions = transactions.filter(t => t.id !== id);
  saveTransactions();
  render();
}

/* ═══════════════════════════════════════════
   5. SORTING
═══════════════════════════════════════════ */

function getSortedTransactions() {
  const mode = dom.sortSelect.value;
  const copy = [...transactions];

  switch (mode) {
    case 'date-asc':
      return copy.sort((a, b) => new Date(a.date) - new Date(b.date));
    case 'date-desc':
      return copy.sort((a, b) => new Date(b.date) - new Date(a.date));
    case 'amount-desc':
      return copy.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':
      return copy.sort((a, b) => a.amount - b.amount);
    case 'category':
      return copy.sort((a, b) => a.category.localeCompare(b.category));
    default:
      return copy;
  }
}

/* ═══════════════════════════════════════════
   6. TOTAL & BUDGET BAR
═══════════════════════════════════════════ */

function updateBalanceUI() {
  const total      = transactions.reduce((s, t) => s + t.amount, 0);
  const pct        = Math.min((total / BUDGET_LIMIT) * 100, 100);
  const isOver     = total > BUDGET_LIMIT;
  const isNear     = !isOver && total >= BUDGET_LIMIT * 0.8;

  // Amount display
  dom.totalBalance.textContent = formatCurrency(total);

  // Progress bar
  dom.budgetBarFill.style.width = pct + '%';
  dom.budgetBarFill.classList.toggle('over',  isOver);
  dom.budgetBarFill.classList.toggle('near',  isNear && !isOver);

  // Status badge
  if (isOver) {
    dom.budgetStatus.textContent = '🔴 Over Budget';
    dom.budgetStatus.className   = 'budget-status over';
  } else if (isNear) {
    dom.budgetStatus.textContent = '🟡 Near Limit';
    dom.budgetStatus.className   = 'budget-status near';
  } else {
    dom.budgetStatus.textContent = total > 0 ? '🟢 On Track' : '';
    dom.budgetStatus.className   = 'budget-status good';
  }

  // Warning banner
  dom.budgetWarning.style.display = isOver ? 'flex' : 'none';
}

/* ═══════════════════════════════════════════
   7. TRANSACTION LIST RENDERING
═══════════════════════════════════════════ */

function renderTransactionList() {
  const sorted = getSortedTransactions();

  // Clear all children except empty-state template
  dom.txList.innerHTML = '';

  if (sorted.length === 0) {
    dom.txList.appendChild(createEmptyState());
    return;
  }

  const frag = document.createDocumentFragment();
  sorted.forEach(t => frag.appendChild(createTransactionEl(t)));
  dom.txList.appendChild(frag);
}

function createEmptyState() {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.id = 'emptyState';
  div.innerHTML = `
    <span class="empty-icon">📋</span>
    <p>No transactions yet.<br/>Add one above to get started!</p>
  `;
  return div;
}

function createTransactionEl(t) {
  const meta     = CATEGORY_META[t.category] || CATEGORY_META.Fun;
  const cssClass = meta.cssClass;
  const dateStr  = formatDate(t.date);

  const item = document.createElement('div');
  item.className = 'transaction-item';
  item.dataset.id = t.id;

  item.innerHTML = `
    <div class="tx-icon ${cssClass}" aria-hidden="true">${meta.icon}</div>
    <div class="tx-info">
      <div class="tx-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>
      <div class="tx-meta">
        <span class="tx-badge ${cssClass}">${t.category}</span>
        <span>${dateStr}</span>
      </div>
    </div>
    <span class="tx-amount">${formatCurrency(t.amount)}</span>
    <button class="btn btn-delete" data-id="${t.id}" aria-label="Delete ${escapeHtml(t.name)}">
      Delete
    </button>
  `;
  return item;
}

/* ═══════════════════════════════════════════
   8. PIE CHART (Chart.js)
═══════════════════════════════════════════ */

function getCategoryTotals() {
  const totals = {};
  transactions.forEach(t => {
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  });
  return totals;
}

function getChartColors(categories) {
  const isDark = dom.html.getAttribute('data-theme') === 'dark';
  return categories.map(c => {
    const m = CATEGORY_META[c];
    return m ? (isDark ? m.darkColor : m.color) : '#94a3b8';
  });
}

function updateChart() {
  const totals     = getCategoryTotals();
  const categories = Object.keys(totals);
  const values     = categories.map(c => totals[c]);
  const colors     = getChartColors(categories);
  const hasData    = categories.length > 0;

  // Toggle chart visibility
  dom.chartWrapper.style.display = hasData ? 'block' : 'none';
  dom.chartLegend.style.display  = hasData ? 'flex'  : 'none';
  dom.chartEmpty.style.display   = hasData ? 'none'  : 'flex';

  if (!hasData) {
    if (pieChart) { pieChart.destroy(); pieChart = null; }
    return;
  }

  const isDark = dom.html.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#e8eaf0' : '#1a1d23';

  const chartData = {
    labels:   categories,
    datasets: [{
      data:            values,
      backgroundColor: colors,
      borderColor:     isDark ? '#1a1d27' : '#ffffff',
      borderWidth:     3,
      hoverOffset:     8,
    }],
  };

  const chartOptions = {
    responsive:          true,
    maintainAspectRatio: true,
    animation:           { duration: 400 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => {
            const val   = ctx.parsed;
            const total = ctx.dataset.data.reduce((s, v) => s + v, 0);
            const pct   = ((val / total) * 100).toFixed(1);
            return ` ${formatCurrency(val)} (${pct}%)`;
          },
        },
        backgroundColor: isDark ? '#21253a' : '#1a1d23',
        titleColor:      '#ffffff',
        bodyColor:       '#ffffff',
        cornerRadius:    8,
        padding:         10,
      },
    },
  };

  if (pieChart) {
    // Update existing chart in-place
    pieChart.data    = chartData;
    pieChart.options = chartOptions;
    pieChart.update('active');
  } else {
    pieChart = new Chart(dom.pieCanvas, {
      type:    'doughnut',
      data:    chartData,
      options: chartOptions,
    });
  }

  // Custom HTML legend
  renderChartLegend(categories, colors, values);
}

function renderChartLegend(categories, colors, values) {
  const total = values.reduce((s, v) => s + v, 0);
  dom.chartLegend.innerHTML = categories.map((cat, i) => {
    const pct = total > 0 ? ((values[i] / total) * 100).toFixed(0) : 0;
    return `
      <div class="legend-item">
        <span class="legend-dot" style="background:${colors[i]}"></span>
        <span>${cat} (${pct}%)</span>
      </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════
   9. CATEGORY SUMMARY BARS
═══════════════════════════════════════════ */

function renderSummary() {
  const totals     = getCategoryTotals();
  const categories = Object.keys(totals);

  if (categories.length === 0) {
    dom.summaryList.innerHTML = '<p class="summary-empty">No data yet.</p>';
    return;
  }

  const max    = Math.max(...Object.values(totals));
  const isDark = dom.html.getAttribute('data-theme') === 'dark';

  dom.summaryList.innerHTML = categories.map(cat => {
    const meta  = CATEGORY_META[cat] || {};
    const color = isDark ? (meta.darkColor || '#94a3b8') : (meta.color || '#94a3b8');
    const pct   = max > 0 ? ((totals[cat] / max) * 100).toFixed(1) : 0;
    const count = transactions.filter(t => t.category === cat).length;

    return `
      <div class="summary-item">
        <div class="summary-item-left">
          <span class="summary-dot" style="background:${color}"></span>
          <span>${meta.icon || ''} ${cat}</span>
          <span style="font-size:0.73rem;color:var(--color-text-muted)">(${count})</span>
        </div>
        <div class="summary-bar-track">
          <div class="summary-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="summary-right">${formatCurrency(totals[cat])}</div>
      </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════
   10. MASTER RENDER
═══════════════════════════════════════════ */

function render() {
  updateBalanceUI();
  renderTransactionList();
  updateChart();
  renderSummary();
}

/* ═══════════════════════════════════════════
   11. UTILITY HELPERS
═══════════════════════════════════════════ */

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style:                 'currency',
    currency:              'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day:   'numeric',
    hour:  '2-digit',
    minute:'2-digit',
  }).format(d);
}

function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, ch => map[ch]);
}

/* ═══════════════════════════════════════════
   12. EVENT LISTENERS
═══════════════════════════════════════════ */

function bindEvents() {
  // Theme toggle
  dom.themeToggle.addEventListener('click', toggleTheme);

  // Form submit
  dom.form.addEventListener('submit', handleFormSubmit);

  // Clear individual field errors on input
  dom.itemName.addEventListener('input', () => {
    dom.itemNameError.textContent = '';
    dom.itemName.classList.remove('error');
  });
  dom.amount.addEventListener('input', () => {
    dom.amountError.textContent = '';
    dom.amount.classList.remove('error');
  });
  dom.category.addEventListener('change', () => {
    dom.categoryError.textContent = '';
    dom.category.classList.remove('error');
  });

  // Sort change — just re-render the list (data unchanged)
  dom.sortSelect.addEventListener('change', () => {
    renderTransactionList();
  });

  // Delete (event delegation on the list container)
  dom.txList.addEventListener('click', e => {
    const btn = e.target.closest('.btn-delete');
    if (!btn) return;
    const id = btn.dataset.id;
    if (id) deleteTransaction(id);
  });
}

/* ═══════════════════════════════════════════
   13. BOOTSTRAP
═══════════════════════════════════════════ */

function init() {
  initTheme();
  loadTransactions();
  bindEvents();
  render();
}

// Wait for Chart.js to be available (it's loaded via CDN in <head>)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
