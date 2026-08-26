<div align="center">

# BridgeTime Kimi Privacy Envelope

**資料送往外部 LLM 前，先別名化、最小化並檢查。**

[繁體中文](README.md) · [English](README.en.md)

[![CI](https://github.com/TokimiSpace/bridgetime-kimi-privacy/actions/workflows/ci.yml/badge.svg)](https://github.com/TokimiSpace/bridgetime-kimi-privacy/actions/workflows/ci.yml)
[![Deno 2](https://img.shields.io/badge/runtime-Deno_2-111827?logo=deno&logoColor=white)](https://deno.com/)
[![Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-16A34A.svg)](LICENSE)

[BridgeTime](https://bridgetime.org/) ·
[TokimiSpace 開源首頁](https://tokimispace.github.io/?lang=zh-TW) ·
[Tokimi](https://tokimi.space/open-source/)

</div>

> [!WARNING]
> **防詐騙：**任何以 `@gmail.com` 結尾、並自稱 Tokimi
> 的帳號都不是官方聯絡管道。請勿付款或提供驗證碼；只透過 [tokimi.space](https://tokimi.space/) 或
> [ben@tokimi.space](mailto:ben@tokimi.space) 核實。

這個可離線驗證的 TypeScript reference implementation，會在呼叫 Kimi 或其他 OpenAI-compatible LLM
前，將**已知姓名、支援的台灣電話格式與 email**換成別名，建立 `EgressEnvelopeV1`，並在出境前做
fail-closed 掃描。

> [!IMPORTANT]
> 截至 **2026-08-25**，`bridgetime.org` 的 production assistant 為 **disabled**。本 repo 衍生自
> private BridgeTime commit `48f5e35659afc729828a20bd68130ac5cd1262ca` 並加入額外加固；它不是
> production deployment 證明，也不能辨識所有個資。

![BridgeTime Kimi Privacy Envelope 中文資料流](docs/assets/privacy-envelope-flow-zh-TW.svg)

## 運作方式

| 階段          | 動作                                                                                 | 可出境資料           |
| ------------- | ------------------------------------------------------------------------------------ | -------------------- |
| 別名化        | 已知人名、電話、email 轉為 `S1`、`C1`、`P1`、`E1`                                    | 無                   |
| 建立 envelope | 正規化文字；加入呼叫端提供、受長度限制與掃描的 system prompt，以及固定的三種唯讀工具 | 別名化訊息與受限欄位 |
| 出境檢查      | 掃描敏感值、身分／credential 字形與長數字                                            | 有殘留就阻擋         |
| Transport     | 僅允許 HTTPS:443、精確 hostname allowlist，拒絕 redirect                             | 通過檢查的 wire body |

原始輸入 `林範例請聯絡陳測試，電話 0912-000-123` 會成為 `S1請聯絡C1,電話 P1`。對照表只留在採用者的
server boundary。

這是可逆的 **pseudonymization（別名化）**，不是 anonymization（匿名化）。Alias table 本身是敏感
資料，正式系統仍需實作加密、存取控制、保留期限與刪除。

## 證據邊界

| 可重現地證明                                                           | 不代表                                             |
| ---------------------------------------------------------------------- | -------------------------------------------------- |
| 已知 roster 姓名、支援電話／email 與 caller 宣告值會被替換或阻擋       | 任意自由文字都不含個資                             |
| Alias table 與 outbound envelope 分離；capture test 檢查實際 wire body | `S1`、`C1` 已匿名化                                |
| 模型只能要求 `staff_on_shift`、`open_slots`、`booking_stats`           | 周邊系統已有 auth、tenant isolation 或 consent     |
| Tool schema 無 DB 存取或寫入；result serializer 拒絕自由文字           | 工具結果完全留在本機                               |
| URL、redirect 與錯誤路徑採 fail-closed                                 | 程式可保證 provider 的保留、訓練、跨境或次處理政策 |

工具結果中的**員工／服務代號、日期、時段、數量與狀態仍可能送到模型**。詳細限制見
[PRIVACY_LIMITATIONS.md](docs/PRIVACY_LIMITATIONS.md)與 [THREAT_MODEL.md](docs/THREAT_MODEL.md)。

## 30 秒驗證

只需要 [Deno 2](https://docs.deno.com/runtime/getting_started/installation/)：

```bash
git clone https://github.com/TokimiSpace/bridgetime-kimi-privacy.git
cd bridgetime-kimi-privacy
deno task verify
deno task demo
```

`verify` 執行格式、型別與離線測試；`demo` 只用合成資料與 `CaptureTransport`，不發出網路
request，也不印出 alias table、原始值或 API key。

## 最小整合

```ts
import { buildAliasTable, buildReadOnlyToolSchemas, prepareEgressEnvelopeV1 } from "./src/mod.ts";

const aliasTable = buildAliasTable(
  [{ id: "staff-1", displayName: "林範例" }],
  [{ id: "customer-1", displayName: "陳測試" }],
);

const prepared = prepareEgressEnvelopeV1({
  model: "kimi-k2.6",
  systemPrompt: "Use opaque tokens.",
  rawUserText: "林範例請聯絡陳測試，電話 0912-000-123",
  aliasTable,
  tools: buildReadOnlyToolSchemas({ staffTokens: ["S1"], serviceTokens: ["V1"] }),
});
```

Alias table 只能存在受信任的 server-side state。工具需在採用者自己的 authentication／tenant boundary
內執行，再以 `appendAliasedToolRoundTrip` 加入受限結果；本 repo 刻意不含 DB executor。

## 上線前

測試通過不等於可處理真實資料。至少需完成：

- provider retention、training、資料地區、subprocessor 與刪除條款審查；
- 隱私告知、合法依據／同意、跨境傳輸與資料當事人流程；
- alias table 加密、權限、TTL／deletion 與 backup policy；
- authentication、tenant isolation、body-free logging、key rotation 與 kill switch。

Kimi 政策可能變更，啟用前請重查
[PROVIDER_DUE_DILIGENCE.md](docs/PROVIDER_DUE_DILIGENCE.md)。這不是法律意見。

## 文件、安全與授權

`src/` 是別名化、envelope、provider 與 tool boundary；`tests/` 提供 fail-closed 與 wire-body
證據。閱讀 [DATA_FLOW.md](docs/DATA_FLOW.md)、[VERIFY.md](docs/VERIFY.md)及
[SOURCE_MAPPING.md](docs/SOURCE_MAPPING.md)。

貢獻請只用合成資料並先讀 [CONTRIBUTING.md](CONTRIBUTING.md)；安全問題請依 [SECURITY.md](SECURITY.md)
私下回報。

程式碼與文件採 [Apache License 2.0](LICENSE)。BridgeTime、TokimiSpace 名稱與標誌不在授權內，詳見
[TRADEMARKS.md](TRADEMARKS.md)。Kimi 與 Moonshot AI 為第三方名稱；本 repo 不代表雙方有合作或認證。
