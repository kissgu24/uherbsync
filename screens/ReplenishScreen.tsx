import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  Pressable,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCategories, SubItem } from '../contexts/CategoriesContext';
import { appendOrder, OrderRecord, getSetting } from '../db/db';
import { COUNTRY_RULES, CountryCode } from '../constants/countryRules';
import { i18n } from '../i18n';
import { useLanguage } from '../contexts/LanguageContext';
import { formatCurrency, formatThreshold } from '../utils/currency';
import { parseNewPlatformUrl } from '../utils/urlParser';

// ─── Theme ────────────────────────────────────────────────────────────────────

const C = {
  bg: '#0D1117',
  card: '#161B22',
  border: '#30363D',
  accent: '#4D9EFF',
  textPrimary: '#E6EDF3',
  textSecondary: '#8B949E',
  red: '#FF4D4D',
  green: '#3FB950',
};


// ─── URL Parser ───────────────────────────────────────────────────────────────

type ParsedInfo = {
  productName: string;
  brand: string;
  spec: string;
  bottleSize: number | null;
  productId: string;
  platform: 'iherb' | 'amazon' | 'vitacost' | 'swanson' | 'momo' | 'costco' | 'shopee' | 'coupang';
};

function parseIHerbUrl(url: string): ParsedInfo | null {
  const match = url.trim().match(/\/pr\/([a-z0-9-]+)\/(\d+)/i);
  if (!match) return null;

  const slug = match[1];
  const productId = match[2];
  const words = slug.split('-').filter(Boolean);

  const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

  // Split at first standalone numeric word — skips compound tokens like "d3", "k2"
  const firstNumIdx = words.findIndex(w => /^\d+$/.test(w));

  let brand: string;
  let spec: string;
  if (firstNumIdx <= 0) {
    brand = '';
    spec = words.map(capitalize).join(' ');
  } else {
    brand = words.slice(0, firstNumIdx).map(capitalize).join(' ');
    spec  = words.slice(firstNumIdx).map(capitalize).join(' ');
  }

  // bottleSize = number immediately before a unit keyword; fallback: last standalone number
  const UNIT_KEYWORDS = new Set([
    'caps', 'capsules', 'softgels', 'softgel',
    'tablets', 'tablet', 'vegcaps', 'vcaps', 'gels', 'gel',
  ]);
  const unitIdx = words.findIndex(w => UNIT_KEYWORDS.has(w.toLowerCase()));
  let bottleSize: number;
  if (unitIdx > 0 && /^\d+$/.test(words[unitIdx - 1])) {
    bottleSize = parseInt(words[unitIdx - 1], 10);
  } else {
    const numericWords = words.filter(w => /^\d+$/.test(w));
    bottleSize = numericWords.length > 0 ? parseInt(numericWords[numericWords.length - 1], 10) : 30;
  }

  const productName = brand ? `${brand} - ${spec}` : spec;
  return { productName, brand, spec, bottleSize, productId, platform: 'iherb' };
}

function parseVitacostUrl(url: string): ParsedInfo | null {
  const match = url.trim().match(/vitacost\.com\/p\/([a-z0-9-]+)/i);
  if (!match) return null;

  const slug = match[1];
  const words = slug.split('-').filter(Boolean);
  const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

  const firstNumIdx = words.findIndex(w => /^\d+$/.test(w));
  let brand: string;
  let spec: string;
  if (firstNumIdx <= 0) {
    brand = '';
    spec = words.map(capitalize).join(' ');
  } else {
    brand = words.slice(0, firstNumIdx).map(capitalize).join(' ');
    spec  = words.slice(firstNumIdx).map(capitalize).join(' ');
  }

  const numericWords = words.filter(w => /^\d+$/.test(w));
  const bottleSize = numericWords.length > 0 ? parseInt(numericWords[numericWords.length - 1], 10) : 30;

  const productName = brand ? `${brand} - ${spec}` : spec;
  return { productName, brand, spec, bottleSize, productId: '', platform: 'vitacost' };
}

