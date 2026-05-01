import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { initDB, loadCategories, saveCategories } from '../db/db';

const INIT_CATEGORIES = ['NMN', 'Omega-3', '維生素D3+K2', '益生菌', 'Apigenin', '其他'];

export type SubItem = {
  id: string;
  brand: string;
  spec: string;
  remaining: number;
  bottleSize: number;
  doseUnit: string;
  iherbUrl: string;
  isActive: boolean;
};

type PendingEntry = { categoryName: string; subItem: SubItem };

type CategoriesCtx = {
  categories: string[];
  isReady: boolean;
  addCategory: (name: string) => void;
  renameCategory: (oldName: string, newName: string) => void;
  removeCategory: (name: string) => void;
  addPendingItem: (categoryName: string, subItem: SubItem) => void;
  consumePendingItems: () => PendingEntry[];
};

const CategoriesContext = createContext<CategoriesCtx>({
  categories: INIT_CATEGORIES,
  isReady: false,
  addCategory: () => {},
  renameCategory: () => {},
  removeCategory: () => {},
  addPendingItem: () => {},
  consumePendingItems: () => [],
});

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<string[]>(INIT_CATEGORIES);
  const [isReady, setIsReady] = useState(false);
  const pendingRef = useRef<PendingEntry[]>([]);

  useEffect(() => {
    (async () => {
      await initDB();
      const saved = await loadCategories();
      if (saved.length > 0) {
        setCategories(saved);
      } else {
        await saveCategories(INIT_CATEGORIES);
        // state already equals INIT_CATEGORIES — no setCategories needed
      }
      setIsReady(true);
    })();
  }, []);

  function addCategory(name: string) {
    setCategories(prev => {
      if (prev.includes(name)) return prev;
      const withoutOther = prev.filter(c => c !== '其他');
      const next = [...withoutOther, name, '其他'];
      saveCategories(next);
      return next;
    });
  }

  function renameCategory(oldName: string, newName: string) {
    setCategories(prev => {
      const next = prev.map(c => (c === oldName ? newName : c));
      saveCategories(next);
      return next;
    });
  }

  function removeCategory(name: string) {
    setCategories(prev => {
      const next = prev.filter(c => c !== name);
      saveCategories(next);
      return next;
    });
  }

  function addPendingItem(categoryName: string, subItem: SubItem) {
    pendingRef.current = [...pendingRef.current, { categoryName, subItem }];
  }

  function consumePendingItems(): PendingEntry[] {
    const snapshot = pendingRef.current;
    pendingRef.current = [];
    return snapshot;
  }

  return (
    <CategoriesContext.Provider value={{
      categories, isReady,
      addCategory, renameCategory, removeCategory,
      addPendingItem, consumePendingItems,
    }}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  return useContext(CategoriesContext);
}
