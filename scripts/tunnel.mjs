// VoiceNexus Public Tunnel Manager for Twilio Webhooks
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

async function startTunnel() {
  const ngrokModulePath = path.resolve(
    process.env.APPDATA || "",
    "npm/node_modules/@ngrok/ngrok"
  );
  let ngrok;
  try {
    ngrok = require(ngrokModulePath);
  } catch {
    ngrok = await import("@ngrok/ngrok");
  }

  const authtoken =
    process.env.NGROK_AUTHTOKEN ||
    "3F5U8P5Fqs2vzxz8Fn7uJoEPHp3_tpwGu1USFADcmG4UmQX5";

  const port = parseInt(process.env.PORT || "3000", 10);
  console.log(`[Tunnel] Initiating secure ngrok tunnel for port ${port}...`);

  const listener = await ngrok.forward({
    addr: port,
    authtoken: authtoken,
  });

  const url = listener.url();
  console.log(`[Tunnel] Twilio Webhook URL: ${url}`);
  console.log(`[Tunnel] Inbound Webhook: ${url}/api/telephony/inbound`);
  console.log(`[Tunnel] Turn Webhook:    ${url}/api/telephony/turn`);
  console.log(`[Tunnel] Status Webhook:  ${url}/api/telephony/status`);
  console.log(`[Tunnel] Audio Gateway:   ${url}/api/telephony/audio/[id]`);

  // Keep alive indefinitely
  setInterval(() => {}, 1000 * 60 * 60);

  process.on("SIGINT", async () => {
    console.log("[Tunnel] Closing tunnel...");
    await listener.close();
    process.exit(0);
  });
}

startTunnel().catch((err) => {
  console.error("[Tunnel] Failed to start tunnel:", err);
  process.exit(1);
});
