# v1.0.2 (2026-11-23)

- 新增原生 Magic Link 貼上視窗：不依賴跨裝置共用剪貼簿；避免直接在郵件中點擊 Sign in 而開啟一般瀏覽器。
- 新增登入狀態診斷：只檢查存在性，不讀取或顯示登入憑證。
- 保留 v1.0.1 安全網址辨識與原有的 Windows／macOS 自動建置設定。
- 未修改正式網站與資料庫，尚需 Windows／macOS 真實登入驗收。

# 變更記錄

## Desktop v1.0.1（2026-11-23）

- 修正桌面版「剪貼簿不是支援的登入連結」：改善 Supabase Magic Link 辨識。
- 支援常見 Gmail（`www.google.com/url`）與 Outlook SafeLinks 的轉址包裝、HTML `&amp;` 轉義與電子郵件 HTML 連結。
- 僅允許「TRAVEL DOCUMENT STUDIO」專屬 Supabase 驗證網址與本網站的 Auth 回呼，不任意開啟其他專案連結。
- 多個不同的 Magic Link 會要求使用者重新複製，避免誤用。
- 失敗時只顯示偵測到的網址主機名稱，不顯示或記錄完整一次性認證網址。
- 11 項單元測試與語法檢查通過。
- 沒有修改既有網站、Supabase 資料庫、使用者權限、表單及 PDF 相關設定。
- 尚須在已打包的 Windows/macOS APP 中，以真實收到的 Magic Link 驗收。

## Desktop v1.0.0（2026-11-23）

- 初始 Electron 桌面應用程式；連接既有 Netlify 網站。
- Windows + macOS GitHub Actions 自動打包。
- 原版 Supabase Magic Link 剪貼簿選單（目前已改良）。
