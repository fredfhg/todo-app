/**
 * Cloudflare Pages Function - Supabase 反向代理
 * 路由: /api/*  →  https://hnjeodwopxsoytmhpynl.supabase.co/*
 * 
 * 通过 Pages Functions 代理 Supabase API，
 * 使得电纸书等无法翻墙的设备可以通过同一个 pages.dev 域名访问 API。
 */

const SUPABASE_HOST = 'hnjeodwopxsoytmhpynl.supabase.co';
const SUPABASE_ORIGIN = 'https://' + SUPABASE_HOST;

export async function onRequest(context) {
  const { request, params } = context;
  const url = new URL(request.url);

  // 从 /api/xxx 中提取实际路径
  const pathSegments = params.path || [];
  const targetPath = '/' + pathSegments.join('/');
  const targetUrl = SUPABASE_ORIGIN + targetPath + url.search;

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

  // 构造转发请求的 headers
  const headers = new Headers(request.headers);
  headers.set('host', SUPABASE_HOST);
  // 删除可能干扰的 headers
  headers.delete('cf-connecting-ip');
  headers.delete('cf-ray');
  headers.delete('cf-visitor');

  try {
    // 处理 WebSocket 升级请求（Realtime）
    if (request.headers.get('Upgrade') === 'websocket') {
      return fetch(targetUrl, {
        headers,
        method: request.method,
      });
    }

    // 读取请求体（避免 stream 转发时丢失 body 的问题）
    let body = undefined;
    if (!['GET', 'HEAD'].includes(request.method)) {
      body = await request.text();
      if (!body || body.length === 0) {
        body = undefined; // 真正的空 body，不传递
      } else {
        headers.set('Content-Length', new TextEncoder().encode(body).length.toString());
      }
    }

    // 普通 HTTP 请求转发
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      redirect: 'follow',
    });

    // 添加 CORS headers 到响应
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Headers', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy error', message: err.message }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
