'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../src/url-policy');

const SITE = p.APP_URL;
const AUTH = 'https://abcdefghijklmnopqrst.supabase.co/auth/v1/verify?token=example-nonsecret&type=magiclink&redirect_to=' + encodeURIComponent(SITE);

test('正式網站來源合法', () => {
  assert.equal(p.isAppURL(SITE), true);
  assert.equal(p.isAppURL(SITE + '?code=abc'), true);
  assert.equal(p.isAppURL('https://ntu-travel-document-studio.netlify.app.attacker.example/'), false);
  assert.equal(p.isAppURL('http://ntu-travel-document-studio.netlify.app/'), false);
  assert.equal(p.isAppURL('https://test:pass@ntu-travel-document-studio.netlify.app/'), false);
});

test('僅允許目前網站 Blob PDF URL', () => {
  assert.equal(p.isAppBlobURL('blob:https://ntu-travel-document-studio.netlify.app/abcdef'), true);
  assert.equal(p.isAppBlobURL('blob:https://evil.example/abcdef'), false);
  assert.equal(p.isAppBlobURL('data:application/pdf;base64,xyz'), false);
});

test('Magic Link 限制 Supabase 網域、驗證路徑、合法回跳與 token', () => {
  assert.equal(p.isTrustedMagicVerifyURL(AUTH), true);
  assert.equal(p.isTrustedMagicVerifyURL(AUTH.replace('token=example-nonsecret', 'token=')), false);
  assert.equal(p.isTrustedMagicVerifyURL(AUTH.replace('/verify?', '/settings?')), false);
  assert.equal(p.isTrustedMagicVerifyURL(AUTH.replace('supabase.co', 'supabase.co.evil.test')), false);
  assert.equal(p.isTrustedMagicVerifyURL(AUTH.replace(encodeURIComponent(SITE), encodeURIComponent('https://evil.test'))), false);
  assert.equal(p.isTrustedMagicVerifyURL(AUTH.replace('https://', 'http://')), false);
});

test('只接受驗證回呼而不是任意網站首頁', () => {
  assert.equal(p.isAppAuthCallback(SITE), false);
  assert.equal(p.isAppAuthCallback(SITE + '?code=challenge-code'), true);
  assert.equal(p.isAppAuthCallback(SITE + '#access_token=token&refresh_token=other'), true);
  assert.equal(p.isAppAuthCallback('https://evil.test/?code=challenge-code'), false);
});

test('剪貼簿 Magic Link 不保留非預期來源', () => {
  assert.equal(p.magicLinkFromClipboard(`  <${AUTH}> `), AUTH);
  assert.equal(p.magicLinkFromClipboard(SITE), null);
  assert.equal(p.magicLinkFromClipboard('javascript:alert(1)'), null);
  assert.equal(p.magicLinkFromClipboard('file:///etc/passwd'), null);
});

test('外部連結只開放無帳密的 HTTPS 和 mailto', () => {
  assert.equal(p.isExternalLinkAllowed('https://www.nature.com/articles/test'), true);
  assert.equal(p.isExternalLinkAllowed('mailto:example@example.com'), true);
  assert.equal(p.isExternalLinkAllowed('https://user:pass@evil.example/'), false);
  assert.equal(p.isExternalLinkAllowed('file:///tmp/test'), false);
  assert.equal(p.isExternalLinkAllowed('javascript:alert(1)'), false);
  assert.equal(p.isExternalLinkAllowed(AUTH), false);
});
