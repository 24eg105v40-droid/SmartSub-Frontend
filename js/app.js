/**
 * Smart Subscription Manager - Main Frontend Controller
 */

// State
let currentTab = 'dashboard';
let subscriptionsCache = [];
let categoryChartInstance = null;
let forecastChartInstance = null;
let costPerUseChartInstance = null;
let selectedSimulateIds = new Set();
let currentCalendarFilter = '7days';

// DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupModals();
  setupAuthEventListeners();

  // Initialize Firebase client
  if (window.firebaseAuth) {
    try {
      await window.firebaseAuth.init();
    } catch (e) {
      console.warn('Firebase initialization notice:', e);
    }
  }

  updateUserInterface();

  // If no auth token, open login modal and do not load protected resources
  if (!api.isAuthenticated()) {
    openModal('loginModal');
    return;
  }

  loadCurrentTab();
});

// Setup Navigation Tabs & Titles
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const headings = {
    'dashboard': { h: 'Subscription Intelligence Overview', p: 'Analyze recurring commitments, usage efficiency, and savings opportunities' },
    'spending': { h: 'Spending Analytics', p: 'Monthly run rates, yearly commitments, and category breakdowns' },
    'usage': { h: 'Cost-per-Use & Health Scores', p: 'Usage frequency, cost-per-day efficiency tiers, and composite health ratings' },
    'overlaps': { h: 'Overlap Detection', p: 'Flag redundant subscriptions in identical categories and optimize consolidation' },
    'ai-advisor': { h: 'AI Subscription Advisor', p: 'Personalized subscription insights, review suggestions, and savings guidance' },
    'calendar': { h: 'Renewal Calendar', p: 'Upcoming renewal deadlines and scheduled charges by date' },
    'forecast': { h: 'Forecast & Risks', p: 'Future payment commitments and priority renewal risk queue' },
    'simulator': { h: 'What-If Savings Simulator', p: 'Simulate hypothetical subscription cuts and calculate projected savings' },
    'subscriptions': { h: 'All Subscriptions', p: 'Manage, edit, track renewal countdowns, and log price changes' },
    'budget-goals': { h: 'Monthly Budget & Goals', p: 'Manage subscription spending limits and track linked milestone goals' },
    'shared': { h: 'Shared & Family Plans', p: 'Calculate split shares and track member payment collections' },
    'import-timeline': { h: 'Import & Event Timeline', p: 'Upload bank statements, scan invoice receipts, and review lifecycle history' }
  };

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = item.dataset.tab;
      if (!tabName) return;

      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      currentTab = tabName;
      document.querySelectorAll('.tab-pane').forEach(pane => pane.style.display = 'none');
      const targetPane = document.getElementById(`tab-${tabName}`);
      if (targetPane) targetPane.style.display = 'block';

      if (headings[tabName]) {
        document.getElementById('page-heading').textContent = headings[tabName].h;
        document.getElementById('page-subheading').textContent = headings[tabName].p;
      }

      loadCurrentTab();
    });
  });
}

// Route Loader
async function loadCurrentTab() {
  try {
    switch (currentTab) {
      case 'dashboard':
        await renderDashboard();
        break;
      case 'subscriptions':
        await renderSubscriptionsTable();
        break;
      case 'spending':
        await renderSpendingAnalytics();
        break;
      case 'usage':
        await renderUsageAndCostPerUse();
        break;
      case 'overlaps':
        await renderOverlaps();
        break;
      case 'ai-advisor':
        await renderAiAdvisor();
        break;
      case 'calendar':
        await renderCalendar();
        break;
      case 'forecast':
        await renderForecastAndRisks();
        break;
      case 'simulator':
        await renderWhatIfSimulator();
        break;
      case 'budget-goals':
        await renderBudgetAndGoals();
        break;
      case 'shared':
        await renderSharedSubscriptions();
        break;
      case 'import-timeline':
        await renderTimelineAndImport();
        break;
    }
  } catch (err) {
    console.error('Error loading tab:', err);
    showToast(err.message, 'error');
  }
}

