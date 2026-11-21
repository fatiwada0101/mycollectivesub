# MyCollectiveSub — Android APK Native Wi-Fi Onboarding Plugin (Phase 3 / ZT-3.2)

Enables Mikroticket-style onboarding directly from an Android phone connected to a brand-new MikroTik router's Wi-Fi (`192.168.88.1`).

## How It Works
- `android/MikroTikLocalPlugin.java` registers a native Capacitor plugin (`MikroTikLocal`) using Android's `java.net.Socket` to talk directly over RouterOS Binary API port `8728` (zero browser CORS or HTTPS certificate restrictions).
- `src/mikrotik-native.js` orchestrates the exact same 8-step zero-touch onboarding sequence as the Desktop Connector, pulling `FIRST_LOGIN_SCRIPT` (`# AN voucher expiry v3`) and `EXPIRY_SWEEP_SCRIPT` (`an-voucher-expiry-v1`) directly from `lib/voucher-expiry.js`.

## Build Steps (Capacitor + Android Studio / `android` CLI)
1. Initialize Capacitor in `mobile/`:
   ```bash
   cd mobile
   npm init -y
   npm install @capacitor/core @capacitor/cli @capacitor/android
   npx cap add android
   ```
2. Copy `android/MikroTikLocalPlugin.java` into `mobile/android/app/src/main/java/ng/com/mycollectivesub/admin/MikroTikLocalPlugin.java` and register it in `MainActivity.java` via `registerPlugin(MikroTikLocalPlugin.class);`.
3. Ensure `<uses-permission android:name="android.permission.INTERNET" />` is in `AndroidManifest.xml`.
4. Build debug/release APK:
   ```bash
   npx cap sync android
   cd android && ./gradlew assembleRelease
   ```
