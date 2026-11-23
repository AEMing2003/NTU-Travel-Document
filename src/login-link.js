'use strict';
const form = document.getElementById('form');
const field = document.getElementById('magic');
const status = document.getElementById('status');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  status.textContent = '正在檢查網址格式…';
  window.desktopLogin.submit(field.value);
});
document.getElementById('cancel').addEventListener('click', () => window.desktopLogin.cancel());
window.desktopLogin.onResult((r) => {
  status.textContent = `${r.reason}（偵測到的網址主機：${r.host}）`;
});
field.focus();
