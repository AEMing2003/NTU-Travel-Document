# Desktop v1.0.4 — Supabase Native Magic Link Verify

- 從 Supabase 官方驗證連結讀取一次性 token hash，直接透過 Supabase Auth 的 POST /auth/v1/verify 驗證。
- 成功後將 Auth 回傳的 Session 儲存在網頁原本的 localStorage key（沿用同一 origin/partition），再重新載入既有網站。
- 驗證失敗時明確顯示過期、寄送限制、網路或缺少 Session 等情況；不記錄、不顯示驗證憑證。
- 「登入 → 檢查 APP 登入狀態」現在提供最近一次驗證結果。
- 網站回呼連結保留舊路徑相容性，並非所有自訂登入流程皆可直接交換 token。

安全註記：程式只使用 Supabase Publishable Key（非 secret/service_role）；未修改 Supabase 後端、RLS、Netlify 網站或共用資料。未在實機完成真實登入驗證，需安裝後測試。
