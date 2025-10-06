import {
  modal,
  openBtn,
  refreshBtn,
  exportBtn,
  rangeSelect,
  customRangeContainer,
  startInput,
  endInput,
  granularitySelect,
  typeFilterSelect,
} from './dashboard/dom.js';
import { state } from './dashboard/state.js';
import {
  loadDashboardData,
  updateCustomRangeVisibility,
  applyTypeFilter,
} from './dashboard/data-loader.js';
import { exportLogsCsv, renderLogTable } from './dashboard/tables.js';
import {
  initializeSlackSection,
  refreshSlackSection,
} from './dashboard/slack.js';
import {
  initializeTypingSection,
  refreshTypingSection,
  refreshTypingStatus,
} from './dashboard/typing.js';
import {
  initializeSystemEventsSection,
  refreshSystemEvents,
} from './dashboard/system-events.js';
import { refreshUpcomingSchedules } from './dashboard/upcoming.js';
import { renderChart } from './dashboard/charts.js';

function openModal() {
  if (!modal) return;
  modal.classList.add('open');
  document.body.classList.add('dashboard-modal-open');
  loadDashboardData();
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove('open');
  document.body.classList.remove('dashboard-modal-open');
}

document.querySelectorAll('#dashboardModal .close-btn').forEach((btn) => {
  btn.addEventListener('click', closeModal);
});

document.querySelectorAll('#dashboardModal .modal-backdrop').forEach((backdrop) => {
  backdrop.addEventListener('click', closeModal);
});

if (openBtn) {
  openBtn.addEventListener('click', () => {
    if (modal?.classList.contains('open')) {
      closeModal();
    } else {
      openModal();
    }
  });
}

if (refreshBtn) {
  refreshBtn.addEventListener('click', () => {
    loadDashboardData();
  });
}

if (exportBtn) {
  exportBtn.addEventListener('click', () => {
    exportLogsCsv();
  });
}

if (rangeSelect) {
  rangeSelect.addEventListener('change', () => {
    const isCustom = rangeSelect.value === 'custom';
    updateCustomRangeVisibility();
    if (!isCustom) {
      loadDashboardData();
    }
  });
}

if (startInput && endInput) {
  [startInput, endInput].forEach((input) => {
    input.addEventListener('change', () => {
      if (rangeSelect?.value === 'custom' && startInput.value && endInput.value) {
        loadDashboardData();
      }
    });
  });
}

if (granularitySelect) {
  granularitySelect.addEventListener('change', () => {
    loadDashboardData();
  });
}

if (typeFilterSelect) {
  typeFilterSelect.addEventListener('change', () => {
    applyTypeFilter();
    renderLogTable();
  });
}

initializeSlackSection();
initializeTypingSection();
initializeSystemEventsSection();
updateCustomRangeVisibility();
refreshUpcomingSchedules();
refreshTypingStatus();
renderChart();
renderLogTable();

window.addEventListener('schedules-updated', () => {
  refreshUpcomingSchedules();
  refreshSlackSection({ showLoadingIndicator: false });
});

window.addEventListener('typing-monitor-status-updated', () => {
  refreshTypingStatus();
  refreshTypingSection({ showLoading: false });
});

window.addEventListener('detection-log-recorded', () => {
  if (!modal?.classList.contains('open')) return;
  if (state.autoRefreshHandle) {
    clearTimeout(state.autoRefreshHandle);
  }
  state.autoRefreshHandle = setTimeout(() => {
    loadDashboardData();
    state.autoRefreshHandle = null;
  }, 1000);
});
