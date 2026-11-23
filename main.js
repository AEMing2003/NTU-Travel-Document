'use strict';

const path = require('node:path');
const {
  app, BrowserWindow, Menu, dialog, clipboard, shell, session,
} = require('electron');
const {
  APP_URL, isAppURL, isAppBlobURL, isTrustedMagicVerifyURL,
  magicLinkFromClipboard, isExternalLinkAllowed,
} = require('./src/url-policy');

const APP_TITLE = '臺大出差文件製作站';
const APP_VERSION = '1.0.0';
const PERSISTENT_SESSION = 'persist:ntu-travel-document-studio';
let mainWindow = null;
let offlineMode = false;

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

async function openMagicLinkFromClipboard() {
  if (!mainWindow) return;
  const link = magicLinkFromClipboard(clipboard.readText());
  if (!link) {
    await dialog.showMessageBox(mainWindow, {
      type: 'warning', title: '未找到有效 Magic Link',
      message: '剪貼簿不是支援的登入連結。',
      detail:
        '請先在桌面程式的網站中輸入 Email 並寄送登入信，再到信件中「複製連結網址」（不要先點開）。\n'
        + '回到桌面程式，選擇「登入 → 從剪貼簿開啟 Magic Link」。\n\n'
        + '為安全起見，僅接受本網站的驗證回呼或 Supabase 官方驗證網址。',
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
  offlineMode = false;
  // Never log, persist, or echo the secret URL. The page handles its own tokens.
  mainWindow.loadURL(link).catch(() => {
    dialog.showMessageBox(mainWindow, {
      type: 'error', title: '登入連結開啟失敗',
      message: '請檢查網路，或重新寄送 Magic Link 並複製原始連結。',
    });
  });
}

function createMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu', label: APP_TITLE }] : []),
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
      { label: '從剪貼簿開啟 Magic Link', accelerator: 'CmdOrCtrl+Shift+L', click: openMagicLinkFromClipboard },
      { label: 'Magic Link 使用說明', click: async () => {
        if (!mainWindow) return;
        await dialog.showMessageBox(mainWindow, {
          type: 'info', title: '桌面版 Magic Link 登入方式',
          message: '同一個 Email 帳號，但瀏覽器與桌面版登入狀態不同。',
          detail: '① 在桌面程式填寫 Email，按網站的寄送登入信。\n'
            + '② 開啟信箱，對「登入按鈕」按右鍵，選擇複製連結網址；不要先點擊。\n'
            + '③ 回到桌面程式，按 Ctrl+Shift+L（Mac：⌘⇧L）。\n'
            + '④ 確認後讓驗證頁返回本網站，完成登入。\n\n'
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
