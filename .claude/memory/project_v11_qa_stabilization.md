---
name: V1.1 QA and Release Stabilization — findings and fixes
description: Engineering QA session for V1.1 Android release candidate; bugs fixed and known deferred issues
type: project
originSessionId: 1e44c01b-6953-46f3-a898-1646c80138c5
---
All fixes applied in one session on 2026-05-07.

**Why:** Preparing for Android release candidate build. Goal was crash prevention and release stability, no feature additions.

**How to apply:** Reference when resuming V1.1 work or planning V1.2.

---

## Bugs Fixed

### db.ts
- `saveCategoryItems` now wrapped in `db.withTransactionAsync()` — previously a crash mid-write would partially delete inventory data
- Source_id migrations now version-gated (v3) instead of running try/catch on every startup
- Migration version tracking now reads `PRAGMA user_version` once at top; v2 and v3 blocks both run on fresh install (version=0) then are skipped on subsequent startups

### SettingsScreen.tsx
- Dev-test "模擬每日扣除" section gated behind `__DEV__` — was shipping in all builds

### CategoriesContext.tsx
- Removed 4 debug `console.log` statements

### ReplenishScreen.tsx
- Removed 3 debug `console.log` statements
- Added `linkBlurred: boolean` field to `EntryRow` — "unrecognized link" error now only shows AFTER the user blurs the input and async parse completes (previously showed while typing momo/shopee/coupang URLs)
- Fixed OFF-country override leak: when country=OFF, `activeTaxThreshold` and `activeShippingThreshold` now force to 0 regardless of stored override values (previously stale TW/JP/KR overrides could show threshold UI in OFF mode)

### RecordScreen.tsx
- Removed async `getProductUrl('', fallback)` call — was always returning fallback (empty subItemId never matches DB join). Now directly calls `buildRestockUrl`.
- Removed unused `getProductUrl` import

### utils/urlParser.ts
- Removed hardcoded `brand: 'Kirkland'` in `parseCostco` — Costco Taiwan stocks non-Kirkland items. Changed to empty string so user fills in manually.

---

## Release Build Configuration (set 2026-05-07)

- `app.json`: version "1.1.0", versionCode 3
- `build.gradle`: versionCode 3, versionName "1.1.0"
- `gradle.properties`: minify=true, shrinkResources=true, EX_DEV_CLIENT_NETWORK_INSPECTOR removed
- `eas.json` created: development / preview (APK) / production (AAB) profiles
- `proguard-rules.pro` hardened for React Native New Arch, expo modules, Firebase
- APK output: `android/app/build/outputs/apk/release/app-release.apk`, 68.73 MB, 4 ABIs
- Hermes bytecode confirmed: magic bytes C6 1F BC 03
- `__DEV__` appears once in Hermes string table (framework property key for `global.__DEV__`), NOT a debug code leak
- `initDB()` now has a singleton `_initPromise` guard — safe for concurrent callers (LanguageContext + CategoriesContext both call it at startup)
- Release build signing: still uses debug keystore — must replace with production keystore before Play Store submission

## Known Deferred Issues (V1.2 candidates)

- **Timezone edge case**: Order dates stored as UTC ISO strings. Users in UTC+8 near midnight may see an order land in the "wrong" H1/H2 half-year bucket. Fixing requires storing local date separately.
- **Amazon short URLs (amzn.to)**: Not resolved by the new-platform async parser (Amazon not in `utils/urlParser.ts` platform list). Shows linkError after blur. User must paste the full amazon.com URL.
- **loadCategoryItems N+1**: One DB query per category for sub_items. Acceptable for V1.1 item counts; for V1.2 rewrite with a single JOIN query.
- **Theme constants duplicated**: Each screen re-declares the same `C = { bg, card, border, ... }` theme object. Should be extracted to a shared constants file in V1.2.
- **No automated tests**: No unit or integration tests exist. Migration safety was verified by manual trace only.
