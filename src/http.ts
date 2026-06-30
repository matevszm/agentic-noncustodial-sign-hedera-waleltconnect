import {createServer} from "node:http";
import QRCode from "qrcode";

interface SessionStatus {
    connected: boolean;
    accountId: string | null;
}

function renderPage(uri: string): string {
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
<h1>Połącz HashPack</h1>
<p id="no-uri" hidden>Brak aktywnego pairing URI. Wywołaj najpierw authorize_start, potem odśwież.</p>
<div id="choices">
  <button id="btn-ext">Połącz przez rozszerzenie</button>
  <button id="btn-mobile">Połącz przez telefon (QR)</button>
  <p id="ext-status"></p>
  <div id="mobile-area" hidden>
    <p>Zeskanuj w HashPack mobile lub wklej URI w WalletConnect:</p>
    <img src="/qr.png" alt="WalletConnect QR" width="280" height="280" />
    <code id="uri"></code>
  </div>
</div>
<script>
  const WC_URI = ${JSON.stringify(uri)};
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
        extStatus.textContent = "Znaleziono " + (meta.name || meta.id) + " — zatwierdź w HashPack.";
        window.postMessage({ type: "hedera-extension-connect-" + meta.id, pairingString: WC_URI }, "*");
      }
    });
    document.getElementById("btn-ext").onclick = () => {
      extRequested = true;
      extStatus.textContent = "Szukam rozszerzenia HashPack…";
      window.postMessage({ type: "hedera-extension-query" }, "*");
      setTimeout(() => {
        if (!connectSent) extStatus.textContent = "Nie wykryto rozszerzenia HashPack. Zainstaluj/odblokuj i spróbuj ponownie.";
      }, 2000);
    };
    document.getElementById("btn-mobile").onclick = () => {
      document.getElementById("mobile-area").hidden = false;
    };

    const poll = setInterval(async () => {
      try {
        const res = await fetch("/status");
        const s = await res.json();
        if (s.connected) {
          clearInterval(poll);
          document.body.innerHTML =
            "<h1>✅ Połączono</h1><p>Konto: " + (s.accountId || "") +
            ". Możesz zamknąć tę kartę.</p>";
          window.close();
        }
      } catch (_e) {}
    }, 1000);
  }
</script>
</body></html>`;
}

export function startConnectServer(
    port: number,
    getUri: () => string | null,
    getStatus: () => SessionStatus,
): void {
    const server = createServer((req, res) => {
        const url = req.url ?? "";
        if (req.method !== "GET") {
            res.writeHead(404, {"content-type": "text/plain; charset=utf-8"});
            res.end("not found");
            return;
        }
        if (url.startsWith("/status")) {
            res.writeHead(200, {"content-type": "application/json; charset=utf-8"});
            res.end(JSON.stringify(getStatus()));
            return;
        }
        if (url.startsWith("/qr.png")) {
            const uri = getUri();
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
        if (url.startsWith("/connect")) {
            res.writeHead(200, {"content-type": "text/html; charset=utf-8"});
            res.end(renderPage(getUri() ?? ""));
            return;
        }
        res.writeHead(404, {"content-type": "text/plain; charset=utf-8"});
        res.end("not found");
    });
    server.listen(port, "127.0.0.1", () => {
        console.error(`connect page on http://localhost:${port}/connect`);
    });
}
