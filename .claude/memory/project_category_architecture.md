---
name: Category architecture decision (V1.1 vs V1.2)
description: Why categories/category_items dual-table sync is deferred and what ReplenishScreen currently does
type: project
originSessionId: 7129de31-3c0e-4d2c-807f-417925eccac5
---
ReplenishScreen correctly uses `useCategories().categories` (→ `loadCategories()` → `categories` table). No hardcoded static arrays remain in the UI layer. Task verified complete for V1.1.

**Why:** Refactoring `CategoriesContext` to derive its list directly from `category_items` (eliminating the separate `categories` table) was evaluated and deliberately deferred.

**Decision:** Single-source refactor (`categories` table → `category_items` names) is scheduled for **V1.2** to avoid architectural churn during V1.1 stabilization.

**How to apply:** Do not suggest collapsing the two tables or changing `CategoriesContext`'s data source until V1.2 work begins. The current dual-table sync via `addCategory`/`renameCategory`/`removeCategory` is intentional and load-bearing for V1.1.

---

**Confirmed by source trace (2026-05-07):**
- `categories` table: seeded by `initDB()` (db.ts:153–161), guard = `COUNT(*) === 0`
- `category_items` table: seeded by DashboardScreen `useEffect` (line 918–919) with `INITIAL_ITEMS`, guard = `loadCategoryItems().length === 0`
- The two tables can diverge independently — this is expected and by design for V1.1
- "Old" user data (e.g. Fisetin) persists in `category_items` because SQLite survives Metro/bundle cache clears; only Android Clear Data / full reinstall wipes it
- No runtime bug confirmed; dual-table split is working as designed
