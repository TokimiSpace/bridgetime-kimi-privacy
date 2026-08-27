import {
  buildPrivateIntentEnvelopeV1,
  CaptureTransport,
  sendPrivateIntentEnvelope,
} from "../src/mod.ts";

// Interpret raw text and resolve business values inside your own trusted server
// boundary. Only this value-free routing enum is allowed to reach Kimi.
const envelope = buildPrivateIntentEnvelopeV1("manage_staff_services", "quick_action", "request");
const capture = new CaptureTransport();

await sendPrivateIntentEnvelope({
  envelope,
  apiKey: "synthetic-demo-key",
  transport: capture,
});

// CaptureTransport never stores the key and performs no network request.
console.log(JSON.stringify(JSON.parse(capture.requests[0].body), null, 2));
