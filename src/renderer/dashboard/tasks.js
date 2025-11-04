/**
 * ダッシュボードのタスク統計セクションを描画するモジュール。
 */
import { state } from './state.js';

/**
 * タスク統計セクションを描画する。
 */
export function renderTaskStats() {
  const container = document.getElementById('dashboardTaskStats');
  if (!container) return;

  const stats = state.taskStats;
  if (!stats || !stats.summary) {
    container.innerHTML = `
      <div class="dashboard-section-empty">
        <p>タスク統計データがありません</p>
      </div>
    `;
    return;
  }

  const summary = stats.summary;
  const range = stats.range || {};

  // KPIカード群
  const kpiCards = [
    {
      label: '総タスク数',
      value: summary.total || 0,
      subtext: '期間内の全タスク',
      color: '#4dabf7',
    },
    {
      label: '完了率',
      value: `${summary.completionRate || 0}%`,
      subtext: `完了: ${summary.completedCount || 0}件`,
      color: '#51cf66',
    },
    {
      label: '未着手',
      value: summary.byStatus?.todo || 0,
      subtext: 'ステータス: 未着手',
      color: '#ffd43b',
    },
    {
      label: '進行中',
      value: summary.byStatus?.in_progress || 0,
      subtext: 'ステータス: 進行中',
      color: '#4dabf7',
    },
    {
      label: '完了',
      value: summary.byStatus?.done || 0,
      subtext: 'ステータス: 完了',
      color: '#51cf66',
    },
    summary.averageCompletionDays != null
      ? {
          label: '平均完了日数',
          value: `${summary.averageCompletionDays}日`,
          subtext: '完了タスクの平均',
          color: '#ff922b',
        }
      : null,
  ].filter(Boolean);

  // 優先度別分布
  const priorityData = {
    high: summary.byPriority?.high || 0,
    medium: summary.byPriority?.medium || 0,
    low: summary.byPriority?.low || 0,
  };

  const html = `
    <div class="task-stats-kpis">
      ${kpiCards
        .map(
          (card) => `
        <div class="dashboard-kpi-card task-stat-card">
          <div class="kpi-label">${card.label}</div>
          <div class="kpi-value" style="color: ${card.color}">${card.value}</div>
          <div class="kpi-subtext">${card.subtext}</div>
        </div>
      `
        )
        .join('')}
    </div>

    <div class="task-stats-charts">
      <div class="task-stats-chart-section">
        <h4>ステータス別分布</h4>
        <div class="task-status-chart">
          <div class="status-bar-chart">
            <div class="status-bar-item">
              <div class="status-bar-label">未着手</div>
              <div class="status-bar-container">
                <div 
                  class="status-bar-fill status-todo" 
                  style="width: ${summary.total > 0 ? Math.round((summary.byStatus?.todo || 0) / summary.total * 100) : 0}%"
                ></div>
                <span class="status-bar-value">${summary.byStatus?.todo || 0}</span>
              </div>
            </div>
            <div class="status-bar-item">
              <div class="status-bar-label">進行中</div>
              <div class="status-bar-container">
                <div 
                  class="status-bar-fill status-in-progress" 
                  style="width: ${summary.total > 0 ? Math.round((summary.byStatus?.in_progress || 0) / summary.total * 100) : 0}%"
                ></div>
                <span class="status-bar-value">${summary.byStatus?.in_progress || 0}</span>
              </div>
            </div>
            <div class="status-bar-item">
              <div class="status-bar-label">完了</div>
              <div class="status-bar-container">
                <div 
                  class="status-bar-fill status-done" 
                  style="width: ${summary.total > 0 ? Math.round((summary.byStatus?.done || 0) / summary.total * 100) : 0}%"
                ></div>
                <span class="status-bar-value">${summary.byStatus?.done || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="task-stats-chart-section">
        <h4>優先度別分布</h4>
        <div class="task-priority-chart">
          <div class="priority-bar-chart">
            <div class="priority-bar-item">
              <div class="priority-bar-label">高</div>
              <div class="priority-bar-container">
                <div 
                  class="priority-bar-fill priority-high" 
                  style="width: ${summary.total > 0 ? Math.round((priorityData.high / summary.total) * 100) : 0}%"
                ></div>
                <span class="priority-bar-value">${priorityData.high}</span>
              </div>
            </div>
            <div class="priority-bar-item">
              <div class="priority-bar-label">中</div>
              <div class="priority-bar-container">
                <div 
                  class="priority-bar-fill priority-medium" 
                  style="width: ${summary.total > 0 ? Math.round((priorityData.medium / summary.total) * 100) : 0}%"
                ></div>
                <span class="priority-bar-value">${priorityData.medium}</span>
              </div>
            </div>
            <div class="priority-bar-item">
              <div class="priority-bar-label">低</div>
              <div class="priority-bar-container">
                <div 
                  class="priority-bar-fill priority-low" 
                  style="width: ${summary.total > 0 ? Math.round((priorityData.low / summary.total) * 100) : 0}%"
                ></div>
                <span class="priority-bar-value">${priorityData.low}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