function parseSwansonUrl(url: string): ParsedInfo | null {
  const match = url.trim().match(/swansonvitamins\.com\/p\/([a-z0-9-]+)/i);
  if (!match) return null;

  const slug = match[1];
  const words = slug.split('-').filter(Boolean);
  const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

  const firstNumIdx = words.findIndex(w => /^\d+$/.test(w));
  let brand: string;
  let spec: string;
  if (firstNumIdx <= 0) {
    brand = '';
    spec = words.map(capitalize).join(' ');
  } else {
    brand = words.slice(0, firstNumIdx).map(capitalize).join(' ');
    spec  = words.slice(firstNumIdx).map(capitalize).join(' ');
  }

  const UNIT_KEYWORDS = new Set(['caps', 'capsules', 'tablets', 'tablet']);
  const unitIdx = words.findIndex(w => UNIT_KEYWORDS.has(w.toLowerCase()));
  let bottleSize: number;
  if (unitIdx > 0 && /^\d+$/.test(words[unitIdx - 1])) {
    bottleSize = parseInt(words[unitIdx - 1], 10);
  } else {
    const numericWords = words.filter(w => /^\d+$/.test(w));
    bottleSize = numericWords.length > 0 ? parseInt(numericWords[numericWords.length - 1], 10) : 30;
  }

  const productName = brand ? `${brand} - ${spec}` : spec;
  return { productName, brand, spec, bottleSize, productId: '', platform: 'swanson' };
}

function parseAmazonUrl(url: string): ParsedInfo | null {
  const trimmedUrl = url.trim();

  const asinMatch = trimmedUrl.match(/\/dp\/([A-Z0-9]{10})/);
  if (!asinMatch) return null;

  const productId = asinMatch[1].toUpperCase();
  const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  let brand = '';
  let spec = '';

  // Priority 1: slug segment immediately before /dp/
  // Skip locale codes (e.g. zh_TW, en_US) and segments <= 2 chars (e.g. '-')
  const slugMatch = trimmedUrl.match(/\/([^/?]+)\/dp\/[A-Z0-9]{10}/i);
  if (slugMatch) {
    const rawSlug = slugMatch[1];
    const isLocaleOrShort = /^[a-z]{2}[-_][a-z]{2}$/i.test(rawSlug) || rawSlug.length <= 2;
    if (!isLocaleOrShort) {
      const decoded = decodeURIComponent(rawSlug).replace(/[-_+]/g, ' ');
      const words = decoded.split(/\s+/).filter(w => /^[a-zA-Z0-9]+$/.test(w));
      if (words.length > 0) {
        const firstNumIdx = words.findIndex(w => /^\d+$/.test(w));
        if (firstNumIdx <= 0) {
          spec = words.map(capitalize).join(' ');
        } else {
          brand = words.slice(0, firstNumIdx).map(capitalize).join(' ');
          spec  = words.slice(firstNumIdx).map(capitalize).join(' ');
        }
      }
    }
  }

  // Priority 2: keywords/k query param only — no other params
  if (!spec) {
    try {
      const urlObj = new URL(trimmedUrl);
      const keyword = urlObj.searchParams.get('keywords') || urlObj.searchParams.get('k');
      if (keyword?.trim()) spec = keyword.trim();
    } catch {}
  }

  // No name found — return with empty brand/spec so user fills in manually
  if (!spec) {
    return { productName: '', brand: '', spec: '', bottleSize: null, productId, platform: 'amazon' };
  }

  const productName = brand ? `${brand} - ${spec}` : spec;
  return { productName, brand, spec, bottleSize: 0, productId, platform: 'amazon' };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type EntryRow = {
  id: string;
  category: string;
  customCategory: string;
  link: string;
  parsed: ParsedInfo | null;
  linkBlurred: boolean;
  brandInput: string;
  specInput: string;
  totalPills: string;
  pillsManuallyEdited: boolean;
  qty: string;
  unitPrice: string;
};

function newRow(): EntryRow {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    category: '',
    customCategory: '',
    link: '',
    parsed: null,
    linkBlurred: false,
    brandInput: '',
    specInput: '',
    totalPills: '',
    pillsManuallyEdited: false,
    qty: '1',
    unitPrice: '',
  };
}

// ─── Category Picker Modal ────────────────────────────────────────────────────

type CategoryPickerProps = {
  categories: string[];
  current: string;
  onSelect: (c: string) => void;
  onClose: () => void;
};

