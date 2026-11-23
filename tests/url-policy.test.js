'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../src/url-policy');

const SITE = p.APP_URL;
const AUTH = `https://${p.AUTH_HOST}/auth/v1/verify?token=example-fake-token&type=magiclink&redirect_to=${encodeURIComponent(SITE)}`;
const appCallback = `${SITE}?code=fake-challenge-code`;

test('正確限制正式網站來源', () => {
  assert.equal(p.isAppURL(SITE), true);
  assert.equal(p.isAppURL(SITE + '?code=fake'), true);
  assert.equal(p.isAppURL('https://ntu-travel-document-studio.netlify.app.evil.example/'), false);
  assert.equal(p.isAppURL('http://ntu-travel-document-studio.netlify.app/'), false);
  assert.equal(p.isAppURL('https://user:pass@ntu-travel-document-studio.netlify.app/'), false);
});

test('Blob PDF URL 必須屬於本網站', () => {
  assert.equal(p.isAppBlobURL('blob:https://ntu-travel-document-studio.netlify.app/abc'), true);
  assert.equal(p.isAppBlobURL('blob:https://evil.test/abc'), false);
});

test('Magic Link 僅允許已指定的 Supabase 專案及有效驗證路徑', () => {
  assert.equal(p.isTrustedMagicVerifyURL(AUTH), true);
  assert.equal(p.isTrustedMagicVerifyURL(AUTH.replace('token=example-fake-token', 'token=')), false);
  assert.equal(p.isTrustedMagicVerifyURL(AUTH.replace('type=magiclink', 'type=recovery')), false);
  assert.equal(p.isTrustedMagicVerifyURL(AUTH.replace('/verify?', '/settings?')), false);
  assert.equal(p.isTrustedMagicVerifyURL(AUTH.replace(p.AUTH_HOST, 'abcdefghijklmnopqrst.supabase.co')), false);
  assert.equal(p.isTrustedMagicVerifyURL(AUTH.replace(encodeURIComponent(SITE), encodeURIComponent('https://evil.test/'))), false);
  assert.equal(p.isTrustedMagicVerifyURL(AUTH.replace('https://', 'http://')), false);
});

test('允許現有 Supabase magiclink 與 PKCE 登入回呼', () => {
  assert.equal(p.isAppAuthCallback(SITE), false);
  assert.equal(p.isAppAuthCallback(appCallback), true);
  assert.equal(p.isAppAuthCallback(SITE + 'auth/confirm?token_hash=fake-hash&type=email'), true);
  assert.equal(p.isAppAuthCallback(SITE + '#access_token=fake&refresh_token=fake2'), true);
  assert.equal(p.isAppAuthCallback(SITE + '?error=expired'), false);
  assert.equal(p.isAppAuthCallback('https://evil.test/?code=fake'), false);
});

test('直接從剪貼簿解析一次性驗證連結', () => {
  assert.equal(p.magicLinkFromClipboard(`  <${AUTH}> `), AUTH);
  assert.equal(p.magicLinkFromClipboard(SITE), null);
  assert.equal(p.magicLinkFromClipboard('javascript:alert(1)'), null);
});

test('支援 Gmail 轉址包裝', () => {
  const wrapped = 'https://www.google.com/url?sa=D&q=' + encodeURIComponent(AUTH);
  assert.equal(p.magicLinkFromClipboard(wrapped), AUTH);
});

test('支援 Outlook SafeLinks 轉址包裝', () => {
  const wrapped = 'https://nam12.safelinks.protection.outlook.com/?url=' + encodeURIComponent(AUTH);
  assert.equal(p.magicLinkFromClipboard(wrapped), AUTH);
});

test('支援郵件 HTML href 中的 HTML 轉義與多種文字內容', () => {
  const htmlEncoded = AUTH.replaceAll('&', '&amp;');
  assert.equal(p.inspectMagicLinkClipboard('Log In', `<a href="${htmlEncoded}">Login</a>`).link, AUTH);
  assert.equal(p.magicLinkFromClipboard(`請按這個網址：${AUTH}`), AUTH);
});

test('拒絕惡意轉址、非預期來源、多重登入網址', () => {
  const evil = 'https://www.google.com/url?q=' + encodeURIComponent('https://evil.example/auth/v1/verify?token=fake&type=magiclink');
  assert.equal(p.magicLinkFromClipboard(evil), null);
  assert.equal(p.magicLinkFromClipboard('https://tracker.example/redirect?url=' + encodeURIComponent(AUTH)), null);
  assert.equal(p.inspectMagicLinkClipboard(`${AUTH} ${appCallback}`).reason, 'multiple');
  assert.equal(p.inspectMagicLinkClipboard('Log In').reason, 'not-url');
});

test('錯誤訊息僅回傳主機名稱，不回傳敏感 token', () => {
  const bad = `https://unrecognized.example/private?token=fake-super-secret`;
  const result = p.inspectMagicLinkClipboard(bad);
  assert.equal(result.link, null);
  assert.equal(result.observedHost, 'unrecognized.example');
  assert.equal(JSON.stringify(result).includes('fake-super-secret'), false);
});

test('外部連結僅限非認證網址的 HTTPS 或 mailto', () => {
  assert.equal(p.isExternalLinkAllowed('https://www.nature.com/articles/test'), true);
  assert.equal(p.isExternalLinkAllowed('mailto:example@example.com'), true);
  assert.equal(p.isExternalLinkAllowed('https://user:pass@evil.example/'), false);
  assert.equal(p.isExternalLinkAllowed('file:///tmp/test'), false);
  assert.equal(p.isExternalLinkAllowed(AUTH), false);
});
