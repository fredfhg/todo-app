# fredd的个人任务系统

一个轻量级的个人待办事项管理系统，支持电脑和电纸书双端实时同步。

## 功能

- **电脑版** (`index.html`)：全功能管理界面，深色主题，支持创建/编辑/归档/删除任务，拖拽排序
- **电纸书版** (`eink.html`)：墨水屏适配，大字体高对比度，支持勾选完成和查看归档

## 技术栈

- 纯前端 HTML/CSS/JavaScript（无框架，无构建工具）
- Supabase（PostgreSQL 数据库 + 实时同步）
- CDN 引入 Supabase JS SDK

## 快速开始

### 1. 创建 Supabase 项目

1. 访问 [supabase.com](https://supabase.com) 并注册/登录
2. 点击 "New Project" 创建项目
3. 选择区域（推荐选择亚洲节点如 Singapore）
4. 等待项目初始化完成（约1-2分钟）

### 2. 创建数据库表

1. 在 Supabase Dashboard 左侧找到 "SQL Editor"
2. 点击 "New Query"
3. 复制 `setup.sql` 文件的全部内容并粘贴
4. 点击 "Run" 执行

### 3. 配置项目

1. 在 Supabase Dashboard 进入 Settings → API
2. 复制 "Project URL" 和 "anon/public" key
3. 打开 `js/config.js`，替换占位符：

```javascript
const SUPABASE_CONFIG = {
  url: 'https://你的项目ID.supabase.co',
  anonKey: '你的anon-key'
};
```

### 4. 启用 Realtime

1. 在 Supabase Dashboard 进入 Database → Replication
2. 确认 `todos` 表已出现在 "Source" 列表中
3. 如果没有，点击表名旁边的开关启用

（如果执行了 setup.sql，这一步通常已自动完成）

### 5. 运行

由于使用了 CDN 加载的 ES modules，需要通过 HTTP 服务器访问：

**方式一：Python 内置服务器**
```bash
cd "D:\WorkBuddy\0615 ToDoList"
python -m http.server 8080
```
然后访问 `http://localhost:8080`

**方式二：VS Code Live Server**
安装 Live Server 扩展，右键 `index.html` → Open with Live Server

**方式三：部署到线上**
见下方部署说明。

## 部署

### Vercel（推荐）

1. 将项目推送到 GitHub
2. 登录 [vercel.com](https://vercel.com)
3. Import 仓库，无需配置，直接部署
4. 获取 `https://你的项目.vercel.app` 地址

### GitHub Pages

1. 推送到 GitHub
2. Settings → Pages → Source 选择 main 分支
3. 获取 `https://你的用户名.github.io/仓库名` 地址

### Cloudflare Pages

1. 登录 [dash.cloudflare.com](https://dash.cloudflare.com)
2. Pages → Create a project → Connect to Git
3. 无需构建配置，直接部署

## 文件结构

```
├── index.html          # 电脑版（全功能）
├── eink.html           # 电纸书版（墨水屏适配）
├── css/
│   ├── desktop.css     # 电脑版样式
│   └── eink.css        # 电纸书版样式
├── js/
│   ├── config.js       # Supabase 配置（需修改）
│   ├── db.js           # 数据访问层（共享）
│   ├── desktop-app.js  # 电脑版逻辑
│   └── eink-app.js     # 电纸书版逻辑
├── setup.sql           # 数据库建表脚本
└── README.md           # 本文件
```

## 电纸书使用

1. 部署后获取网址（如 `https://你的项目.vercel.app/eink.html`）
2. 在墨案 W7 内置浏览器中打开该网址
3. 建议保存为书签方便下次访问
4. 如数据未自动刷新，点击右上角 ↻ 按钮手动刷新

## 数据模型

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| title | TEXT | 标题 |
| description | TEXT | 描述 |
| priority | TEXT | 优先级：urgent/high/medium/low |
| category | TEXT | 分类：work/dev/team/finance/ops/design/other |
| due_date | TIMESTAMPTZ | 截止时间 |
| status | TEXT | 状态：active/completed |
| is_archived | BOOLEAN | 是否归档 |
| subtasks | JSONB | 子任务数组 |
| sort_order | INTEGER | 排序权重 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |
