'use strict';

const path = require('node:path');
const {
  app, BrowserWindow, Menu, dialog, clipboard, shell, session, ipcMain,
} = require('electron');
const {
  APP_URL, isAppURL, isAppBlobURL, isTrustedMagicVerifyURL,
  inspectMagicLinkClipboard, isExternalLinkAllowed,
} = require('./src/url-policy');
const { STORAGE_KEY, parseVerifyPayload, verifyMagicLinkWithAuth } = require('./src/native-auth');

const APP_TITLE = '臺大出差文件製作站';
const APP_VERSION = '1.0.4';
const PERSISTENT_SESSION = 'persist:ntu-travel-document-studio';
let mainWindow = null;
let loginWindow = null;
let offlineMode = false;
let lastAuthStatus = '尚未在 v1.0.4 進行登入驗證';

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('app.local.ntu-travel-document-studio');
    setupSession();
    setupLoginIPC();
    createWindow();
    createMenu();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

function setupSession() {
  const ses = session.fromPartition(PERSISTENT_SESSION);
  // No system camera, microphone, location, notifications or other permissions.
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on('will-download', (_event, item) => {
    const suggested = item.getFilename();
    item.setSaveDialogOptions({
      title: suggested.toLowerCase().endsWith('.pdf') ? '儲存 PDF 文件' : '儲存檔案',
      defaultPath: path.join(app.getPath('downloads'), suggested),
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: APP_TITLE,
    width: 1360,
    height: 860,
    minWidth: 950,
    minHeight: 630,
    show: false,
    backgroundColor: '#f5f7fb',
    autoHideMenuBar: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      partition: PERSISTENT_SESSION,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      devTools: false,
      webSecurity: true,
    },
  });

  const contents = mainWindow.webContents;
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.on('will-navigate', handleNavigation);
  contents.on('will-redirect', handleNavigation);
  contents.setWindowOpenHandler(({ url }) => {
    if (isAppBlobURL(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1024, height: 760,
          webPreferences: {
            partition: PERSISTENT_SESSION,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webviewTag: false,
            devTools: false,
          },
        },
      };
    }
    // Internal links should reuse the main view, not spawn a privileged popup.
    if (isAppURL(url)) mainWindow.loadURL(url).catch(() => {});
    else if (isExternalLinkAllowed(url)) openExternalWithConfirmation(url);
    return { action: 'deny' };
  });
  contents.on('did-create-window', (child) => {
    child.webContents.on('will-navigate', handleNavigation);
    child.webContents.on('will-redirect', handleNavigation);
    child.webContents.on('will-attach-webview', (e) => e.preventDefault());
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });

  contents.on('did-fail-load', (_e, errorCode, _errorDescription, _validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || offlineMode) return; // -3 = aborted
    offlineMode = true;
    contents.loadFile(path.join(__dirname, 'src', 'offline.html')).catch(() => {});
  });
  contents.on('did-finish-load', () => {
    const url = contents.getURL();
    if (isAppURL(url)) offlineMode = false;
  });

  contents.on('page-title-updated', (event) => {
    event.preventDefault();
    mainWindow.setTitle(`${APP_TITLE}｜桌面版`);
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  // Display an actual error rather than a blank window on network failures.
  mainWindow.loadURL(APP_URL).catch(() => {});
  mainWindow.on('closed', () => { mainWindow = null; });
}

function handleNavigation(event, url) {
  if (isAppURL(url) || isAppBlobURL(url) || isTrustedMagicVerifyURL(url)) return;
  event.preventDefault();
  if (isExternalLinkAllowed(url)) openExternalWithConfirmation(url);
}

async function openExternalWithConfirmation(raw) {
  if (!isExternalLinkAllowed(raw) || !mainWindow) return;
  const u = new URL(raw);
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: '開啟外部連結',
    message: '是否在預設瀏覽器開啟外部網站？',
    detail: `目的地：${u.hostname || '電子郵件應用程式'}\n請確認網址與用途。`,
    buttons: ['取消', '開啟'], defaultId: 0, cancelId: 0, noLink: true,
  });
  if (response === 1) await shell.openExternal(raw).catch(() => {});
}

