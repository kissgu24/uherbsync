import * as SQLite from 'expo-sqlite';
import type { SubItem } from '../contexts/CategoriesContext';
import { detectPlatform } from '../constants/affiliate';

// ─── Shared Types ─────────────────────────────────────────────────────────────

export type CategoryItem = {
  id: string;
  name: string;
  nameEn: string;
  maxDays: number;
  dailyDose: number;
  doseUnit: string;
  timing: string;
  iherbUrl: string;
  subItems: SubItem[];
};

export type OrderRecord = {
  id: string;
  date: string;
  discountCode: string;
  totalAmount: number;
  isOverseas: boolean;
  items: Array<{
    categoryName: string;
    productName: string;
    qty: number;
    unitPrice: number;
    amount: number;
    brand: string;
    spec: string;
  }>;
};

// ─── Connection ───────────────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;
let _openPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let _initPromise: Promise<void> | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (!_openPromise) {
    _openPromise = SQLite.openDatabaseAsync('uherbsync.db').then(db => {
      _db = db;
      return db;
    });
  }
  return _openPromise;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initDB(): Promise<void> {
  if (!_initPromise) {
    _initPromise = _runInitDB();
  }
  return _initPromise;
}

async function _runInitDB(): Promise<void> {
  const db = await getDB();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS categories (
      sort_order INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS category_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_en TEXT NOT NULL DEFAULT '',
      max_days INTEGER NOT NULL DEFAULT 30,
      daily_dose INTEGER NOT NULL DEFAULT 1,
      dose_unit TEXT NOT NULL DEFAULT '顆',
      timing TEXT NOT NULL DEFAULT '飯後',
      iherb_url TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS sub_items (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT '',
      spec TEXT NOT NULL DEFAULT '',
      remaining INTEGER NOT NULL DEFAULT 0,
      bottle_size INTEGER NOT NULL DEFAULT 30,
      dose_unit TEXT NOT NULL DEFAULT '顆',
      iherb_url TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (category_id) REFERENCES category_items(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      discount_code TEXT NOT NULL DEFAULT '',
      total_amount REAL NOT NULL DEFAULT 0,
      items_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS product_sources (
      id               TEXT    PRIMARY KEY,
      category_item_id TEXT    NOT NULL,
      platform         TEXT    NOT NULL DEFAULT 'iherb',
      url              TEXT    NOT NULL DEFAULT '',
      price            REAL,
      priority         INTEGER NOT NULL DEFAULT 0,
      is_default       INTEGER NOT NULL DEFAULT 0,
      source_type      TEXT    NOT NULL DEFAULT 'user',
      last_used_at     TEXT,
      created_at       TEXT,
      updated_at       TEXT,
      FOREIGN KEY (category_item_id) REFERENCES category_items(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS event_logs (
      id          TEXT PRIMARY KEY,
      user_id     TEXT,
      event_type  TEXT NOT NULL,
      target_type TEXT,
      target_id   TEXT,
      context_json TEXT,
      created_at  TEXT NOT NULL
    );
  `);

  const dbVersion = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = dbVersion?.user_version ?? 0;

  // Migration v1: is_active on sub_items (legacy try/catch — no version tag was set at the time)
  try {
    await db.execAsync('ALTER TABLE sub_items ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration v2: is_overseas on orders
  if (version < 2) {
    try {
      await db.execAsync('ALTER TABLE orders ADD COLUMN is_overseas INTEGER NOT NULL DEFAULT 0');
    } catch {
      // Column already exists — safe to ignore
    }
    await db.execAsync('PRAGMA user_version = 2');
  }

  // Migration v3: source_id on orders and sub_items
  if (version < 3) {
    try {
      await db.execAsync('ALTER TABLE orders ADD COLUMN source_id TEXT');
    } catch {
      // Column already exists — safe to ignore
    }
    try {
      await db.execAsync('ALTER TABLE sub_items ADD COLUMN source_id TEXT');
    } catch {
      // Column already exists — safe to ignore
    }
    await db.execAsync('PRAGMA user_version = 3');
  }

  // Seed default settings (no-op if key already exists)
  await db.runAsync(
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('default_restock_platform', 'iherb')`
  );
  await db.runAsync(
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('show_beginner_guide', '1')`
  );

  // Seed default categories on fresh install (no-op if already populated)
  const catCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM categories'
  );
  if ((catCount?.count ?? 0) === 0) {
    const defaults = ['NMN', 'Omega-3', '維生素D3+K2', '益生菌', 'Apigenin', '其他'];
    for (let i = 0; i < defaults.length; i++) {
      await db.runAsync(
        'INSERT INTO categories (sort_order, name) VALUES (?, ?)',
        [i, defaults[i]]
      );
    }
  }
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function loadCategories(): Promise<string[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<{ name: string }>(
    'SELECT name FROM categories ORDER BY sort_order ASC'
  );
  return rows.map(r => r.name);
}

export async function saveCategories(cats: string[]): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM categories');
  for (let i = 0; i < cats.length; i++) {
    await db.runAsync(
      'INSERT INTO categories (sort_order, name) VALUES (?, ?)',
      [i, cats[i]]
    );
  }
}

// ─── Category Items ───────────────────────────────────────────────────────────

export async function loadCategoryItems(): Promise<CategoryItem[]> {
  const db = await getDB();
  const cats = await db.getAllAsync<{
    id: string; name: string; name_en: string;
    max_days: number; daily_dose: number; dose_unit: string;
    timing: string; iherb_url: string;
  }>('SELECT * FROM category_items');

  const result: CategoryItem[] = [];
  for (const cat of cats) {
    const subs = await db.getAllAsync<{
      id: string; brand: string; spec: string;
      remaining: number; bottle_size: number; dose_unit: string; iherb_url: string;
      is_active: number;
    }>('SELECT * FROM sub_items WHERE category_id = ?', [cat.id]);

    result.push({
      id: cat.id,
      name: cat.name,
      nameEn: cat.name_en,
      maxDays: cat.max_days,
      dailyDose: cat.daily_dose,
      doseUnit: cat.dose_unit,
      timing: cat.timing,
      iherbUrl: cat.iherb_url,
      subItems: subs.map(s => ({
        id: s.id,
        brand: s.brand,
        spec: s.spec,
        remaining: s.remaining,
        bottleSize: s.bottle_size,
        doseUnit: s.dose_unit,
        iherbUrl: s.iherb_url,
        isActive: s.is_active !== 0,
      })),
    });
  }
  return result;
}

export async function saveCategoryItems(items: CategoryItem[]): Promise<void> {
  const db = await getDB();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM sub_items');
    await db.runAsync('DELETE FROM category_items');
    for (const cat of items) {
      await db.runAsync(
        `INSERT INTO category_items
         (id, name, name_en, max_days, daily_dose, dose_unit, timing, iherb_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [cat.id, cat.name, cat.nameEn, cat.maxDays, cat.dailyDose,
         cat.doseUnit, cat.timing, cat.iherbUrl]
      );
      for (const sub of cat.subItems) {
        await db.runAsync(
          `INSERT INTO sub_items
           (id, category_id, brand, spec, remaining, bottle_size, dose_unit, iherb_url, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [sub.id, cat.id, sub.brand, sub.spec, sub.remaining,
           sub.bottleSize, sub.doseUnit, sub.iherbUrl, sub.isActive ? 1 : 0]
        );
      }
    }
  });
}

export async function updateSubItemRemaining(subItemId: string, remaining: number): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE sub_items SET remaining = ? WHERE id = ?', [remaining, subItemId]);
}

export async function updateSubItemActive(subItemId: string, isActive: boolean): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE sub_items SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, subItemId]);
}

export async function updateSubItemBrandSpec(id: string, brand: string, spec: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE sub_items SET brand = ?, spec = ? WHERE id = ?', [brand, spec, id]);
}

async function applyDailyDeduction(): Promise<boolean> {
  const db = await getDB();
  const today = new Date().toISOString().split('T')[0];
  const lastDate = await getSetting('last_deduct_date');

  if (lastDate === today) return false;

  try {
    await db.withTransactionAsync(async () => {
      await db.runAsync(`
        UPDATE sub_items
        SET remaining = MAX(
          0,
          remaining - COALESCE((
            SELECT daily_dose FROM category_items
            WHERE category_items.id = sub_items.category_id
          ), 0)
        )
        WHERE is_active = 1;
      `);
      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);',
        ['last_deduct_date', today]
      );
    });
    return true;
  } catch (error) {
    console.error('Daily deduction failed:', error);
    return false;
  }
}

export async function runDailyDeductionIfNeeded(): Promise<boolean> {
  return applyDailyDeduction();
}

export async function updateCategoryDose(id: string, dailyDose: number, doseUnit: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'UPDATE category_items SET daily_dose = ?, dose_unit = ? WHERE id = ?',
    [dailyDose, doseUnit, id]
  );
}

export async function updateCategoryTiming(id: string, timing: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE category_items SET timing = ? WHERE id = ?', [timing, id]);
}

// ─── Product Sources ──────────────────────────────────────────────────────────

export async function upsertProductSource(params: {
  categoryItemId: string;
  url: string;
}): Promise<void> {
  const trimmedUrl = params.url.trim();
  if (!trimmedUrl) return;

  const db = await getDB();
  const now = new Date().toISOString();
  const platform = detectPlatform(trimmedUrl) ?? 'iherb';

  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM product_sources WHERE category_item_id = ? AND url = ?',
    [params.categoryItemId, trimmedUrl]
  );

  if (existing) {
    await db.runAsync('UPDATE product_sources SET updated_at = ? WHERE id = ?', [now, existing.id]);
    return;
  }

  const countRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM product_sources WHERE category_item_id = ?',
    [params.categoryItemId]
  );
  const isDefault = (countRow?.count ?? 0) === 0 ? 1 : 0;
  const id = `src_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  await db.runAsync(
    `INSERT INTO product_sources
       (id, category_item_id, platform, url, is_default, source_type, created_at, updated_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, 'user', ?, ?, ?)`,
    [id, params.categoryItemId, platform, trimmedUrl, isDefault, now, now, now]
  );
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function appendOrder(order: OrderRecord): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO orders (id, date, discount_code, total_amount, items_json, is_overseas)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [order.id, order.date, order.discountCode,
     order.totalAmount, JSON.stringify(order.items), order.isOverseas ? 1 : 0]
  );
}

export async function updateOrderOverseas(id: string, isOverseas: boolean): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE orders SET is_overseas = ? WHERE id = ?', [isOverseas ? 1 : 0, id]);
}

export async function deleteOrder(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM orders WHERE id = ?', [id]);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?', [key]
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, value]
  );
}

export async function loadOrders(): Promise<OrderRecord[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<{
    id: string; date: string; discount_code: string;
    total_amount: number; items_json: string; is_overseas: number;
  }>('SELECT * FROM orders ORDER BY date DESC');
  return rows.map(r => ({
    id: r.id,
    date: r.date,
    discountCode: r.discount_code,
    totalAmount: r.total_amount,
    isOverseas: r.is_overseas === 1,
    items: JSON.parse(r.items_json),
  }));
}

// ─── Product URL ──────────────────────────────────────────────────────────────

export async function getProductUrl(subItemId: string, fallbackUrl: string): Promise<string> {
  const db = await getDB();
  try {
    const row = await db.getFirstAsync<{ url: string }>(
      `SELECT ps.url
         FROM product_sources ps
         JOIN sub_items si ON si.source_id = ps.id
        WHERE si.id = ?`,
      [subItemId]
    );
    return row?.url || fallbackUrl;
  } catch (error) {
    console.error('Failed to get product URL from DB:', error);
    return fallbackUrl;
  }
}

// ─── Event Logs ───────────────────────────────────────────────────────────────

export async function logEvent(params: {
  event_type: string;
  target_type?: string;
  target_id?: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = await getDB();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const createdAt = new Date().toISOString();
    const contextJson = params.context != null ? JSON.stringify(params.context) : null;
    await db.runAsync(
      `INSERT INTO event_logs (id, user_id, event_type, target_type, target_id, context_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        null,
        params.event_type,
        params.target_type ?? null,
        params.target_id ?? null,
        contextJson,
        createdAt
      ]
    );
  } catch (error) {
    console.error('Failed to log event:', error);
  }
}
