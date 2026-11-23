'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('登入貼上視窗與安全預載檔案包含在發行範圍', () => {
  const build = require('../package.json').build;
  assert.equal(build.files.includes('src/**/*'), true);
  for (const file of ['src/login-link.html', 'src/login-link.js', 'src/login-preload.js']) {
    assert.equal(fs.existsSync(path.join(root, file)), true);
  }
});

test('登入頁面使用限制性 CSP、密碼型態的輸入框', () => {
  const page = fs.readFileSync(path.join(root, 'src/login-link.html'), 'utf8');
  assert.match(page, /Content-Security-Policy/);
  assert.match(page, /default-src 'none'/);
  assert.match(page, /type="password"/);
  assert.doesNotMatch(page, /https?:\/\//);
});

test('登入 IPC 必須驗證送信者且只能使用驗證過的連結', () => {
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  assert.match(main, /event\.sender !== loginWindow\.webContents/);
  assert.match(main, /inspectMagicLinkClipboard\(provided\)/);
  assert.match(main, /openValidatedMagicLink\(validatedLink\)/);
});
