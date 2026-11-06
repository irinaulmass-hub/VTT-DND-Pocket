# Security Policy

## Supported Versions

Only the latest release is actively maintained and receives security updates.

| Version | Supported |
|---------|-----------|
| 2.2.1   | ✅ Yes — current supported release |
| < 2.2.1 | ❌ No — unsupported, contains known vulnerabilities |

## Security Hardening (v2.2.1)

The following vulnerabilities were identified and resolved in v2.2.1:

| Issue | Severity | Fix |
|-------|----------|-----|
| `/server.js`, `/seeds/*.json`, `/package.json` publicly readable via static file serving | Critical | Blocking middleware added before static handler — returns 403 Forbidden for sensitive paths (`/server.js`, `/package.json`, `/package-lock.json`, `/seeds/*`, `/node_modules/*`, `/.git/*`) |
| Any LAN client could send DM actions over WebSocket without authentication | High | DM identity auto-detected from HTTP upgrade cookie (`dm_token`); a `DM_ACTIONS` allowlist silently drops unauthenticated DM commands |
| `innerHTML` used with unsanitized initiative names, class labels, condition names, audio category headers, and scene search terms | Medium | `escHtml()` helper added to `dm/app.js`; all five injection points sanitized |

## Reporting a Vulnerability

This is a local-network D&D companion app intended for use on a private intranet. If you identify a security issue:

1. Do **not** open a public GitHub issue.
2. Contact the repository owner directly.
3. Include a description of the vulnerability, steps to reproduce, and potential impact.

Fixes will be addressed in the next patch release.