// ----------------------------------------------------
// 1. Dashboard Module
// ----------------------------------------------------
async function renderDashboard() {
  const summary = await api.getDashboardSummary();
  subscriptionsCache = await api.getSubscriptions();

  // Populate KPIs
  document.getElementById('kpi-active-count').textContent = summary.totalActiveSubscriptions;
  document.getElementById('kpi-monthly-cost').textContent = `₹${summary.totalMonthlyCost.toLocaleString()}`;
  document.getElementById('kpi-yearly-cost').textContent = `₹${summary.totalYearlyCost.toLocaleString()}`;
  document.getElementById('kpi-renewing-soon').textContent = summary.renewingSoonCount;
  document.getElementById('kpi-low-usage').textContent = summary.lowUsageCount;
  document.getElementById('kpi-overlaps').textContent = summary.overlappingCount;
  document.getElementById('kpi-savings').textContent = `₹${summary.potentialSavingsMonthly.toLocaleString()}/mo`;
  
  const budgetLeft = summary.budgetRemaining;
  const budgetEl = document.getElementById('kpi-budget-status');
  budgetEl.textContent = budgetLeft >= 0 ? `₹${budgetLeft.toLocaleString()} Left` : `₹${Math.abs(budgetLeft).toLocaleString()} Over`;
  budgetEl.style.color = budgetLeft >= 0 ? '#10b981' : '#f43f5e';

  // Budget Progress bar
  const budgetBar = document.getElementById('dashboard-budget-bar');
  if (budgetBar) {
    budgetBar.style.width = `${Math.min(100, summary.budgetPercentageUsed)}%`;
    budgetBar.style.backgroundColor = summary.isOverBudget ? '#f43f5e' : (summary.budgetPercentageUsed > 80 ? '#f59e0b' : '#10b981');
  }

  // Renewal Risk Banner
  const riskBanner = document.getElementById('dashboard-risk-alert');
  if (riskBanner) {
    if (summary.highRiskRenewals && summary.highRiskRenewals.length > 0) {
      const topRisk = summary.highRiskRenewals[0];
      riskBanner.style.display = 'flex';
      riskBanner.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
          <i class="fas fa-exclamation-triangle" style="font-size:1.5rem; color:#f43f5e;"></i>
          <div>
            <strong>Renewal Alert: ${topRisk.serviceName} renews in ${topRisk.daysRemaining} days (₹${topRisk.cost})</strong>
            <p style="font-size:0.8rem; margin:0; opacity:0.9;">Health Score: ${topRisk.healthScore}/100 • Low usage detected (${topRisk.usageDays} days/mo). Consider reviewing before renewal.</p>
          </div>
        </div>
        <button class="btn btn-sm btn-outline-danger" onclick="openEditSubModal(${topRisk.subscriptionId})">Review Now</button>
      `;
    } else {
      riskBanner.style.display = 'none';
    }
  }

  // Render Charts on Dashboard
  renderCategoryDonutChart(summary.categorySpending);
  renderTopSpendingList(summary.highestCostSubscriptions);
  renderLowUsageAlerts(summary.lowUsageSubscriptions);
}

function renderCategoryDonutChart(categorySpending) {
  const ctx = document.getElementById('dashboardCategoryChart');
  if (!ctx) return;

  const labels = Object.keys(categorySpending || {});
  const data = Object.values(categorySpending || {});

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
  }

  if (labels.length === 0) {
    labels.push('No Subscriptions');
    data.push(1);
  }

  categoryChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          '#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e',
          '#8b5cf6', '#ec4899', '#3b82f6', '#64748b'
        ],
        borderWidth: 2,
        borderColor: '#0f172a'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#cbd5e1', font: { family: 'Inter', size: 11 } }
        }
      },
      cutout: '70%'
    }
  });
}

function renderTopSpendingList(highestCost) {
  const container = document.getElementById('dashboard-highest-cost-list');
  if (!container) return;

  if (!highestCost || highestCost.length === 0) {
    container.innerHTML = `<div style="color:#64748b; font-size:0.85rem; padding:16px; text-align:center;">No subscriptions active in your account yet.</div>`;
    return;
  }

  container.innerHTML = highestCost.map(sub => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:rgba(15,23,42,0.4); border-radius:8px; border:1px solid rgba(148,163,184,0.1);">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:32px; height:32px; border-radius:6px; background:${sub.color}; display:flex; align-items:center; justify-content:center; color:#fff;">
          <i class="${sub.icon}"></i>
        </div>
        <div>
          <strong style="font-size:0.9rem;">${sub.serviceName}</strong>
          <div style="font-size:0.75rem; color:#94a3b8;">${sub.category} • ${sub.billingCycle}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <strong style="color:#f8fafc;">₹${sub.cost}</strong>
        <div style="font-size:0.75rem; color:#94a3b8;">₹${sub.monthlyCostEquivalent}/mo</div>
      </div>
    </div>
  `).join('');
}

function renderLowUsageAlerts(lowUsage) {
  const container = document.getElementById('dashboard-low-usage-list');
  if (!container) return;

  if (!lowUsage || lowUsage.length === 0) {
    container.innerHTML = `
      <div style="padding:18px; text-align:center; color:#10b981; background:rgba(16,185,129,0.08); border-radius:8px; border:1px solid rgba(16,185,129,0.2);">
        <i class="fas fa-check-circle" style="font-size:1.4rem; margin-bottom:6px; display:block;"></i>
        <strong>All Subscriptions Efficiently Utilized!</strong>
        <p style="font-size:0.8rem; margin:4px 0 0; color:#94a3b8;">None of your active plans are flagged for low usage (&le; 5 days/month).</p>
      </div>
    `;
    return;
  }

  container.innerHTML = lowUsage.map(sub => `
    <div class="low-usage-alert" style="margin-bottom:10px;">
      <div class="low-usage-info">
        <i class="fas fa-exclamation-circle" style="color:#f59e0b; font-size:1.3rem;"></i>
        <div>
          <strong>${sub.serviceName} (${sub.category})</strong>
          <div style="font-size:0.78rem; color:#cbd5e1;">Used only ${sub.usageDaysPerMonth} days/mo • ₹${sub.monthlyCostEquivalent}/mo (Cost/use: ₹${sub.costPerUse}/day)</div>
        </div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-sm btn-secondary" onclick="openSimulatorWithId(${sub.id})">Simulate Cut</button>
        <button class="btn btn-sm btn-outline-danger" onclick="openEditSubModal(${sub.id})">Review</button>
      </div>
    </div>
  `).join('');
}

// ----------------------------------------------------
// 2. Subscriptions Management
// ----------------------------------------------------
async function renderSubscriptionsTable() {
  const subs = await api.getSubscriptions();
  subscriptionsCache = subs;

  const tbody = document.getElementById('subscriptions-table-body');
  if (!tbody) return;

  if (subs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px; color:#64748b;">
      <i class="fas fa-credit-card" style="font-size:2.5rem; margin-bottom:10px; display:block; opacity:0.5;"></i>
      No subscriptions added yet. Click <strong>'+ Add Subscription'</strong> or <strong>Scan Invoice</strong> to begin!
    </td></tr>`;
    return;
  }

  tbody.innerHTML = subs.map(sub => {
    let riskBadge = '';
    if (sub.renewalRiskLevel === 'HIGH_ATTENTION') {
      riskBadge = `<span class="badge badge-danger">🔴 High Attention</span>`;
    } else if (sub.renewalRiskLevel === 'MEDIUM_RISK') {
      riskBadge = `<span class="badge badge-warning">🟡 Medium</span>`;
    } else {
      riskBadge = `<span class="badge badge-success">🟢 Healthy</span>`;
    }

    return `
      <tr>
        <td>
          <div class="service-cell">
            <div class="service-icon-box" style="background:${sub.color};">
              <i class="${sub.icon}"></i>
            </div>
            <div class="service-names">
              <span class="service-title">${sub.serviceName}</span>
              <span class="service-plan">${sub.planName || 'Standard'} • ${sub.personalReason ? `"${sub.personalReason}"` : ''}</span>
            </div>
          </div>
        </td>
        <td><span class="badge badge-info">${sub.category}</span></td>
        <td>
          <strong>₹${sub.cost}</strong>
          <div style="font-size:0.75rem; color:#94a3b8;">${sub.billingCycle} (₹${sub.monthlyCostEquivalent}/mo)</div>
        </td>
        <td>
          <div>${sub.renewalDate}</div>
          <span style="font-size:0.75rem; color:${sub.daysUntilRenewal <= 3 ? '#fb7185' : '#94a3b8'};">
            ${sub.daysUntilRenewal >= 0 ? `In ${sub.daysUntilRenewal} days` : 'Overdue'}
          </span>
        </td>
        <td>
          <div>${sub.usageDaysPerMonth || 0} days/mo</div>
          <div style="font-size:0.75rem; color:#06b6d4;">₹${sub.costPerUse}/use</div>
        </td>
        <td>
          <div class="health-score-pill" style="background:rgba(99,102,241,0.15); color:#a5b4fc; cursor:pointer;" onclick="openHealthModal()" title="Click to view calculation breakdown">
            <i class="fas fa-heartbeat"></i> ${sub.healthScore}/100
          </div>
        </td>
        <td>${riskBadge}</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-sm btn-secondary" title="Price Change" onclick="openPriceModal(${sub.id})"><i class="fas fa-tags"></i></button>
            <button class="btn btn-sm btn-secondary" title="Edit" onclick="openEditSubModal(${sub.id})"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-outline-danger" title="Delete" onclick="deleteSubscription(${sub.id})"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ----------------------------------------------------
// 3. Spending Analytics
// ----------------------------------------------------
async function renderSpendingAnalytics() {
  const summary = await api.getDashboardSummary();

  document.getElementById('spending-monthly-total').textContent = `₹${summary.totalMonthlyCost.toLocaleString()}`;
  document.getElementById('spending-yearly-total').textContent = `₹${summary.totalYearlyCost.toLocaleString()}`;
  
  const list = document.getElementById('spending-category-breakdown-list');
  if (list) {
    const cats = Object.entries(summary.categorySpending || {});
    if (cats.length === 0) {
      list.innerHTML = `<div style="color:#64748b; padding:16px;">No spending data available.</div>`;
      return;
    }
    list.innerHTML = cats.map(([cat, amt]) => {
      const pct = summary.totalMonthlyCost > 0 ? Math.round((amt / summary.totalMonthlyCost) * 100) : 0;
      return `
        <div style="margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.9rem;">
            <span>${cat}</span>
            <strong>₹${amt.toLocaleString()}/mo (${pct}%)</strong>
          </div>
          <div class="progress-bar-container" style="height:8px;">
            <div class="progress-bar-fill" style="width:${pct}%; background:#6366f1;"></div>
          </div>
        </div>
      `;
    }).join('');
  }
}

// ----------------------------------------------------
// 4. Usage & Cost-Per-Use Analysis
// ----------------------------------------------------
async function renderUsageAndCostPerUse() {
  const costPerUseList = await api.getCostPerUse();
  const healthScores = await api.getHealthScores();

  const tbody = document.getElementById('cost-per-use-table-body');
  if (tbody) {
    if (costPerUseList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748b;">No active subscriptions to analyze.</td></tr>`;
    } else {
      tbody.innerHTML = costPerUseList.map(item => `
        <tr>
          <td><strong>${item.serviceName}</strong> <span class="badge badge-info">${item.category}</span></td>
          <td>₹${item.monthlyCost}/mo</td>
          <td>${item.usageDays} days/mo</td>
          <td><strong style="color:#06b6d4; font-size:1.05rem;">₹${item.costPerDay} / day</strong></td>
          <td><span class="badge ${item.costPerDay <= 20 ? 'badge-success' : (item.costPerDay <= 70 ? 'badge-warning' : 'badge-danger')}">${item.efficiencyCategory.replace('_', ' ')}</span></td>
          <td style="font-size:0.82rem; color:#94a3b8;">${item.message}</td>
        </tr>
      `).join('');
    }
  }

  const healthContainer = document.getElementById('health-scores-grid');
  if (healthContainer) {
    if (healthScores.length === 0) {
      healthContainer.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:#64748b; padding:24px;">No health scores calculated yet.</div>`;
    } else {
      healthContainer.innerHTML = healthScores.map(hs => `
        <div class="kpi-card" style="border-left: 4px solid ${hs.badgeColor};">
          <div class="kpi-header">
            <span class="kpi-title">${hs.category}</span>
            <span class="badge" style="background:${hs.badgeColor}22; color:${hs.badgeColor}; border:1px solid ${hs.badgeColor}; cursor:pointer;" onclick="openHealthModal()" title="View formula">${hs.status}</span>
          </div>
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <h3 style="font-size:1.2rem; font-weight:700;">${hs.serviceName}</h3>
            <span style="font-size:1.4rem; font-weight:800; color:${hs.badgeColor};">${hs.score}/100</span>
          </div>
          <p style="font-size:0.8rem; color:#94a3b8; margin-bottom:12px;">${hs.feedback}</p>
          <div style="font-size:0.75rem; color:#cbd5e1; display:flex; justify-content:space-between; border-top:1px solid rgba(148,163,184,0.1); padding-top:8px;">
            <span>Cost: ₹${hs.monthlyCost}/mo</span>
            <span>Used: ${hs.usageDays} days</span>
            <span>Rating: ${'★'.repeat(hs.valueRating || 3)}</span>
          </div>
        </div>
      `).join('');
    }
  }
}

// ----------------------------------------------------
// 5. Overlap Detection
// ----------------------------------------------------
async function renderOverlaps() {
  const overlaps = await api.getOverlaps();
  const container = document.getElementById('overlaps-container');
  if (!container) return;

  if (overlaps.length === 0) {
    container.innerHTML = `
      <div class="dashboard-section" style="text-align:center; padding:48px;">
        <i class="fas fa-check-double" style="font-size:3rem; color:#10b981; margin-bottom:16px;"></i>
        <h3>No Redundant Subscriptions Detected!</h3>
        <p style="color:#94a3b8; max-width:500px; margin:8px auto;">Your subscription portfolio is well-diversified with no multiple services competing in identical categories.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = overlaps.map(group => `
    <div class="overlap-card">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:10px;">
          <i class="fas fa-layer-group" style="color:#f59e0b; font-size:1.4rem;"></i>
          <div>
            <h3 style="font-size:1.1rem; font-weight:700;">⚠️ ${group.category} Overlap Detected</h3>
            <span style="font-size:0.8rem; color:#94a3b8;">${group.count} Subscriptions • Total ₹${group.totalMonthlyCost}/month (₹${group.totalYearlyCost}/year)</span>
          </div>
        </div>
        <div style="text-align:right;">
          <span style="font-size:0.75rem; text-transform:uppercase; color:#10b981; font-weight:700;">Potential Savings</span>
          <div style="font-size:1.3rem; font-weight:800; color:#10b981;">₹${group.potentialMonthlySavings}/mo</div>
        </div>
      </div>

      <p style="font-size:0.85rem; color:#fde68a; background:rgba(245,158,11,0.1); padding:10px 14px; border-radius:6px; margin:4px 0;">
        ${group.suggestion}
      </p>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:10px; margin-top:8px;">
        ${group.subscriptions.map(sub => `
          <div style="background:rgba(15,23,42,0.6); padding:12px; border-radius:8px; border:1px solid rgba(148,163,184,0.1); display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong>${sub.serviceName}</strong>
              <div style="font-size:0.75rem; color:#94a3b8;">₹${sub.monthlyCostEquivalent}/mo • Used ${sub.usageDaysPerMonth}d</div>
            </div>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-sm btn-outline-danger" onclick="openSimulatorWithId(${sub.id})">Simulate Cut</button>
            </div>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:10px; text-align:right;">
        <button class="btn btn-sm btn-secondary" onclick="showToast('Overlap acknowledged for ${group.category}', 'info')">
          <i class="fas fa-check"></i> Acknowledge Overlap
        </button>
      </div>
    </div>
  `).join('');
}

// ----------------------------------------------------
// 6. AI Subscription Advisor
// ----------------------------------------------------
async function renderAiAdvisor() {
  // If no question asked yet, populate default greeting or keep previous response
  const resultsArea = document.getElementById('ai-advisor-results');
  if (resultsArea && resultsArea.style.display === 'none') {
    // Ready for query
  }
}

async function askAiQuick(promptText) {
  document.getElementById('ai-query-input').value = promptText;
  await executeAiAdvisor(promptText);
}

async function handleAiAdvisorSubmit(e) {
  e.preventDefault();
  const query = document.getElementById('ai-query-input').value.trim();
  if (query) {
    await executeAiAdvisor(query);
  }
}

async function executeAiAdvisor(query) {
  const submitBtn = document.getElementById('ai-submit-btn');
  const resultsArea = document.getElementById('ai-advisor-results');
  const answerText = document.getElementById('ai-advisor-answer-text');
  const savingsBadge = document.getElementById('ai-savings-badge');
  const actionsContainer = document.getElementById('ai-action-items-container');
  const setupNotice = document.getElementById('ai-setup-notice');

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Analyzing...`;

  resultsArea.style.display = 'block';
  answerText.innerHTML = `<div class="skeleton-loader" style="height:80px; margin:10px 0;"></div>`;
  savingsBadge.style.display = 'none';
  actionsContainer.innerHTML = '';
  setupNotice.style.display = 'none';

  try {
    const res = await api.askAiAdvisor(query);

    // Setup Notice if unconfigured
    // Keep technical setup and API errors hidden from the UI
setupNotice.style.display = 'none';
setupNotice.innerHTML = '';

    // Format Markdown Bold and Bullets
    let formatted = res.answer
      .replace(/### (.*)/g, '<h4 style="margin:12px 0 6px; color:#f8fafc; font-weight:700;">$1</h4>')
      .replace(/#### (.*)/g, '<h5 style="margin:10px 0 4px; color:#c7d2fe; font-weight:600;">$1</h5>')
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#f8fafc;">$1</strong>')
      .replace(/\n- (.*)/g, '<li style="margin-left:20px; color:#cbd5e1;">$1</li>')
      .replace(/\n\n/g, '<br><br>');

    answerText.innerHTML = formatted;

    // Savings Badge
    if (res.estimatedSavingsMonthly && res.estimatedSavingsMonthly > 0) {
      savingsBadge.style.display = 'inline-block';
      savingsBadge.innerHTML = `<i class="fas fa-piggy-bank"></i> Est. Savings: ₹${res.estimatedSavingsMonthly.toLocaleString()}/mo`;
    }

    // Action Items
    if (res.actionItems && res.actionItems.length > 0) {
      actionsContainer.innerHTML = `
        <div style="font-size:0.8rem; font-weight:600; text-transform:uppercase; color:#94a3b8; margin-bottom:6px;">Recommended Actions:</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          ${res.actionItems.map(act => `<span class="action-item-pill"><i class="fas fa-arrow-right"></i> ${act}</span>`).join('')}
        </div>
      `;
    }

    document.getElementById('ai-disclaimer-text').textContent = res.disclaimer || 'SmartSub AI provides suggestions, not guaranteed savings. Subscriptions are not automatically cancelled.';

  } catch (err) {
    answerText.innerHTML = `<div style="color:#fb7185;"><i class="fas fa-exclamation-triangle"></i> Failed to generate AI recommendations: ${err.message}</div>`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fas fa-paper-plane"></i> Ask Advisor`;
  }
}

// ----------------------------------------------------
// 7. Renewal Calendar
// ----------------------------------------------------
async function renderCalendar() {
  const container = document.getElementById('calendar-grid-container');
  if (!container) return;

  container.innerHTML = `<div class="skeleton-loader" style="height:120px; grid-column:1/-1;"></div>`;

  try {
    const items = await api.getCalendar(currentCalendarFilter);

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state-box" style="grid-column: 1/-1;">
          <div class="empty-state-icon"><i class="fas fa-calendar-check"></i></div>
          <div class="empty-state-title">No Upcoming Renewals</div>
          <div class="empty-state-desc">No active subscriptions are renewing within this selected timeframe.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="calendar-card ${item.isWithin7Days ? 'urgent' : ''}">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span class="badge ${item.isWithin7Days ? 'badge-danger' : 'badge-info'}">
              ${item.isWithin7Days ? `⚡ Due in ${item.daysUntilRenewal}d` : `In ${item.daysUntilRenewal} days`}
            </span>
            <span class="badge" style="background:${item.color}22; color:${item.color}; border:1px solid ${item.color};">${item.category}</span>
          </div>

          <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
            <div style="width:36px; height:36px; border-radius:8px; background:${item.color}; display:flex; align-items:center; justify-content:center; color:#fff; font-size:1.1rem;">
              <i class="${item.icon}"></i>
            </div>
            <div>
              <strong style="font-size:1.05rem;">${item.serviceName}</strong>
              <div style="font-size:0.75rem; color:#94a3b8;">${item.planName || 'Standard'}</div>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; background:rgba(15,23,42,0.4); padding:10px 12px; border-radius:8px; margin-bottom:12px;">
            <div>
              <div style="font-size:0.72rem; color:#94a3b8; text-transform:uppercase;">Scheduled Charge</div>
              <strong style="font-size:1.1rem; color:#f8fafc;">₹${item.cost}</strong>
            </div>
            <div style="text-align:right;">
              <div style="font-size:0.72rem; color:#94a3b8; text-transform:uppercase;">Billing Cycle</div>
              <span style="font-size:0.85rem; color:#cbd5e1;">${item.billingCycle}</span>
            </div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:10px;">
          <div style="font-size:0.8rem; color:#94a3b8;"><i class="fas fa-calendar-day"></i> ${item.renewalDate}</div>
          <button class="btn btn-sm btn-secondary" onclick="openEditSubModal(${item.subscriptionId})"><i class="fas fa-sliders-h"></i> Details</button>
        </div>
      </div>
    `).join('');

  } catch (err) {
    container.innerHTML = `<div style="color:#fb7185; grid-column:1/-1;">Error loading renewal calendar: ${err.message}</div>`;
  }
}

function setCalendarFilter(filter, btn) {
  currentCalendarFilter = filter;
  document.querySelectorAll('.calendar-filter-bar .filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderCalendar();
}

// ----------------------------------------------------
// 8. Forecast & Risks
// ----------------------------------------------------
async function renderForecastAndRisks() {
  const forecast = await api.getFutureForecast();
  const risks = await api.getRenewalRisks();

  document.getElementById('forecast-30d').textContent = `₹${forecast.next30DaysCost.toLocaleString()}`;
  document.getElementById('forecast-3m').textContent = `₹${forecast.next3MonthsCost.toLocaleString()}`;
  document.getElementById('forecast-6m').textContent = `₹${forecast.next6MonthsCost.toLocaleString()}`;
  document.getElementById('forecast-12m').textContent = `₹${forecast.next12MonthsCost.toLocaleString()}`;

  // Forecast Line Chart
  const ctx = document.getElementById('forecastLineChart');
  if (ctx) {
    const labels = Object.keys(forecast.monthlyProjectedExpenditure || {});
    const values = Object.values(forecast.monthlyProjectedExpenditure || {});

    if (forecastChartInstance) forecastChartInstance.destroy();

    forecastChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Projected Monthly Spend (₹)',
          data: values,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointBackgroundColor: '#06b6d4'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { grid: { color: 'rgba(148,163,184,0.1)' }, ticks: { color: '#94a3b8' } },
          x: { grid: { color: 'rgba(148,163,184,0.1)' }, ticks: { color: '#94a3b8' } }
        },
        plugins: {
          legend: { labels: { color: '#cbd5e1' } }
        }
      }
    });
  }

  // Renewal Risks List
  const riskList = document.getElementById('renewal-risks-table-body');
  if (riskList) {
    if (risks.length === 0) {
      riskList.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">No renewal risks recorded.</td></tr>`;
      return;
    }
    riskList.innerHTML = risks.map(r => `
      <tr>
        <td><strong>${r.serviceName}</strong></td>
        <td><span class="badge badge-info">${r.category}</span></td>
        <td>₹${r.cost} (${r.billingCycle})</td>
        <td>
          <strong>${r.renewalDate}</strong>
          <div style="font-size:0.75rem; color:${r.daysRemaining <= 3 ? '#fb7185' : '#94a3b8'};">In ${r.daysRemaining} days</div>
        </td>
        <td>${r.usageDays} days/mo</td>
        <td>
          <span class="badge" style="background:${r.riskBadgeColor}22; color:${r.riskBadgeColor}; border:1px solid ${r.riskBadgeColor};">
            ${r.riskLevel.replace('_', ' ')}
          </span>
        </td>
        <td style="font-size:0.82rem; color:#cbd5e1;">${r.actionNeeded}</td>
      </tr>
    `).join('');
  }
}

// ----------------------------------------------------
// 9. What-If Savings Simulator
// ----------------------------------------------------
async function renderWhatIfSimulator() {
  const subs = await api.getSubscriptions(true);
  const container = document.getElementById('simulator-items-container');
  if (!container) return;

  if (subs.length === 0) {
    container.innerHTML = `<div style="color:#64748b; padding:24px; text-align:center;">No active subscriptions to simulate.</div>`;
    return;
  }

  container.innerHTML = subs.map(sub => {
    const isChecked = selectedSimulateIds.has(sub.id);
    return `
      <div class="sim-item ${isChecked ? 'selected' : ''}" onclick="toggleSimulateItem(${sub.id})">
        <div style="display:flex; align-items:center; gap:12px;">
          <input type="checkbox" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); toggleSimulateItem(${sub.id});">
          <div>
            <strong>${sub.serviceName}</strong>
            <div style="font-size:0.75rem; color:#94a3b8;">${sub.category} • Health: ${sub.healthScore}/100</div>
          </div>
        </div>
        <div style="text-align:right;">
          <strong style="color:#fb7185;">₹${sub.monthlyCostEquivalent}/mo</strong>
          <div style="font-size:0.72rem; color:#94a3b8;">Used ${sub.usageDaysPerMonth}d</div>
        </div>
      </div>
    `;
  }).join('');

  await updateSimulatorCalculations();
}

async function toggleSimulateItem(id) {
  if (selectedSimulateIds.has(id)) {
    selectedSimulateIds.delete(id);
  } else {
    selectedSimulateIds.add(id);
  }
  await renderWhatIfSimulator();
}

function resetSimulator() {
  selectedSimulateIds.clear();
  renderWhatIfSimulator();
  showToast('Simulation reset', 'info');
}

async function updateSimulatorCalculations() {
  const ids = Array.from(selectedSimulateIds);
  const simResult = await api.simulateSavings(ids);

  document.getElementById('sim-cancelled-count').textContent = simResult.simulatedCancelledCount;
  document.getElementById('sim-monthly-savings').textContent = `₹${simResult.potentialMonthlySavings.toLocaleString()}`;
  document.getElementById('sim-yearly-savings').textContent = `₹${simResult.potentialYearlySavings.toLocaleString()}`;
  document.getElementById('sim-new-monthly-commitment').textContent = `₹${simResult.newMonthlyCommitment.toLocaleString()}`;
  document.getElementById('sim-new-budget-remaining').textContent = `₹${simResult.newBudgetRemaining.toLocaleString()}`;
  document.getElementById('sim-pct-saved').textContent = `${simResult.budgetSavingsPercentage}% saved`;
}

function openSimulatorWithId(id) {
  if (id) selectedSimulateIds.add(id);
  const navItem = document.querySelector('[data-tab="simulator"]');
  if (navItem) navItem.click();
}

// ----------------------------------------------------
// 10. Budget & Goals Management
// ----------------------------------------------------
async function renderBudgetAndGoals() {
  const profile = await api.getProfile();
  const summary = await api.getDashboardSummary();
  const goals = await api.getGoals();

  document.getElementById('budget-input-val').value = profile.monthlyBudget || 3000;
  document.getElementById('budget-view-limit').textContent = `₹${(profile.monthlyBudget || 3000).toLocaleString()}`;
  document.getElementById('budget-view-committed').textContent = `₹${summary.totalMonthlyCost.toLocaleString()}`;
  document.getElementById('budget-view-remaining').textContent = `₹${summary.budgetRemaining.toLocaleString()}`;
  
  const pct = summary.budgetPercentageUsed;
  document.getElementById('budget-view-pct').textContent = `${pct}% used`;
  const bar = document.getElementById('budget-detail-bar');
  if (bar) {
    bar.style.width = `${Math.min(100, pct)}%`;
    bar.style.backgroundColor = summary.isOverBudget ? '#f43f5e' : (pct > 80 ? '#f59e0b' : '#10b981');
  }

  // Goals List
  const goalsContainer = document.getElementById('goals-container-list');
  if (goalsContainer) {
    if (goals.length === 0) {
      goalsContainer.innerHTML = `<div style="color:#64748b; padding:16px; font-size:0.85rem;">No goals linked yet. Connect a subscription to a learning or career milestone!</div>`;
      return;
    }
    goalsContainer.innerHTML = goals.map(g => `
      <div style="background:rgba(15,23,42,0.4); border:1px solid var(--border-color); border-radius:8px; padding:14px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div>
            <strong style="font-size:0.95rem;">${g.goalTitle}</strong>
            <span class="badge badge-info" style="margin-left:6px;">${g.subscription ? g.subscription.serviceName : 'Goal'}</span>
          </div>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteGoal(${g.id})"><i class="fas fa-trash"></i></button>
        </div>
        <p style="font-size:0.8rem; color:#94a3b8; margin:0 0 10px;">${g.goalDescription || ''}</p>
        <div style="display:flex; align-items:center; gap:12px;">
          <input type="range" min="0" max="100" value="${g.progressPercentage}" onchange="updateGoalProgress(${g.id}, this.value)" style="flex:1;">
          <strong style="color:#8b5cf6; min-width:40px;">${g.progressPercentage}%</strong>
        </div>
      </div>
    `).join('');
  }
}

async function saveBudgetChange() {
  const val = parseFloat(document.getElementById('budget-input-val').value);
  if (!isNaN(val) && val >= 0) {
    try {
      await api.updateBudget(val);
      showToast('Budget updated successfully', 'success');
      updateUserInterface();
      renderBudgetAndGoals();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

async function updateGoalProgress(goalId, pct) {
  try {
    await api.updateGoalProgress(goalId, parseInt(pct));
    showToast('Goal progress saved', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------------------------------------------
// 11. Shared Subscriptions
// ----------------------------------------------------
async function renderSharedSubscriptions() {
  const subs = await api.getSubscriptions(true);
  const select = document.getElementById('shared-sub-select');
  if (!select) return;

  if (subs.length === 0) {
    select.innerHTML = '<option value="">No subscriptions available</option>';
    document.getElementById('shared-members-list').innerHTML = '<div style="color:#64748b; padding:16px;">No subscriptions available to split.</div>';
    return;
  }

  const prevVal = select.value;
  select.innerHTML = subs.map(s => `<option value="${s.id}">${s.serviceName} (₹${s.cost})</option>`).join('');
  if (prevVal && subs.some(s => s.id == prevVal)) {
    select.value = prevVal;
  }

  select.onchange = () => loadSharedMembersForSub(select.value);
  loadSharedMembersForSub(select.value);
}

async function loadSharedMembersForSub(subId) {
  if (!subId) return;
  const sub = subscriptionsCache.find(s => s.id == subId) || await api.getSubscriptionById(subId);
  const members = await api.getSharedMembers(subId);

  document.getElementById('shared-sub-title').textContent = sub.serviceName;
  document.getElementById('shared-total-cost').textContent = `₹${sub.cost}`;

  const splitCount = members.length + 1; // plus owner
  const splitShare = Math.round((sub.cost / splitCount) * 100) / 100;
  document.getElementById('shared-split-calc').textContent = `₹${splitShare} (for ${splitCount} people)`;

  const list = document.getElementById('shared-members-list');
  if (list) {
    if (members.length === 0) {
      list.innerHTML = `<div style="color:#64748b; padding:14px;">No members added to this plan yet. Click "+ Add Member" to split costs.</div>`;
      return;
    }
    list.innerHTML = members.map(m => `
      <div style="background:rgba(15,23,42,0.4); border:1px solid var(--border-color); border-radius:8px; padding:12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong>${m.memberName}</strong> <span style="font-size:0.8rem; color:#94a3b8;">(${m.memberEmail || 'No email'})</span>
          <div style="font-size:0.75rem; color:#cbd5e1;">Share: ₹${m.shareAmount} • ${m.notes || ''}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button class="btn btn-sm ${m.isPaid ? 'btn-success' : 'btn-secondary'}" onclick="toggleMemberPaid(${m.id}, ${!m.isPaid})">
            ${m.isPaid ? '<i class="fas fa-check"></i> Paid' : '<i class="fas fa-clock"></i> Unpaid'}
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="removeSharedMember(${m.id})"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `).join('');
  }
}

async function toggleMemberPaid(memberId, isPaid) {
  try {
    await api.toggleSharedMemberPaid(memberId, isPaid);
    showToast('Payment status updated', 'success');
    const subId = document.getElementById('shared-sub-select').value;
    loadSharedMembersForSub(subId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function removeSharedMember(memberId) {
  if (confirm('Remove this member from the split plan?')) {
    try {
      await api.removeSharedMember(memberId);
      showToast('Member removed', 'success');
      const subId = document.getElementById('shared-sub-select').value;
      loadSharedMembersForSub(subId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

// ----------------------------------------------------
// 12. Import & Timeline
// ----------------------------------------------------
async function renderTimelineAndImport() {
  const timeline = await api.getTimeline();
  const container = document.getElementById('timeline-events-container');
  if (container) {
    if (timeline.length === 0) {
      container.innerHTML = `<div style="color:#64748b; padding:16px;">No subscription lifecycle events recorded yet.</div>`;
      return;
    }
    container.innerHTML = timeline.map(e => `
      <div class="timeline-event">
        <div class="timeline-event-icon" style="background:${e.badgeColor || '#6366f1'};">
          <i class="${e.icon || 'fas fa-calendar'}"></i>
        </div>
        <div class="timeline-event-content">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <strong style="color:#f8fafc; font-size:0.95rem;">${e.subscriptionName}</strong>
            <span style="font-size:0.75rem; color:#94a3b8;">${e.eventDate}</span>
          </div>
          <p style="font-size:0.85rem; color:#cbd5e1; margin:0;">${e.description}</p>
        </div>
      </div>
    `).join('');
  }
}

// CSV Upload handler
async function handleCsvUpload(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;

  const resultContainer = document.getElementById('csv-import-results');
  resultContainer.innerHTML = `<div style="padding:16px; color:#a5b4fc;"><i class="fas fa-spinner fa-spin"></i> Analyzing statement transactions and recurring patterns...</div>`;

  try {
    const candidates = await api.uploadCsv(file);
    if (candidates.length === 0) {
      resultContainer.innerHTML = `<div style="color:#64748b; padding:16px;">No recurring subscription patterns detected in statement.</div>`;
      return;
    }

    resultContainer.innerHTML = `
      <h4 style="margin:16px 0 12px; font-size:1rem;">🔍 Detected Possible Recurring Subscriptions:</h4>
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${candidates.map((c, idx) => `
          <div style="background:rgba(15,23,42,0.6); border:1px solid ${c.isRecurringCandidate ? 'rgba(16,185,129,0.4)' : 'rgba(148,163,184,0.2)'}; padding:14px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong>${c.detectedServiceName}</strong> <span class="badge badge-info">${c.suggestedCategory}</span>
              <div style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">Raw: "${c.rawDescription}" • ${c.reason}</div>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
              <strong style="font-size:1.1rem; color:#f8fafc;">₹${c.detectedAmount}/mo</strong>
              <button class="btn btn-sm btn-primary" onclick='importDetectedCandidate(${JSON.stringify(c)})'>+ Add Subscription</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    resultContainer.innerHTML = `<div style="color:#fb7185; padding:16px;">Error parsing CSV: ${err.message}</div>`;
  }
}

async function importDetectedCandidate(candidate) {
  try {
    await api.createSubscription({
      serviceName: candidate.detectedServiceName,
      planName: 'Auto Detected',
      cost: candidate.detectedAmount,
      billingCycle: candidate.suggestedBillingCycle || 'MONTHLY',
      renewalDate: candidate.detectedDate,
      category: candidate.suggestedCategory,
      usageDaysPerMonth: 15,
      valueRating: 4,
      personalReason: 'Imported from Bank Statement'
    });
    showToast(`Added ${candidate.detectedServiceName} to subscriptions!`, 'success');
    loadCurrentTab();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Receipt Scanning Upload Handler
async function handleReceiptUpload(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;

  const resultsDiv = document.getElementById('receipt-scan-results');
  resultsDiv.innerHTML = `<div style="padding:14px; color:#06b6d4;"><i class="fas fa-spinner fa-spin"></i> Scanning receipt with SmartSub Intelligence...</div>`;

  try {
    const data = await api.uploadReceipt(file);

    // Populate review modal
    document.getElementById('receipt-service-name').value = data.detectedServiceName || '';
    document.getElementById('receipt-plan-name').value = data.detectedPlanName || 'Standard';
    document.getElementById('receipt-cost').value = data.detectedCost || 0;
    document.getElementById('receipt-billing-cycle').value = data.detectedBillingCycle || 'MONTHLY';
    document.getElementById('receipt-renewal-date').value = data.detectedRenewalDate || new Date().toISOString().split('T')[0];
    document.getElementById('receipt-category').value = data.detectedCategory || 'Entertainment';
    document.getElementById('receipt-confidence-note').innerHTML = `
      <i class="fas fa-magic" style="color:#10b981;"></i> <strong>Confidence:</strong> ${(data.confidence * 100).toFixed(0)}% • ${data.notes || ''}
    `;

    resultsDiv.innerHTML = `<div style="padding:10px; color:#10b981;"><i class="fas fa-check"></i> Scanned successfully! Review fields below to save.</div>`;
    openModal('receiptReviewModal');
  } catch (err) {
    resultsDiv.innerHTML = `<div style="padding:12px; color:#fb7185;">Receipt scan error: ${err.message}</div>`;
  }
}

// ----------------------------------------------------
// Modals & UI Actions
// ----------------------------------------------------
function setupModals() {
  // Subscription Form submission
  const subForm = document.getElementById('subscriptionForm');
  if (subForm) {
    subForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('sub-id').value;
      const subData = {
        serviceName: document.getElementById('sub-service-name').value,
        planName: document.getElementById('sub-plan-name').value,
        cost: parseFloat(document.getElementById('sub-cost').value),
        billingCycle: document.getElementById('sub-billing-cycle').value,
        renewalDate: document.getElementById('sub-renewal-date').value,
        category: document.getElementById('sub-category').value,
        usageDaysPerMonth: parseInt(document.getElementById('sub-usage-days').value) || 0,
        valueRating: parseInt(document.getElementById('sub-value-rating').value) || 3,
        personalReason: document.getElementById('sub-personal-reason').value
      };

      try {
        if (id) {
          await api.updateSubscription(id, subData);
          showToast('Subscription updated successfully', 'success');
        } else {
          await api.createSubscription(subData);
          showToast('Subscription created successfully', 'success');
        }
        closeModal('subscriptionModal');
        loadCurrentTab();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Price Change Form submission
  const priceForm = document.getElementById('priceChangeForm');
  if (priceForm) {
    priceForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('price-sub-id').value;
      const newPrice = parseFloat(document.getElementById('price-new-val').value);
      const reason = document.getElementById('price-reason-val').value;

      try {
        await api.recordPriceChange(id, newPrice, reason);
        showToast('Price change logged successfully', 'success');
        closeModal('priceChangeModal');
        loadCurrentTab();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Goal Form submission
  const goalForm = document.getElementById('goalForm');
  if (goalForm) {
    goalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const goalData = {
        subscriptionId: parseInt(document.getElementById('goal-sub-id').value),
        goalTitle: document.getElementById('goal-title-val').value,
        goalDescription: document.getElementById('goal-desc-val').value,
        progressPercentage: parseInt(document.getElementById('goal-prog-val').value) || 0,
        targetDate: document.getElementById('goal-target-date').value || null
      };

      try {
        await api.createGoal(goalData);
        showToast('Goal linked successfully', 'success');
        closeModal('goalModal');
        loadCurrentTab();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Shared Member Form
  const sharedForm = document.getElementById('sharedMemberForm');
  if (sharedForm) {
    sharedForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const subId = parseInt(document.getElementById('shared-sub-select').value);
      const memberData = {
        subscriptionId: subId,
        memberName: document.getElementById('member-name-val').value,
        memberEmail: document.getElementById('member-email-val').value,
        shareAmount: parseFloat(document.getElementById('member-amount-val').value),
        notes: document.getElementById('member-notes-val').value,
        isPaid: false
      };

      try {
        await api.addSharedMember(memberData);
        showToast('Member added to split plan', 'success');
        closeModal('sharedMemberModal');
        loadSharedMembersForSub(subId);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Receipt Review Form submission
  const receiptForm = document.getElementById('receiptReviewForm');
  if (receiptForm) {
    receiptForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const subData = {
        serviceName: document.getElementById('receipt-service-name').value,
        planName: document.getElementById('receipt-plan-name').value,
        cost: parseFloat(document.getElementById('receipt-cost').value),
        billingCycle: document.getElementById('receipt-billing-cycle').value,
        renewalDate: document.getElementById('receipt-renewal-date').value,
        category: document.getElementById('receipt-category').value,
        usageDaysPerMonth: 15,
        valueRating: 4,
        personalReason: 'Imported from Invoice / Receipt'
      };

      try {
        await api.createSubscription(subData);
        showToast(`Added ${subData.serviceName} from receipt!`, 'success');
        closeModal('receiptReviewModal');
        loadCurrentTab();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

function openHealthModal() {
  openModal('healthInfoModal');
}

function openAddSubModal() {
  document.getElementById('sub-id').value = '';
  document.getElementById('subscriptionForm').reset();
  document.getElementById('subscription-modal-title').textContent = 'Add New Subscription';
  document.getElementById('sub-renewal-date').value = new Date().toISOString().split('T')[0];
  openModal('subscriptionModal');
}

async function openEditSubModal(id) {
  const sub = subscriptionsCache.find(s => s.id == id) || await api.getSubscriptionById(id);
  document.getElementById('sub-id').value = sub.id;
  document.getElementById('sub-service-name').value = sub.serviceName;
  document.getElementById('sub-plan-name').value = sub.planName || '';
  document.getElementById('sub-cost').value = sub.cost;
  document.getElementById('sub-billing-cycle').value = sub.billingCycle;
  document.getElementById('sub-renewal-date').value = sub.renewalDate;
  document.getElementById('sub-category').value = sub.category;
  document.getElementById('sub-usage-days').value = sub.usageDaysPerMonth || 0;
  document.getElementById('sub-value-rating').value = sub.valueRating || 3;
  document.getElementById('sub-personal-reason').value = sub.personalReason || '';
  
  document.getElementById('subscription-modal-title').textContent = `Edit Subscription: ${sub.serviceName}`;
  openModal('subscriptionModal');
}

function openPriceModal(id) {
  const sub = subscriptionsCache.find(s => s.id == id);
  document.getElementById('price-sub-id').value = id;
  document.getElementById('price-current-display').textContent = sub ? `₹${sub.cost}` : '';
  document.getElementById('price-new-val').value = sub ? sub.cost : '';
  document.getElementById('price-reason-val').value = '';
  openModal('priceChangeModal');
}

function openAddGoalModal() {
  const select = document.getElementById('goal-sub-id');
  select.innerHTML = subscriptionsCache.map(s => `<option value="${s.id}">${s.serviceName}</option>`).join('');
  document.getElementById('goalForm').reset();
  openModal('goalModal');
}

function openAddMemberModal() {
  document.getElementById('sharedMemberForm').reset();
  openModal('sharedMemberModal');
}

async function deleteSubscription(id) {
  if (confirm('Are you sure you want to delete/cancel this subscription?')) {
    try {
      await api.deleteSubscription(id);
      showToast('Subscription removed', 'success');
      loadCurrentTab();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

async function deleteGoal(id) {
  if (confirm('Delete this goal?')) {
    try {
      await api.deleteGoal(id);
      showToast('Goal removed', 'success');
      renderBudgetAndGoals();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

function updateUserInterface() {
  if (api.user) {
    document.getElementById('user-display-name').textContent = api.user.fullName || api.user.username;
    document.getElementById('user-display-budget').textContent = `Budget: ₹${(api.user.monthlyBudget || 3000).toLocaleString()}/mo`;
    const initials = (api.user.fullName || api.user.username || 'U')
      .split(' ')
      .filter(n => n.length > 0)
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
    const avatarEl = document.getElementById('user-avatar-initials');
    if (avatarEl) avatarEl.textContent = initials;
  } else {
    document.getElementById('user-display-name').textContent = 'Guest';
    document.getElementById('user-display-budget').textContent = 'Please Sign In';
    const avatarEl = document.getElementById('user-avatar-initials');
    if (avatarEl) avatarEl.textContent = '?';
  }
}

function setupAuthEventListeners() {
  window.addEventListener('auth:login', () => {
    updateUserInterface();
    loadCurrentTab();
  });
  window.addEventListener('auth:unauthorized', () => {
    updateUserInterface();
    openModal('loginModal');
  });
  window.addEventListener('auth:logout', () => {
    updateUserInterface();
    openModal('loginModal');
  });
}

// ----------------------------------------------------
// Authentication Actions (Firebase & Local)
// ----------------------------------------------------
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('authSignInForm').style.display = 'none';
  document.getElementById('authSignUpForm').style.display = 'none';
  document.getElementById('authForgotForm').style.display = 'none';
  hideAuthError();

  if (tab === 'signin') {
    document.getElementById('tab-btn-signin').classList.add('active');
    document.getElementById('authSignInForm').style.display = 'block';
  } else if (tab === 'signup') {
    document.getElementById('tab-btn-signup').classList.add('active');
    document.getElementById('authSignUpForm').style.display = 'block';
  } else if (tab === 'forgot') {
    document.getElementById('tab-btn-forgot').classList.add('active');
    document.getElementById('authForgotForm').style.display = 'block';
  }
}

function showAuthError(msg) {
  const banner = document.getElementById('auth-error-banner');
  if (banner) {
    banner.style.display = 'flex';
    banner.innerHTML = `<i class="fas fa-exclamation-circle"></i> <span>${msg}</span>`;
  }
}

function hideAuthError() {
  const banner = document.getElementById('auth-error-banner');
  if (banner) banner.style.display = 'none';
}

async function handleAuthSignIn(e) {
  e.preventDefault();
  hideAuthError();
  const emailOrUser = document.getElementById('signin-email').value.trim();
  const password = document.getElementById('signin-password').value;

  const btnText = document.getElementById('signin-btn-text');
  const btnSpinner = document.getElementById('signin-btn-spinner');
  btnText.style.display = 'none';
  btnSpinner.style.display = 'inline';

  try {
    if (emailOrUser.includes('@') && window.firebaseAuth) {
      await window.firebaseAuth.loginWithEmail(emailOrUser, password);
    } else {
      await api.login(emailOrUser, password);
    }
    showToast('Signed in successfully', 'success');
    closeModal('loginModal');
    updateUserInterface();
    loadCurrentTab();
  } catch (err) {
    showAuthError(err.message || 'Login failed. Please check credentials.');
  } finally {
    btnText.style.display = 'inline';
    btnSpinner.style.display = 'none';
  }
}

async function handleAuthSignUp(e) {
  e.preventDefault();
  hideAuthError();
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const budget = parseFloat(document.getElementById('signup-budget').value) || 3000;

  const btnText = document.getElementById('signup-btn-text');
  const btnSpinner = document.getElementById('signup-btn-spinner');
  btnText.style.display = 'none';
  btnSpinner.style.display = 'inline';

  try {
    if (window.firebaseAuth) {
      await window.firebaseAuth.registerWithEmail(email, password, name, budget);
    } else {
      await api.register(email.split('@')[0], email, password, name, budget);
    }
    showToast('Account created and logged in!', 'success');
    closeModal('loginModal');
    updateUserInterface();
    loadCurrentTab();
  } catch (err) {
    showAuthError(err.message || 'Registration failed. Please check your information.');
  } finally {
    btnText.style.display = 'inline';
    btnSpinner.style.display = 'none';
  }
}

async function handleAuthForgot(e) {
  e.preventDefault();
  hideAuthError();
  const email = document.getElementById('forgot-email').value.trim();

  const btnText = document.getElementById('forgot-btn-text');
  const btnSpinner = document.getElementById('forgot-btn-spinner');
  btnText.style.display = 'none';
  btnSpinner.style.display = 'inline';

  try {
    await window.firebaseAuth.sendPasswordReset(email);
    showToast(`Password reset link sent to ${email}`, 'success');
    switchAuthTab('signin');
  } catch (err) {
    showAuthError(err.message || 'Could not send reset email.');
  } finally {
    btnText.style.display = 'inline';
    btnSpinner.style.display = 'none';
  }
}

async function handleGoogleSignIn() {
  hideAuthError();
  try {
    await window.firebaseAuth.loginWithGoogle();
    showToast('Signed in with Google!', 'success');
    closeModal('loginModal');
    updateUserInterface();
    loadCurrentTab();
  } catch (err) {
    showAuthError(err.message || 'Google sign-in was cancelled or failed.');
  }
}

async function handleDemoQuickLogin() {
  hideAuthError();
  try {
    await api.loginDemo();
    showToast('Signed in as Demo user (Alex Johnson)', 'success');
    closeModal('loginModal');
    updateUserInterface();
    loadCurrentTab();
  } catch (err) {
    showAuthError(err.message || 'Could not sign in as demo user.');
  }
}

async function handleSignOut() {
  try {
    if (window.firebaseAuth) {
      await window.firebaseAuth.logout();
    } else {
      api.clearAuth();
    }
  } catch (e) {
    api.clearAuth();
  }
  updateUserInterface();
  openModal('loginModal');
  showToast('Signed out successfully', 'info');
}

window.handleSignOut = handleSignOut;

// Toast Helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  const icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle');
  const color = type === 'success' ? '#10b981' : (type === 'error' ? '#f43f5e' : '#6366f1');

  toast.innerHTML = `
    <i class="fas ${icon}" style="color:${color}; font-size:1.1rem;"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
