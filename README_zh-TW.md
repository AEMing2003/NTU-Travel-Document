# 臺大出差文件製作站｜Windows & macOS 桌面版 v1.0.0

> **專案狀態：桌面程式原始碼及建置流程已完成；尚未產出或在 Windows/macOS 上驗證原生 `.exe` / `.dmg`。**
> 網站基礎：[https://ntu-travel-document-studio.netlify.app/](https://ntu-travel-document-studio.netlify.app/)（2026-11-23 已檢視線上網站標示 v2.1.5）。

## 這是什麼

將先前已完成的 **「臺大出差文件製作站」** 以安全的 Electron 桌面視窗開啟。和先前「空白桌面封裝範本」不同，這次已直接設定正式網站位址，因此網路正常時就會呈現真正的表單、管理與 PDF 預覽畫面。

這**不是**反編譯網站、獨立離線版，也不是重新建立的資料庫；正式網站持續提供功能與 Supabase 連線。

### 沿用既有網站功能

- 國科會計畫人員出差申請單及存根、國內出差旅費報告表
- PDF A4 預覽與下載、電子簽章圖片上傳、跨日行程及費用
- 人員／計畫／活動／地點範本，自動帶入及填表資料備份／還原
- Supabase Email Magic Link 登入、核准後才能讀取內部範本
- 管理員編修共用資料與 CSV 匯入、預建帳號（原網站提供）
- 管理員本機 AES-GCM 加密身分證號庫（原網站提供）
- 既有欄位驗證規則與管理員權限（由原網站及 Supabase RLS 決定）

**注意：功能由網站端提供，若網頁更新、API 改變、服務未連線，本桌面版也會同步受到影響。** 桌面程式不內建任何 Supabase Secret/Service Role key。

## 直接使用（已有建置好的安裝程式時）

### Windows（Windows 10/11，x64）

1. 執行 `NTU-Travel-Document-Studio-...-win-x64.exe`。如果看到兩個 `.exe`，其中一個為安裝程式，另一個為免安裝可攜式版本；兩者可以擇一。
2. 安裝版依畫面完成安裝；可攜式版雙擊開啟即可。
3. 程式內的「檔案」選單可重新載入網站、列印或開啟外部瀏覽器。

### Mac（macOS，Intel x64／Apple Silicon arm64）

1. 根據處理器選擇 `mac-x64.dmg` 或 `mac-arm64.dmg`。
2. 開啟 DMG，將 `.app` 拖入「應用程式」。
3. 首次啟動時，本專案尚未做 Apple Developer ID 簽章／公證，可能受 Gatekeeper 阻擋。請僅在信任來源的前提下使用，正式發布應完成簽章與公證。

**未簽署的 Windows 安裝程式可能觸發 SmartScreen；請確保來源可信。**

## 桌面程式 Email Magic Link 登入（重要）

由於桌面程式和預設網頁瀏覽器使用不同的本機登入儲存空間，**直接點擊 Email 的登入連結一般會開啟瀏覽器，不能保證桌面程式也登入**。

1. 在**桌面程式內**，於網站登入區填寫已有帳號的 Email，按「寄送 Magic Link 登入信」。
2. 到信箱找到信件，對登入按鈕／連結按 **右鍵 → 複製連結網址**；**不要先點擊**（避免一次性連結已被使用）。
3. 返回桌面程式，點選 **「登入 → 從剪貼簿開啟 Magic Link」**。快捷鍵：Windows `Ctrl+Shift+L`，Mac `⌘⇧L`。
4. 確認後，程式會在相同桌面視窗中完成驗證並返回正式網站。

這個功能只接受本網站的帶驗證參數回呼網址，或 `*.supabase.co/auth/v1/verify` 的一次性驗證網址；**登入連結不寫入磁碟、不傳送給封裝作者、不輸出至記錄檔**。驗證由既有 Supabase 提供。

若驗證失敗或信件連結已過期，重新寄送一封新 Magic Link 再試。部分 Email 用戶端可能改寫連結，請優先複製原始目標網址。

## 本機資料與隱私

- 桌面視窗直接載入 `https://ntu-travel-document-studio.netlify.app/`（HTTPS）。
- 既有網站的表單、本機加密證號庫、簽章等功能維持**網站原本的資料策略**；此封裝程式不新增資料傳輸 API。
- Electron 會使用獨立且持久的 Chromium 使用者資料目錄。**瀏覽器既有 localStorage、登入 session 與加密證號不會自動匯入桌面程式**；需要在桌面版重新登入及（如有必要）匯入網站備份。
- 網站原本的加密證號庫在桌面版必須**重新建立／輸入**，原瀏覽器的庫不能直接解密移入；請勿把未加密證號放到雲端。
- 管理員權限依 Supabase/Auth/RLS 決定，桌面版不會提升權限。
- 這不是離線版：沒有網路或網站停止服務時，無法登入、同步或取得網頁。

## 開發環境

- Node.js 22 或更新版本
- npm
- Windows 10/11（x64）或 macOS（建議 13+）
- **於相應作業系統建置**：Windows 的 `.exe` 於 Windows；Mac 的 `.app/.dmg` 於 macOS。

Windows PowerShell：

```powershell
cd ntu-travel-desktop-v1.0.0
powershell -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1
```

macOS Terminal：

```bash
cd ntu-travel-desktop-v1.0.0
bash scripts/build-macos.sh
```

或自行執行：

```bash
npm install --no-audit --no-fund
npm test
npm run lint
npm start           # 開發預覽（需 GUI）
npm run dist:win    # Windows x64 安裝與 portable
npm run dist:mac    # Mac Intel 與 Apple Silicon DMG/ZIP
```

打包成功後原生檔案位於 `dist/`。首次建置需連接網路下載 Node 套件與 Electron binary。

### 沒有 Windows 與 Mac 兩台設備：GitHub Actions

1. 在 GitHub 建立新的 Repository。
2. 上傳本 ZIP **內層專案資料夾中的所有檔案**，注意要包含 `.github/workflows/build-desktop.yml` 隱藏資料夾；`package.json` 必須位於 repository 根目錄。
3. GitHub → **Actions** → **Build NTU Travel Document Studio Desktop** → **Run workflow**。
4. 兩個工作都成功後，至 workflow 執行紀錄底下下載：
   - `NTU-Travel-Desktop-Windows-x64`：Windows 安裝版／可攜式 EXE
   - `NTU-Travel-Desktop-macOS`：Intel / Apple Silicon DMG 與 ZIP

上述二進位檔需 GitHub Actions 實際建置完成才會存在，本 ZIP **不含**已完成的 EXE／DMG。此 workflow 不會部署或修改原本 Netlify 網站，不會修改 Supabase 資料庫。

## 專案主要檔案

| 檔案 | 用途 |
|---|---|
| `main.js` | Electron 桌面視窗、安全權限、下載與 Magic Link 選單 |
| `src/url-policy.js` | HTTPS 網址限制與登入連結驗證 |
| `src/offline.html` | 網站無法連線時的提醒畫面 |
| `assets/icon.*` | 桌面應用程式自製圖示（PNG/ICO/ICNS） |
| `scripts/build-windows.ps1` | Windows 一鍵建置 |
| `scripts/build-macos.sh` | macOS 一鍵建置 |
| `.github/workflows/build-desktop.yml` | GitHub 自動建置 Windows＋macOS |
| `tests/url-policy.test.js` | 網址、安全驗證單元測試 |

## 已確認與仍需實機驗證

- 已確認：正式 Netlify 網站存在，頁面標示 v2.1.5（2026-11-23）。
- 已完成：桌面外殼、PDF 下載儲存對話框、Magic Link 剪貼簿驗證入口、網域限制、離線提示與雙平台建置設定。
- 已能於本環境執行：不需 GUI 的 Node.js 測試與 JavaScript 語法檢查。
- **尚未驗證**：實際 Windows / macOS 原生安裝、在桌面版完成真實 Magic Link 登入、使用真實 Supabase 使用者、表單 PDF 下載列印、簽章選檔與 macOS Gatekeeper。因此勿把未測功能描述成已通過實機驗收。

此桌面封裝僅屬既有網站客戶端。非國立臺灣大學官方軟體，實際報支與簽核仍請依校方最新規定辦理。
