import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { CategoryItem } from '../db/db';
import { getSetting } from '../db/db';
import { calcDepletionTimeline } from './inventoryService';
import { i18n } from '../i18n';

const isExpoGo = Constants.appOwnership === 'expo';
const CHANNEL_ID = 'uherbsync-low-stock';

// ─── Foreground notification behaviour ───────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ─── Android channel (one-time setup, called from App.tsx) ───────────────────

export async function initNotificationChannelAsync(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Low Stock Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF9500',
  });
}

// ─── Identifier helpers ───────────────────────────────────────────────────────

type Suffix = '14d' | '7d' | 'depleted';
const notifId = (categoryId: string, suffix: Suffix) =>
  `uherbsync_${categoryId}_${suffix}`;
const ALL_SUFFIXES: Suffix[] = ['14d', '7d', 'depleted'];

// ─── Cancel ───────────────────────────────────────────────────────────────────

export async function cancelItemNotificationsAsync(categoryId: string): Promise<void> {
  await Promise.all(
    ALL_SUFFIXES.map(s =>
      Notifications.cancelScheduledNotificationAsync(notifId(categoryId, s)).catch(() => {})
    )
  );
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

export async function scheduleItemNotificationsAsync(item: CategoryItem): Promise<void> {
  if (isExpoGo) return;

  const enabled = await getSetting('notifications_enabled');
  if (enabled === 'false') return;

  // Cancel stale schedules for this item before re-computing.
  await cancelItemNotificationsAsync(item.id);

  const timeline = calcDepletionTimeline(item);
  const displayName = item.nameEn || item.name;

  const pending: Array<{ suffix: Suffix; date: Date | null; title: string; body: string }> = [
    {
      suffix: '14d',
      date: timeline.notifyAt14Days,
      title: i18n.t('notifications.warnTitle', { name: displayName }),
      body:  i18n.t('notifications.warn14Body', { name: displayName }),
    },
    {
      suffix: '7d',
      date: timeline.notifyAt7Days,
      title: i18n.t('notifications.criticalTitle', { name: displayName }),
      body:  i18n.t('notifications.warn7Body', { name: displayName }),
    },
    {
      suffix: 'depleted',
      date: timeline.notifyAtDepleted,
      title: i18n.t('notifications.depletedTitle', { name: displayName }),
      body:  i18n.t('notifications.depletedBody', { name: displayName }),
    },
  ];

  for (const { suffix, date, title, body } of pending) {
    if (!date) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: notifId(item.id, suffix),
      content: {
        title,
        body,
        sound: true,
        data: {
          categoryId: item.id,
          categoryName: item.name,
          action: 'reorder',
        },
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
    });
  }
}

export async function scheduleAllNotificationsAsync(items: CategoryItem[]): Promise<void> {
  await Promise.all(items.map(item => scheduleItemNotificationsAsync(item)));
}
