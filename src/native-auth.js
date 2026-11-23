'use strict';

// Dedicated, narrowly scoped verification for a copied Supabase email link.
// No credentials are logged. All API requests go to the fixed project origin.
const PROJECT_REF = 'pcjbfvmebzbiyednzjyt';
const AUTH_ENDPOINT = `https://${PROJECT_REF}.supabase.co/auth/v1/verify`;
// Supabase publishable key (NOT a service_role / secret key).
const PUBLISHABLE_KEY = 'sb_publishable_9BPis3hZiU_RwJtlGheMPQ_Jg1iCZy_';
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

function parseVerifyPayload(link) {
  const u = new URL(link);
  if (u.origin !== `https://${PROJECT_REF}.supabase.co` || u.pathname !== '/auth/v1/verify') return null;
  const type = u.searchParams.get('type');
  const token_hash = u.searchParams.get('token_hash') || u.searchParams.get('token');
  if (!token_hash || token_hash.length > 2048 || !['email', 'magiclink'].includes(type)) return null;
  return { type, token_hash };
}

function validateSessionResponse(raw) {
  // The Auth REST API's verify response is the session object (SDK wraps this in data.session).
  if (!raw || typeof raw !== 'object') throw new Error('驗證回應無效');
  const s = raw.session && typeof raw.session === 'object' ? raw.session : raw;
  if (typeof s.access_token !== 'string' || !s.access_token ||
      typeof s.refresh_token !== 'string' || !s.refresh_token ||
      !s.user || typeof s.user.id !== 'string') throw new Error('Supabase 未回傳完整的登入 Session');
  const expires_in = Number(s.expires_in);
  const expires_at = Number(s.expires_at);
  const normalized = { ...s, expires_in: Number.isFinite(expires_in) && expires_in > 0 ? expires_in : 3600 };
  if (!Number.isFinite(expires_at) || expires_at <= 0) normalized.expires_at = Math.floor(Date.now()/1000) + normalized.expires_in;
  return normalized;
}

async function verifyMagicLinkWithAuth(link, fetchImpl = fetch) {
  const payload = parseVerifyPayload(link);
  if (!payload) throw new Error('不是此專案支援的 Magic Link 驗證網址');
  let response;
  try {
    response = await fetchImpl(AUTH_ENDPOINT, {
      method: 'POST',
      headers: { 'apikey': PUBLISHABLE_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error('無法連線至 Supabase Auth，請檢查網路連線'); }
  if (!response.ok) {
    // Never display raw server responses (they can contain token-like content).
    if (response.status === 400 || response.status === 422) throw new Error('登入連結已過期、已使用或驗證類型不符，請從 APP 重新寄送一封新信');
    if (response.status === 429) throw new Error('寄送或驗證次數受到限制，請稍後重試');
    throw new Error(`Supabase 驗證失敗（HTTP ${response.status}）`);
  }
  let json;
  try { json = await response.json(); } catch { throw new Error('Supabase 回應不是有效的 JSON'); }
  return validateSessionResponse(json);
}

function clientStorageStatus(keys) {
  return keys.some(key => /^sb-[a-z0-9]+-auth-token$/.test(key));
}

module.exports = { PROJECT_REF, AUTH_ENDPOINT, STORAGE_KEY, parseVerifyPayload,
  validateSessionResponse, verifyMagicLinkWithAuth, clientStorageStatus };
