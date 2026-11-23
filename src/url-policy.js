'use strict';

// Sensitive auth links are only processed in memory. Never log, display or save them.
const APP_URL = 'https://ntu-travel-document-studio.netlify.app/';
const APP_ORIGIN = new URL(APP_URL).origin;
const APP_HOST = new URL(APP_URL).hostname;
const AUTH_HOST = 'pcjbfvmebzbiyednzjyt.supabase.co';
const MAX_CLIPBOARD_CHARS = 32768;
const MAX_LINK_CHARS = 8192;

function parseHttps(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    return u;
  } catch { return null; }
}

function isAppURL(raw) {
  const u = parseHttps(raw);
  return Boolean(u && u.hostname === APP_HOST);
}

function isAppBlobURL(raw) {
  return typeof raw === 'string' && raw.startsWith(`blob:${APP_ORIGIN}/`);
}

function isSupabaseHost(host) {
  return typeof host === 'string' && /^[a-z0-9-]{8,80}\.supabase\.co$/.test(host);
}

function isTrustedMagicVerifyURL(raw) {
  const u = parseHttps(raw);
  if (!u || u.hostname !== AUTH_HOST || u.pathname !== '/auth/v1/verify') return false;
  const token = u.searchParams.get('token_hash') || u.searchParams.get('token');
  if (!token || token.length > 2048) return false;
  const type = u.searchParams.get('type');
  if (!['magiclink', 'email', 'signup', 'invite'].includes(type)) return false;
  const redirect = u.searchParams.get('redirect_to') || u.searchParams.get('redirectTo');
  if (redirect && !isAppURL(redirect)) return false;
  return true;
}

function isAppAuthCallback(raw) {
  if (!isAppURL(raw)) return false;
  const u = new URL(raw);
  // A callback must contain actual verification material, not merely an error.
  const query = u.searchParams;
  const hash = new URLSearchParams(u.hash.slice(1));
  return Boolean(
    query.get('code') ||
    (query.get('token_hash') && ['magiclink', 'email', 'signup', 'invite'].includes(query.get('type'))) ||
    (hash.get('access_token') && hash.get('refresh_token'))
  );
}

function unwrapKnownRedirector(raw) {
  let link = raw;
  for (let level = 0; level < 4; level++) {
    if (link.length > MAX_LINK_CHARS) return null;
    const u = parseHttps(link);
    if (!u) return null;
    if (isTrustedMagicVerifyURL(link) || isAppAuthCallback(link)) return link;

    let param = null;
    if ((u.hostname === 'www.google.com' || u.hostname === 'google.com') && u.pathname === '/url') {
      param = u.searchParams.get('url') || u.searchParams.get('q');
    } else if (/^(?:[a-z0-9-]+\.)*safelinks\.protection\.outlook\.com$/i.test(u.hostname)) {
      param = u.searchParams.get('url');
    }
    // Only explicitly known email redirectors are unwrapped. Do not follow links.
    if (!param || param.length > MAX_LINK_CHARS) return null;
    link = param.replaceAll('&amp;', '&');
  }
  return null;
}

function normalizeClipboardText(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_CLIPBOARD_CHARS) return '';
  return raw.replace(/&(?:amp|#38|#x26);/gi, '&').trim();
}

function getCandidates(raw) {
  const text = normalizeClipboardText(raw);
  if (!text) return [];
  const candidates = [];
  function add(candidate) {
    const cleaned = candidate.trim().replace(/^[<'"(]+/, '').replace(/[>'"),.]+$/, '');
    if (cleaned && cleaned.length <= MAX_LINK_CHARS) candidates.push(cleaned);
  }
  add(text);
  const links = text.match(/https:\/\/[^\s<>"'\x00-\x1f]+/gi) || [];
  for (const link of links) add(link);
  // Handle a copied percent-encoded URL (not decoding arbitrary strings as URLs).
  if (text.startsWith('https%3A%2F%2F')) {
    try { add(decodeURIComponent(text)); } catch { /* malformed encoding */ }
  }
  return [...new Set(candidates)];
}

function inspectMagicLinkClipboard(rawText, rawHtml = '') {
  const inputs = [rawText, rawHtml];
  const valid = new Set();
  let observedHost = null;
  for (const input of inputs) {
    for (const candidate of getCandidates(input)) {
      const u = parseHttps(candidate);
      if (!u) continue;
      if (!observedHost) observedHost = u.hostname;
      const link = unwrapKnownRedirector(candidate);
      if (link) valid.add(link);
    }
  }
  if (valid.size === 1) return { link: [...valid][0], reason: 'ok', observedHost };
  if (valid.size > 1) return { link: null, reason: 'multiple', observedHost };
  if (!observedHost) return { link: null, reason: 'not-url', observedHost: null };
  return { link: null, reason: 'unsupported', observedHost };
}

function magicLinkFromClipboard(raw) {
  return inspectMagicLinkClipboard(raw).link;
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
  APP_URL, APP_ORIGIN, APP_HOST, AUTH_HOST, isAppURL, isAppBlobURL,
  isSupabaseHost, isTrustedMagicVerifyURL, isAppAuthCallback,
  magicLinkFromClipboard, inspectMagicLinkClipboard, isExternalLinkAllowed,
};
