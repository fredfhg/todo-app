/**
 * 电纸书版应用逻辑
 * 对标 Kindle 等墨水屏阅读器的交互设计
 * ─ 单列列表 · 大触控区 · 清晰信息层次
 * 
 * 兼容性：ES5 语法，适配 Android 8.1 WebView (Chrome 65+)
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
    startPolling();
  }).catch(function(e) {
    console.error('初始化加载失败:', e);
    updateConnectionStatus(false);
    document.getElementById('taskGrid').innerHTML =
      '<div class="loading">连接失败，请点击刷新重试</div>';
  });
}

/**
 * 轮询 - 每60秒自动拉取
 */
function startPolling() {
  if (pollingTimer) return;
  pollingTimer = setInterval(function() {
    loadData().then(function() {
      updateConnectionStatus(true);
    }).catch(function() {
      updateConnectionStatus(false);
    });
  }, 60000);
}

/**
 * 更新日期时间
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
    renderList();
    updateCount();
    updateLastSync();
    einkState.isLoading = false;
  });
}

/**
 * 渲染任务列表
 */
function renderList() {
  var grid = document.getElementById('taskGrid');
  var emptyState = document.getElementById('emptyState');

  if (einkState.todos.length === 0) {
    grid.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  grid.classList.remove('hidden');
  emptyState.classList.add('hidden');

  // 排序：未完成在前，按优先级排序
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

  // 分组渲染：活跃任务 & 已完成
  var activeItems = [];
  var completedItems = [];
  for (var i = 0; i < sorted.length; i++) {
    if (sorted[i].status === 'completed') {
      completedItems.push(sorted[i]);
    } else {
      activeItems.push(sorted[i]);
    }
  }

  var html = '';

  // 活跃任务
  if (activeItems.length > 0) {
    for (var j = 0; j < activeItems.length; j++) {
      html += renderItem(activeItems[j]);
    }
  }

  // 已完成任务（带分组标题）
  if (completedItems.length > 0) {
    html += '<div class="task-section-header">已完成 (' + completedItems.length + ')</div>';
    for (var k = 0; k < completedItems.length; k++) {
      html += renderItem(completedItems[k]);
    }
  }

  grid.innerHTML = html;
  forceEinkRefresh();
}

/**
 * 渲染单个列表项
 * 布局：[复选框] [标题] ──── [优先级 / 类别 / 截止日期]
 */
function renderItem(todo) {
  var isCompleted = todo.status === 'completed';
  var priorityConf = PRIORITIES[todo.priority] || {};
  var categoryConf = CATEGORIES[todo.category] || {};
  var dueText = TodoUtils.formatDate(todo.due_date);
  var isOverdue = todo.due_date && new Date(todo.due_date) < new Date() && !isCompleted;

  var itemClass = 'task-item' + (isCompleted ? ' completed' : '');
  var checkClass = 'task-checkbox' + (isCompleted ? ' checked' : '');
  var dueClass = 'task-due' + (isOverdue ? ' overdue' : '');
  var priorityClass = 'task-priority-tag ' + (todo.priority || 'medium');

  // 右侧元信息区
  var asideHtml = '';
  asideHtml += '<span class="' + priorityClass + '">' + (priorityConf.label || '普通') + '</span>';
  asideHtml += '<span class="task-category-tag">' + (categoryConf.emoji || '') + ' ' + (categoryConf.label || '') + '</span>';
  if (dueText) {
    asideHtml += '<span class="' + dueClass + '">' + (isOverdue ? '⚠ ' : '') + dueText + '</span>';
  }

  return '<div class="' + itemClass + '" data-id="' + todo.id + '">' +
    '<div class="' + checkClass + '" onclick="toggleStatus(\'' + todo.id + '\', \'' + todo.status + '\')"></div>' +
    '<div class="task-content">' +
      '<div class="task-title">' + escapeHtml(todo.title) + '</div>' +
    '</div>' +
    '<div class="task-aside">' + asideHtml + '</div>' +
  '</div>';
}

/**
 * 切换任务状态
 */
function toggleStatus(id, currentStatus) {
  var item = document.querySelector('[data-id="' + id + '"]');
  if (item) {
    var checkbox = item.querySelector('.task-checkbox');
    var isNowCompleted = currentStatus === 'active';

    if (isNowCompleted) {
      item.classList.add('completed');
      checkbox.classList.add('checked');
    } else {
      item.classList.remove('completed');
      checkbox.classList.remove('checked');
    }
    forceEinkRefresh();
  }

  EinkDB.toggleStatus(id, currentStatus).then(function() {
    setTimeout(function() { loadData(); }, 600);
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
    if (completed > 0) countText += ' · ' + completed + ' 已完成';
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
  document.getElementById('lastSync').textContent = '同步 ' + timeStr;
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

// 启动
document.addEventListener('DOMContentLoaded', initEinkApp);
