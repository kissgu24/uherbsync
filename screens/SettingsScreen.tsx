import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import { getSetting, setSetting } from '../db/db';

import { COUNTRY_OPTIONS, CountryCode } from '../constants/countryRules';
import { RestockPlatform } from '../constants/affiliate';

const PLATFORM_OPTIONS: { key: RestockPlatform; emoji: string; label: string }[] = [
  { key: 'iherb',    emoji: '🛒', label: 'iHerb' },
  { key: 'amazon',   emoji: '📦', label: 'Amazon' },
  { key: 'vitacost', emoji: '🌿', label: 'Vitacost' },
  { key: 'swanson',  emoji: '🌻', label: 'Swanson' },
];

const isExpoGo = Constants.appOwnership === 'expo';

const C = {
  bg: '#0D1117',
  card: '#161B22',
  border: '#30363D',
  accent: '#4D9EFF',
  textPrimary: '#E6EDF3',
  textSecondary: '#8B949E',
};

const appVersion = Constants.expoConfig?.version ?? '1.0.0';

export default function SettingsScreen() {
  const [country, setCountry] = useState<CountryCode>('TW');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [sortPreference, setSortPreference] = useState<'days' | 'custom'>('days');
  const [defaultRestockPlatform, setDefaultRestockPlatform] = useState<RestockPlatform>('iherb');

  useFocusEffect(
    useCallback(() => {
      getSetting('country').then(val => {
        if (val === 'TW' || val === 'JP' || val === 'KR' || val === 'OFF') {
          setCountry(val);
        }
      }).catch(() => {});
      getSetting('notifications_enabled').then(val => {
        setNotificationsEnabled(val !== 'false');
      }).catch(() => {});
      getSetting('sort_preference').then(val => {
        if (val === 'days' || val === 'custom') setSortPreference(val);
      }).catch(() => {});
      getSetting('default_restock_platform').then(val => {
        if (val === 'iherb' || val === 'amazon' || val === 'vitacost' || val === 'swanson') {
          setDefaultRestockPlatform(val);
        }
      }).catch(() => {});
    }, [])
  );

  async function selectCountry(code: CountryCode) {
    setCountry(code);
    await setSetting('country', code);
  }

  async function toggleNotifications(value: boolean) {
    if (isExpoGo && value) {
      Alert.alert(
        '推播通知',
        '推播通知需要安裝正式版 App 才能使用',
        [{ text: '了解', style: 'default' }]
      );
      return;
    }
    setNotificationsEnabled(value);
    await setSetting('notifications_enabled', value ? 'true' : 'false');
  }

  async function selectSortPreference(pref: 'days') {
    setSortPreference(pref);
    await setSetting('sort_preference', pref);
  }

  async function selectRestockPlatform(platform: RestockPlatform) {
    setDefaultRestockPlatform(platform);
    await setSetting('default_restock_platform', platform);
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>設定</Text>

        <View style={s.section}>
          <Text style={s.sectionLabel}>免稅追蹤地區</Text>
          <View style={s.btnGrid}>
            {COUNTRY_OPTIONS.map(opt => {
              const isActive = country === opt.code;
              return (
                <TouchableOpacity
                  key={opt.code}
                  style={[s.countryBtn, isActive && s.countryBtnActive]}
                  onPress={() => selectCountry(opt.code)}
                  activeOpacity={0.75}
                >
                  <Text style={s.flag}>{opt.flag}</Text>
                  <Text style={[s.countryLabel, isActive && s.countryLabelActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[s.section, s.sectionTop]}>
          <Text style={s.sectionLabel}>推播通知</Text>
          <View style={s.notifRow}>
            <View style={s.notifLeft}>
              <Text style={s.notifTitle}>庫存不足提醒</Text>
              <Text style={s.notifHint}>庫存低於14天時，開啟 App 會收到提醒</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: C.border, true: C.accent + '88' }}
              thumbColor={notificationsEnabled ? C.accent : '#8B949E'}
            />
          </View>
        </View>

        <View style={[s.section, s.sectionTop]}>
          <Text style={s.sectionLabel}>首頁排序</Text>

          <TouchableOpacity
            style={[s.sortOption, sortPreference === 'days' && s.sortOptionActive]}
            onPress={() => selectSortPreference('days')}
            activeOpacity={0.75}
          >
            <View style={[s.sortRadio, sortPreference === 'days' && s.sortRadioActive]}>
              {sortPreference === 'days' && <View style={s.sortRadioDot} />}
            </View>
            <View style={s.sortTextGroup}>
              <Text style={[s.sortLabel, sortPreference === 'days' && s.sortLabelActive]}>剩餘天數</Text>
              <Text style={s.sortHint}>依剩餘天數由少到多排列</Text>
            </View>
          </TouchableOpacity>

          <View style={[s.sortOption, s.sortOptionDisabled]}>
            <View style={s.sortRadio} />
            <View style={s.sortTextGroup}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[s.sortLabel, s.sortLabelDisabled]}>自訂順序</Text>
                <View style={s.comingSoonBadge}>
                  <Text style={s.comingSoonText}>即將推出</Text>
                </View>
              </View>
              <Text style={s.sortHint}>依用戶拖曳順序排列</Text>
            </View>
          </View>
        </View>

        <View style={[s.section, s.sectionTop]}>
          <Text style={s.sectionLabel}>預設補貨平台</Text>
          <View style={s.btnGrid}>
            {PLATFORM_OPTIONS.map(opt => {
              const isActive = defaultRestockPlatform === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.countryBtn, isActive && s.countryBtnActive]}
                  onPress={() => selectRestockPlatform(opt.key)}
                  activeOpacity={0.75}
                >
                  <Text style={s.flag}>{opt.emoji}</Text>
                  <Text style={[s.countryLabel, isActive && s.countryLabelActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={s.versionContainer}>
          <Text style={s.versionText}>uHerbSync</Text>
          <Text style={s.versionText}>版本 {appVersion}</Text>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  title: { fontSize: 24, fontWeight: '800', color: C.textPrimary, marginBottom: 24 },

  section:      { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
  sectionTop:   { marginTop: 14 },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: C.textSecondary,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14,
  },

  btnGrid: { flexDirection: 'row', gap: 10 },
  countryBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.border,
    backgroundColor: '#1C2128',
  },
  countryBtnActive: {
    borderColor: C.accent,
    backgroundColor: C.accent + '18',
  },
  flag:         { fontSize: 24, marginBottom: 6 },
  countryLabel: { fontSize: 13, fontWeight: '600', color: C.textSecondary },
  countryLabelActive: { color: C.accent },

  notifRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notifLeft: { flex: 1, marginRight: 12 },
  notifTitle: { fontSize: 15, fontWeight: '600', color: C.textPrimary, marginBottom: 4 },
  notifHint:  { fontSize: 12, color: C.textSecondary, lineHeight: 17 },

  sortOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.border,
    backgroundColor: '#1C2128', marginBottom: 10,
  },
  sortOptionActive: {
    borderColor: C.accent,
    backgroundColor: C.accent + '18',
  },
  sortOptionDisabled: { opacity: 0.45 },
  sortRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  sortRadioActive: { borderColor: C.accent },
  sortRadioDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: C.accent,
  },
  sortTextGroup: { flex: 1 },
  sortLabel: { fontSize: 14, fontWeight: '600', color: C.textSecondary, marginBottom: 2 },
  sortLabelActive: { color: C.accent },
  sortLabelDisabled: { color: C.textSecondary },
  sortHint:  { fontSize: 12, color: C.textSecondary, opacity: 0.7 },

  comingSoonBadge: {
    backgroundColor: C.border, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  comingSoonText: { fontSize: 10, fontWeight: '700', color: C.textSecondary, letterSpacing: 0.5 },

  versionContainer: { marginTop: 32, alignItems: 'center', gap: 4 },
  versionText: { fontSize: 12, color: C.textSecondary, opacity: 0.6 },
});
