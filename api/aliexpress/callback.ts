import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Vercel Serverless Function - AliExpress OAuth Callback Proxy
 * 
 * Esta función actúa como callback y proxy para el OAuth de AliExpress Dropshipping.
 * Recibe el callback de AliExpress y lo reenvía al backend de Railway.
 * 
 * Ruta final: /api/aliexpress/callback
 * Redirect URI en AliExpress: https://www.ivanreseller.com/api/aliexpress/callback
 */

const RAILWAY_BACKEND_URL = process.env.RAILWAY_BACKEND_URL || 
  'https://ivan-reseller-web-production.up.railway.app';

const REQUEST_TIMEOUT = 30000; // 30 segundos

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // ✅ Solo aceptar GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: 'Only GET method is allowed for OAuth callbacks'
    });
  }

  // ✅ Extraer query params
  const { code, state, error: errorParam, error_description } = req.query;
  const codeStr = String(code || '');
  const stateStr = String(state || '');

  // ✅ SMOKE TEST MODE: Si code=test y state=test, responder inmediatamente
  if (codeStr === 'test' && stateStr === 'test') {
    return res.status(200).json({
      success: true,
      mode: 'smoke_test',
      message: 'callback reached vercel serverless function',
      timestamp: new Date().toISOString()
    });
  }

  // ✅ Construir URL del backend de Railway con todos los query params
  const queryParams = new URLSearchParams();
  Object.entries(req.query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        value.forEach(v => queryParams.append(key, String(v)));
      } else {
        queryParams.append(key, String(value));
      }
    }
  });

  const railwayCallbackUrl = `${RAILWAY_BACKEND_URL}/aliexpress/callback?${queryParams.toString()}`;

  // ✅ Reenviar request al backend de Railway
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const backendResponse = await fetch(railwayCallbackUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Vercel-Serverless-Function/1.0',
        'X-Forwarded-For': req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown',
        'X-Forwarded-Proto': req.headers['x-forwarded-proto'] || 'https',
        'X-Original-Host': req.headers.host || 'unknown',
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // ✅ Preservar status code
    res.status(backendResponse.status);

    // ✅ Preservar headers relevantes (excluir headers que Vercel maneja automáticamente)
    const headersToPreserve = [
      'content-type',
      'x-oauth-callback',
      'x-correlation-id',
      'cache-control'
    ];

    backendResponse.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (headersToPreserve.includes(lowerKey) || lowerKey.startsWith('x-')) {
        res.setHeader(key, value);
      }
    });

    // ✅ Obtener body
    const contentType = backendResponse.headers.get('content-type') || '';
    const body = await backendResponse.text();

    // ✅ Si es JSON, parsearlo y devolver JSON; si no, devolver texto
    if (contentType.includes('application/json')) {
      try {
        const json = JSON.parse(body);
        return res.json(json);
      } catch (e) {
        // Si falla el parse, devolver como texto
        return res.send(body);
      }
    } else {
      // ✅ HTML, texto plano, etc.
      return res.send(body);
    }

  } catch (error: any) {
    // ✅ Manejo de errores
    if (error.name === 'AbortError') {
      return res.status(504).json({
        success: false,
        error: 'gateway_timeout',
        message: 'Request to backend timed out',
        timeout: REQUEST_TIMEOUT
      });
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(502).json({
        success: false,
        error: 'bad_gateway',
        message: 'Cannot connect to backend',
        backendUrl: RAILWAY_BACKEND_URL
      });
    }

    // ✅ Error genérico
    return res.status(500).json({
      success: false,
      error: 'internal_server_error',
      message: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

