'use strict';
const form = document.getElementById('form');
const field = document.getElementById('magic');
const status = document.getElementById('status');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  status.textContent = '正在檢查網址格式…';
  window.desktopLogin.submit(field.value);
});
document.getElementById('paste').addEventListener('click', async () => {
  const text = await window.desktopLogin.readClipboard();
  if (!text) {
    status.textContent = '剪貼簿中沒有可貼入的文字。請確認已在同一台 Mac 複製「Sign in」連結網址。';
    return;
  }
  field.value = text;
  status.textContent = '已從本機剪貼簿貼入。確認後請按「在 APP 內驗證」。';
  field.focus();
});
document.getElementById('cancel').addEventListener('click', () => window.desktopLogin.cancel());
window.desktopLogin.onResult((r) => {
  status.textContent = `${r.reason}（偵測到的網址主機：${r.host}）`;
});
field.focus();
