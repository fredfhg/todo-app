/**
 * 电脑版应用逻辑
 * 全功能：创建、编辑、管理、归档、拖拽排序
 */

// 应用状态
const state = {
  todos: [],
  currentView: 'tasks',    // 'tasks' | 'archived'
  currentCategory: 'all',
  selectedTodoId: null,
  editSubtasks: []
};

// DOM 元素缓存
const dom = {};

/**
 * 初始化应用
 */
async function initApp() {
  cacheDom();
  await loadTodos();
  setupRealtime();
}

function cacheDom() {
  dom.highPriorityList = document.getElementById('highPriorityList');
  dom.laterList = document.getElementById('laterList');
  dom.highCount = document.getElementById('highCount');
  dom.laterCount = document.getElementById('laterCount');
  dom.taskCount = document.getElementById('taskCount');
  dom.archiveCount = document.getElementById('archiveCount');
  dom.emptyState = document.getElementById('emptyState');
  dom.highPriorityGroup = document.getElementById('highPriorityGroup');
  dom.laterGroup = document.getElementById('laterGroup');
  dom.detailPanel = document.getElementById('detailPanel');
  dom.viewTitle = document.getElementById('viewTitle');
  dom.connectionDot = document.getElementById('connectionDot');
  dom.connectionText = document.getElementById('connectionText');
}

/**
 * 加载任务
 */
async function loadTodos() {
  const isArchived = state.currentView === 'archived';
  const filters = {
    archived: isArchived
  };

  if (state.currentCategory !== 'all') {
    filters.category = state.currentCategory;
  }

  state.todos = await TodoDB.fetchTodos(filters);
  renderTodos();
  updateCounts();
}

/**
 * 设置实时同步
 */
function setupRealtime() {
  TodoDB.subscribe(
    // onInsert
    (newTodo) => {
      handleRealtimeChange();
    },
    // onUpdate
    (updatedTodo) => {
      handleRealtimeChange();
      // 如果正在编辑该任务，更新面板
      if (state.selectedTodoId === updatedTodo.id) {
        const todo = state.todos.find(t => t.id === updatedTodo.id);
        if (todo) {
          Object.assign(todo, updatedTodo);
          populateDetailPanel(updatedTodo);
        }
      }
    },
    // onDelete
    (deletedTodo) => {
      handleRealtimeChange();
      if (state.selectedTodoId === deletedTodo.id) {
        closeDetailPanel();
      }
    }
  );
}

function handleRealtimeChange() {
  loadTodos();
}

/**
 * 渲染任务列表
 */
function renderTodos() {
  if (state.currentView === 'archived') {
    renderArchivedView();
    return;
  }

  const activeTodos = state.todos.filter(t => t.status === 'active');
  const completedTodos = state.todos.filter(t => t.status === 'completed');
  const allTodos = [...activeTodos, ...completedTodos];

  const { high, later } = TodoUtils.groupByPriority(allTodos);

  dom.highPriorityList.innerHTML = high.map(t => renderTaskItem(t)).join('');
  dom.laterList.innerHTML = later.map(t => renderTaskItem(t)).join('');
  dom.highCount.textContent = high.length;
  dom.laterCount.textContent = later.length;

  // 显示/隐藏空状态
  const isEmpty = high.length === 0 && later.length === 0;
  dom.emptyState.classList.toggle('hidden', !isEmpty);
  dom.highPriorityGroup.classList.toggle('hidden', high.length === 0);
  dom.laterGroup.classList.toggle('hidden', later.length === 0);

  // 绑定拖拽
  setupDragAndDrop();
}

function renderArchivedView() {
  dom.highPriorityGroup.classList.add('hidden');
  dom.laterGroup.classList.remove('hidden');
  
  const groupHeader = dom.laterGroup.querySelector('.task-group-header');
  groupHeader.innerHTML = '<span>&#128451; 归档任务</span><span class="count">' + state.todos.length + '</span>';
  
  dom.laterList.innerHTML = state.todos.map(t => renderTaskItem(t)).join('');
  dom.emptyState.classList.toggle('hidden', state.todos.length > 0);
}

