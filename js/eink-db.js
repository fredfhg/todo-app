/**
 * 电纸书版 - 轻量数据层
 * 不依赖 Supabase SDK，直接用 fetch 调用 REST API
 * 兼容 Android 8.1 WebView (Chrome 65+)
 */

// 配置
var EINK_CONFIG = {
  // 部署后走同域代理，本地开发直连
  baseUrl: (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'https://hnjeodwopxsoytmhpynl.supabase.co/rest/v1'
    : location.origin + '/api/rest/v1',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhuamVvZHdvcHhzb3l0bWhweW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0OTU1NTQsImV4cCI6MjA5NzA3MTU1NH0.HPXNG40gM9h5kbIvSdCh6MkD3zlxmhRj_mo5PTTOOFo'
};

// 优先级配置
var PRIORITIES = {
  urgent: { label: '紧急', emoji: '🔴', order: 0 },
  high:   { label: '高优', emoji: '🟠', order: 1 },
  medium: { label: '中优', emoji: '🔵', order: 2 },
  low:    { label: '低优', emoji: '⚪', order: 3 }
};

// 分类配置
var CATEGORIES = {
  family:  { label: '家庭', emoji: '🏠', color: '#F59E0B' },
  work:    { label: '工作', emoji: '💼', color: '#4A9EFF' },
  personal:{ label: '个人', emoji: '🧑', color: '#10B981' },
  other:   { label: '其他', emoji: '📌', color: '#6B7280' }
};

/**
 * 通用请求方法
 */
function apiRequest(path, options) {
  var url = EINK_CONFIG.baseUrl + path;
  var headers = {
    'apikey': EINK_CONFIG.anonKey,
    'Authorization': 'Bearer ' + EINK_CONFIG.anonKey,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  var fetchOptions = {
    method: options && options.method ? options.method : 'GET',
    headers: headers
  };

  if (options && options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  return fetch(url, fetchOptions).then(function(response) {
    if (!response.ok) {
      return response.text().then(function(text) {
        throw new Error('API错误 ' + response.status + ': ' + text);
      });
    }
    var contentType = response.headers.get('content-type');
    if (contentType && contentType.indexOf('application/json') !== -1) {
      return response.json();
    }
    return null;
  });
}

/**
 * 电纸书数据操作对象
 */
var EinkDB = {
  /**
   * 获取任务列表
   */
  fetchTodos: function(filters) {
    var params = ['select=*'];

    if (filters && filters.archived !== undefined) {
      params.push('is_archived=eq.' + filters.archived);
    }

    if (filters && filters.category && filters.category !== 'all') {
      params.push('category=eq.' + filters.category);
    }

    if (filters && filters.status) {
      params.push('status=eq.' + filters.status);
    }

    params.push('order=sort_order.asc,created_at.desc');

    var path = '/todos?' + params.join('&');
    return apiRequest(path).then(function(data) {
      return data || [];
    }).catch(function(err) {
      console.error('获取任务失败:', err);
      return [];
    });
  },

  /**
   * 切换任务状态
   */
  toggleStatus: function(id, currentStatus) {
    var newStatus = currentStatus === 'active' ? 'completed' : 'active';
    var path = '/todos?id=eq.' + id;
    return apiRequest(path, {
      method: 'PATCH',
      body: { status: newStatus }
    }).then(function(data) {
      return data && data[0] ? data[0] : null;
    }).catch(function(err) {
      console.error('更新状态失败:', err);
      return null;
    });
  }
};

/**
 * 工具函数
 */
var TodoUtils = {
  formatDate: function(dateStr) {
    if (!dateStr) return '';
    var date = new Date(dateStr);
    var now = new Date();
    var diff = date - now;
    var days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return '已过期 ' + Math.abs(days) + ' 天';
    if (days === 0) return '今天';
    if (days === 1) return '明天';
    if (days <= 7) return days + ' 天后';

    var month = date.getMonth() + 1;
    var day = date.getDate();
    return month + '月' + day + '日';
  },

  getCurrentTime: function() {
    var now = new Date();
    var weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    var hours = now.getHours();
    var minutes = now.getMinutes();
    var timeStr = (hours < 10 ? '0' : '') + hours + ':' + (minutes < 10 ? '0' : '') + minutes;
    var month = now.getMonth() + 1;
    var day = now.getDate();
    return {
      time: timeStr,
      date: month + '月' + day + '日',
      weekday: weekdays[now.getDay()]
    };
  }
};
