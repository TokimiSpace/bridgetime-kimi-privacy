<div align="center">

# BridgeTime Kimi Privacy Envelope

**在資料送往外部 LLM 前，先把可識別資訊縮小成可審查、可測試的最小封包。**

[繁體中文](README.md) · [English](README.en.md)

[![CI](https://github.com/TokimiSpace/bridgetime-kimi-privacy/actions/workflows/ci.yml/badge.svg)](https://github.com/TokimiSpace/bridgetime-kimi-privacy/actions/workflows/ci.yml)
[![Deno 2](https://img.shields.io/badge/runtime-Deno_2-111827?logo=deno&logoColor=white)](https://deno.com/)
[![Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-16A34A.svg)](LICENSE)
[![Offline demo](https://img.shields.io/badge/demo-synthetic_%26_offline-0891B2.svg)](#30-秒驗證)

[BridgeTime](https://bridgetime.org/) ·
[GitHub repository](https://github.com/TokimiSpace/bridgetime-kimi-privacy) ·
[TokimiSpace 開源首頁](https://tokimispace.github.io/?lang=zh-TW) ·
[Tokimi 官方網站](https://tokimi.space/open-source/)

</div>

這是一個獨立、可離線驗證的 TypeScript reference implementation，展示 BridgeTime 在呼叫 Kimi 或其他
OpenAI-compatible LLM 前，如何把**已知姓名、支援的台灣電話格式與 email** 轉為別名，建立
`EgressEnvelopeV1`，並在真正出境前再做一次 fail-closed 掃描。

> [!IMPORTANT]
> 截至 2026-08-25，`bridgetime.org` 的 production assistant 為 disabled。這個公開 repo 衍生自
> private BridgeTime commit `48f5e35659afc729828a20bd68130ac5cd1262ca`，並加入額外加固；它不是
> production deployment 證明，也不代表所有個資都能被規則自動辨識。

![BridgeTime Kimi Privacy Envelope 中文資料流：原始資料先別名化、最小化、掃描，再送往 allowlisted provider](docs/assets/privacy-envelope-flow-zh-TW.svg)

## 一眼看懂

| 階段                  | 發生什麼事                                                                    | 哪些資料能離開 server boundary                      |
| --------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| 1. 建立別名表         | 已知員工／顧客映射成 `S1`、`C1`；電話與 email 會得到 `P1`、`E1`               | 尚未出境                                            |
| 2. 建立 envelope      | 正規化自由文字、套用別名，只加入固定 system text 與三種唯讀 tool schema       | 別名化訊息、日期、時段、數量、狀態碼與 opaque token |
| 3. 出境掃描           | 再掃描已宣告敏感值、email、支援電話、台灣身分證字形、長數字與 credential 字形 | 有任何殘留就阻擋                                    |
| 4. Provider transport | 只允許 HTTPS、443、精確 hostname allowlist，且拒絕 redirect                   | 通過檢查的 provider wire body                       |
| 5. 回應處理           | 真名還原只能在採用者自己的受信任 server boundary 內進行                       | alias table 永不放入 provider payload               |

### 合成範例

|                                    | 內容                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------- |
| 原始輸入（只在 server-side）       | `林範例請聯絡陳測試，電話 0912-000-123，信箱 demo.person@example.test` |
| 實際 demo 的 outbound user message | `S1請聯絡C1,電話 P1,信箱 E1`                                           |
| 留在 server-side 的對照            | `S1 ⇄ 林範例`、`C1 ⇄ 陳測試`、`P1 ⇄ 0912…`、`E1 ⇄ demo…`               |

這仍然是 **pseudonymization（可逆別名化）**，不是匿名化。別名對照表本身是敏感資料，
正式系統必須另外實作存取控制、加密、保留期限與刪除。

## 能證明與不能證明

| 這個 repo 可重現地證明                                                              | 這個 repo 不會宣稱                                                             |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 已知 roster 姓名、支援電話／email、caller 宣告的敏感值，會被替換或使 request 被阻擋 | 任意自由文字都不含個資                                                         |
| alias table 與 outbound envelope 是不同物件，capture 測試檢查實際 wire body         | `S1`、`C1` 等 token 已真正匿名化                                               |
| 模型只能要求 `staff_on_shift`、`open_slots`、`booking_stats` 三種唯讀工具           | 排班日期、時段、數量與語意完全留在本機                                         |
| tool schema 沒有 `merchantId`、DB 存取或寫入動作；tool result 拒絕任意自由文字      | 周邊應用已具備 auth、tenant isolation、consent、retention 或 incident response |
| URL、redirect 與錯誤訊息有明確的 fail-closed 防護                                   | Kimi 的保留、訓練、跨境與次處理政策由本程式碼保證                              |
| 離線測試只使用合成資料，不需要帳號、API key、資料庫或網路                           | `bridgetime.org` 線上環境已部署相同 commit 或已啟用 LLM                        |

完整限制請讀 [PRIVACY_LIMITATIONS.md](docs/PRIVACY_LIMITATIONS.md)，攻擊面與信任邊界請讀
[THREAT_MODEL.md](docs/THREAT_MODEL.md)。

## 30 秒驗證

只需要 [Deno 2](https://docs.deno.com/runtime/getting_started/installation/)：

```bash
git clone https://github.com/TokimiSpace/bridgetime-kimi-privacy.git
cd bridgetime-kimi-privacy
deno task verify
deno task demo
```

- `verify` 依序檢查格式、型別與完整離線測試。
- `demo` 使用合成資料與 `CaptureTransport`，**不會發出網路 request**。
- demo 只印出實際 outbound body，不印 alias table、原始敏感值或 API key。

可依 [VERIFY.md](docs/VERIFY.md) 檢查每一項測試與手動 adversarial case。

## 最小使用概念

下面只準備 envelope，不連線到任何 provider：

```ts
import { buildAliasTable, buildReadOnlyToolSchemas, prepareEgressEnvelopeV1 } from "./src/mod.ts";

const aliasTable = buildAliasTable(
  [{ id: "staff-synthetic-1", displayName: "林範例" }],
  [{ id: "customer-synthetic-1", displayName: "陳測試" }],
);

const prepared = prepareEgressEnvelopeV1({
  model: "kimi-k2.6",
  systemPrompt: "Use opaque tokens and read-only aggregate tools.",
  rawUserText: "林範例請聯絡陳測試，電話 0912-000-123",
  aliasTable,
  tools: buildReadOnlyToolSchemas({
    staffTokens: ["S1"],
    serviceTokens: ["V1"],
  }),
});

console.log(prepared.maskedUserText); // S1請聯絡C1,電話 P1
```

真正整合時，alias table 必須只存在受信任的 server-side state。若有 tool call，採用者需在自己的
authentication／tenant boundary 內查詢資料，再用 `appendAliasedToolRoundTrip` 加入受限的別名化結果。
`src/` 不包含資料庫 executor，這是刻意的安全與商業邊界。

## 固定的唯讀工具

| Tool             | 可接受的資訊                                          | 明確禁止                            |
| ---------------- | ----------------------------------------------------- | ----------------------------------- |
| `staff_on_shift` | 受限 period／日期、`S` staff token                    | 真名、任意 ID、`merchantId`、寫入   |
| `open_slots`     | 受限 period／日期、`V` service token、aggregate count | 服務名稱、顧客資料、自由文字        |
| `booking_stats`  | 受限 period／日期、固定狀態碼與 aggregate count       | 個別 booking row、note、電話、email |

模型在第二輪仍會看到**別名化的**日期、時段與統計結果，所以不可宣稱「查詢結果完全不會送給 LLM」。

## Repository 地圖

```text
bridgetime-kimi-privacy/
├── src/
│   ├── alias.ts          # 正規化後的可逆別名化
│   ├── envelope.ts       # EgressEnvelopeV1 與兩層掃描
│   ├── provider.ts       # HTTPS／allowlist／safe-error boundary
│   └── tools.ts          # 固定唯讀 schemas 與受限 serializer
├── tests/                # capture、fail-closed、round-trip、safe-error 測試
├── examples/
│   └── synthetic_demo.ts # 零網路、純合成 demo
└── docs/
    ├── DATA_FLOW.md
    ├── THREAT_MODEL.md
    ├── PRIVACY_LIMITATIONS.md
    ├── PROVIDER_DUE_DILIGENCE.md
    ├── SOURCE_MAPPING.md
    └── VERIFY.md
```

建議閱讀順序： [資料流](docs/DATA_FLOW.md) → [驗證指南](docs/VERIFY.md) →
[隱私限制](docs/PRIVACY_LIMITATIONS.md) → [威脅模型](docs/THREAT_MODEL.md) →
[Kimi provider 審查](docs/PROVIDER_DUE_DILIGENCE.md) →
[private／public 來源對照](docs/SOURCE_MAPPING.md)。

## Production 啟用門檻

測試全綠不等於可以直接處理真實使用者資料。BridgeTime 或任何採用者至少還要完成：

- provider 的 retention、training/model-improvement、資料地區、subprocessor 與刪除條款審查；
- 正確的隱私告知、合法依據／同意、跨境傳輸與資料當事人權利流程；
- alias table 的加密、權限、TTL／deletion 與 backup policy；
- authentication、tenant isolation、rate limit、body-free logging、key rotation 與 kill switch；
- 用部署 commit／release digest 連結公開證據與實際 production artifact。

Kimi 條款可能變更；正式啟用前請重新查核
[PROVIDER_DUE_DILIGENCE.md](docs/PROVIDER_DUE_DILIGENCE.md)。這不是法律意見。

## 貢獻、安全、授權

歡迎改善偵測規則、負面測試、文件與 provider boundary。請只使用合成資料，並先閱讀
[CONTRIBUTING.md](CONTRIBUTING.md)：

```bash
deno task verify
deno task demo
```

安全問題請依 [SECURITY.md](SECURITY.md) 私下回報，不要公開貼出可能的敏感內容或 exploit。

程式碼與文件採 [Apache License 2.0](LICENSE)。BridgeTime、TokimiSpace 名稱與標誌不包含在授權內，
詳見 [TRADEMARKS.md](TRADEMARKS.md)。Kimi 與 Moonshot AI 為第三方名稱／商標；此 repo 僅用來描述 API
compatibility 與被檢視的 provider boundary，不代表隸屬、贊助或認證關係。
