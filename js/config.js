/**
 * Supabase 配置
 * 请替换为你自己的 Supabase 项目 URL 和 anon key
 * 
 * 获取方式：
 * 1. 登录 https://supabase.com
 * 2. 创建或进入项目
 * 3. Settings → API → Project URL 和 anon/public key
 */
const SUPABASE_CONFIG = {
  // 通过同域名 Pages Functions 代理访问 Supabase（/api/ 路径）
  // 部署后实际走：https://todo-8mt.pages.dev/api/rest/v1/... 
  // 本地开发时直连 Supabase（需翻墙）
  url: (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'https://hnjeodwopxsoytmhpynl.supabase.co'
    : location.origin + '/api',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhuamVvZHdvcHhzb3l0bWhweW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0OTU1NTQsImV4cCI6MjA5NzA3MTU1NH0.HPXNG40gM9h5kbIvSdCh6MkD3zlxmhRj_mo5PTTOOFo'
};
