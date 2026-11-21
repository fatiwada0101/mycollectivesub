# MyCollectiveSub Router Connector — Standalone Desktop App (Phase 3 / ZT-3.1)

Packages `router-connector/` + `lib/routeros-api.js` + `lib/voucher-expiry.js` into a standalone Windows `.exe`, macOS `.dmg`, or Linux `.AppImage` so field technicians never need Node.js installed on their laptop.

## Build Standalone Installer

```bash
cd desktop
npm install
npm run dist:win    # Generates Windows NSIS installer (.exe) in desktop/dist/
# npm run dist:mac  # macOS .dmg
# npm run dist:linux # Linux .AppImage
```

## Run Locally in Dev Mode
```bash
cd desktop
npm install
npm start
```
