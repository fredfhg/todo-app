/**
 * Cloudflare Worker — Supabase 反向代理
 * 将所有请求透传给 Supabase，解决国内无法直连 *.supabase.co 的问题
 * 
 * 部署到 Cloudflare Workers 后，把 Worker URL 替换 config.js 中的 Supabase URL 即可
 */

const SUPABASE_HOST = 'hnjeodwopxsoytmhpynl.supabase.co';
const SUPABASE_ORIGIN = 'https://' + SUPABASE_HOST;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const targetUrl = SUPABASE_ORIGIN + url.pathname + url.search;

    // 复制请求头，重写 Host
    const headers = new Headers(request.headers);
    headers.set('host', SUPABASE_HOST);

    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // WebSocket 升级（用于 Realtime 实时同步）
    if (request.headers.get('Upgrade') === 'websocket') {
      return fetch(targetUrl, {
        headers,
        method: request.method,
      });
    }

    // 普通 HTTP 请求转发
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'follow',
    });

    // 复制响应并添加 CORS 头
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Headers', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};