function reloadWebsite() {
  if (!mainWindow) return;
  offlineMode = false;
  mainWindow.loadURL(APP_URL).catch(() => {});
}

function setupLoginIPC() {
  // Only the sandboxed, local login dialog may read clipboard text, and only
  // following an explicit click by the user. No logging or disk persistence.
  ipcMain.handle('desktop:magic-link-read-clipboard', (event) => {
    if (!loginWindow || event.sender !== loginWindow.webContents) return '';
    return clipboard.readText().slice(0, 32768);
  });
  ipcMain.on('desktop:magic-link-submit', (event, provided) => {
    // No website or arbitrary renderer is allowed to supply auth URLs.
    if (!loginWindow || event.sender !== loginWindow.webContents) return;
    const result = inspectMagicLinkClipboard(provided);
    if (!result.link) {
      event.reply('desktop:magic-link-feedback', {
        ok: false,
        reason: result.reason === 'multiple' ? '偵測到多個不同的驗證網址，請只貼上一個連結。'
          : result.reason === 'not-url' ? '貼上的內容不是 HTTPS 登入網址，請使用「複製連結網址」。'
          : '目前不支援這個登入網址的格式，請確認是 Supabase 登入信的原始連結。',
        host: result.observedHost || '未偵測到網址',
      });
      return;
    }
    // Secrets are used in memory only: do not print, store, or send to external tools.
    const validatedLink = result.link;
    const popup = loginWindow;
    loginWindow = null;
    popup.close();
    openValidatedMagicLink(validatedLink);
  });
  ipcMain.on('desktop:magic-link-cancel', (event) => {
    if (loginWindow && event.sender === loginWindow.webContents) loginWindow.close();
  });
}

async function openValidatedMagicLink(link) {
  if (!mainWindow) return;
  const nativePayload = parseVerifyPayload(link);
  if (nativePayload) {
    lastAuthStatus = '已收到 Supabase 驗證連結，準備驗證';
    try {
      // Supabase documents verifyOtp(token_hash,type) for email auth. Use the REST
      // equivalent to obtain a proper session, not merely navigate to a callback.
      const result = await verifyMagicLinkWithAuth(link);
      lastAuthStatus = 'Supabase 驗證成功，正在建立 APP 登入資料';
      if (!mainWindow) return;
      if (!isAppURL(mainWindow.webContents.getURL())) {
        await mainWindow.loadURL(APP_URL);
      }
      if (!mainWindow) return;
      // Store into the SAME origin/partition as the site SDK. This is the
      // standard supabase-js default storage key. No external token export.
      const serialized = JSON.stringify(result);
      const script = `(() => {
        if (location.origin !== ${JSON.stringify(new URL('https://ntu-travel-document-studio.netlify.app/').origin)}) return false;
        localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(serialized)});
        return Boolean(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}));
      })()`;
      const stored = await mainWindow.webContents.executeJavaScript(script, true);
      if (!stored) throw new Error('無法將登入資料儲存到網站的本機儲存空間');
      lastAuthStatus = 'Supabase 已核發 Session，APP 已保存；等待網站確認登入';
      await mainWindow.loadURL(APP_URL);
      // Only confirms storage, not the site's role/permissions.
      if (!mainWindow) return;
      const hasToken = await mainWindow.webContents.executeJavaScript(
        `Boolean(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}))`, true);
      lastAuthStatus = hasToken ? 'APP 已保存 Supabase 登入 Session（網站權限仍需確認）' : '登入後重新載入，Session 未被保留';
      await dialog.showMessageBox(mainWindow, {
        type: hasToken ? 'info' : 'warning',
        title: '桌面登入驗證結果',
        message: hasToken ? 'Supabase 登入驗證已成功' : '登入資料未能保留',
        detail: hasToken ? 'APP 已在本機儲存 Session。請確認網站是否顯示帳號與管理員身分；若仍為訪客，請回報「登入 → 檢查 APP 登入狀態」結果。' : '請使用「登入 → 檢查 APP 登入狀態」取得診斷。',
      });
    } catch (error) {
      // Messages originate from our own bounded error strings, never server JSON.
      lastAuthStatus = `登入驗證失敗：${error.message}`;
      if (mainWindow) await dialog.showMessageBox(mainWindow, {
        type: 'error', title: '桌面登入未完成',
        message: '無法建立 APP 的 Supabase Session',
        detail: error.message,
      });
    }
    return;
  }
  // Compatibility: PKCE app callbacks and session-bearing URLs remain handled
  // by the existing website logic; these links cannot be verified by token hash.
  offlineMode = false;
  lastAuthStatus = '登入連結已交給網站回呼處理，尚未確認 Session';
  mainWindow.focus();
  mainWindow.loadURL(link).catch(() => {
    lastAuthStatus = '網站登入回呼載入失敗';
    if (!mainWindow) return;
    dialog.showMessageBox(mainWindow, {
      type: 'error', title: '登入連結開啟失敗',
      message: '連線或驗證轉址失敗。請在桌面程式重新寄信，並複製新郵件的原始登入連結。',
    });
  });
}

function showPasteMagicLinkDialog() {
  if (!mainWindow) return;
  if (loginWindow) { loginWindow.focus(); return; }
  loginWindow = new BrowserWindow({
    parent: mainWindow,
    modal: true,
    title: '貼上 Magic Link（桌面登入）',
    width: 740,
    height: 450,
    minWidth: 600,
    minHeight: 395,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f7f9fc',
    webPreferences: {
      preload: path.join(__dirname, 'src', 'login-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: false,
    },
  });
  const popup = loginWindow;
  popup.webContents.on('will-navigate', (e) => e.preventDefault());
  popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  popup.once('ready-to-show', () => popup.show());
  popup.on('closed', () => { if (loginWindow === popup) loginWindow = null; });
  popup.loadFile(path.join(__dirname, 'src', 'login-link.html')).catch(() => {
    if (!popup.isDestroyed()) popup.close();
  });
}

async function showLoginDiagnostics() {
  if (!mainWindow) return;
  const current = mainWindow.webContents.getURL();
  let storage = '無法檢查';
  if (isAppURL(current)) {
    try {
      const answer = await mainWindow.webContents.executeJavaScript(
        `(() => Object.keys(localStorage).some(key => /^sb-[a-z0-9]+-auth-token$/.test(key)))()`, true,
      );
      storage = answer ? '有驗證資料紀錄（不等於已登入）' : '沒有發現標準 Supabase 登入資料';
    } catch { /* inspect metadata only; no credential contents */ }
  }
  if (!mainWindow) return;
  await dialog.showMessageBox(mainWindow, {
    type: 'info', title: '桌面登入診斷',
    message: `桌面程式版本：v${APP_VERSION}`,
    detail: `目前畫面：${isAppURL(current) ? '正式網站' : '網站外／錯誤頁'}\n驗證儲存空間：${storage}\n最近一次驗證：${lastAuthStatus}\n\n`
      + '如果使用手機 Gmail，請改在同一台 Windows／Mac 電腦開啟 Gmail。\n'
      + '必須先由 APP 內寄出新的登入信，再複製「Sign in」的連結網址，\n'
      + '回到 APP → 登入 → 貼上 Magic Link（視窗），貼入網址並點「在 APP 驗證」。\n'
      + '請勿分享包含一次性登入憑證的完整網址。',
  });
}

async function openMagicLinkFromClipboard() {
  if (!mainWindow) return;
  const result = inspectMagicLinkClipboard(clipboard.readText(), clipboard.readHTML());
  if (!result.link) {
    await dialog.showMessageBox(mainWindow, {
      type: 'warning', title: '未找到有效 Magic Link',
      message: result.reason === 'multiple'
        ? '剪貼簿中找到多個不同的登入網址。'
        : '桌面程式尚無法辨識這段 Magic Link。',
      detail:
        `偵測到的網址主機：${result.observedHost || '未偵測到 HTTPS 網址'}\n`
        + '請複製郵件中登入按鈕的原始「連結網址」，而不是按鈕文字。\n'
        + '已支援本網站、所使用的 Supabase 專案，以及常見 Gmail／Outlook 安全轉址。\n\n'
        + '如果仍失敗，只需回報上述「網址主機」，請勿傳送包含 token 的完整登入網址。',
    });
    return;
  }
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question', title: '確認桌面登入',
    message: '要在此桌面程式內完成登入驗證嗎？',
    detail: '登入連結含一次性驗證資訊，請勿傳送給其他人。',
    buttons: ['取消', '驗證登入'], cancelId: 0, defaultId: 1,
  });
  if (response !== 1 || !mainWindow) return;
  openValidatedMagicLink(result.link);
}

function createMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu', label: APP_TITLE }] : []),
    // Important on macOS: native edit roles enable Cmd+C / Cmd+V in modal inputs.
    { role: 'editMenu', label: '編輯' },
    { label: '檔案', submenu: [
      { label: '重新開啟網站', accelerator: 'CmdOrCtrl+R', click: reloadWebsite },
      { label: '以瀏覽器開啟網站', click: () => shell.openExternal(APP_URL) },
      { type: 'separator' },
      { label: '列印目前畫面', accelerator: 'CmdOrCtrl+P', click: () => {
        if (mainWindow && isAppURL(mainWindow.webContents.getURL())) {
          mainWindow.webContents.print({ printBackground: true });
        }
      } },
      { type: 'separator' },
      ...(isMac ? [] : [{ role: 'quit', label: '結束' }]),
    ]},
    { label: '登入', submenu: [
      { label: '貼上 Magic Link（可看到辨識錯誤）', click: showPasteMagicLinkDialog },
      { label: '從剪貼簿開啟 Magic Link', accelerator: 'CmdOrCtrl+Shift+L', click: openMagicLinkFromClipboard },
      { label: '檢查 APP 登入狀態', click: showLoginDiagnostics },
      { label: 'Magic Link 使用說明', click: async () => {
        if (!mainWindow) return;
        await dialog.showMessageBox(mainWindow, {
          type: 'info', title: '桌面版 Magic Link 登入方式',
          message: '同一個 Email 帳號，但瀏覽器與桌面版登入狀態不同。',
          detail: '① 在桌面程式填寫 Email，按網站的寄送登入信。\n'
            + '② 開啟信箱，對「登入按鈕」按右鍵，選擇複製連結網址；不要先點擊。\n'
            + '③ 回到桌面程式，按 Ctrl+Shift+L（Mac：⌘⇧L）。\n'
            + '④ 如果剪貼簿無法解析，改用「登入 → 貼上 Magic Link（可看到辨識錯誤）」。\n'
            + '⑤ 驗證完成後由 APP 網站顯示帳號身份；若仍是訪客，點「登入 → 檢查 APP 登入狀態」。\n\n'
            + '不要將登入連結或身分證號貼給其他人。',
        });
      }},
    ]},
    { label: '檢視', submenu: [
      { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '縮小' },
      { role: 'resetZoom', label: '重設比例' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: '全螢幕' },
    ]},
    { label: '說明', submenu: [
      { label: '關於桌面版', click: () => dialog.showMessageBox(mainWindow, {
        type: 'info', title: '關於',
        message: `${APP_TITLE} Desktop v${APP_VERSION}`,
        detail: '本程式將既有 Netlify 網站以獨立視窗開啟。\n'
          + 'Supabase、表單、PDF 與簽名等功能均由原網站提供。\n'
          + '資料庫管理權限完全遵照原網站設定。\n'
          + '非國立臺灣大學官方發行之軟體。',
      }) },
    ]},
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
