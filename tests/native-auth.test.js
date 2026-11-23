'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseVerifyPayload, verifyMagicLinkWithAuth, validateSessionResponse, STORAGE_KEY, AUTH_ENDPOINT } = require('../src/native-auth');
const link = 'https://pcjbfvmebzbiyednzjyt.supabase.co/auth/v1/verify?token=not-a-real-token&type=magiclink&redirect_to=https%3A%2F%2Fntu-travel-document-studio.netlify.app%2F';
test('只接受固定 Supabase 專案 Magic Link', () => {
  assert.deepEqual(parseVerifyPayload(link), { type: 'magiclink', token_hash: 'not-a-real-token' });
  assert.equal(parseVerifyPayload(link.replace('pcjbfvmebzbiyednzjyt','anotherprojectname')), null);
  assert.equal(parseVerifyPayload(link.replace('magiclink','recovery')), null);
});
test('驗證要求僅發送固定 Auth endpoint', async () => {
  let calls = 0;
  const result = await verifyMagicLinkWithAuth(link, async (url, opt) => {
    calls++;
    assert.equal(url, AUTH_ENDPOINT);
    assert.equal(opt.method, 'POST');
    assert.equal(opt.headers.apikey.startsWith('sb_publishable_'), true);
    assert.equal(JSON.parse(opt.body).token_hash, 'not-a-real-token');
    return { ok: true, json: async () => ({ access_token:'A', refresh_token:'B', user: { id:'123' }, expires_in:3600 }) };
  });
  assert.equal(calls,1);
  assert.equal(result.access_token, 'A');
  assert.equal(STORAGE_KEY, 'sb-pcjbfvmebzbiyednzjyt-auth-token');
});
test('被使用過的登入連結顯示適當錯誤', async () => {
  await assert.rejects(() => verifyMagicLinkWithAuth(link, async () => ({ok:false,status:422})), /已過期、已使用/);
});
test('不接受缺少 session token 的成功回應', () => {
  assert.throws(() => validateSessionResponse({user:{id:'123'}}),/Session/);
});
