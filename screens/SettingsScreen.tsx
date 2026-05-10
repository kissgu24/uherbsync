import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import { getSetting, setSetting } from '../db/db';
import { i18n } from '../i18n';
import { useLanguage } from '../contexts/LanguageContext';

import { COUNTRY_OPTIONS, COUNTRY_RULES, CountryCode } from '../constants/countryRules';
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
  const { language, setLanguage } = useLanguage();
  const [country, setCountry] = useState<CountryCode>('TW');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [sortPreference, setSortPreference] = useState<'days' | 'custom'>('days');
  const [defaultRestockPlatform, setDefaultRestockPlatform] = useState<RestockPlatform>('iherb');
  const [showBeginnerGuide, setShowBeginnerGuide] = useState(true);
  const [taxThresholdInput, setTaxThresholdInput] = useState('');
  const [shippingThresholdInput, setShippingThresholdInput] = useState('');

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        getSetting('country'),
        getSetting('tax_threshold_override'),
        getSetting('free_shipping_threshold_override'),
      ]).then(([countryVal, taxOv, shipOv]) => {
        const c: CountryCode =
          (countryVal === 'TW' || countryVal === 'JP' || countryVal === 'KR' || countryVal === 'OFF')
            ? countryVal : 'TW';
        setCountry(c);
        const rule = COUNTRY_RULES[c];
        setTaxThresholdInput(taxOv && taxOv !== '' ? taxOv : String(rule.taxFreePerOrder));
        setShippingThresholdInput(shipOv && shipOv !== '' ? shipOv : String(rule.freeShipping));
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
      getSetting('show_beginner_guide').then(val => {
        setShowBeginnerGuide(val !== '0');
      }).catch(() => {});
    }, [])
  );

  async function selectCountry(code: CountryCode) {
    setCountry(code);
    await setSetting('country', code);
    const [taxOv, shipOv] = await Promise.all([
      getSetting('tax_threshold_override'),
      getSetting('free_shipping_threshold_override'),
    ]);
    const rule = COUNTRY_RULES[code];
    setTaxThresholdInput(taxOv && taxOv !== '' ? taxOv : String(rule.taxFreePerOrder));
    setShippingThresholdInput(shipOv && shipOv !== '' ? shipOv : String(rule.freeShipping));
  }

  async function handleTaxThresholdChange(val: string) {
    const clean = val.replace(/[^0-9.]/g, '');
    setTaxThresholdInput(clean);
    await setSetting('tax_threshold_override', clean);
  }

  async function handleShippingThresholdChange(val: string) {
    const clean = val.replace(/[^0-9.]/g, '');
    setShippingThresholdInput(clean);
    await setSetting('free_shipping_threshold_override', clean);
  }

  async function toggleNotifications(value: boolean) {
    if (isExpoGo && value) {
      Alert.alert(
        i18n.t('settings.expoGoAlertTitle'),
        i18n.t('settings.expoGoAlertMsg'),
        [{ text: i18n.t('common.ok'), style: 'default' }]
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

  async function toggleBeginnerGuide(value: boolean) {
    setShowBeginnerGuide(value);
    await setSetting('show_beginner_guide', value ? '1' : '0');
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>{i18n.t('settings.title')}</Text>

        <View style={s.section}>
          <Text style={s.sectionLabel}>{i18n.t('settings.taxRegion')}</Text>
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
                    {i18n.t(`settings.country_${opt.code}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {country !== 'OFF' && (() => {
            const rule = COUNTRY_RULES[country];
            return (
              <View style={s.thresholdEditArea}>
                {rule.taxFreePerOrder > 0 && (
                  <View style={s.thresholdEditRow}>
                    <Text style={s.thresholdLabel}>{i18n.t('settings.tax_threshold')}</Text>
                    <View style={s.thresholdInputWrap}>
                      <Text style={s.thresholdCurrency}>{rule.currency}</Text>
                      <TextInput
                        style={s.thresholdInput}
                        value={taxThresholdInput}
                        onChangeText={handleTaxThresholdChange}
                        keyboardType="numeric"
                        placeholderTextColor={C.textSecondary}
                        selectionColor={C.accent}
                      />
                    </View>
                  </View>
                )}
                {rule.freeShipping > 0 && (
                  <View style={[s.thresholdEditRow, { marginTop: 8 }]}>
                    <Text style={s.thresholdLabel}>{i18n.t('settings.free_shipping_threshold')}</Text>
                    <View style={s.thresholdInputWrap}>
                      <Text style={s.thresholdCurrency}>{rule.currency}</Text>
                      <TextInput
                        style={s.thresholdInput}
                        value={shippingThresholdInput}
                        onChangeText={handleShippingThresholdChange}
                        keyboardType="numeric"
                        placeholderTextColor={C.textSecondary}
                        selectionColor={C.accent}
                      />
                    </View>
                  </View>
                )}
              </View>
            );
          })()}
        </View>

        <View style={[s.section, s.sectionTop]}>
          <Text style={s.sectionLabel}>{i18n.t('settings.notifications')}</Text>
          <View style={s.notifRow}>
            <View style={s.notifLeft}>
              <Text style={s.notifTitle}>{i18n.t('settings.lowStockAlert')}</Text>
              <Text style={s.notifHint}>{i18n.t('settings.lowStockHint')}</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: C.border, true: C.accent + '88' }}
              thumbColor={notificationsEnabled ? C.accent : '#8B949E'}
            />
          </View>
          <View style={[s.notifRow, { marginTop: 14 }]}>
            <Text style={s.notifTitle}>{i18n.t('common.beginner_guide')}</Text>
            <Switch
              value={showBeginnerGuide}
              onValueChange={toggleBeginnerGuide}
              trackColor={{ false: C.border, true: C.accent + '88' }}
              thumbColor={showBeginnerGuide ? C.accent : '#8B949E'}
            />
          </View>
        </View>

        <View style={[s.section, s.sectionTop]}>
          <Text style={s.sectionLabel}>{i18n.t('settings.sortTitle')}</Text>

          <TouchableOpacity
            style={[s.sortOption, sortPreference === 'days' && s.sortOptionActive]}
            onPress={() => selectSortPreference('days')}
            activeOpacity={0.75}
          >
            <View style={[s.sortRadio, sortPreference === 'days' && s.sortRadioActive]}>
              {sortPreference === 'days' && <View style={s.sortRadioDot} />}
            </View>
            <View style={s.sortTextGroup}>
              <Text style={[s.sortLabel, sortPreference === 'days' && s.sortLabelActive]}>{i18n.t('settings.sortDays')}</Text>
              <Text style={s.sortHint}>{i18n.t('settings.sortDaysHint')}</Text>
            </View>
          </TouchableOpacity>

          <View style={[s.sortOption, s.sortOptionDisabled]}>
            <View style={s.sortRadio} />
            <View style={s.sortTextGroup}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[s.sortLabel, s.sortLabelDisabled]}>{i18n.t('settings.sortCustom')}</Text>
                <View style={s.comingSoonBadge}>
                  <Text style={s.comingSoonText}>{i18n.t('settings.comingSoon')}</Text>
                </View>
              </View>
              <Text style={s.sortHint}>{i18n.t('settings.sortCustomHint')}</Text>
            </View>
          </View>
        </View>

        <View style={[s.section, s.sectionTop]}>
          <Text style={s.sectionLabel}>{i18n.t('settings.restockPlatform')}</Text>
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

        <View style={[s.section, s.sectionTop]}>
          <Text style={s.sectionLabel}>{i18n.t('settings.language')}</Text>
          <View style={s.btnGrid}>
            <TouchableOpacity
              style={[s.countryBtn, language === 'zh' && s.countryBtnActive]}
              onPress={() => setLanguage('zh')}
              activeOpacity={0.75}
            >
              <Text style={s.flag}>🇹🇼</Text>
              <Text style={[s.countryLabel, language === 'zh' && s.countryLabelActive]}>中文</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.countryBtn, language === 'en' && s.countryBtnActive]}
              onPress={() => setLanguage('en')}
              activeOpacity={0.75}
            >
              <Text style={s.flag}>🇺🇸</Text>
              <Text style={[s.countryLabel, language === 'en' && s.countryLabelActive]}>English</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.versionContainer}>
          <Text style={s.versionText}>uHerbSync</Text>
          <Text style={s.versionText}>{i18n.t('settings.version', { version: appVersion })}</Text>
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

  thresholdEditArea: { marginTop: 12 },
  thresholdEditRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  thresholdLabel: { fontSize: 12, color: C.textSecondary, flex: 1 },
  thresholdInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: C.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: '#1C2128',
  },
  thresholdCurrency: { fontSize: 13, color: C.textSecondary, marginRight: 4 },
  thresholdInput: { fontSize: 14, color: C.textPrimary, minWidth: 72, textAlign: 'right' },

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
