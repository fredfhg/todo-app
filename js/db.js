/**
 * 数据访问层 - 两端共享
 * 提供 CRUD 操作和实时订阅功能
 */

// 初始化 Supabase 客户端
const supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// 优先级配置
const PRIORITIES = {
  urgent: { label: '紧急', order: 0 },
  high: { label: '高优', order: 1 },
  medium: { label: '中优', order: 2 },
  low: { label: '低优', order: 3 }
};

// 分类配置
const CATEGORIES = {
  work: { label: '工作', color: '#4A9EFF' },
  dev: { label: '开发', color: '#10B981' },
  team: { label: '团队', color: '#8B5CF6' },
  finance: { label: '财务', color: '#F59E0B' },
  ops: { label: '运营', color: '#EF4444' },
  design: { label: '设计', color: '#EC4899' },
  other: { label: '其他', color: '#6B7280' }
};

/**
 * 数据库操作对象
 */
const TodoDB = {
  /**
   * 获取任务列表
   * @param {Object} filters - 筛选条件
   * @param {boolean} filters.archived - 是否获取归档任务
   * @param {string} filters.category - 分类筛选
   * @param {string} filters.status - 状态筛选
   * @returns {Promise<Array>} 任务列表
   */
  async fetchTodos(filters = {}) {
    let query = supabase
      .from('todos')
      .select('*');

    // 归档筛选
    if (filters.archived !== undefined) {
      query = query.eq('is_archived', filters.archived);
    }

    // 分类筛选
    if (filters.category && filters.category !== 'all') {
      query = query.eq('category', filters.category);
    }

    // 状态筛选
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    // 排序：优先级 → sort_order → 截止时间 → 创建时间
    query = query
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) {
      console.error('获取任务失败:', error);
      return [];
    }
    return data || [];
  },

  /**
   * 创建任务
   * @param {Object} todo - 任务数据
   * @returns {Promise<Object|null>} 创建的任务
   */
  async createTodo(todo) {
    const newTodo = {
      title: todo.title,
      description: todo.description || '',
      priority: todo.priority || 'medium',
      category: todo.category || 'work',
      due_date: todo.due_date || null,
      status: 'active',
      is_archived: false,
      subtasks: todo.subtasks || [],
      sort_order: todo.sort_order || 0
    };

    const { data, error } = await supabase
      .from('todos')
      .insert(newTodo)
      .select()
      .single();

    if (error) {
      console.error('创建任务失败:', error);
      return null;
    }
    return data;
  },

  /**
   * 更新任务
   * @param {string} id - 任务ID
   * @param {Object} updates - 更新字段
   * @returns {Promise<Object|null>} 更新后的任务
   */
  async updateTodo(id, updates) {
    const { data, error } = await supabase
      .from('todos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('更新任务失败:', error);
      return null;
    }
    return data;
  },

  /**
   * 切换任务完成状态
   * @param {string} id - 任务ID
   * @param {string} currentStatus - 当前状态
   * @returns {Promise<Object|null>}
   */
  async toggleStatus(id, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'completed' : 'active';
    return this.updateTodo(id, { status: newStatus });
  },

  /**
   * 归档/取消归档任务
   * @param {string} id - 任务ID
   * @param {boolean} archive - 是否归档
   * @returns {Promise<Object|null>}
   */
  async archiveTodo(id, archive = true) {
    return this.updateTodo(id, { is_archived: archive });
  },

  /**
   * 删除任务
   * @param {string} id - 任务ID
   * @returns {Promise<boolean>}
   */
  async deleteTodo(id) {
    const { error } = await supabase
      .from('todos')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('删除任务失败:', error);
      return false;
    }
    return true;
  },

  /**
   * 批量更新排序
   * @param {Array<{id: string, sort_order: number}>} items - 排序数据
   * @returns {Promise<boolean>}
   */
  async updateSortOrder(items) {
    const promises = items.map(item =>
      supabase
        .from('todos')
        .update({ sort_order: item.sort_order })
        .eq('id', item.id)
    );

    const results = await Promise.all(promises);
    const hasError = results.some(r => r.error);
    if (hasError) {
      console.error('更新排序失败');
      return false;
    }
    return true;
  },

  /**
   * 订阅实时变更
   * @param {Function} onInsert - 新增回调
   * @param {Function} onUpdate - 更新回调
   * @param {Function} onDelete - 删除回调
   * @returns {Function} 取消订阅函数
   */
  subscribe(onInsert, onUpdate, onDelete) {
    const channel = supabase
      .channel('todos-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'todos'
      }, (payload) => {
        if (onInsert) onInsert(payload.new);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'todos'
      }, (payload) => {
        if (onUpdate) onUpdate(payload.new);
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'todos'
      }, (payload) => {
        if (onDelete) onDelete(payload.old);
      })
      .subscribe();

    // 返回取消订阅函数
    return () => {
      supabase.removeChannel(channel);
    };
  }
};

/**
 * 工具函数
 */
const TodoUtils = {
  /**
   * 按优先级分组排序
   * @param {Array} todos - 任务列表
   * @returns {Object} { high: [...], later: [...] }
   */
  groupByPriority(todos) {
    const high = todos
      .filter(t => t.priority === 'urgent' || t.priority === 'high')
      .sort((a, b) => a.sort_order - b.sort_order || new Date(a.due_date || '9999') - new Date(b.due_date || '9999'));

    const later = todos
      .filter(t => t.priority === 'medium' || t.priority === 'low')
      .sort((a, b) => a.sort_order - b.sort_order || new Date(a.due_date || '9999') - new Date(b.due_date || '9999'));

    return { high, later };
  },

  /**
   * 格式化日期
   * @param {string} dateStr - ISO日期字符串
   * @returns {string} 格式化后的日期
   */
  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return `已过期 ${Math.abs(days)} 天`;
    if (days === 0) return '今天';
    if (days === 1) return '明天';
    if (days <= 7) return `${days} 天后`;

    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  },

  /**
   * 格式化完整日期时间
   * @param {string} dateStr - ISO日期字符串
   * @returns {string}
   */
  formatDateTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  /**
   * 获取当前时间显示
   * @returns {Object} { time, date, weekday }
   */
  getCurrentTime() {
    const now = new Date();
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return {
      time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      date: now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }),
      weekday: weekdays[now.getDay()]
    };
  }
};
