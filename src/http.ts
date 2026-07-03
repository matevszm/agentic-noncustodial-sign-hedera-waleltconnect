import type { IncomingMessage, ServerResponse } from "node:http";
import QRCode from "qrcode";
import { isValidSid } from "./sid.js";

interface SessionStatus {
    connected: boolean;
    accountId: string | null;
}

function renderPage(uri: string, sid: string): string {
    const sidParam = encodeURIComponent(sid);
    return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Connect HashPack</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; }
  button { font-size: 1rem; padding: .7rem 1.1rem; margin: .3rem .3rem 0 0; cursor: pointer; border-radius: 8px; border: 1px solid #888; background: #fff; }
  #ext-status { font-weight: 600; min-height: 1.4em; }
  code { word-break: break-all; background: #f2f2f2; padding: .5rem; display: block; border-radius: 6px; margin-top: .5rem; }
  img { display: block; margin-top: .75rem; border: 1px solid #ddd; border-radius: 8px; }
</style></head>
<body>
<h1>Connect HashPack</h1>
<p id="no-uri" hidden>No active pairing URI. Call authorize_start first, then refresh.</p>
<div id="choices">
  <button id="btn-ext">Connect via extension</button>
  <button id="btn-mobile">Connect via mobile (QR)</button>
  <p id="ext-status"></p>
  <div id="mobile-area" hidden>
    <p>Scan in HashPack mobile or paste the URI in WalletConnect:</p>
    <img src="/qr.png?sid=${sidParam}" alt="WalletConnect QR" width="280" height="280" />
    <code id="uri"></code>
  </div>
</div>
<script>
  const WC_URI = ${JSON.stringify(uri)};
  const SID = ${JSON.stringify(sid)};
  const extStatus = document.getElementById("ext-status");
  document.getElementById("uri").textContent = WC_URI;

  if (!WC_URI) {
    document.getElementById("no-uri").hidden = false;
    document.getElementById("choices").hidden = true;
  } else {
    let extRequested = false;
    let connectSent = false;
    window.addEventListener("message", (event) => {
      const data = event.data;
      if (!extRequested || connectSent) return;
      if (data && data.type === "hedera-extension-response" && data.metadata) {
        const meta = data.metadata;
        const name = (meta.name || "").toLowerCase();
        if (name && !name.includes("hashpack")) return;
        connectSent = true;
        extStatus.textContent = "Found " + (meta.name || meta.id) + " — approve in HashPack.";
        window.postMessage({ type: "hedera-extension-connect-" + meta.id, pairingString: WC_URI }, "*");
      }
    });
    document.getElementById("btn-ext").onclick = () => {
      extRequested = true;
      extStatus.textContent = "Looking for the HashPack extension…";
      window.postMessage({ type: "hedera-extension-query" }, "*");
      setTimeout(() => {
        if (!connectSent) extStatus.textContent = "HashPack extension not detected. Install/unlock it and try again.";
      }, 2000);
    };
    document.getElementById("btn-mobile").onclick = () => {
      document.getElementById("mobile-area").hidden = false;
    };

    const poll = setInterval(async () => {
      try {
        const res = await fetch("/status?sid=" + encodeURIComponent(SID));
        const s = await res.json();
        if (s.connected) {
          clearInterval(poll);
          document.body.innerHTML =
            "<h1>✅ Connected</h1><p>Account: " + (s.accountId || "") +
            ". You can close this tab.</p>";
          window.close();
        }
      } catch (_e) {}
    }, 1000);
  }
</script>
</body></html>`;
}

function errorPage(): string {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Connect HashPack</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 640px; margin: 3rem auto; padding: 0 1rem;">
<h1>Missing or invalid session</h1>
<p>Open the link returned by authorize_start — it contains your <code>sid</code>.</p>
</body></html>`;
}

export function handleConnectRequest(
    req: IncomingMessage,
    res: ServerResponse,
    getUri: (sid: string) => string | null,
    getStatus: (sid: string) => SessionStatus,
): void {
    if (req.method !== "GET") {
        res.writeHead(404, {"content-type": "text/plain; charset=utf-8"});
        res.end("not found");
        return;
    }

    const url = new URL(req.url ?? "", "http://localhost");
    const pathname = url.pathname;
    const sid = url.searchParams.get("sid");
    const validSid = isValidSid(sid) ? sid : null;

    if (pathname === "/status") {
        if (!validSid) {
            res.writeHead(400, {"content-type": "application/json; charset=utf-8"});
            res.end(JSON.stringify({error: "missing or invalid sid"}));
            return;
        }
        res.writeHead(200, {"content-type": "application/json; charset=utf-8"});
        res.end(JSON.stringify(getStatus(validSid)));
        return;
    }

    if (pathname === "/qr.png") {
        if (!validSid) {
            res.writeHead(400, {"content-type": "text/plain; charset=utf-8"});
            res.end("missing or invalid sid");
            return;
        }
        const uri = getUri(validSid);
        if (!uri) {
            res.writeHead(404, {"content-type": "text/plain; charset=utf-8"});
            res.end("no pairing uri");
            return;
        }
        QRCode.toBuffer(uri, {type: "png", width: 280})
            .then((buffer) => {
                res.writeHead(200, {"content-type": "image/png"});
                res.end(buffer);
            })
            .catch(() => {
                res.writeHead(500, {"content-type": "text/plain; charset=utf-8"});
                res.end("qr generation failed");
            });
        return;
    }

    if (pathname === "/connect") {
        if (!validSid) {
            res.writeHead(400, {"content-type": "text/html; charset=utf-8"});
            res.end(errorPage());
            return;
        }
        res.writeHead(200, {"content-type": "text/html; charset=utf-8"});
        res.end(renderPage(getUri(validSid) ?? "", validSid));
        return;
    }

    res.writeHead(404, {"content-type": "text/plain; charset=utf-8"});
    res.end("not found");
}