function CategoryPickerModal({ categories, current, onSelect, onClose }: CategoryPickerProps) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={ps.overlay} onPress={onClose}>
        <Pressable style={ps.card} onPress={() => {}}>
          <Text style={ps.title}>{i18n.t('replenish.pickerTitle')}</Text>
          <View style={ps.divider} />
          {categories.map((cat, i) => {
            const isActive = cat === current;
            const isLast = i === categories.length - 1;
            return (
              <TouchableOpacity
                key={cat}
                style={[ps.option, isLast && { borderBottomWidth: 0 }]}
                onPress={() => { onSelect(cat); onClose(); }}
                activeOpacity={0.65}
              >
                <Text style={[ps.optText, isActive && ps.optTextActive]}>
                  {cat === '其他' ? i18n.t('replenish.category_other') : cat}
                </Text>
                {isActive && <Ionicons name="checkmark-circle" size={18} color={C.accent} />}
              </TouchableOpacity>
            );
          })}
          <View style={ps.divider} />
          <TouchableOpacity style={ps.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={ps.cancelText}>{i18n.t('common.cancel')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ReplenishScreen() {
  const { language } = useLanguage();
  const { categories, addCategory, addPendingItem } = useCategories();

  const [rows, setRows] = useState<EntryRow[]>([newRow()]);
  const [isOverseas, setIsOverseas] = useState(false);
  const [parsingRowIds, setParsingRowIds] = useState<Set<string>>(new Set());
  const [pickerRowId, setPickerRowId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [country, setCountry] = useState<CountryCode>('TW');
  const [activeTaxThreshold, setActiveTaxThreshold] = useState(COUNTRY_RULES['TW'].taxFreePerOrder);
  const [activeShippingThreshold, setActiveShippingThreshold] = useState(COUNTRY_RULES['TW'].freeShipping);

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        getSetting('country'),
        getSetting('tax_threshold_override'),
        getSetting('free_shipping_threshold_override'),
      ])
        .then(([countryVal, taxOv, shipOv]) => {
          const c: CountryCode =
            countryVal === 'TW' || countryVal === 'JP' || countryVal === 'KR' || countryVal === 'OFF'
              ? countryVal
              : 'TW';
          setCountry(c);

          if (c === 'OFF') {
            setActiveTaxThreshold(0);
            setActiveShippingThreshold(0);
            return;
          }

          const r = COUNTRY_RULES[c];

          const parsedTaxOv = taxOv ? parseFloat(taxOv) : NaN;
          setActiveTaxThreshold(
            Number.isFinite(parsedTaxOv) && parsedTaxOv > 0 ? parsedTaxOv : r.taxFreePerOrder
          );

          const parsedShipOv = shipOv ? parseFloat(shipOv) : NaN;
          setActiveShippingThreshold(
            Number.isFinite(parsedShipOv) && parsedShipOv > 0 ? parsedShipOv : r.freeShipping
          );
        })
        .catch(() => {});
    }, [])
  );

  const rule = COUNTRY_RULES[country];

  const total = rows.reduce((sum, r) => {
    const price = parseFloat(r.unitPrice);
    const qty = parseInt(r.qty, 10) || 1;
    return sum + (isNaN(price) ? 0 : price * qty);
  }, 0);
  const overBudget = country !== 'OFF' && activeTaxThreshold > 0 && total > activeTaxThreshold;

  // ── Row helpers ──────────────────────────────────────────────────────────

  function updateRow(id: string, patch: Partial<EntryRow>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  function handleCategorySelect(rowId: string, cat: string) {
    updateRow(rowId, { category: cat, customCategory: '' });
  }

  function commitCustomCategory(rowId: string, text: string) {
    const trimmed = text.trim();
    if (trimmed) addCategory(trimmed);
    updateRow(rowId, { customCategory: trimmed });
  }

  function handleLinkChange(rowId: string, text: string) {
    const parsed = text.trim()
      ? (parseIHerbUrl(text) ?? parseAmazonUrl(text) ?? parseVitacostUrl(text) ?? parseSwansonUrl(text))
      : null;
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const qty = parseInt(r.qty, 10) || 1;
      return {
        ...r,
        link: text,
        parsed,
        linkBlurred: false,
        brandInput: parsed ? parsed.brand : r.brandInput,
        specInput: parsed ? parsed.spec : r.specInput,
        totalPills: parsed ? String((parsed.bottleSize ?? 0) * qty) : r.totalPills,
        pillsManuallyEdited: false,
      };
    }));
  }

  function clearLink(rowId: string) {
    updateRow(rowId, {
      link: '', parsed: null, brandInput: '', specInput: '',
      totalPills: '', pillsManuallyEdited: false,
    });
  }

  function handleQtyChange(rowId: string, text: string) {
    const digits = text.replace(/[^0-9]/g, '');
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      if (r.parsed && !r.pillsManuallyEdited) {
        const qty = parseInt(digits, 10) || 1;
        return { ...r, qty: digits, totalPills: String((r.parsed.bottleSize ?? 0) * qty) };
      }
      return { ...r, qty: digits };
    }));
  }

  async function handleLinkBlur(rowId: string) {
    const row = rows.find(r => r.id === rowId);
    if (!row || !row.link.trim() || row.parsed) return;

    setParsingRowIds(prev => new Set([...prev, rowId]));
    try {
      const result = await parseNewPlatformUrl(row.link.trim());
      if (!result) return;

      const parsed: ParsedInfo = {
        productName: result.productName,
        brand:       result.brand,
        spec:        result.spec,
        bottleSize:  result.bottleSize,
        productId:   result.productId,
        platform:    result.platform,
      };

      setRows(prev => prev.map(r => {
        if (r.id !== rowId) return r;
        const qty = parseInt(r.qty, 10) || 1;
        return {
          ...r,
          link:               result.normalizedUrl || r.link,
          parsed,
          linkBlurred:        true,
          brandInput:         r.brandInput || result.brand,
          specInput:          r.specInput  || result.spec,
          totalPills:         r.totalPills || (result.bottleSize ? String(result.bottleSize * qty) : ''),
          pillsManuallyEdited: false,
        };
      }));
    } catch {
      // silent failure — no blocking error
    } finally {
      setParsingRowIds(prev => {
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, linkBlurred: true } : r));
    }
  }

  function addRow() {
    setRows(prev => [...prev, newRow()]);
  }

  function removeRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  async function handleConfirm() {
    // 1. Persist any custom categories
    rows.forEach(r => {
      if (r.category === '其他' && r.customCategory.trim()) {
        addCategory(r.customCategory.trim());
      }
    });

    // 2. Queue rows as pending sub-items for DashboardScreen
    rows.forEach(r => {
      const categoryName = r.category === '其他' ? r.customCategory.trim() : r.category;
      if (!categoryName) return;
      const brand = r.brandInput.trim() || 'NA';
      const spec  = r.specInput.trim()  || 'NA';
      const newSubItem: SubItem = {
        id: `sub_${Date.now()}_${r.id}`,
        brand,
        spec,
        remaining: parseInt(r.totalPills, 10) || 0,
        bottleSize: r.parsed?.bottleSize ?? 0,
        doseUnit: '顆',
        iherbUrl: r.link.trim() || '',
        isActive: true,
      };
      addPendingItem(categoryName, newSubItem, r.link || undefined, r.parsed?.platform);
    });

    // 3. Append order record to AsyncStorage history
    const record: OrderRecord = {
      id: `order_${Date.now()}`,
      date: new Date().toISOString(),
      discountCode: '',
      totalAmount: total,
      isOverseas,
      items: rows.map(r => {
        const unitPrice = parseFloat(r.unitPrice) || 0;
        const qty = parseInt(r.qty, 10) || 1;
        const brand = r.brandInput.trim() || 'NA';
        const spec  = r.specInput.trim()  || 'NA';
        return {
          categoryName: r.category === '其他' ? r.customCategory.trim() : r.category,
          productName: r.parsed?.productName || (r.brandInput.trim() ? `${brand} - ${spec}` : spec),
          qty,
          unitPrice,
          amount: unitPrice * qty,
          brand,
          spec,
        };
      }),
    };
    try {
      await appendOrder(record);
    } catch {}

    // 4. Show success state, then reset form
    setConfirmed(true);
    setTimeout(() => {
      setConfirmed(false);
      setRows([newRow()]);
      setIsOverseas(false);
    }, 2200);
  }

  const canConfirm = rows.length > 0 && rows.every(r => {
    const effCat = r.category === '其他' ? r.customCategory.trim() : r.category;
    const price = parseFloat(r.unitPrice);
    return !!effCat && !isNaN(price) && price > 0;
  });

  const pickerRow = pickerRowId ? rows.find(r => r.id === pickerRowId) : null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Title ── */}
        <Text style={s.title}>{i18n.t('replenish.title')}</Text>

        {/* ── Order Total Card ── */}
        <View style={[s.totalCard, overBudget && s.totalCardRed]}>
          {/* ── Status lights: top-right corner ── */}
          <View style={s.statusLights}>
            {activeShippingThreshold > 0 && (
              <View style={s.statusLight}>
                <View style={[s.statusDot, {
                  backgroundColor: country !== 'OFF' && total >= activeShippingThreshold ? '#2EA043' : '#F85149',
                }]} />
                <Text style={s.statusText}>
                  {i18n.t('replenish.freeShipping', { threshold: formatThreshold(activeShippingThreshold, language, rule.currency) })}
                </Text>
              </View>
            )}
            {activeTaxThreshold > 0 && (
              <View style={s.statusLight}>
                <View style={[s.statusDot, {
                  backgroundColor: country !== 'OFF' && total <= activeTaxThreshold ? '#2EA043' : '#F85149',
                }]} />
                <Text style={s.statusText}>
                  {i18n.t('replenish.taxFree', { threshold: formatThreshold(activeTaxThreshold, language, rule.currency) })}
                </Text>
              </View>
            )}
          </View>

          {/* paddingRight clears the absolute-positioned status lights */}
          <View style={s.totalTopSection}>
            <View style={s.totalRow}>
              <View>
                <Text style={s.totalLabel}>{i18n.t('replenish.orderTotal')}</Text>
                <Text style={[s.totalAmount, overBudget && { color: C.red }]}>
                  {formatCurrency(total, language)}
                </Text>
              </View>
              {overBudget ? (
                <View style={[s.pill, { borderColor: C.red + '60', backgroundColor: C.red + '18' }]}>
                  <Ionicons name="warning-outline" size={13} color={C.red} />
                  <Text style={[s.pillText, { color: C.red }]}>{i18n.t('replenish.overBudget')}</Text>
                </View>
              ) : total > 0 ? (
                <View style={[s.pill, { borderColor: C.green + '60', backgroundColor: C.green + '18' }]}>
                  <Ionicons name="checkmark-circle-outline" size={13} color={C.green} />
                  <Text style={[s.pillText, { color: C.green }]}>{i18n.t('replenish.amountOk')}</Text>
                </View>
              ) : null}
            </View>

            {activeTaxThreshold > 0 && (
              <>
                <View style={s.budgetTrack}>
                  <View
                    style={[
                      s.budgetFill,
                      {
                        width: `${Math.min((total / activeTaxThreshold) * 100, 100)}%` as `${number}%`,
                        backgroundColor: overBudget ? C.red : C.accent,
                      },
                    ]}
                  />
                </View>
                <Text style={s.budgetLabel}>
                  {i18n.t('replenish.taxThreshold', { threshold: formatThreshold(activeTaxThreshold, language, rule.currency) })}
                </Text>
              </>
            )}
          </View>

          <View style={s.divider} />
          <View style={s.overseasRow}>
            <Text style={[s.fieldLabel, { marginBottom: 0 }]}>{i18n.t('replenish.is_overseas_package')}</Text>
            <Switch
              value={isOverseas}
              onValueChange={setIsOverseas}
              trackColor={{ false: C.border, true: C.accent + '88' }}
              thumbColor={isOverseas ? C.accent : '#8B949E'}
              ios_backgroundColor={C.border}
            />
          </View>
        </View>

        {/* ── Entry Rows ── */}
        {rows.map((row, idx) => (
          <View key={row.id} style={s.entryCard}>

            <View style={s.entryHeader}>
              <Text style={s.entryNum}>{i18n.t('replenish.itemNum', { num: idx + 1 })}</Text>
              {rows.length > 1 && (
                <TouchableOpacity onPress={() => removeRow(row.id)} hitSlop={10}>
                  <Ionicons name="close-circle-outline" size={20} color={C.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            <View style={s.entryBody}>

              {/* a. Category */}
              <Text style={s.fieldLabel}>{i18n.t('replenish.categoryLabel')}</Text>
              <TouchableOpacity
                style={[s.dropdown, !!row.category && s.dropdownFilled, !row.category && s.errorBorder]}
                onPress={() => setPickerRowId(row.id)}
                activeOpacity={0.7}
              >
                <Text style={[s.dropdownText, !row.category && { color: C.textSecondary }]}>
                  {row.category === '其他'
                    ? i18n.t('replenish.category_other')
                    : row.category || i18n.t('replenish.categoryPlaceholder')}
                </Text>
                <Ionicons name="chevron-down" size={15} color={C.textSecondary} />
              </TouchableOpacity>
              {!row.category && (
                <Text style={s.errorText}>{i18n.t('replenish.error_select_category')}</Text>
              )}

              {row.category === '其他' && (
                <TextInput
                  style={[s.input, { marginTop: 8, borderColor: row.customCategory.trim() ? C.border : C.red }]}
                  value={row.customCategory}
                  onChangeText={t => updateRow(row.id, { customCategory: t })}
                  onBlur={() => commitCustomCategory(row.id, row.customCategory)}
                  placeholder={i18n.t('replenish.customCategoryPlaceholder')}
                  placeholderTextColor={C.textSecondary}
                  returnKeyType="done"
                />
              )}

              {/* b. Product link */}
              <Text style={[s.fieldLabel, { marginTop: 12 }]}>{i18n.t('replenish.linkLabel')}</Text>
              <Text style={s.platformHint}>{i18n.t('replenish.import_support_full')}</Text>
              <Text style={s.platformHint}>{i18n.t('replenish.import_support_partial')}</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={[s.input, { flex: 1, paddingRight: 36 }, row.parsed && s.inputOk]}
                  value={row.link}
                  onChangeText={t => handleLinkChange(row.id, t)}
                  onBlur={() => handleLinkBlur(row.id)}
                  placeholder={i18n.t('replenish.linkPlaceholder')}
                  placeholderTextColor={C.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                />
                {parsingRowIds.has(row.id) ? (
                  <ActivityIndicator style={s.inputIconRight} size="small" color={C.accent} />
                ) : row.link.length > 0 ? (
                  <TouchableOpacity style={s.inputIconRight} onPress={() => clearLink(row.id)} hitSlop={8}>
                    <Ionicons name="close-circle" size={17} color={C.textSecondary} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {row.link.trim() !== '' && !row.parsed && !parsingRowIds.has(row.id) && row.linkBlurred && (
                <Text style={s.linkError}>{i18n.t('replenish.url_parse_error')}</Text>
              )}

              {/* c. Sub-category — always visible */}
              <Text style={[s.fieldLabel, { marginTop: 12 }]}>{i18n.t('replenish.subCategoryLabel')}</Text>
              <TextInput
                style={[s.input, { marginBottom: 8 }]}
                value={row.brandInput}
                onChangeText={t => updateRow(row.id, { brandInput: t })}
                placeholder={
                  row.parsed && !row.brandInput
                    ? i18n.t('replenish.brandCannotParse')
                    : i18n.t('replenish.brandPlaceholder')
                }
                placeholderTextColor={C.textSecondary}
                returnKeyType="next"
              />
              <TextInput
                style={s.input}
                value={row.specInput}
                onChangeText={t => updateRow(row.id, { specInput: t })}
                placeholder={
                  row.parsed && !row.specInput
                    ? i18n.t('replenish.brandCannotParse')
                    : i18n.t('replenish.specPlaceholder')
                }
                placeholderTextColor={C.textSecondary}
                returnKeyType="done"
              />

              {row.parsed && (
                <>
                  <View style={s.pillsRow}>
                    <Text style={s.pillsRowLabel}>{i18n.t('replenish.totalPills')}</Text>
                    <View style={s.pillsCol}>
                      <TextInput
                        style={s.pillsInput}
                        value={row.totalPills}
                        onChangeText={t => {
                          const digits = t.replace(/[^0-9]/g, '');
                          updateRow(row.id, { totalPills: digits, pillsManuallyEdited: true });
                        }}
                        keyboardType="numeric"
                        maxLength={5}
                        returnKeyType="done"
                        selectTextOnFocus
                      />
                      <Text style={s.pillsUnit}>{i18n.t('replenish.pillsUnit')}</Text>
                    </View>
                  </View>
                  <Text style={s.subMeta}>
                    {row.parsed.bottleSize != null ? i18n.t('replenish.perBottle', { size: row.parsed.bottleSize }) : ''}
                    {row.parsed.productId ? `${row.parsed.bottleSize != null ? ' · ' : ''}ID ${row.parsed.productId}` : ''}
                    {row.pillsManuallyEdited ? `  · ${i18n.t('replenish.manuallyEdited')}` : ''}
                  </Text>
                </>
              )}

              {/* d. Qty + Unit Price */}
              <View style={s.qtyAmountRow}>
                <View style={s.qtyCol}>
                  <Text style={[s.fieldLabel, { marginTop: 12 }]}>{i18n.t('replenish.qtyLabel')}</Text>
                  <TextInput
                    style={s.input}
                    value={row.qty}
                    onChangeText={t => handleQtyChange(row.id, t)}
                    keyboardType="numeric"
                    maxLength={3}
                    returnKeyType="done"
                    selectTextOnFocus
                  />
                </View>
                <View style={s.amountCol}>
                  <Text style={[s.fieldLabel, { marginTop: 12 }]}>{i18n.t('replenish.priceLabel')}</Text>
                  <TextInput
                    style={s.input}
                    value={row.unitPrice}
                    onChangeText={t => updateRow(row.id, { unitPrice: t.replace(/[^0-9.]/g, '') })}
                    keyboardType="numeric"
                    placeholder={i18n.t('replenish.pricePlaceholder')}
                    placeholderTextColor={C.textSecondary}
                    returnKeyType="done"
                    selectTextOnFocus
                  />
                </View>
              </View>
              {row.unitPrice !== '' && (parseInt(row.qty, 10) || 1) > 1 && (
                <Text style={s.rowSubtotal}>
                  {i18n.t('replenish.subtotal', { amount: formatCurrency((parseFloat(row.unitPrice) || 0) * (parseInt(row.qty, 10) || 1), language) })}
                </Text>
              )}

            </View>
          </View>
        ))}

        {/* ── Add Row ── */}
        <TouchableOpacity style={s.addBtn} onPress={addRow} activeOpacity={0.7}>
          <Ionicons name="add-circle-outline" size={20} color={C.accent} />
          <Text style={s.addBtnText}>{i18n.t('replenish.addMore')}</Text>
        </TouchableOpacity>

        {/* ── Confirm ── */}
        <TouchableOpacity
          style={[s.confirmBtn, !canConfirm && s.confirmBtnOff, confirmed && s.confirmBtnDone]}
          onPress={canConfirm && !confirmed ? handleConfirm : undefined}
          disabled={!canConfirm || confirmed}
          activeOpacity={0.85}
        >
          {confirmed ? (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={s.confirmText}>{i18n.t('replenish.success')}</Text>
            </>
          ) : (
            <>
              <Ionicons
                name="checkmark-done-outline"
                size={20}
                color={canConfirm ? '#fff' : C.textSecondary}
              />
              <Text style={[s.confirmText, !canConfirm && { color: C.textSecondary }]}>
                {i18n.t('replenish.confirmBtn')}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      {pickerRowId !== null && pickerRow && (
        <CategoryPickerModal
          categories={categories}
          current={pickerRow.category}
          onSelect={cat => handleCategorySelect(pickerRowId, cat)}
          onClose={() => setPickerRowId(null)}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12 },

  title: { fontSize: 24, fontWeight: '800', color: C.textPrimary, marginBottom: 16 },

  totalCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 16,
    marginBottom: 20, borderWidth: 1, borderColor: C.border,
    position: 'relative',
  },
  totalCardRed: { borderColor: C.red + '55', backgroundColor: '#160D0D' },
  totalTopSection: { paddingRight: 100 },
  totalRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 14,
  },
  totalLabel: {
    fontSize: 11, color: C.textSecondary, fontWeight: '600',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4,
  },
  totalAmount: { fontSize: 30, fontWeight: '800', color: C.textPrimary },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: '600' },
  budgetTrack: {
    height: 6, backgroundColor: '#21262D', borderRadius: 3,
    overflow: 'hidden', marginBottom: 5,
  },
  budgetFill:  { height: '100%', borderRadius: 3 },
  budgetLabel: { fontSize: 10, color: C.textSecondary, textAlign: 'right' },

  statusLights: { position: 'absolute', top: 12, right: 12, alignItems: 'flex-end', gap: 6 },
  statusLight:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot:    { width: 8, height: 8, borderRadius: 4 },
  statusText:   { fontSize: 10, color: C.textSecondary, fontWeight: '600' },

  divider:    { height: 1, backgroundColor: C.border, marginVertical: 14 },
  overseasRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: {
    fontSize: 11, fontWeight: '600', color: C.textSecondary,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6,
  },
  discountInput: {
    backgroundColor: '#0D1117', borderRadius: 10, borderWidth: 1, borderColor: C.border,
    color: C.textPrimary, fontSize: 14, paddingHorizontal: 12, paddingVertical: 11,
    letterSpacing: 1.5,
  },
  refreshBtn: {
    width: 42, height: 42, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#21262D', borderRadius: 10, borderWidth: 1, borderColor: C.border,
    marginLeft: 8,
  },

  entryCard: {
    backgroundColor: C.card, borderRadius: 14, marginBottom: 14,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  entryHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border,
    backgroundColor: '#1C2128',
  },
  entryNum: { fontSize: 13, fontWeight: '700', color: C.accent, letterSpacing: 0.5 },
  entryBody: { padding: 14 },

  inputRow:       { flexDirection: 'row', alignItems: 'center' },
  inputIconRight: { position: 'absolute', right: 10 },

  input: {
    backgroundColor: '#0D1117', borderRadius: 10, borderWidth: 1, borderColor: C.border,
    color: C.textPrimary, fontSize: 14, paddingHorizontal: 12, paddingVertical: 11,
  },
  inputOk: { borderColor: C.green + '88' },

  dropdown: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0D1117', borderRadius: 10, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  dropdownFilled: { borderColor: C.accent + '66' },
  dropdownText:   { fontSize: 14, color: C.textPrimary, fontWeight: '500' },

  // ── Sub-category fields ──
  pillsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10,
  },
  pillsRowLabel: { fontSize: 13, color: C.textSecondary, fontWeight: '500' },
  pillsCol: { alignItems: 'center' },
  pillsInput: {
    backgroundColor: '#21262D', borderRadius: 8, borderWidth: 1, borderColor: C.border,
    color: C.textPrimary, fontSize: 15, fontWeight: '700',
    textAlign: 'center', paddingHorizontal: 6, paddingVertical: 7, width: 60,
  },
  pillsUnit: { fontSize: 11, color: C.textSecondary, marginTop: 3 },
  subMeta:   { fontSize: 10, color: C.textSecondary, marginTop: 5, marginLeft: 2 },

  platformHint: { fontSize: 12, color: '#8B949E', marginBottom: 6 },
  linkError: { fontSize: 12, color: C.red, marginTop: 6, marginLeft: 2 },

  errorBorder: { borderColor: '#FF0000', borderWidth: 1 },
  errorText: { color: '#FF0000', fontSize: 12, marginTop: 4, marginLeft: 4 },

  qtyAmountRow: { flexDirection: 'row' },
  qtyCol:       { flex: 1, marginRight: 10 },
  amountCol:    { flex: 2 },
  rowSubtotal:  { fontSize: 11, color: C.accent, textAlign: 'right', marginTop: 6, fontWeight: '600' },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1.5, borderColor: C.accent + '55',
    borderStyle: 'dashed', paddingVertical: 14, marginBottom: 16,
  },
  addBtnText: { fontSize: 15, color: C.accent, fontWeight: '600' },

  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#2EA043', borderRadius: 14, paddingVertical: 17,
  },
  confirmBtnOff:  { backgroundColor: '#21262D', borderWidth: 1, borderColor: C.border },
  confirmBtnDone: { backgroundColor: '#388BFD' },
  confirmText:    { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ─── Category Picker Styles ───────────────────────────────────────────────────

const ps = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
  },
  card: {
    width: '100%', backgroundColor: '#1C2128',
    borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 20,
  },
  title:   { fontSize: 17, fontWeight: '700', color: C.textPrimary, marginBottom: 4 },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 12 },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#21262D',
  },
  optText:       { fontSize: 15, color: C.textSecondary, fontWeight: '500' },
  optTextActive: { color: C.accent, fontWeight: '700' },
  cancelBtn: {
    alignItems: 'center', backgroundColor: '#21262D',
    borderRadius: 12, paddingVertical: 13, borderWidth: 1, borderColor: C.border,
  },
  cancelText: { fontSize: 15, color: C.textSecondary, fontWeight: '600' },
});