/**
 * 渲染单个任务项
 */
function renderTaskItem(todo) {
  const isCompleted = todo.status === 'completed';
  const isActive = state.selectedTodoId === todo.id;
  const priorityConf = PRIORITIES[todo.priority] || {};
  const categoryConf = CATEGORIES[todo.category] || {};
  const dueText = TodoUtils.formatDate(todo.due_date);
  const isOverdue = todo.due_date && new Date(todo.due_date) < new Date() && !isCompleted;

  return `
    <div class="task-item ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}"
         data-id="${todo.id}"
         draggable="true"
         onclick="selectTask('${todo.id}')">
      <span class="task-drag-handle" title="拖拽排序">&#8942;&#8942;</span>
      <div class="task-checkbox ${isCompleted ? 'checked' : ''}"
           onclick="event.stopPropagation(); toggleTodoStatus('${todo.id}', '${todo.status}')"></div>
      <div class="task-info">
        <div class="task-title">${escapeHtml(todo.title)}</div>
        <div class="task-meta">
          <span class="task-tag tag-priority ${todo.priority}">${priorityConf.emoji || ''} ${priorityConf.label || ''}</span>
          <span class="task-tag tag-category">${categoryConf.emoji || ''} ${categoryConf.label || ''}</span>
          ${dueText ? `<span class="task-tag tag-due ${isOverdue ? 'overdue' : ''}">📅 ${dueText}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * 更新计数
 */
async function updateCounts() {
  // 获取活跃任务数
  const activeTodos = await TodoDB.fetchTodos({ archived: false });
  dom.taskCount.textContent = activeTodos.length;

  // 获取归档任务数
  const archivedTodos = await TodoDB.fetchTodos({ archived: true });
  dom.archiveCount.textContent = archivedTodos.length;
}

/**
 * 切换视图
 */
function switchView(view) {
  state.currentView = view;
  state.selectedTodoId = null;
  closeDetailPanel();

  // 更新导航激活状态
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  // 更新标题
  dom.viewTitle.textContent = view === 'tasks' ? '任务' : '归档';

  // 重新渲染列表头
  if (view === 'tasks') {
    const highHeader = dom.highPriorityGroup.querySelector('.task-group-header');
    highHeader.innerHTML = '<span>&#9650; 高优先级</span><span class="count" id="highCount">0</span>';
    dom.highCount = document.getElementById('highCount');
    
    const laterHeader = dom.laterGroup.querySelector('.task-group-header');
    laterHeader.innerHTML = '<span>&#9660; 稍后</span><span class="count" id="laterCount">0</span>';
    dom.laterCount = document.getElementById('laterCount');
  }

  loadTodos();
}

/**
 * 按分类筛选
 */
function filterCategory(category) {
  state.currentCategory = category;

  document.querySelectorAll('.nav-item[data-category]').forEach(el => {
    el.classList.toggle('active', el.dataset.category === category);
  });

  loadTodos();
}

/**
 * 选择任务，打开编辑面板
 */
function selectTask(id) {
  state.selectedTodoId = id;
  const todo = state.todos.find(t => t.id === id);
  if (!todo) return;

  populateDetailPanel(todo);
  dom.detailPanel.classList.remove('hidden');

  // 更新列表中的选中状态
  document.querySelectorAll('.task-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
}

/**
 * 填充编辑面板
 */
function populateDetailPanel(todo) {
  document.getElementById('editId').value = todo.id;
  document.getElementById('editTitle').value = todo.title;
  document.getElementById('editDesc').value = todo.description || '';
  document.getElementById('editPriority').value = todo.priority;
  document.getElementById('editCategory').value = todo.category;

  // 截止时间
  const dueDateInput = document.getElementById('editDueDate');
  if (todo.due_date) {
    const d = new Date(todo.due_date);
    dueDateInput.value = d.toISOString().slice(0, 16);
  } else {
    dueDateInput.value = '';
  }

  // 状态
  const statusDot = document.getElementById('editStatusDot');
  const statusText = document.getElementById('editStatusText');
  statusDot.className = `status-dot ${todo.status}`;
  statusText.textContent = todo.status === 'active' ? '进行中' : '已完成';

  // 子任务
  state.editSubtasks = [...(todo.subtasks || [])];
  renderSubtasks();
}

/**
 * 渲染子任务
 */
function renderSubtasks() {
  const container = document.getElementById('editSubtasks');
  container.innerHTML = state.editSubtasks.map((st, idx) => `
    <div class="subtask-item ${st.completed ? 'completed' : ''}">
      <div class="subtask-checkbox ${st.completed ? 'checked' : ''}"
           onclick="toggleSubtask(${idx})"></div>
      <span class="subtask-title">${escapeHtml(st.title)}</span>
      <button class="subtask-delete" onclick="removeSubtask(${idx})">&times;</button>
    </div>
  `).join('');
}

function toggleSubtask(idx) {
  state.editSubtasks[idx].completed = !state.editSubtasks[idx].completed;
  renderSubtasks();
}

function removeSubtask(idx) {
  state.editSubtasks.splice(idx, 1);
  renderSubtasks();
}

function addSubtask() {
  const input = document.getElementById('subtaskInput');
  const title = input.value.trim();
  if (!title) return;

  state.editSubtasks.push({
    id: Date.now().toString(),
    title,
    completed: false
  });

  input.value = '';
  renderSubtasks();
}

function handleAddSubtask(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    addSubtask();
  }
}

/**
 * 切换编辑面板状态
 */
function toggleEditStatus() {
  const statusDot = document.getElementById('editStatusDot');
  const statusText = document.getElementById('editStatusText');
  const current = statusDot.classList.contains('active') ? 'active' : 'completed';
  const newStatus = current === 'active' ? 'completed' : 'active';

  statusDot.className = `status-dot ${newStatus}`;
  statusText.textContent = newStatus === 'active' ? '进行中' : '已完成';
}

/**
 * 保存任务
 */
async function saveTask() {
  const id = document.getElementById('editId').value;
  if (!id) return;

  const statusDot = document.getElementById('editStatusDot');
  const status = statusDot.classList.contains('active') ? 'active' : 'completed';

  const updates = {
    title: document.getElementById('editTitle').value.trim(),
    description: document.getElementById('editDesc').value.trim(),
    priority: document.getElementById('editPriority').value,
    category: document.getElementById('editCategory').value,
    due_date: document.getElementById('editDueDate').value || null,
    status,
    subtasks: state.editSubtasks
  };

  if (!updates.title) {
    alert('标题不能为空');
    return;
  }

  await TodoDB.updateTodo(id, updates);
  await loadTodos();
}

/**
 * 归档当前任务
 */
async function archiveCurrentTask() {
  if (!state.selectedTodoId) return;
  const isArchived = state.currentView === 'archived';
  await TodoDB.archiveTodo(state.selectedTodoId, !isArchived);
  closeDetailPanel();
  await loadTodos();
  updateCounts();
}

/**
 * 删除当前任务
 */
async function deleteCurrentTask() {
  if (!state.selectedTodoId) return;
  if (!confirm('确定要删除这个任务吗？此操作不可恢复。')) return;

  await TodoDB.deleteTodo(state.selectedTodoId);
  closeDetailPanel();
  await loadTodos();
  updateCounts();
}

/**
 * 关闭编辑面板
 */
function closeDetailPanel() {
  state.selectedTodoId = null;
  dom.detailPanel.classList.add('hidden');
  document.querySelectorAll('.task-item').forEach(el => {
    el.classList.remove('active');
  });
}

/**
 * 切换任务状态（从列表中快速切换）
 */
async function toggleTodoStatus(id, currentStatus) {
  await TodoDB.toggleStatus(id, currentStatus);
  await loadTodos();
}

/**
 * 快速添加任务
 */
async function handleQuickAdd(event) {
  if (event.key !== 'Enter') return;
  const input = document.getElementById('quickAddInput');
  const title = input.value.trim();
  if (!title) return;

  await TodoDB.createTodo({ title, priority: 'medium', category: 'work' });
  input.value = '';
  await loadTodos();
  updateCounts();
}

/**
 * 创建任务弹窗
 */
function openCreateModal() {
  document.getElementById('createModal').classList.remove('hidden');
  document.getElementById('createTitle').focus();
}

function closeCreateModal() {
  document.getElementById('createModal').classList.add('hidden');
  document.getElementById('createTitle').value = '';
  document.getElementById('createDesc').value = '';
  document.getElementById('createPriority').value = 'medium';
  document.getElementById('createCategory').value = 'work';
  document.getElementById('createDueDate').value = '';
}

async function createTask() {
  const title = document.getElementById('createTitle').value.trim();
  if (!title) {
    alert('标题不能为空');
    return;
  }

  const todo = {
    title,
    description: document.getElementById('createDesc').value.trim(),
    priority: document.getElementById('createPriority').value,
    category: document.getElementById('createCategory').value,
    due_date: document.getElementById('createDueDate').value || null
  };

  await TodoDB.createTodo(todo);
  closeCreateModal();
  await loadTodos();
  updateCounts();
}

/**
 * 拖拽排序
 */
function setupDragAndDrop() {
  const lists = [dom.highPriorityList, dom.laterList];

  lists.forEach(list => {
    const items = list.querySelectorAll('.task-item');
    items.forEach(item => {
      item.addEventListener('dragstart', handleDragStart);
      item.addEventListener('dragend', handleDragEnd);
      item.addEventListener('dragover', handleDragOver);
      item.addEventListener('drop', handleDrop);
      item.addEventListener('dragleave', handleDragLeave);
    });
  });
}

let draggedItem = null;

function handleDragStart(e) {
  draggedItem = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.id);
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.task-item').forEach(el => {
    el.classList.remove('drag-over');
  });
  draggedItem = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (this !== draggedItem) {
    this.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

async function handleDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');

  if (!draggedItem || this === draggedItem) return;

  const draggedId = draggedItem.dataset.id;
  const targetId = this.dataset.id;

  // 获取同一列表内的所有任务ID
  const list = this.parentElement;
  const items = Array.from(list.querySelectorAll('.task-item'));
  const ids = items.map(el => el.dataset.id);

  // 移动元素
  const fromIdx = ids.indexOf(draggedId);
  const toIdx = ids.indexOf(targetId);
  ids.splice(fromIdx, 1);
  ids.splice(toIdx, 0, draggedId);

  // 更新排序
  const updates = ids.map((id, idx) => ({ id, sort_order: idx }));
  await TodoDB.updateSortOrder(updates);
  await loadTodos();
}

/**
 * 工具函数
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 键盘快捷键
document.addEventListener('keydown', (e) => {
  // Escape 关闭弹窗/面板
  if (e.key === 'Escape') {
    const modal = document.getElementById('createModal');
    if (!modal.classList.contains('hidden')) {
      closeCreateModal();
    } else if (state.selectedTodoId) {
      closeDetailPanel();
    }
  }

  // Ctrl+N 新建
  if (e.ctrlKey && e.key === 'n') {
    e.preventDefault();
    openCreateModal();
  }
});

// 点击弹窗外部关闭
document.getElementById('createModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    closeCreateModal();
  }
});

// 启动应用
document.addEventListener('DOMContentLoaded', initApp);
