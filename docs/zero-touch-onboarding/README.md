# Zero-Touch MikroTik Router Onboarding & Multi-VPS Hub

> **Initiative:** Mikroticket-Style Plug & Play Router Onboarding (Zero SSH, Zero Manual Scripts)  
> **Platform:** MyCollectiveSub (Next.js 16 + Supabase + MikroTik RouterOS 7.12+ + WireGuard Multi-VPS)  
> **Default Expiry Policy:** Strict First-Login Wall-Clock Expiry (`# AN voucher expiry v3` + 10s `an-voucher-expiry-v1` sweep) + Seamless MAC-Cookie Auto-Reconnect (`4w2d`)

---

## Folder Index

| Document | Purpose |
| :--- | :--- |
| [PROGRESS.md](PROGRESS.md) | Live feature & phase status tracker (updated as each milestone ships & passes tests) |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Complete phased architecture, database schema, API contracts, local connector design, and test plan |
| [KNOWLEDGE_BASE.md](KNOWLEDGE_BASE.md) | Deep technical reference: RouterOS Binary API (`8728`) & REST (`443`), WireGuard Multi-VPS automation, strict expiry invariants, security model, and runbook |
| [../MikroTik_First_Login_Expiry_and_MAC_Cookie_Guide.pdf](../MikroTik_First_Login_Expiry_and_MAC_Cookie_Guide.pdf) | Standalone PDF engineering blueprint & copy-paste AI coding agent prompt for strict first-login expiry & MAC-cookie reconnect |

---

## Core Product Goals

1. **Zero-SSH Multi-VPS Scaling:** Register a 1st, 2nd, or Nth Ubuntu VPS once by pasting its Provisioner URL and API secret in Super Admin. Every new router automatically registers its WireGuard peer and port mapping on that VPS via HTTPS API — never SSH again.
2. **Mikroticket-Style Local Onboarding (IP + Username + Password Only):** While connected to a brand-new MikroTik router's Wi-Fi/LAN, open the Local Router Connector, enter `Router IP`, `Username`, `Password`, and pick a VPS Hub. The connector talks directly to RouterOS (Binary API `8728` or REST `443`/`80`), generates the router's WireGuard key, registers it on the VPS, brings up the cloud tunnel, and applies every hotspot & expiry setting automatically.
3. **1-Line Cloud Bootstrap Fallback:** Even without installing the Local Connector, Super Admin can generate a single-use 15-minute signed bootstrap URL (`/tool fetch`) that configures the router and auto-registers its WireGuard peer on the VPS automatically.
4. **Strict First-Login Wall-Clock Expiry & MAC-Cookie Defaulted Everywhere:** Every router onboarded through any path automatically ships with:
   - `login-by=cookie,http-chap,http-pap,mac-cookie` & `http-cookie-lifetime=4w2d` on all hotspot server profiles
   - `add-mac-cookie=yes`, `mac-cookie-timeout=4w2d`, `keepalive-timeout=2m` on all hotspot user profiles
   - `# AN voucher expiry v3` `on-login` hook on **all** profiles (locking wall-clock expiry on first login for both `ANV1|` vouchers and any `limit-uptime` voucher, while skipping unlimited accounts like `admin`)
   - `an-voucher-expiry-v1` 10-second startup sweep scheduler enforcing offline & online cutoffs with cookie purges
5. **Zero Regression:** Existing routers (`Sabon Layi`), wallet/Flutterwave/Monnify payments, Voucher Factory, roaming, and all 85+ tests stay 100% unbroken.
