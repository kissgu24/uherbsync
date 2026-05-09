---
name: V1.1 Final Release — Google Play submission config
description: Package name, signing, AAB path, affiliate codes, and next steps for iOS
type: project
originSessionId: 28fb5cf4-e427-4434-8f92-d172e57df6f4
---
Package name confirmed as `com.kissgu24.uherbsync` (was `com.uherbsync.app` — corrected to match Play Console registration).

**Why:** Google Play Console app was created with `com.kissgu24.uherbsync`; the old name caused AAB rejection.

**How to apply:** Always use `com.kissgu24.uherbsync` for any build or Play Console reference.

---

## Build Identity

- **applicationId**: com.kissgu24.uherbsync
- **versionName**: 1.1.0
- **versionCode**: 3
- **Signing**: Production signed via `signingConfigs.release` (NOT debug keystore)
- **Keystore file**: `android/app/uherbsync-upload.keystore` — protected by `.gitignore` (*.keystore rule)
- **Keystore alias**: uherbsync-upload
- **Google Play submission file**: `android/app/build/outputs/bundle/release/app-release.aab`

## Signing Config Persistence Warning

`expo prebuild --clean` regenerates the entire `android/` folder, wiping the signing config. After every prebuild --clean:
1. Re-apply `signingConfigs.release` block to `android/app/build.gradle`
2. Re-add keystore credentials to `android/gradle.properties`
3. Copy `uherbsync-upload.keystore` back to `android/app/`

The signing config template (without passwords) is committed at `android/app/build.gradle` in git as reference.

## Affiliate Codes

- **Amazon**: `uherbsync-20`
- **iHerb**: 審核中（Partnerize 経由）

## Mac Migration Status (as of 2026-05-09)

Mac 移行完了済み：
- Node.js インストール済み
- Homebrew インストール済み
- Expo CLI インストール済み
- Claude Code インストール済み

## Next Steps

- iOS 開発：Xcode インストール待ち（Mac 側）
- iHerb affiliate 審査完了後にコード設定
