/**
 * 电纸书版应用逻辑
 * 专注显示与操作：勾选完成、切换视图、手动刷新
 * 墨水屏适配：避免频繁DOM更新，操作后强制重绘
 * 
 * 兼容性：使用 ES5 语法，适配 Android 8.1 WebView
 */

// 应用状态
var einkState = {
  todos: [],
  currentView: 'tasks',
  isLoading: false
};

// 轮询定时器
var pollingTimer = null;

/**
 * 初始化
 */
function initEinkApp() {
  updateDateTime();
  setInterval(updateDateTime, 60000);

  loadData().then(function() {
    updateConnectionStatus(true);
    // 启动轮询（30秒刷新一次）
    startPolling();
  }).catch(function(e) {
    console.error('初始化加载失败:', e);
    updateConnectionStatus(false);
    document.getElementById('taskGrid').innerHTML =
      '<div class="loading">连接失败，请点击右上角刷新按钮重试</div>';
  });
}

/**
 * 轮询模式 - 每 30 秒自动拉取数据
 */
function startPolling() {
  if (pollingTimer) return;
  pollingTimer = setInterval(function() {
    loadData().then(function() {
      updateConnectionStatus(true);
    }).catch(function() {
      updateConnectionStatus(false);
    });
  }, 30000);
}

/**
 * 更新日期时间显示
 */
function updateDateTime() {
  var timeInfo = TodoUtils.getCurrentTime();
  document.getElementById('headerTime').textContent = timeInfo.time;
  document.getElementById('currentDate').textContent = timeInfo.date + ' ' + timeInfo.weekday;
}

/**
 * 加载数据
 */
function loadData() {
  einkState.isLoading = true;
  var grid = document.getElementById('taskGrid');
  grid.innerHTML = '<div class="loading">加载中...</div>';

  var isArchived = einkState.currentView === 'archived';
  return EinkDB.fetchTodos({ archived: isArchived }).then(function(data) {
    einkState.todos = data;
    renderCards();
    updateCount();
    updateLastSync();
    einkState.isLoading = false;
  });
}

/**
 * 渲染任务卡片
 */
function renderCards() {
  var grid = document.getElementById('taskGrid');
  var emptyState = document.getElementById('emptyState');

  if (einkState.todos.length === 0) {
    grid.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  grid.classList.remove('hidden');
  emptyState.classList.add('hidden');

  // 排序
  var sorted = einkState.todos.slice().sort(function(a, b) {
    if (a.status !== b.status) {
      return a.status === 'active' ? -1 : 1;
    }
    var priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    var pA = priorityOrder[a.priority] !== undefined ? priorityOrder[a.priority] : 4;
    var pB = priorityOrder[b.priority] !== undefined ? priorityOrder[b.priority] : 4;
    var pDiff = pA - pB;
    if (pDiff !== 0) return pDiff;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  var html = '';
  for (var i = 0; i < sorted.length; i++) {
    html += renderCard(sorted[i]);
  }
  grid.innerHTML = html;

  forceEinkRefresh();
}

/**
 * 渲染单个卡片
 */
function renderCard(todo) {
  var isCompleted = todo.status === 'completed';
  var priorityConf = PRIORITIES[todo.priority] || {};
  var categoryConf = CATEGORIES[todo.category] || {};
  var dueText = TodoUtils.formatDate(todo.due_date);
  var isOverdue = todo.due_date && new Date(todo.due_date) < new Date() && !isCompleted;

  var completedClass = isCompleted ? ' completed' : '';
  var checkedClass = isCompleted ? ' checked' : '';
  var overdueClass = isOverdue ? ' overdue' : '';
  var overdueIcon = isOverdue ? '&#9888; ' : '';

  var dueHtml = dueText
    ? '<div class="task-card-meta' + overdueClass + '">' + overdueIcon + dueText + '</div>'
    : '';

  return '<div class="task-card' + completedClass + '" data-id="' + todo.id + '">' +
    '<div class="task-card-header">' +
      '<div class="eink-checkbox' + checkedClass + '" onclick="toggleStatus(\'' + todo.id + '\', \'' + todo.status + '\')"></div>' +
      '<span class="task-card-title">' + escapeHtml(todo.title) + '</span>' +
    '</div>' +
    '<div class="task-card-tags">' +
      '<span class="eink-tag priority-' + todo.priority + '">' + (priorityConf.emoji || '') + ' ' + (priorityConf.label || '') + '</span>' +
      '<span class="eink-tag category">' + (categoryConf.emoji || '') + ' ' + (categoryConf.label || '') + '</span>' +
    '</div>' +
    dueHtml +
  '</div>';
}

/**
 * 切换任务状态
 */
function toggleStatus(id, currentStatus) {
  // 乐观更新 UI
  var card = document.querySelector('[data-id="' + id + '"]');
  if (card) {
    var checkbox = card.querySelector('.eink-checkbox');
    var isNowCompleted = currentStatus === 'active';

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
  EinkDB.toggleStatus(id, currentStatus).then(function() {
    // 500ms后重新加载确保数据一致
    setTimeout(function() { loadData(); }, 500);
  });
}

/**
 * 切换视图
 */
function switchView(view) {
  einkState.currentView = view;

  document.getElementById('btnTasks').classList.toggle('active', view === 'tasks');
  document.getElementById('btnArchived').classList.toggle('active', view === 'archived');

  loadData();
}

/**
 * 手动刷新
 */
function refreshData() {
  loadData();
}

/**
 * 更新任务计数
 */
function updateCount() {
  var total = einkState.todos.length;
  var completed = 0;
  for (var i = 0; i < einkState.todos.length; i++) {
    if (einkState.todos[i].status === 'completed') completed++;
  }
  var active = total - completed;

  var countText;
  if (einkState.currentView === 'tasks') {
    countText = active + ' 项待办';
    if (completed > 0) countText += '，' + completed + ' 项已完成';
  } else {
    countText = total + ' 项归档';
  }

  document.getElementById('todoCount').textContent = countText;
}

/**
 * 更新最后同步时间
 */
function updateLastSync() {
  var now = new Date();
  var h = now.getHours();
  var m = now.getMinutes();
  var timeStr = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  document.getElementById('lastSync').textContent = '上次同步: ' + timeStr;
}

/**
 * 连接状态
 */
function updateConnectionStatus(connected) {
  var dot = document.getElementById('statusDot');
  var text = document.getElementById('statusText');
  if (connected) {
    dot.classList.add('connected');
    text.textContent = '已连接';
  } else {
    dot.classList.remove('connected');
    text.textContent = '未连接';
  }
}

/**
 * 墨水屏强制重绘
 */
function forceEinkRefresh() {
  requestAnimationFrame(function() {
    document.body.style.display = 'none';
    void document.body.offsetHeight;
    document.body.style.display = '';
  });
}

/**
 * HTML转义
 */
function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 启动应用
document.addEventListener('DOMContentLoaded', initEinkApp);
