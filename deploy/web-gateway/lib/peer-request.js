/**
 * JSON requests from the gateway to Boson DHT endpoints and peer gateways.
 *
 * Uses http/https rather than fetch so responses are never decompressed: no
 * Brotli decoder (CVE-2026-111497) on any Node version. Elacity supernodes are
 * reached by IP and verified against the *.ela.city certificate they serve.
 */
import http from "http";
import https from "https";

export const ELACITY_SUPERNODE_IPS = new Set(["69.164.241.210", "38.242.211.112"]);
export const ELACITY_SUPERNODE_SERVERNAME = "supernode.ela.city";
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export function peerServername(hostname) {
  return ELACITY_SUPERNODE_IPS.has(hostname) ? ELACITY_SUPERNODE_SERVERNAME : undefined;
}

/**
 * @param {string} url
 * @param {{ method?: string, body?: unknown, timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, status: number, json: () => any }>}
 */
export function peerRequest(url, { method = "GET", body, timeoutMs = 5000 } = {}) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const headers = { "accept-encoding": "identity" };
  if (payload !== undefined) {
    headers["content-type"] = "application/json";
    headers["content-length"] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const req = client.request(
      target,
      { method, headers, timeout: timeoutMs, servername: peerServername(target.hostname) },
      (res) => {
        const encoding = res.headers["content-encoding"];
        if (encoding && encoding !== "identity") {
          res.destroy();
          reject(new Error(`Refused ${encoding}-encoded response from ${target.host}`));
          return;
        }
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            res.destroy(new Error(`Response from ${target.host} exceeds ${MAX_RESPONSE_BYTES} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: () => JSON.parse(text),
          });
        });
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error(`Request to ${target.host} timed out after ${timeoutMs}ms`)));
    req.on("error", reject);
    req.end(payload);
  });
}
