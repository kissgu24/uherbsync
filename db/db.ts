import * as SQLite from 'expo-sqlite';
import type { SubItem } from '../contexts/CategoriesContext';

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

export async function initDB(): Promise<void> {
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
  `);

  // Migration: add is_active if upgrading from older schema
  try {
    await db.execAsync('ALTER TABLE sub_items ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
  } catch {
    // Column already exists — safe to ignore
  }

  // Seed default settings (no-op if key already exists)
  await db.runAsync(
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('default_restock_platform', 'iherb')`
  );
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
}

export async function updateSubItemRemaining(subItemId: string, remaining: number): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE sub_items SET remaining = ? WHERE id = ?', [remaining, subItemId]);
}

export async function updateSubItemActive(subItemId: string, isActive: boolean): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE sub_items SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, subItemId]);
}

export async function runDailyDeductionIfNeeded(): Promise<boolean> {
  const db = await getDB();
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = await getSetting('last_deduct_date');
  if (lastDate === today) return false;

  const cats = await db.getAllAsync<{ id: string; daily_dose: number }>(
    'SELECT id, daily_dose FROM category_items'
  );
  for (const cat of cats) {
    const subs = await db.getAllAsync<{ id: string; remaining: number }>(
      'SELECT id, remaining FROM sub_items WHERE category_id = ? AND is_active = 1',
      [cat.id]
    );
    for (const sub of subs) {
      const newRemaining = Math.max(0, sub.remaining - cat.daily_dose);
      await db.runAsync('UPDATE sub_items SET remaining = ? WHERE id = ?', [newRemaining, sub.id]);
    }
  }
  await setSetting('last_deduct_date', today);
  return true;
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

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function appendOrder(order: OrderRecord): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO orders (id, date, discount_code, total_amount, items_json)
     VALUES (?, ?, ?, ?, ?)`,
    [order.id, order.date, order.discountCode,
     order.totalAmount, JSON.stringify(order.items)]
  );
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
    total_amount: number; items_json: string;
  }>('SELECT * FROM orders ORDER BY date DESC');
  return rows.map(r => ({
    id: r.id,
    date: r.date,
    discountCode: r.discount_code,
    totalAmount: r.total_amount,
    items: JSON.parse(r.items_json),
  }));
}
