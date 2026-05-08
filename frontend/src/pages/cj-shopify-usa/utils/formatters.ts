import axios from 'axios';

// ── Currency / number formatters ──────────────────────────────────────────────

export function usd(n: number | null | undefined): string {
  if (n == null || n === 0) return '$0.00';
  return `$${Number(n).toFixed(2)}`;
}

export function pct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Number(n).toFixed(1)}%`;
}

// ── Date formatters ───────────────────────────────────────────────────────────

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CL', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return 'N/D';
  return new Date(value).toLocaleString();
}

// ── Axios error helpers ───────────────────────────────────────────────────────

export type ApiErrorInfo = {
  message: string;
  status?: number;
  code?: string;
  retryAfterSeconds?: number;
};

export function extractApiErrorInfo(e: unknown): ApiErrorInfo {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as Record<string, unknown> | undefined;
    const details =
      data?.details && typeof data.details === 'object'
        ? (data.details as Record<string, unknown>)
        : undefined;
    const retryAfterSeconds =
      typeof details?.retryAfterSeconds === 'number'
        ? details.retryAfterSeconds
        : typeof data?.retryAfterSeconds === 'number'
        ? data.retryAfterSeconds
        : undefined;
    const code =
      typeof data?.errorCode === 'string'
        ? data.errorCode
        : typeof data?.code === 'string'
        ? data.code
        : typeof details?.code === 'string'
        ? details.code
        : undefined;
    if (
      e.response?.status === 429 ||
      code === 'API_RATE_LIMIT' ||
      code === 'CJ_RATE_LIMIT'
    ) {
      return {
        message:
          typeof data?.error === 'string'
            ? data.error
            : 'CJ esta limitando temporalmente las solicitudes. Espera cerca de 1 minuto antes de evaluar mas productos.',
        status: e.response?.status,
        code,
        retryAfterSeconds: retryAfterSeconds ?? 60,
      };
    }
    if (typeof data?.error === 'string')
      return { message: data.error, status: e.response?.status, code };
    if (e.response?.status === 404)
      return { message: 'Módulo no disponible o desactivado.', status: 404, code };
    if (e.response?.status === 503)
      return { message: 'CJ API temporalmente no disponible.', status: 503, code };
  }
  if (e instanceof Error) return { message: e.message };
  return { message: 'Error desconocido.' };
}

export function extractApiError(e: unknown): string {
  return extractApiErrorInfo(e).message;
}

export function axiosMsg(e: unknown, fb: string): string {
  if (
    axios.isAxiosError(e) &&
    e.response?.data &&
    typeof e.response.data === 'object'
  ) {
    const d = e.response.data as { message?: string; error?: string };
    return d.message || d.error || fb;
  }
  return e instanceof Error ? e.message : fb;
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

export function htmlPreview(html: string | null | undefined): string {
  const text = String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 220 ? `${text.slice(0, 220)}…` : text;
}
