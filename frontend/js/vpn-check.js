// vpn-check.js — best-effort client-side VPN / datacenter detection
// Returns { blocked: boolean, reason: string } or { blocked:false } on failures.

async function checkVpnBestEffort() {
  // Try multiple free endpoints (no API key required usually) — some may be rate-limited.
  const endpoints = [
    "https://ipapi.co/json/",
    "https://ipinfo.io/json",
    "https://geolocation-db.com/json/"
  ];

  let info = null;
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep, { cache: "no-store" , mode: "cors" });
      if (!r.ok) continue;
      const j = await r.json();
      info = Object.assign({}, j);
      break;
    } catch (e) {
      // ignore and try next
    }
  }

  if (!info) {
    // Unknown (no detection possible) — don't block
    return { blocked: false };
  }

  // heuristics: if org/hostname looks like cloud or proxy, block.
  const tests = [];
  const org = (info.org || info.hostname || info.orgname || info.network || "").toString().toLowerCase();
  const ip = (info.ip || info.IP || info.ip_address || "").toString();

  tests.push(org);
  tests.push(ip);

  const suspicious = [
    "digitalocean", "amazon", "aws", "amazonaws", "google", "azure", "microsoft", "ovh", "linode", "hetzner",
    "cloud", "vps", "hosting", "hosting", "virtual", "vpn", "prox", "proxy", "tor", "cloudflare", "colo"
  ];

  for (const t of suspicious) {
    if (!t) continue;
    if (org.includes(t)) {
      // Reason found
      return { blocked: true, reason: `VPN/proxy detected (${t})` };
    }
  }

  // If ASN looks like data center (ipinfo returns asn sometimes)
  if ((info.asn || "").toString().toLowerCase().includes("asn")) {
    // don't block by default
  }

  // Otherwise allow
  return { blocked: false };
}
