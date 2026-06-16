/**
 * 电纸书版应用逻辑
 * 专注显示与操作：勾选完成、切换视图、手动刷新
 * 墨水屏适配：避免频繁DOM更新，操作后强制重绘
 */

// 应用状态
const einkState = {
  todos: [],
  currentView: 'tasks', // 'tasks' | 'archived'
  isLoading: false
};

/**
 * 初始化
 */
async function initEinkApp() {
  updateDateTime();
  setInterval(updateDateTime, 60000); // 每分钟更新时间

  await loadData();
  setupRealtime();
  updateConnectionStatus(true);
}

/**
 * 更新日期时间显示
 */
function updateDateTime() {
  const { time, date, weekday } = TodoUtils.getCurrentTime();
  document.getElementById('headerTime').textContent = time;
  document.getElementById('currentDate').textContent = `${date} ${weekday}`;
}

/**
 * 加载数据
 */
async function loadData() {
  einkState.isLoading = true;
  const grid = document.getElementById('taskGrid');
  grid.innerHTML = '<div class="loading">加载中...</div>';

  const isArchived = einkState.currentView === 'archived';
  einkState.todos = await TodoDB.fetchTodos({ archived: isArchived });

  renderCards();
  updateCount();
  updateLastSync();
  einkState.isLoading = false;
}

/**
 * 渲染任务卡片
 */
function renderCards() {
  const grid = document.getElementById('taskGrid');
  const emptyState = document.getElementById('emptyState');

  if (einkState.todos.length === 0) {
    grid.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  grid.classList.remove('hidden');
  emptyState.classList.add('hidden');

  // 排序：活跃任务按优先级，已完成在后面
  const sorted = [...einkState.todos].sort((a, b) => {
    // 活跃的排前面
    if (a.status !== b.status) {
      return a.status === 'active' ? -1 : 1;
    }
    // 同状态按优先级
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    // 同优先级按 sort_order
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  grid.innerHTML = sorted.map(todo => renderCard(todo)).join('');

  // 墨水屏强制重绘
  forceEinkRefresh();
}

/**
 * 渲染单个卡片
 */
function renderCard(todo) {
  const isCompleted = todo.status === 'completed';
  const priorityConf = PRIORITIES[todo.priority] || {};
  const categoryConf = CATEGORIES[todo.category] || {};
  const dueText = TodoUtils.formatDate(todo.due_date);
  const isOverdue = todo.due_date && new Date(todo.due_date) < new Date() && !isCompleted;

  return `
    <div class="task-card ${isCompleted ? 'completed' : ''}" data-id="${todo.id}">
      <div class="task-card-header">
        <div class="eink-checkbox ${isCompleted ? 'checked' : ''}"
             onclick="toggleStatus('${todo.id}', '${todo.status}')"></div>
        <span class="task-card-title">${escapeHtml(todo.title)}</span>
      </div>
      <div class="task-card-tags">
        <span class="eink-tag priority-${todo.priority}">${priorityConf.emoji || ''} ${priorityConf.label || ''}</span>
        <span class="eink-tag category">${categoryConf.emoji || ''} ${categoryConf.label || ''}</span>
      </div>
      ${dueText ? `<div class="task-card-meta ${isOverdue ? 'overdue' : ''}">${isOverdue ? '&#9888; ' : ''}${dueText}</div>` : ''}
    </div>
  `;
}

/**
 * 切换任务状态
 */
async function toggleStatus(id, currentStatus) {
  // 乐观更新 UI
  const card = document.querySelector(`[data-id="${id}"]`);
  if (card) {
    const checkbox = card.querySelector('.eink-checkbox');
    const isNowCompleted = currentStatus === 'active';

    if (isNowCompleted) {
      card.classList.add('completed');
      checkbox.classList.add('checked');
    } else {
      card.classList.remove('completed');
      checkbox.classList.remove('checked');
    }

    forceEinkRefresh();
  }

  // 发送到服务器
  await TodoDB.toggleStatus(id, currentStatus);

  // 短暂延迟后重新加载以确保数据一致
  setTimeout(() => loadData(), 500);
}

/**
 * 切换视图
 */
function switchView(view) {
  einkState.currentView = view;

  // 更新导航按钮状态
  document.getElementById('btnTasks').classList.toggle('active', view === 'tasks');
  document.getElementById('btnArchived').classList.toggle('active', view === 'archived');

  loadData();
}

/**
 * 手动刷新
 */
async function refreshData() {
  await loadData();
}

/**
 * 设置实时同步
 */
function setupRealtime() {
  TodoDB.subscribe(
    // onInsert - 新任务
    () => {
      if (!einkState.isLoading) {
        loadData();
      }
    },
    // onUpdate - 任务更新
    () => {
      if (!einkState.isLoading) {
        loadData();
      }
    },
    // onDelete - 任务删除
    () => {
      if (!einkState.isLoading) {
        loadData();
      }
    }
  );
}

/**
 * 更新任务计数
 */
function updateCount() {
  const total = einkState.todos.length;
  const completed = einkState.todos.filter(t => t.status === 'completed').length;
  const active = total - completed;

  const countText = einkState.currentView === 'tasks'
    ? `${active} 项待办${completed > 0 ? '，' + completed + ' 项已完成' : ''}`
    : `${total} 项归档`;

  document.getElementById('todoCount').textContent = countText;
}

/**
 * 更新最后同步时间
 */
function updateLastSync() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('lastSync').textContent = `上次同步: ${timeStr}`;
}

/**
 * 连接状态
 */
function updateConnectionStatus(connected) {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  dot.classList.toggle('connected', connected);
  text.textContent = connected ? '已连接' : '未连接';
}

/**
 * 墨水屏强制重绘
 * 通过短暂改变 body 的 display 属性来触发整页刷新
 * 减少墨水屏残影
 */
function forceEinkRefresh() {
  // 使用 requestAnimationFrame 确保在下一帧执行
  requestAnimationFrame(() => {
    document.body.style.display = 'none';
    // 强制浏览器重排
    void document.body.offsetHeight;
    document.body.style.display = '';
  });
}

/**
 * 工具函数
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 启动应用
document.addEventListener('DOMContentLoaded', initEinkApp);
