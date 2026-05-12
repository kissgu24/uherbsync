import { useCallback } from 'react';
import type { CategoryItem } from '../db/db';
import {
  scheduleItemNotificationsAsync,
  scheduleAllNotificationsAsync,
  cancelItemNotificationsAsync,
} from '../services/notificationService';

/**
 * Provides notification-aware wrappers for inventory mutations.
 * Call these after any stock change so the OS scheduler stays in sync.
 */
export function useInventory() {
  const scheduleForItem = useCallback(async (item: CategoryItem) => {
    try {
      await scheduleItemNotificationsAsync(item);
    } catch (e) {
      console.error('[useInventory] scheduleForItem error', e);
    }
  }, []);

  const scheduleForAll = useCallback(async (items: CategoryItem[]) => {
    try {
      await scheduleAllNotificationsAsync(items);
    } catch (e) {
      console.error('[useInventory] scheduleForAll error', e);
    }
  }, []);

  const cancelForItem = useCallback(async (categoryId: string) => {
    try {
      await cancelItemNotificationsAsync(categoryId);
    } catch (e) {
      console.error('[useInventory] cancelForItem error', e);
    }
  }, []);

  return { scheduleForItem, scheduleForAll, cancelForItem };
}
