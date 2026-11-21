# Zero-Touch Onboarding & Multi-VPS Feature Status Tracker

> **Last Updated:** 2026-11-21  
> **Legend:** ⬜ Not Started | 🟡 In Progress | ✅ Complete | 🧪 Verified in Tests | 🚀 Live on Router

---

## Phase 0: Core Expiry & MAC-Cookie Defaults (Foundation)

| ID | Feature | Status | Files / Artifacts | Verification |
| :--- | :--- | :---: | :--- | :--- |
| ZT-0.1 | Seamless MAC-Cookie Auto-Reconnect (`4w2d`, `2m` keepalive) | 🚀 | `lib/mikrotik.js`, `lib/router-voucher-expiry.js`, `app/api/mikrotik/auto-setup/route.js`, `app/api/mikrotik/kick-user/route.js` | Live on `Sabon Layi` (12/12 profiles, 2/2 server profiles) + `npm test` |
| ZT-0.2 | Strict First-Login Wall-Clock Expiry v3 (online & offline, all current & future profiles + legacy `limit-uptime` fallback) | 🚀 | `lib/voucher-expiry.js`, `lib/router-voucher-expiry.js`, `lib/mikrotik.js`, `app/api/purchase/*`, `app/api/super-admin/plans/route.js`, `app/api/vouchers/*` | Live on `Sabon Layi` (`364/364` vouchers covered, `0` overdue active) + `54/54` tests |
| ZT-0.3 | Engineering Blueprint PDF & AI Agent Prompt | ✅ | `docs/MikroTik_First_Login_Expiry_and_MAC_Cookie_Guide.pdf` | 8-page PDF visually inspected |
| ZT-0.4 | Knowledge Base, Feature Tracker & Implementation Plan Folder | ✅ | `docs/zero-touch-onboarding/{README,PROGRESS,IMPLEMENTATION_PLAN,KNOWLEDGE_BASE}.md` | Created & maintained in-repo |

---

## Phase 1: Zero-SSH Multi-VPS WireGuard Auto-Provisioner

| ID | Feature | Status | Target Files | Notes |
| :--- | :--- | :---: | :--- | :--- |
| ZT-1.1 | Idempotent Supabase Migration (`vps_hubs` table with RLS + `routers` tunnel/onboarding columns + atomic slot allocator RPC) | 🚀 | `supabase/migrations/20261121000001_zero_touch_vps_hubs.sql`, `scripts/apply-migration.mjs` | Applied live to Supabase `ltwzvsaooyuuetaakfbv` (`vps_hubs_rls=true`, 6 router cols, RPC active) + verified in PGlite |
| ZT-1.2 | Self-Contained VPS WireGuard Provisioner Daemon & 1-Command Ubuntu Installer (`wg set` live peer add/remove + iptables DNAT + UFW) | 🧪 | `vps-provisioner/server.mjs`, `vps-provisioner/install.sh`, `vps-provisioner/README.md` | Zero npm deps, tested via HTTP `DRY_RUN=1` suite |
| ZT-1.3 | Cloud Multi-VPS Client & Conflict-Free Slot Allocator | 🧪 | `lib/vps-hub.js` | Supports 1 to N VPS hubs, live health check, auto-fetches WG public key, masks secrets |
| ZT-1.4 | Super Admin Multi-VPS Management API (`GET/POST/PUT/PATCH/DELETE` + live health test) | ✅ | `app/api/super-admin/vps-hubs/route.js` | Admin JWT auth, masked `api_secret` in responses, graceful migration detection |

---

## Phase 2: Zero-Touch Router Onboarding Engine & Local Plug-and-Play Connector

| ID | Feature | Status | Target Files | Notes |
| :--- | :--- | :---: | :--- | :--- |
| ZT-2.1 | Unified Zero-Touch RouterOS v7.12+ Script Generator (WireGuard + SSL/REST + NTP + MAC-Cookie + Strict Expiry v3 + Watchdog + Callback) | 🧪 | `lib/zero-touch-onboarding.js` | Pulls `FIRST_LOGIN_SCRIPT` & `EXPIRY_SWEEP_SCRIPT` directly from `lib/voucher-expiry.js` |
| ZT-2.2 | Cloud Onboarding & Bootstrap APIs (Local Connector registration + single-use 15-min `.rsc` bootstrap + auto VPS callback + delete peer revocation) | ✅ | `app/api/super-admin/routers/onboard/route.js`, `app/api/onboarding/bootstrap/route.js`, `app/api/super-admin/routers/route.js`, `middleware.js` | SHA-256 hashed single-use tokens, CSRF-exempt callback |
| ZT-2.3 | Pure-Node MikroTik Binary API (`8728`/`8729`) + REST (`443`/`80`) Local Client | 🧪 | `lib/routeros-api.js` | Zero npm deps; verified against mock RouterOS TCP server |
| ZT-2.4 | Local "Plug & Play" Router Connector App (`IP + Username + Password -> Auto-Configure`) | ✅ | `router-connector/server.mjs`, `router-connector/index.html`, `router-connector/Launch-Router-Connector.bat`, `router-connector/README.md` | Mikroticket-style local Wi-Fi onboarding (`npm run connector`) |
| ZT-2.5 | Modular Super Admin UI for Multi-VPS Hubs & Zero-Touch Onboarding | ✅ | `app/super-admin/components/ZeroTouchHubPanel.js` (mounted inside `LocationsTab.js`) | Zero lines added to `app/super-admin/page.js` |
| ZT-2.6 | Automated Zero-Regression Test Suite | 🧪 | `test/zero-touch-onboarding.test.mjs`, `package.json` | Integrated into `npm test` (`31/31` + `60/60`) |

---

## Phase 3: Native Packaged Installers & Zero-SSH Cloud-Init VPS Auto-Enrollment

| ID | Feature | Status | Target Scope | Notes |
| :--- | :--- | :---: | :--- | :--- |
| ZT-3.1 | Electron Standalone Desktop App Wrapper (`desktop/`) | ✅ | `desktop/package.json`, `desktop/main.mjs`, `desktop/README.md` | Wraps `router-connector/` + `lib/routeros-api.js` into Windows `.exe` / macOS `.dmg` / Linux `.AppImage` (`npm run dist:win`) |
| ZT-3.2 | Capacitor Android Native Local TCP `8728` Plugin (`mobile/`) | ✅ | `mobile/capacitor.config.json`, `mobile/android/MikroTikLocalPlugin.java`, `mobile/src/mikrotik-native.js`, `mobile/README.md` | Native Android Wi-Fi Binary API client with strict First-Login Expiry v3 + MAC-Cookie defaults |
| ZT-3.3 | Zero-SSH Cloud-Init VPS Self-Registration API & Super Admin UI | 🧪 | `app/api/super-admin/vps-hubs/bootstrap/route.js`, `app/api/onboarding/vps-installer/route.js`, `ZeroTouchHubPanel.js` | Generates Cloud-Init YAML & 1-line curl installer; VPS self-registers its IP, WireGuard key & API secret automatically |
