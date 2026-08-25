# Kimi provider due diligence / Kimi 供應商審查

Checked on / 查核日期：**2026-08-25**

This is an engineering and business-risk checklist, not legal advice. Provider terms can change;
review the live documents and obtain qualified legal advice for the jurisdictions, customers, and
data involved in a real deployment.

這是工程與商業風險檢查表，不是法律意見。供應商條款可能變更；正式啟用前，應重新閱讀即時
版本，並依服務地區、客戶與資料類型取得合格法律意見。

## What the official documents currently say / 官方文件目前的重點

The [Kimi OpenPlatform Terms of Service](https://platform.kimi.ai/docs/agreement/modeluse) (last
updated 2026-07-30 on the page) define prompts and outputs as Customer Content. They state that
Content may be used to provide, maintain, develop, support, and improve the service. Customers who
need restrictions on training or model improvement are directed to discuss an enterprise arrangement
or separate written agreement; absent an express written agreement, Content may be used for the
stated purposes.

[Kimi OpenPlatform 服務條款](https://platform.kimi.ai/docs/agreement/modeluse)（頁面標示最後更新
2026-07-30）把輸入與輸出都視為 Customer Content。條款表示 Content 可能用於提供、維護、
開發、支援及改善服務；需要限制訓練或模型改善用途的客戶，應洽談企業方案或獨立書面協議。
在沒有明確書面約定時，不應假設 API 內容排除於上述用途之外。

The [Kimi OpenPlatform Privacy Policy](https://platform.kimi.ai/docs/agreement/userprivacy) (last
updated 2025-04-30 on the page) says User Content can support model optimization and that service
improvement includes training and refining machine-learning models. It says account, input, and
payment information are retained while an account is active, subject to the policy's broader
retention purposes and exceptions. It also says collected information is stored on secure servers in
Singapore and may be transferred outside the user's country of residence.

[Kimi OpenPlatform 隱私政策](https://platform.kimi.ai/docs/agreement/userprivacy)（頁面標示最後更新
2025-04-30）表示 User Content 可用於模型最佳化，服務改善也包含訓練與調整機器學習模型；
account、input 與 payment information 的保留範例是帳號有效期間，並受政策所列其他保留目的與
例外影響。政策也表示所蒐集資訊存放於新加坡伺服器，且可能跨境傳輸。

## Activation gate / 啟用前門檻

Do not enable a real Kimi provider for BridgeTime user traffic until all items are documented:

- A signed enterprise arrangement or separate written agreement states whether Customer Content is
  excluded from training/model improvement, defines retention/deletion, confidentiality,
  subprocessors, breach notification, audit rights, and termination handling.
- Counsel confirms the lawful basis, notices/consent, cross-border transfer mechanism, processor
  roles, and data-subject request process for every served jurisdiction.
- BridgeTime's privacy notice accurately names the provider/data flow and no longer promises that
  data is never shared with a third party when an external LLM is enabled.
- The production endpoint, account tier, region, logging, backups, support workflow, and deletion
  behavior are verified against the signed terms—not inferred from this reference code.
- A data inventory sets an allowlist for permitted fields and prohibits special-category or other
  high-risk content unless separately approved.
- Security review covers key storage/rotation, access control, monitoring without body logging,
  incident response, and a tested kill switch.

BridgeTime 若要把真實使用者流量送至 Kimi，應先完成以下事項並留下文件：

- 取得已簽署的企業方案或獨立書面協議，明定 Customer Content 是否排除於訓練／模型改善、
  保留與刪除、保密、次處理者、資安事件通知、稽核權與終止後處理。
- 由法律顧問確認各服務地區的合法依據、告知／同意、跨境傳輸機制、資料處理角色與當事人權利處理流程。
- 更新 BridgeTime 隱私告知，準確說明供應商與資料流；啟用外部 LLM 後，不可仍承諾資料絕不
  提供予第三方。
- 依簽署條款驗證 production endpoint、帳號層級、區域、日誌、備份、客服流程與刪除行為，不可由本
  reference code 推論。
- 建立資料清冊與允許欄位清單；未另行核准前，禁止特殊類別或其他高風險內容。
- 完成金鑰保存／輪替、權限、無 body 日誌監控、事件應變與可測試 kill switch 的安全審查。

## Decision for this repository / 本 repo 的決策

The included `CaptureTransport` remains the default demonstration path and never makes a network
request. The real `FetchTransport` is reference code only. Passing the test suite is not approval to
activate Kimi, and the public repository does not establish that BridgeTime has an enterprise
agreement.

本 repo 預設示範仍使用不連網的 `CaptureTransport`；`FetchTransport` 只作為參考。測試全綠不
等於可以啟用 Kimi，公開此 repo 也不代表 BridgeTime 已取得企業書面安排。
