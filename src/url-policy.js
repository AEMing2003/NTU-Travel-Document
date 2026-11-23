'use strict';

// No remote value is ever evaluated, logged, or used as a command.
const APP_URL = 'https://ntu-travel-document-studio.netlify.app/';
const APP_ORIGIN = new URL(APP_URL).origin;
const APP_HOST = new URL(APP_URL).hostname;

function parseHttps(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return u;
  } catch { return null; }
}

function isAppURL(raw) {
  const u = parseHttps(raw);
  return Boolean(u && u.hostname === APP_HOST && u.port === '');
}

function isAppBlobURL(raw) {
  return typeof raw === 'string' && raw.startsWith(`blob:${APP_ORIGIN}/`);
}

function isSupabaseHost(host) {
  // Hosted Supabase project URLs, not arbitrary eTLD look-alikes.
  return /^[a-z0-9-]{8,80}\.supabase\.co$/.test(host);
}

function isTrustedMagicVerifyURL(raw) {
  const u = parseHttps(raw);
  if (!u || !isSupabaseHost(u.hostname) || u.port !== '') return false;
  if (u.pathname !== '/auth/v1/verify') return false;
  const token = u.searchParams.get('token_hash') || u.searchParams.get('token');
  if (!token || token.length > 2048) return false;
  const redirect = u.searchParams.get('redirect_to') || u.searchParams.get('redirectTo');
  if (redirect && !isAppURL(redirect)) return false;
  return true;
}

function isAppAuthCallback(raw) {
  if (!isAppURL(raw)) return false;
  const u = new URL(raw);
  return Boolean(
    u.searchParams.get('code') ||
    u.searchParams.get('token_hash') ||
    u.hash.includes('access_token=') ||
    u.searchParams.get('error')
  );
}

function magicLinkFromClipboard(raw) {
  if (typeof raw !== 'string') return null;
  let link = raw.trim();
  if (link.startsWith('<') && link.endsWith('>')) link = link.slice(1, -1).trim();
  if (link.length > 8192) return null;
  if (isTrustedMagicVerifyURL(link) || isAppAuthCallback(link)) return link;
  return null;
}

function isExternalLinkAllowed(raw) {
  try {
    const u = new URL(raw);
    if (u.username || u.password) return false;
    if (u.protocol === 'https:') return !isAppURL(raw) && !isSupabaseHost(u.hostname);
    if (u.protocol === 'mailto:') return true;
    return false;
  } catch { return false; }
}

module.exports = {
  APP_URL, APP_ORIGIN, APP_HOST, isAppURL, isAppBlobURL,
  isSupabaseHost, isTrustedMagicVerifyURL, isAppAuthCallback,
  magicLinkFromClipboard, isExternalLinkAllowed,
};
