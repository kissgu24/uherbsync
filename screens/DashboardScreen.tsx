import React, { useState, useRef, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Linking,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCategories, SubItem } from '../contexts/CategoriesContext';
import { CategoryItem, loadCategoryItems, saveCategoryItems, loadOrders, updateSubItemRemaining, updateSubItemActive, updateSubItemBrandSpec, updateCategoryDose, updateCategoryTiming, getSetting, setSetting, runDailyDeductionIfNeeded, upsertProductSource, logEvent, getProductUrl } from '../db/db';
import { COUNTRY_RULES, CountryCode } from '../constants/countryRules';
import { AMAZON_TAG, buildIHerbSearchUrl, buildIHerbProductUrl, buildPlatformSearchUrl, detectPlatform, RestockPlatform } from '../constants/affiliate';
import { formatCurrency } from '../utils/currency';
import { executeReorder } from '../utils/reorderHandler';
import { supabase } from '../lib/supabase';
import { i18n } from '../i18n';
import { useLanguage } from '../contexts/LanguageContext';

const isExpoGo = Constants.appOwnership === 'expo';

// ─── Theme ────────────────────────────────────────────────────────────────────

const C = {
  bg: '#0D1117',
  card: '#161B22',
  cardAlt: '#1C2128',
  border: '#30363D',
  accent: '#4D9EFF',
  textPrimary: '#E6EDF3',
  textSecondary: '#8B949E',
  red: '#FF4D4D',
  orange: '#FF9500',
  green: '#3FB950',
};

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// ─── Seed Data ────────────────────────────────────────────────────────────────

function halfYearRange(): [Date, Date] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (m < 6) return [new Date(y, 0, 1), new Date(y, 5, 30, 23, 59, 59, 999)];
  return [new Date(y, 6, 1), new Date(y, 11, 31, 23, 59, 59, 999)];
}

function halfYearLabel(): string {
  const now = new Date();
  const yy = String(now.getFullYear() % 100).padStart(2, '0');
  return now.getMonth() < 6 ? `${yy}/01～${yy}/06` : `${yy}/07～${yy}/12`;
}

const INITIAL_ITEMS: CategoryItem[] = [
  {
    id: '1', name: '益生菌', nameEn: 'Probiotic',
    maxDays: 30, dailyDose: 3, doseUnit: '顆', timing: '飯後',
    iherbUrl: buildIHerbProductUrl('https://www.iherb.com/c/probiotics'),
    subItems: [
      { id: '1a', brand: 'Natren', spec: 'Healthy Trinity, 60 Caps', remaining: 9, bottleSize: 60, doseUnit: '顆', iherbUrl: '', isActive: true },
    ],
  },
  {
    id: '2', name: '維生素D3+K2', nameEn: 'Vitamin D3+K2',
    maxDays: 30, dailyDose: 1, doseUnit: '顆', timing: '早餐後',
    iherbUrl: buildIHerbProductUrl('https://www.iherb.com/c/vitamin-d'),
    subItems: [
      { id: '2a', brand: 'Sports Research', spec: 'Vitamin D3+K2, 60 Soft Gels', remaining: 11, bottleSize: 60, doseUnit: '顆', iherbUrl: '', isActive: true },
    ],
  },
  {
    id: '3', name: 'Apigenin', nameEn: 'Apigenin',
    maxDays: 30, dailyDose: 1, doseUnit: '顆', timing: '睡前',
    iherbUrl: buildIHerbSearchUrl('apigenin'),
    subItems: [
      { id: '3a', brand: 'Now Foods', spec: 'Apigenin 50 mg, 90 Veg Caps', remaining: 14, bottleSize: 90, doseUnit: '顆', iherbUrl: '', isActive: true },
    ],
  },
  {
    id: '4', name: 'NMN', nameEn: 'NMN',
    maxDays: 60, dailyDose: 2, doseUnit: '顆', timing: '空腹',
    iherbUrl: buildIHerbSearchUrl('nmn'),
    subItems: [
      { id: '4a', brand: 'ProHealth Longevity', spec: 'NMN Pro 300 mg, 60 Caps', remaining: 56, bottleSize: 60, doseUnit: '顆', iherbUrl: '', isActive: true },
      { id: '4b', brand: 'Life Extension', spec: 'NAD+ Cell Regenerator, 30 Caps', remaining: 10, bottleSize: 30, doseUnit: '顆', iherbUrl: '', isActive: true },
    ],
  },
  {
    id: '5', name: 'Omega-3', nameEn: 'Omega-3 Fish Oil',
    maxDays: 60, dailyDose: 2, doseUnit: '顆', timing: '飯後',
    iherbUrl: buildIHerbProductUrl('https://www.iherb.com/c/fish-oil-omega-3'),
    subItems: [
      { id: '5a', brand: 'Nordic Naturals', spec: 'Ultimate Omega, 180 Soft Gels', remaining: 72, bottleSize: 180, doseUnit: '顆', iherbUrl: '', isActive: true },
    ],
  },
];

const TIMING_OPTIONS = ['空腹', '早餐前', '早餐後', '午餐前', '午餐後', '晚餐前', '晚餐後', '睡前'];
const DOSE_UNITS = ['顆', '匙', 'ml'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeKey(brand: string, spec: string): string {
  const normalize = (s: string) => s.toLowerCase().replace(/[-_\s]+/g, '').trim();
  return `${normalize(brand)}|${normalize(spec)}`;
}

function translateDoseUnit(unit: string): string {
  const map: Record<string, string> = {
    '顆': i18n.t('dashboard.doseUnitCap'),
    '匙': i18n.t('dashboard.doseUnitScoop'),
  };
  return map[unit] ?? unit;
}

function translateTiming(timing: string): string {
  const map: Record<string, string> = {
    '空腹': i18n.t('dashboard.timingFasted'),
    '早餐前': i18n.t('dashboard.timingBeforeBreakfast'),
    '早餐後': i18n.t('dashboard.timingAfterBreakfast'),
    '午餐前': i18n.t('dashboard.timingBeforeLunch'),
    '午餐後': i18n.t('dashboard.timingAfterLunch'),
    '晚餐前': i18n.t('dashboard.timingBeforeDinner'),
    '晚餐後': i18n.t('dashboard.timingAfterDinner'),
    '睡前': i18n.t('dashboard.timingBeforeBed'),
  };
  return map[timing] ?? timing;
}

function subItemDays(sub: SubItem, dailyDose: number): number {
  return dailyDose > 0 ? Math.floor(sub.remaining / dailyDose) : 0;
}

function categoryTotalDays(cat: CategoryItem): number {
  const total = cat.subItems.reduce((s, si) => s + si.remaining, 0);
  return cat.dailyDose > 0 ? Math.floor(total / cat.dailyDose) : 0;
}

function categoryDotColor(cat: CategoryItem): string {
  const totalDays = categoryTotalDays(cat);
  if (totalDays < 14) return C.red;
  const hasRedSub = cat.subItems.some(si => subItemDays(si, cat.dailyDose) < 14);
  if (hasRedSub) return C.orange;
  return C.green;
}

function subDotColor(sub: SubItem, dailyDose: number): string {
  return subItemDays(sub, dailyDose) >= 14 ? C.green : C.red;
}

function calcFinishDate(qty: number, dose: number): string {
  const days = dose > 0 ? Math.floor(qty / dose) : 0;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Shared Sub-components ────────────────────────────────────────────────────

function DetailRow({ icon, label, value }: { icon: IoniconName; label: string; value: string }) {
  return (
    <View style={m.detailRow}>
      <Ionicons name={icon} size={15} color={C.textSecondary} style={{ width: 20 }} />
      <Text style={m.detailLabel}>{label}</Text>
      <Text style={m.detailValue}>{value}</Text>
    </View>
  );
}

function EditableDetailRow({
  icon, label, value, onPress,
}: { icon: IoniconName; label: string; value: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[m.detailRow, m.editableRow]} onPress={onPress} activeOpacity={0.65}>
      <Ionicons name={icon} size={15} color={C.textSecondary} style={{ width: 20 }} />
      <Text style={m.detailLabel}>{label}</Text>
      <View style={m.editableValueRow}>
        <Text style={[m.detailValue, { color: C.accent }]}>{value}</Text>
        <Ionicons name="pencil-outline" size={13} color={C.accent} style={{ marginLeft: 5 }} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Dose Edit Modal ──────────────────────────────────────────────────────────

type DoseEditProps = {
  initialValue: number;
  initialUnit: string;
  onConfirm: (value: number, unit: string) => void;
  onClose: () => void;
};

function DoseEditModal({ initialValue, initialUnit, onConfirm, onClose }: DoseEditProps) {
  const [inputText, setInputText] = useState(String(initialValue));
  const [unit, setUnit] = useState(initialUnit);

  function handleConfirm() {
    const n = parseInt(inputText, 10);
    if (!isNaN(n) && n > 0) { onConfirm(n, unit); onClose(); }
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={m.overlay} onPress={onClose}>
        <Pressable style={de.card} onPress={() => {}}>
          <View style={de.header}>
            <Ionicons name="repeat-outline" size={18} color={C.accent} />
            <Text style={de.title}>{i18n.t('dashboard.editDose')}</Text>
          </View>
          <View style={m.divider} />
          <Text style={de.hint}>{i18n.t('dashboard.doseQty')}</Text>
          <TextInput
            style={de.input}
            value={inputText}
            onChangeText={t => setInputText(t.replace(/[^0-9]/g, ''))}
            keyboardType="numeric"
            maxLength={4}
            selectTextOnFocus
            placeholderTextColor={C.textSecondary}
          />
          <Text style={[de.hint, { marginTop: 14 }]}>{i18n.t('dashboard.doseUnit')}</Text>
          <View style={de.unitRow}>
            {DOSE_UNITS.map(u => (
              <TouchableOpacity
                key={u}
                style={[de.unitBtn, unit === u && de.unitBtnActive]}
                onPress={() => setUnit(u)}
                activeOpacity={0.75}
              >
                <Text style={[de.unitText, unit === u && de.unitTextActive]}>{translateDoseUnit(u)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={m.divider} />
          <View style={de.btnRow}>
            <TouchableOpacity style={[m.secondaryBtn, { flex: 1 }]} onPress={onClose}>
              <Text style={m.secondaryBtnText}>{i18n.t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[m.primaryBtn, { flex: 1 }]} onPress={handleConfirm}>
              <Text style={m.primaryBtnText}>{i18n.t('common.confirm')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Timing Picker Modal ──────────────────────────────────────────────────────

type TimingPickerProps = {
  current: string;
  onSelect: (t: string) => void;
  onClose: () => void;
};

function TimingPickerModal({ current, onSelect, onClose }: TimingPickerProps) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={m.overlay} onPress={onClose}>
        <Pressable style={m.card} onPress={() => {}}>
          <View style={tp.header}>
            <Ionicons name="time-outline" size={18} color={C.accent} />
            <View style={{ flex: 1 }}>
              <Text style={m.modalTitle}>{i18n.t('dashboard.selectTiming')}</Text>
              <Text style={tp.hint}>{i18n.t('dashboard.timingHint')}</Text>
            </View>
            <TouchableOpacity style={m.closeBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={18} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={m.divider} />
          {TIMING_OPTIONS.map((opt, i) => {
            const isActive = opt === current;
            const isLast = i === TIMING_OPTIONS.length - 1;
            return (
              <TouchableOpacity
                key={opt}
                style={[tp.option, isLast && { borderBottomWidth: 0 }]}
                onPress={() => { onSelect(opt); onClose(); }}
                activeOpacity={0.65}
              >
                <Text style={[tp.optText, isActive && tp.optTextActive]}>{translateTiming(opt)}</Text>
                {isActive
                  ? <Ionicons name="checkmark-circle" size={20} color={C.accent} />
                  : <Ionicons name="chevron-forward" size={16} color={C.border} />
                }
              </TouchableOpacity>
            );
          })}
          <View style={m.divider} />
          <TouchableOpacity style={m.secondaryBtn} onPress={onClose}>
            <Text style={m.secondaryBtnText}>{i18n.t('common.cancel')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Category Switcher Modal ──────────────────────────────────────────────────

type CatSwitcherProps = {
  items: CategoryItem[];
  current: string;
  onSelect: (name: string) => void;
  onClose: () => void;
};

function CatSwitcherModal({ items, current, onSelect, onClose }: CatSwitcherProps) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={m.overlay} onPress={onClose}>
        <Pressable style={m.card} onPress={() => {}}>
          <View style={cs.header}>
            <Text style={m.modalTitle}>{i18n.t('dashboard.switchCategory')}</Text>
            <TouchableOpacity style={m.closeBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={18} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={m.divider} />
          {items.map((item, i) => {
            const isActive = item.name === current;
            const isLast = i === items.length - 1;
            const dotColor = categoryDotColor(item);
            return (
              <TouchableOpacity
                key={item.id}
                style={[cs.option, isLast && { borderBottomWidth: 0 }]}
                onPress={() => onSelect(item.name)}
                activeOpacity={0.65}
              >
                <View style={[cs.dot, { backgroundColor: dotColor }]} />
                <Text style={[cs.optText, isActive && cs.optTextActive]}>{item.name}</Text>
                {isActive && <Ionicons name="checkmark-circle" size={18} color={C.accent} />}
              </TouchableOpacity>
            );
          })}
          <View style={m.divider} />
          <TouchableOpacity style={m.secondaryBtn} onPress={onClose}>
            <Text style={m.secondaryBtnText}>{i18n.t('common.cancel')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Discount Code Modal ──────────────────────────────────────────────────────

type DiscountCode = {
  id: number;
  code: string;
  description: string;
  discount_percentage: number;
  expiry_date: string | null;
};

type DiscountModalProps = {
  onClose: () => void;
};

function DiscountModal({ onClose }: DiscountModalProps) {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('discount_codes')
          .select('*')
          .eq('is_active', true);
        if (err) throw err;
        setCodes(data ?? []);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleCopy(code: DiscountCode) {
    await Clipboard.setStringAsync(code.code);
    setCopiedId(code.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function formatExpiry(dateStr: string | null): string {
    if (!dateStr) return i18n.t('dashboard.unlimited');
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={m.overlay} onPress={onClose}>
        <Pressable style={[m.card, { maxHeight: '80%' }]} onPress={() => {}}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="pricetag-outline" size={18} color={C.accent} />
              <Text style={m.modalTitle}>{i18n.t('dashboard.discountCodes')}</Text>
            </View>
            <TouchableOpacity style={m.closeBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={18} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={m.divider} />

          {loading ? (
            <ActivityIndicator color={C.accent} style={{ marginVertical: 24 }} />
          ) : error ? (
            <Text style={dc.errorText}>{i18n.t('dashboard.discountError')}</Text>
          ) : codes.length === 0 ? (
            <Text style={dc.errorText}>{i18n.t('dashboard.discountEmpty')}</Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {codes.map(code => {
                const isCopied = copiedId === code.id;
                return (
                  <View key={code.id} style={dc.codeCard}>
                    <View style={dc.codeMain}>
                      <Text style={dc.codeText}>{code.code}</Text>
                      {code.description ? (
                        <Text style={dc.descText}>{code.description}</Text>
                      ) : null}
                      <View style={dc.metaRow}>
                        <View style={dc.metaChip}>
                          <Ionicons name="pricetag" size={11} color={C.accent} />
                          <Text style={dc.metaChipText}>{code.discount_percentage}% OFF</Text>
                        </View>
                        <View style={dc.metaChip}>
                          <Ionicons name="calendar-outline" size={11} color={C.textSecondary} />
                          <Text style={[dc.metaChipText, { color: C.textSecondary }]}>
                            {i18n.t('dashboard.validUntil', { date: formatExpiry(code.expiry_date) })}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[dc.copyBtn, isCopied && dc.copyBtnDone]}
                      onPress={() => handleCopy(code)}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={isCopied ? 'checkmark-circle' : 'copy-outline'}
                        size={16}
                        color="#fff"
                      />
                      <Text style={dc.copyBtnText}>{isCopied ? i18n.t('common.copied') : i18n.t('common.copy')}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Category Modal ───────────────────────────────────────────────────────────

type CategoryModalProps = {
  item: CategoryItem;
  qty: number;
  originalQty: number;
  dose: number;
  doseUnit: string;
  timing: string;
  editingName: boolean;
  nameInput: string;
  restockUrl: string;
  onChangeQty: (n: number) => void;
  onSaveQty: () => void;
  onEditDose: () => void;
  onEditTiming: () => void;
  onStartRename: () => void;
  onConfirmRename: (newName: string) => void;
  onNameInputChange: (text: string) => void;
  onDelete: () => void;
  onClose: () => void;
};

function CategoryModal({
  item, qty, originalQty, dose, doseUnit, timing,
  editingName, nameInput, restockUrl,
  onChangeQty, onSaveQty, onEditDose, onEditTiming,
  onStartRename, onConfirmRename, onNameInputChange,
  onDelete, onClose,
}: CategoryModalProps) {
  const dotColor = categoryDotColor(item);
  const isDirty = qty !== originalQty;
  const primaryBottleSize = item.subItems[0]?.bottleSize ?? 60;
  const [catQtyInlineActive, setCatQtyInlineActive] = useState(false);
  const [catQtyInlineValue, setCatQtyInlineValue] = useState('');

  function commitCatQtyInline() {
    setCatQtyInlineActive(false);
    const n = parseInt(catQtyInlineValue, 10);
    if (!isNaN(n) && n >= 0) onChangeQty(n);
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={m.overlay} onPress={onClose}>
        <Pressable style={m.card} onPress={() => {}}>

          {editingName ? (
            /* ── Editing: stripe + input + confirm + close in one row ── */
            <View style={mo.nameRow}>
              <View style={[mo.stripe, { backgroundColor: dotColor }]} />
              <TextInput
                style={mo.nameInput}
                value={nameInput}
                onChangeText={onNameInputChange}
                onSubmitEditing={() => onConfirmRename(nameInput)}
                autoFocus
                returnKeyType="done"
                selectTextOnFocus
              />
              <TouchableOpacity
                style={mo.confirmBtn}
                onPress={() => onConfirmRename(nameInput)}
                activeOpacity={0.8}
              >
                <Text style={mo.confirmBtnText}>{i18n.t('common.confirm')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={m.closeBtn} onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={18} color={C.textSecondary} />
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Default: name + pencil + close in one row ── */
            <View style={mo.defaultHeaderRow}>
              <View style={[mo.stripe, { backgroundColor: dotColor }]} />
              <Text style={[m.modalTitle, { flex: 1 }]}>{item.name}</Text>
              <TouchableOpacity onPress={onStartRename} hitSlop={10} style={{ marginRight: 10 }}>
                <Ionicons name="pencil" size={17} color={C.accent} />
              </TouchableOpacity>
              <TouchableOpacity style={m.closeBtn} onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={18} color={C.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
          <Text style={[m.modalSubtitle, { marginLeft: 12 }]}>{item.nameEn}</Text>

          <View style={m.divider} />

          {/* ── Stock Details ── */}
          <Text style={m.sectionLabel}>{i18n.t('dashboard.stockDetails')}</Text>
          <DetailRow icon="layers-outline" label={i18n.t('dashboard.remaining')} value={`${qty} ${translateDoseUnit(doseUnit)}`} />
          <EditableDetailRow icon="repeat-outline" label={i18n.t('dashboard.dailyDose')} value={i18n.t('dashboard.dailyDoseValue', { dose, unit: translateDoseUnit(doseUnit) })} onPress={onEditDose} />
          <DetailRow icon="calendar-outline" label={i18n.t('dashboard.estimatedFinish')} value={calcFinishDate(qty, dose)} />
          <EditableDetailRow icon="time-outline" label={i18n.t('dashboard.timing')} value={translateTiming(timing)} onPress={onEditTiming} />

          <View style={m.divider} />

          {/* ── Qty Adjuster ── */}
          <Text style={m.sectionLabel}>{i18n.t('dashboard.adjustStock')}</Text>
          <View style={m.qtyRow}>
            <TouchableOpacity
              style={[m.qtyBtn, qty <= 0 && m.qtyBtnDisabled]}
              onPress={() => onChangeQty(Math.max(0, qty - 1))}
              disabled={qty <= 0}
            >
              <Ionicons name="remove" size={22} color={qty <= 0 ? C.border : C.textPrimary} />
            </TouchableOpacity>
            {catQtyInlineActive ? (
              <TextInput
                style={m.qtyInlineInput}
                value={catQtyInlineValue}
                onChangeText={setCatQtyInlineValue}
                onBlur={commitCatQtyInline}
                onSubmitEditing={commitCatQtyInline}
                keyboardType="numeric"
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                maxLength={5}
              />
            ) : (
              <TouchableOpacity
                style={m.qtyDisplay}
                onPress={() => { setCatQtyInlineValue(String(qty)); setCatQtyInlineActive(true); }}
                activeOpacity={0.7}
              >
                <Text style={m.qtyNum}>{qty}</Text>
                <Text style={m.qtyUnit}>{translateDoseUnit(doseUnit)}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={m.qtyBtn}
              onPress={() => onChangeQty(qty + 1)}
            >
              <Ionicons name="add" size={22} color={C.textPrimary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[m.saveBtn, !isDirty && m.saveBtnDisabled]}
            onPress={isDirty ? onSaveQty : undefined}
            disabled={!isDirty}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color={isDirty ? '#fff' : C.textSecondary} />
            <Text style={[m.saveBtnText, !isDirty && m.saveBtnTextDisabled]}>{i18n.t('common.save')}</Text>
          </TouchableOpacity>

          <View style={m.divider} />

          <TouchableOpacity
            style={m.primaryBtn}
            onPress={() => executeReorder({ keyword: '', url: restockUrl })}
            activeOpacity={0.8}
          >
            <Ionicons name="cart-outline" size={16} color="#fff" />
            <Text style={m.primaryBtnText}>{i18n.t('dashboard.restock')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={m.deleteBtn} onPress={onDelete} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={15} color={C.red} />
            <Text style={m.deleteBtnText}>{i18n.t('dashboard.deleteItem')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={m.secondaryBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={m.secondaryBtnText}>{i18n.t('common.close')}</Text>
          </TouchableOpacity>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Sub-Item Stock Adjust Modal ─────────────────────────────────────────────

type SubItemAdjustProps = {
  sub: SubItem;
  qty: number;
  onChangeQty: (n: number) => void;
  onConfirm: () => void;
  onDelete: () => void;
  onClose: () => void;
  onUpdateBrandSpec: (brand: string, spec: string) => void;
};

function SubItemAdjustModal({ sub, qty, onChangeQty, onConfirm, onDelete, onClose, onUpdateBrandSpec }: SubItemAdjustProps) {
  const [editingMeta, setEditingMeta] = useState(false);
  const [brandInput, setBrandInput] = useState(sub.brand);
  const [specInput, setSpecInput] = useState(sub.spec);
  const [qtyInlineActive, setQtyInlineActive] = useState(false);
  const [qtyInlineValue, setQtyInlineValue] = useState('');

  function handleMetaConfirm() {
    onUpdateBrandSpec(brandInput.trim(), specInput.trim());
    setEditingMeta(false);
  }

  function commitQtyInline() {
    setQtyInlineActive(false);
    const n = parseInt(qtyInlineValue, 10);
    if (!isNaN(n) && n >= 0) onChangeQty(n);
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={m.overlay} onPress={onClose}>
        <Pressable style={m.card} onPress={() => {}}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={m.modalTitle}>{i18n.t('dashboard.adjustSubItem')}</Text>
            <TouchableOpacity style={m.closeBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={18} color={C.textSecondary} />
            </TouchableOpacity>
          </View>

          {editingMeta ? (
            <View style={{ marginBottom: 4 }}>
              <TextInput
                style={sa.metaInput}
                value={brandInput}
                onChangeText={setBrandInput}
                placeholder="Brand"
                placeholderTextColor={C.textSecondary}
                autoFocus
                returnKeyType="next"
              />
              <TextInput
                style={[sa.metaInput, { marginTop: 6 }]}
                value={specInput}
                onChangeText={setSpecInput}
                placeholder="Spec"
                placeholderTextColor={C.textSecondary}
                returnKeyType="done"
                onSubmitEditing={handleMetaConfirm}
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity style={[m.secondaryBtn, { flex: 1 }]} onPress={() => { setBrandInput(sub.brand); setSpecInput(sub.spec); setEditingMeta(false); }}>
                  <Text style={m.secondaryBtnText}>{i18n.t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[m.saveBtn, { flex: 1 }]} onPress={handleMetaConfirm} activeOpacity={0.8}>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                  <Text style={m.saveBtnText}>{i18n.t('common.confirm')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={sa.metaRow} onPress={() => setEditingMeta(true)} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={m.modalSubtitle}>{sub.brand}</Text>
                <Text style={[m.modalSubtitle, { marginTop: 2 }]}>{sub.spec}</Text>
              </View>
              <Ionicons name="pencil-outline" size={16} color={C.accent} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          )}

          <View style={m.divider} />
          <View style={m.qtyRow}>
            <TouchableOpacity
              style={[m.qtyBtn, qty <= 0 && m.qtyBtnDisabled]}
              onPress={() => onChangeQty(Math.max(0, qty - 1))}
              disabled={qty <= 0}
            >
              <Ionicons name="remove" size={22} color={qty <= 0 ? C.border : C.textPrimary} />
            </TouchableOpacity>
            {qtyInlineActive ? (
              <TextInput
                style={m.qtyInlineInput}
                value={qtyInlineValue}
                onChangeText={setQtyInlineValue}
                onBlur={commitQtyInline}
                onSubmitEditing={commitQtyInline}
                keyboardType="numeric"
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                maxLength={5}
              />
            ) : (
              <TouchableOpacity
                style={m.qtyDisplay}
                onPress={() => { setQtyInlineValue(String(qty)); setQtyInlineActive(true); }}
                activeOpacity={0.7}
              >
                <Text style={m.qtyNum}>{qty}</Text>
                <Text style={m.qtyUnit}>{translateDoseUnit(sub.doseUnit)}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={m.qtyBtn} onPress={() => onChangeQty(qty + 1)}>
              <Ionicons name="add" size={22} color={C.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={m.divider} />
          <TouchableOpacity style={m.saveBtn} onPress={onConfirm} activeOpacity={0.8}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
            <Text style={m.saveBtnText}>{i18n.t('common.save')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[m.secondaryBtn, { marginTop: 12 }]} onPress={onClose} activeOpacity={0.7}>
            <Text style={m.secondaryBtnText}>{i18n.t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[m.deleteBtn, { marginTop: 12 }]} onPress={onDelete} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={15} color={C.red} />
            <Text style={m.deleteBtnText}>{i18n.t('dashboard.deleteSubItem')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Quick Add Modal ──────────────────────────────────────────────────────────

type QuickAddModalProps = {
  existingNames: string[];
  onConfirm: (name: string, qty: number) => void;
  onClose: () => void;
};

function QuickAddModal({ existingNames, onConfirm, onClose }: QuickAddModalProps) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');

  function handleConfirm() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('', i18n.t('dashboard.quickAddEmptyName'));
      return;
    }
    if (existingNames.some(n => n === trimmedName)) {
      Alert.alert('', i18n.t('dashboard.quickAddDuplicate'));
      return;
    }
    const qtyNum = parseInt(qty, 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      Alert.alert('', i18n.t('dashboard.quickAddInvalidQty'));
      return;
    }
    onConfirm(trimmedName, qtyNum);
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={m.overlay} onPress={onClose}>
        <Pressable style={m.card} onPress={() => {}}>
          <View style={qa.header}>
            <Ionicons name="add-circle-outline" size={18} color={C.accent} />
            <Text style={[m.modalTitle, { flex: 1 }]}>{i18n.t('dashboard.quickAdd')}</Text>
            <TouchableOpacity style={m.closeBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={18} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={m.divider} />
          <Text style={qa.label}>{i18n.t('dashboard.quickAddName')}</Text>
          <TextInput
            style={qa.input}
            value={name}
            onChangeText={setName}
            placeholder={i18n.t('dashboard.quickAddNamePlaceholder')}
            placeholderTextColor={C.textSecondary}
            autoFocus
            returnKeyType="next"
          />
          <Text style={[qa.label, { marginTop: 14 }]}>{i18n.t('dashboard.quickAddQty')}</Text>
          <TextInput
            style={qa.input}
            value={qty}
            onChangeText={t => setQty(t.replace(/[^0-9]/g, ''))}
            placeholder={i18n.t('dashboard.quickAddQtyPlaceholder')}
            placeholderTextColor={C.textSecondary}
            keyboardType="numeric"
            returnKeyType="done"
          />
          <View style={m.divider} />
          <View style={qa.btnRow}>
            <TouchableOpacity style={[m.secondaryBtn, { flex: 1 }]} onPress={onClose}>
              <Text style={m.secondaryBtnText}>{i18n.t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[qa.confirmBtn, { flex: 1 }]} onPress={handleConfirm} activeOpacity={0.8}>
              <Text style={qa.confirmBtnText}>{i18n.t('dashboard.quickAddConfirm')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Low Stock Notification ───────────────────────────────────────────────────

async function checkLowStockNotifications(items: CategoryItem[]): Promise<void> {
  if (isExpoGo) return;
  try {
    const enabled = await getSetting('notifications_enabled');
    if (enabled === 'false') return;

    const today = new Date().toISOString().slice(0, 10);
    const lastNotify = await getSetting('last_notify_date');
    if (lastNotify === today) return;

    const lowItems = items.flatMap(cat =>
      cat.subItems
        .filter(si => si.isActive && cat.dailyDose > 0 && Math.floor(si.remaining / cat.dailyDose) < 14)
        .map(si => ({ cat, si, days: Math.floor(si.remaining / cat.dailyDose) }))
    );

    for (const { cat: _cat, si, days } of lowItems) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: i18n.t('dashboard.notifTitle'),
          body: i18n.t('dashboard.notifBody', { name: `${si.brand} ${si.spec}`, days }),
        },
        trigger: null,
      });
    }

    if (lowItems.length > 0) {
      await setSetting('last_notify_date', today);
    }
  } catch (e) {
    console.error('checkLowStockNotifications error', e);
  }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { language } = useLanguage();
  const { renameCategory, addCategory, removeCategory, consumePendingItems, isReady } = useCategories();
  const [activeAccount, setActiveAccount] = useState(0);
  const [items, setItems] = useState<CategoryItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const itemsReadyRef = useRef(false);

  const trackedSetItems = (newItems: CategoryItem[], source: string) => {
    if (__DEV__ && (newItems?.length || 0) === 0) {
      console.warn(`[STATE TRACE] WARNING: setItems(${source}) called with empty array! Stack:`, new Error().stack);
    }
    setItems(newItems);
  };
  const isDeductingRef = useRef(false);
  const isSavingRef = useRef(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showDiscountModal, setShowDiscountModal] = useState(false);

  // Modal state
  const [selectedCat, setSelectedCat] = useState<CategoryItem | null>(null);
  const [currentQty, setCurrentQty] = useState(0);
  const [originalQty, setOriginalQty] = useState(0);
  const [currentDose, setCurrentDose] = useState(0);
  const [currentDoseUnit, setCurrentDoseUnit] = useState('顆');
  const [currentTiming, setCurrentTiming] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // Sub-modal flags (all at same level — avoids Android nested-Modal issues)
  const [showDoseEditor, setShowDoseEditor] = useState(false);
  const [showTimingPicker, setShowTimingPicker] = useState(false);
  const [showCatSwitcher, setShowCatSwitcher] = useState(false);

  // Sub-item stock adjust modal
  const [showSubItemAdjust, setShowSubItemAdjust] = useState(false);
  const [subItemAdjustTarget, setSubItemAdjustTarget] = useState<{ sub: SubItem; catId: string } | null>(null);
  const [subItemAdjustQty, setSubItemAdjustQty] = useState(0);
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState('');

  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const [country, setCountry] = useState<CountryCode>('TW');
  const [sortPreference, setSortPreference] = useState<'days' | 'custom'>('days');
  const [defaultRestockPlatform, setDefaultRestockPlatform] = useState<RestockPlatform>('iherb');
  const [showBeginnerGuide, setShowBeginnerGuide] = useState(true);
  const [lowStockReminderEnabled, setLowStockReminderEnabled] = useState(true);
  const [taxData, setTaxData] = useState({
    usedCount: 0, remainCount: 0, spentAmount: 0, remainAmount: 0, pct: 0,
  });
  const alertCats = items.filter(cat => categoryTotalDays(cat) < 14);
  const sortedAlerts = [...alertCats].sort((a, b) => categoryTotalDays(a) - categoryTotalDays(b));

  const ACCOUNTS = [i18n.t('common.person'), i18n.t('dashboard.multiAccount')];

  // ── Load items from DB once CategoriesContext is ready ────────────────
  useEffect(() => {
    if (!isReady) return;
    (async () => {
      let loadedItems: CategoryItem[] = INITIAL_ITEMS;
      try {
        await runDailyDeductionIfNeeded();
        const saved = await loadCategoryItems();
        if (saved.length > 0) {
          loadedItems = saved;
          trackedSetItems(saved, 'initialLoad:fromDB');
        } else {
          trackedSetItems(INITIAL_ITEMS, 'initialLoad:seedEmptyDB');
          await saveCategoryItems(INITIAL_ITEMS);
        }
      } catch (e) {
        console.error('DashboardScreen initial load error', e);
        trackedSetItems(INITIAL_ITEMS, 'initialLoad:errorFallback');
      } finally {
        itemsReadyRef.current = true;
        setItemsLoading(false);
      }
      checkLowStockNotifications(loadedItems);
    })();
  }, [isReady]);

  // ── Persist items to DB whenever they change ───────────────────────────
  useEffect(() => {
    if (!itemsReadyRef.current) return;
    if (isSavingRef.current) {
      if (__DEV__) console.log('[SERIALIZATION] Save blocked: Transaction already in progress.');
      return;
    }
    isSavingRef.current = true;
    saveCategoryItems(items)
      .catch(e => {
        if (__DEV__) console.error('[DB FATAL] FK Failure caught. Aborting DB write but PRESERVING memory state.', e);
      })
      .finally(() => {
        isSavingRef.current = false;
      });
  }, [items]);

  // ── Reload country setting + tax quota from DB on focus ───────────────
  useFocusEffect(
    React.useCallback(() => {
      async function loadTaxData() {
        try {
          const [savedCountry, savedSort, savedPlatform, savedGuide, taxOv, notifEnabled] = await Promise.all([
            getSetting('country'),
            getSetting('sort_preference'),
            getSetting('default_restock_platform'),
            getSetting('show_beginner_guide'),
            getSetting('tax_threshold_override'),
            getSetting('notifications_enabled'),
          ]);
          setShowBeginnerGuide(savedGuide !== '0');
          setLowStockReminderEnabled(notifEnabled !== 'false');
          const c: CountryCode =
            savedCountry === 'TW' || savedCountry === 'JP' || savedCountry === 'KR' || savedCountry === 'OFF'
              ? savedCountry
              : 'TW';
          setCountry(c);
          if (savedSort === 'days' || savedSort === 'custom') setSortPreference(savedSort);
          if (savedPlatform === 'iherb' || savedPlatform === 'amazon' || savedPlatform === 'vitacost' || savedPlatform === 'swanson') {
            setDefaultRestockPlatform(savedPlatform);
          }

          const rule = COUNTRY_RULES[c];
          const parsedOv = taxOv ? parseFloat(taxOv) : NaN;
          const activeTaxThreshold = (Number.isFinite(parsedOv) && parsedOv > 0) ? parsedOv : rule.taxFreePerOrder;
          const orders = await loadOrders();

          if (c === 'OFF') {
            const allSpent = orders.filter(o => o.isOverseas).reduce((s, o) => s + o.totalAmount, 0);
            setTaxData({ usedCount: 0, remainCount: 0, spentAmount: allSpent, remainAmount: 0, pct: 0 });
            return;
          }

          const [start, end] = halfYearRange();
          const periodOrders = orders.filter(o => {
            const d = new Date(o.date);
            return d >= start && d <= end;
          });
          const taxFreeOrders = periodOrders.filter(o => o.isOverseas && o.totalAmount <= activeTaxThreshold);
          const count = taxFreeOrders.length;
          const spent = periodOrders.reduce((s, o) => s + o.totalAmount, 0);

          if (rule.quotaCount > 0) {
            const remain = Math.max(0, rule.quotaCount - count);
            setTaxData({
              usedCount: count,
              remainCount: remain,
              spentAmount: spent,
              remainAmount: remain * activeTaxThreshold,
              pct: Math.min(count / rule.quotaCount, 1),
            });
          } else {
            setTaxData({ usedCount: count, remainCount: 0, spentAmount: spent, remainAmount: 0, pct: 0 });
          }
        } catch (e) {
          console.error('loadTaxData error', e);
        }
      }
      loadTaxData();
    }, [])
  );

  // ── Consume pending items from ReplenishScreen on focus ────────────────

  const consumeRef = useRef(consumePendingItems);
  consumeRef.current = consumePendingItems;

  useFocusEffect(
    React.useCallback(() => {
      const pending = consumeRef.current();
      if (pending.length === 0) return;
      // upsertProductSource is intentionally skipped here: it fires before category_items
      // exists in DB (setItems is async), causing FK constraint failure. iherb_url is
      // already persisted in sub_items.iherb_url and serves as the reorder URL fallback.
      setItems(prev => {
        let next = [...prev];
        for (const { categoryName, subItem, sourceUrl } of pending) {
          const idx = next.findIndex(c => c.name === categoryName);
          if (idx >= 0) {
            const catId = next[idx].id;
            next = next.map((cat, i) => {
              if (i !== idx) return cat;
              const existIdx = cat.subItems.findIndex(
                si => normalizeKey(si.brand, si.spec) === normalizeKey(subItem.brand, subItem.spec)
              );
              if (existIdx >= 0) {
                // Same product already exists → accumulate remaining
                const newSubs = cat.subItems.map((si, j) =>
                  j === existIdx ? { ...si, remaining: si.remaining + subItem.remaining } : si
                );
                return { ...cat, subItems: newSubs };
              }
              return { ...cat, subItems: [...cat.subItems, subItem] };
            });
            // sourceUrl intentionally not queued — see pendingSources bypass comment above
          } else {
            const newId = `cat_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            next = [...next, {
              id: newId,
              name: categoryName,
              nameEn: '',
              maxDays: 30,
              dailyDose: 1,
              doseUnit: '顆',
              timing: '飯後',
              iherbUrl: buildIHerbSearchUrl(categoryName),
              subItems: [subItem],
            }];
          // sourceUrl intentionally not queued — see pendingSources bypass comment above
          }
        }
        return next;
      });
    }, [])
  );

  // ── Daily deduction on every focus ────────────────────────────────────

  useFocusEffect(
    React.useCallback(() => {
      if (!itemsReadyRef.current) return;
      if (isDeductingRef.current) return;
      isDeductingRef.current = true;
      (async () => {
        try {
          await runDailyDeductionIfNeeded();
          const refreshed = await loadCategoryItems();
          if (isSavingRef.current) {
            if (__DEV__) console.log('[CONSISTENCY] Blocked stale DB reload. Fresh state is being persisted.');
          } else if (refreshed.length > 0) {
            trackedSetItems(refreshed, 'dailyDeductionFocus');
          }
        } catch (e) {
          console.error('daily deduction focus error', e);
        } finally {
          isDeductingRef.current = false;
        }
      })();
    }, [])
  );

  // ── Expand / Collapse ──────────────────────────────────────────────────

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Modal open / close ─────────────────────────────────────────────────

  function openModal(cat: CategoryItem) {
    const totalRemaining = cat.subItems.reduce((sum, s) => sum + s.remaining, 0);
    setSelectedCat(cat);
    setCurrentQty(totalRemaining);
    setOriginalQty(totalRemaining);
    setCurrentDose(cat.dailyDose);
    setCurrentDoseUnit(cat.doseUnit);
    setCurrentTiming(cat.timing);
    setEditingName(false);
    setNameInput(cat.name);
  }

  function closeModal() {
    setSelectedCat(null);
    setEditingName(false);
    setShowDoseEditor(false);
    setShowTimingPicker(false);
    setShowCatSwitcher(false);
  }

  // ── Modal actions ──────────────────────────────────────────────────────

  async function saveQty() {
    if (!selectedCat || selectedCat.subItems.length === 0) return;
    const catId = selectedCat.id;
    const diff = currentQty - originalQty;

    const maxIdx = selectedCat.subItems.reduce(
      (bestIdx, si, i, arr) => (si.remaining > arr[bestIdx].remaining ? i : bestIdx),
      0,
    );
    const targetSub = selectedCat.subItems[maxIdx];
    const newRemaining = Math.max(0, targetSub.remaining + diff);

    setItems(prev => prev.map(cat => {
      if (cat.id !== catId) return cat;
      return {
        ...cat,
        subItems: cat.subItems.map((si, i) => i === maxIdx ? { ...si, remaining: newRemaining } : si),
      };
    }));
    setOriginalQty(currentQty);

    try {
      await updateSubItemRemaining(targetSub.id, newRemaining);
    } catch (e) {
      console.error('saveQty DB error', e);
    }
  }

  function handleRename(newName: string) {
    if (!selectedCat) return;
    const trimmed = newName.trim();

    if (trimmed === selectedCat.name) {
      setEditingName(false);
      return;
    }

    if (!trimmed) {
      Alert.alert(i18n.t('dashboard.nameEmpty'));
      return;
    }

    const isDuplicate = items.some(cat => cat.id !== selectedCat.id && cat.name === trimmed);
    if (isDuplicate) {
      Alert.alert(i18n.t('dashboard.nameDuplicate'), i18n.t('dashboard.nameDuplicateMsg'));
      return;
    }

    const oldName = selectedCat.name;
    setItems(prev => prev.map(cat => cat.id === selectedCat.id ? { ...cat, name: trimmed } : cat));
    renameCategory(oldName, trimmed);
    addCategory(trimmed);
    setSelectedCat(prev => prev ? { ...prev, name: trimmed } : null);
    setEditingName(false);
  }

  async function handleSubItemPress(sub: SubItem, parentCat: CategoryItem) {
    const keyword = `${sub.brand} ${sub.spec}`.trim();
    const productId = sub.id;
    const baseUrl = await getProductUrl(sub.id, sub.iherbUrl);

    Alert.alert(
      i18n.t('dashboard.restockAlert'),
      `${sub.brand}\n${sub.spec}`,
      [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        { text: i18n.t('dashboard.restock'), onPress: () => {
          executeReorder({ keyword, url: baseUrl || undefined });
          logEvent({
            event_type: 'click_product',
            target_type: 'product',
            target_id: productId || baseUrl || keyword,
            context: { screen: 'DashboardScreen', url: baseUrl || keyword },
          });
        }},
      ],
    );
  }

  function handleSubItemQtyPress(sub: SubItem, cat: CategoryItem) {
    setSubItemAdjustTarget({ sub, catId: cat.id });
    setSubItemAdjustQty(sub.remaining);
    setShowSubItemAdjust(true);
  }

  async function handleInlineEditConfirm(sub: SubItem, catId: string, value: string) {
    setInlineEditId(null);
    const qty = Math.max(0, parseInt(value, 10) || 0);
    setItems(prev => prev.map(cat =>
      cat.id !== catId ? cat :
      { ...cat, subItems: cat.subItems.map(si => si.id === sub.id ? { ...si, remaining: qty } : si) }
    ));
    try {
      await updateSubItemRemaining(sub.id, qty);
    } catch (e) {
      console.error('inlineEditConfirm DB error', e);
    }
  }

  async function handleToggleSubItemActive(sub: SubItem, catId: string) {
    const newActive = !sub.isActive;
    setItems(prev => prev.map(cat => {
      if (cat.id !== catId) return cat;
      return {
        ...cat,
        subItems: cat.subItems.map(si => si.id === sub.id ? { ...si, isActive: newActive } : si),
      };
    }));
    try {
      await updateSubItemActive(sub.id, newActive);
    } catch (e) {
      console.error('handleToggleSubItemActive DB error', e);
    }
  }

  async function saveSubItemQty() {
    if (!subItemAdjustTarget) return;
    const { sub, catId } = subItemAdjustTarget;
    const qty = subItemAdjustQty;
    setItems(prev => prev.map(cat => {
      if (cat.id !== catId) return cat;
      return {
        ...cat,
        subItems: cat.subItems.map(si => si.id === sub.id ? { ...si, remaining: qty } : si),
      };
    }));
    setShowSubItemAdjust(false);
    setSubItemAdjustTarget(null);
    try {
      await updateSubItemRemaining(sub.id, qty);
    } catch (e) {
      console.error('saveSubItemQty DB error', e);
    }
  }

  async function handleUpdateSubItemBrandSpec(brand: string, spec: string) {
    if (!subItemAdjustTarget) return;
    const { sub, catId } = subItemAdjustTarget;
    setSubItemAdjustTarget(prev => prev ? { ...prev, sub: { ...prev.sub, brand, spec } } : prev);
    setItems(prev => prev.map(cat => {
      if (cat.id !== catId) return cat;
      return {
        ...cat,
        subItems: cat.subItems.map(si => si.id === sub.id ? { ...si, brand, spec } : si),
      };
    }));
    try {
      await updateSubItemBrandSpec(sub.id, brand, spec);
    } catch (e) {
      console.error('updateSubItemBrandSpec DB error', e);
    }
  }

  function handleDeleteSubItem() {
    if (!subItemAdjustTarget) return;
    const { sub, catId } = subItemAdjustTarget;
    const cat = items.find(c => c.id === catId);
    if (!cat) return;

    Alert.alert(
      i18n.t('dashboard.deleteSubItemTitle'),
      i18n.t('dashboard.deleteSubItemMsg', { name: `${sub.brand} ${sub.spec}` }),
      [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        {
          text: i18n.t('common.confirmDelete'),
          style: 'destructive',
          onPress: () => {
            setShowSubItemAdjust(false);
            setSubItemAdjustTarget(null);
            const remainingSubs = cat.subItems.filter(si => si.id !== sub.id);
            if (remainingSubs.length === 0) {
              setItems(prev => prev.filter(c => c.id !== catId));
              removeCategory(cat.name);
            } else {
              setItems(prev => prev.map(c =>
                c.id !== catId ? c : { ...c, subItems: remainingSubs }
              ));
            }
          },
        },
      ]
    );
  }

  async function handleDoseConfirm(v: number, u: string) {
    if (!selectedCat) return;
    setCurrentDose(v);
    setCurrentDoseUnit(u);
    setItems(prev => prev.map(cat =>
      cat.id === selectedCat.id ? { ...cat, dailyDose: v, doseUnit: u } : cat
    ));
    try {
      await updateCategoryDose(selectedCat.id, v, u);
    } catch (e) {
      console.error('handleDoseConfirm DB error', e);
    }
  }

  async function handleTimingSelect(t: string) {
    if (!selectedCat) return;
    setCurrentTiming(t);
    setItems(prev => prev.map(cat =>
      cat.id === selectedCat.id ? { ...cat, timing: t } : cat
    ));
    try {
      await updateCategoryTiming(selectedCat.id, t);
    } catch (e) {
      console.error('handleTimingSelect DB error', e);
    }
  }

  function handleDeleteCategory() {
    const cat = selectedCat;
    if (!cat) return;
    closeModal();
    Alert.alert(
      i18n.t('dashboard.deleteCategoryTitle'),
      i18n.t('dashboard.deleteCategoryMsg', { name: cat.name }),
      [
        { text: i18n.t('common.cancel'), style: 'cancel', onPress: () => openModal(cat) },
        {
          text: i18n.t('common.confirmDelete'),
          style: 'destructive',
          onPress: () => {
            setItems(prev => prev.filter(c => c.id !== cat.id));
            removeCategory(cat.name);
          },
        },
      ],
    );
  }

  function switchCategory(catName: string) {
    const cat = items.find(c => c.name === catName);
    if (cat) openModal(cat);
    setShowCatSwitcher(false);
  }

  function handleQuickAdd(name: string, qty: number) {
    const now = Date.now();
    const newCat: CategoryItem = {
      id: `cat_${now}`,
      name,
      nameEn: '',
      maxDays: 30,
      dailyDose: 1,
      doseUnit: '顆',
      timing: '早餐後',
      iherbUrl: '',
      subItems: [{
        id: `sub_${now}`,
        brand: 'NA',
        spec: 'NA',
        remaining: qty,
        bottleSize: qty,
        doseUnit: '顆',
        isActive: true,
        iherbUrl: '',
      }],
    };
    setItems(prev => [...prev, newCat]);
    addCategory(name);
    setShowQuickAdd(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (itemsLoading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator style={{ flex: 1 }} color={C.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Brand + Account Tabs ── */}
        <View style={s.header}>
          <View style={s.brandRow}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={s.brand}>uHerb</Text>
              <Text style={s.brandAccent}>Sync</Text>
            </View>
            <TouchableOpacity
              style={s.discountBtn}
              onPress={() => setShowDiscountModal(true)}
              activeOpacity={0.7}
              hitSlop={8}
            >
              <Ionicons name="pricetag-outline" size={20} color={C.accent} />
            </TouchableOpacity>
          </View>
          <View style={s.tabRow}>
            {ACCOUNTS.map((acc, i) => (
              <TouchableOpacity
                key={acc}
                style={[s.tab, activeAccount === i && s.tabActive]}
                onPress={() => setActiveAccount(i)}
                activeOpacity={0.7}
              >
                <Text style={[s.tabText, activeAccount === i && s.tabTextActive]}>{acc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Beginner Guide Banner ── */}
        {showBeginnerGuide && (
          <TouchableOpacity
            style={s.beginnerBtn}
            onPress={() => Alert.alert(
              i18n.t('common.beginner_guide'),
              i18n.t('common.beginner_guide_confirm'),
              [
                { text: i18n.t('common.cancel'), style: 'cancel' },
                { text: i18n.t('common.confirm'), onPress: () => {
                  const guideUrl = language === 'en'
                    ? 'https://kissgu24.github.io/uherbsync/guide-en.html'
                    : 'https://kissgu24.github.io/uherbsync/guide-zh.html';
                  Linking.openURL(guideUrl);
                }},
              ]
            )}
            activeOpacity={0.8}
          >
            <Ionicons name="book-outline" size={15} color={C.accent} />
            <Text style={s.beginnerBtnText}>{i18n.t('common.beginner_guide')}</Text>
            <Ionicons name="chevron-forward" size={14} color={C.textSecondary} />
          </TouchableOpacity>
        )}

        {activeAccount === 0 ? (
          <>
            {/* ── Tax Quota Card ── */}
            {(() => {
              const rule = COUNTRY_RULES[country];
              const showCountCol = rule.quotaCount > 0 || country === 'OFF';
              const headerLabel = country === 'OFF'
                ? i18n.t('dashboard.taxTrackingOff')
                : i18n.t('dashboard.taxQuotaLabel', { period: halfYearLabel() });
              const currentMonth = new Date().getMonth() + 1;
              const taxTitle = currentMonth <= 6 ? i18n.t('dashboard.tax_period_h1') : i18n.t('dashboard.tax_period_h2');
              return (
                <View style={s.card}>
                  <View style={s.cardHeaderRow}>
                    <Ionicons name="shield-checkmark-outline" size={14} color={C.textSecondary} />
                    <Text style={s.cardLabel}> {headerLabel}</Text>
                  </View>
                  <View style={s.statRow}>
                    {showCountCol && (
                      <>
                        <View style={s.statItem}>
                          <Text style={s.statMini} numberOfLines={1} ellipsizeMode="tail">{i18n.t('dashboard.usedOrders')}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                            <Text style={s.statBig}>{taxData.usedCount}</Text>
                            {rule.quotaCount > 0 && (
                              <Text style={s.statSub}>/{rule.quotaCount}</Text>
                            )}
                          </View>
                        </View>
                        <View style={s.statDivider} />
                      </>
                    )}
                    <View style={s.statItem}>
                      <Text style={s.statMini} numberOfLines={1} ellipsizeMode="tail">{taxTitle}</Text>
                      <Text style={[s.statMed, { color: C.orange }]}>
                        {formatCurrency(taxData.spentAmount, language)}
                      </Text>
                    </View>
                    {showCountCol && (
                      <>
                        <View style={s.statDivider} />
                        <View style={s.statItem}>
                          <Text style={s.statMini} numberOfLines={1} ellipsizeMode="tail">
                            {currentMonth <= 6 ? i18n.t('dashboard.remainingQuotaH1') : i18n.t('dashboard.remainingQuotaH2')}
                          </Text>
                          <Text style={[s.statMed, { color: C.green }]}>
                            {formatCurrency(taxData.remainAmount, language)}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${Math.round(taxData.pct * 100)}%` as `${number}%` }]} />
                  </View>
                  <View style={s.progressMeta}>
                    <Text style={s.progressMetaText}>{i18n.t('dashboard.quotaProgress')}</Text>
                    <Text style={[s.progressMetaText, { color: C.accent }]}>{Math.round(taxData.pct * 100)}%</Text>
                  </View>
                  <Text style={s.taxDisclaimer}>{i18n.t('dashboard.taxDisclaimer')}</Text>
                </View>
              );
            })()}

            {/* ── Low Stock Alert Banners (sorted by urgency, priority stack) ── */}
            {lowStockReminderEnabled && sortedAlerts.length > 0 && (
              <View style={{ marginBottom: 10 }}>
                {sortedAlerts.map((cat, index) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      s.alert,
                      {
                        marginTop: index === 0 ? 0 : -55,
                        marginBottom: 0,
                        zIndex: sortedAlerts.length - index,
                        borderColor: 'rgba(255,255,255,0.2)',
                        transform: [
                          { scale: 1 - index * 0.04 },
                          { translateY: index * 4 },
                        ],
                        opacity: 1 - index * 0.1,
                        elevation: Math.max(5 - index, 0),
                        shadowOpacity: Math.max(0.5 - index * 0.05, 0.2),
                      },
                    ]}
                    activeOpacity={0.85}
                    onPress={() => openModal(cat)}
                  >
                    <View style={s.alertIcon}>
                      <Ionicons name="warning" size={18} color="#fff" />
                    </View>
                    <Text style={s.alertText} numberOfLines={1}>
                      {i18n.t('dashboard.alertBanner', { name: cat.name, days: categoryTotalDays(cat) })}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ── Category List ── */}
            <View style={s.sectionTitleRow}>
              <Text style={s.sectionTitle}>{i18n.t('dashboard.sectionTitle')}</Text>
              <TouchableOpacity onPress={() => setShowQuickAdd(true)} hitSlop={8} activeOpacity={0.7}>
                <Ionicons name="add-circle-outline" size={22} color={C.accent} />
              </TouchableOpacity>
            </View>

            {(sortPreference === 'days'
              ? [...items].sort((a, b) => categoryTotalDays(a) - categoryTotalDays(b))
              : items
            ).map(cat => {
              const dotColor = categoryDotColor(cat);
              const totalDays = categoryTotalDays(cat);
              const pct = Math.min(totalDays / cat.maxDays, 1);
              const isExpanded = expandedIds.has(cat.id);

              return (
                <View key={cat.id} style={s.catCard}>
                  {/* ── Category header row ── */}
                  <View style={s.catHeaderRow}>
                    <View style={[s.catStripe, { backgroundColor: dotColor }]} />

                    <TouchableOpacity
                      style={s.catBody}
                      onPress={() => openModal(cat)}
                      activeOpacity={0.7}
                    >
                      <View style={s.catTopRow}>
                        <View style={s.catNameGroup}>
                          <View style={[s.colorDot, { backgroundColor: dotColor }]} />
                          <Text style={s.catName}>{cat.name}</Text>
                        </View>
                        <Text style={[s.catDays, { color: dotColor }]}>{totalDays}{i18n.t('common.daysUnit')}</Text>
                      </View>
                      <View style={s.catTrack}>
                        <View style={[s.catFill, {
                          width: `${Math.round(pct * 100)}%` as `${number}%`,
                          backgroundColor: dotColor,
                        }]} />
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={s.chevronBtn}
                      onPress={() => toggleExpand(cat.id)}
                      activeOpacity={0.7}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={C.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* ── Sub-items (expanded) ── */}
                  {isExpanded && cat.subItems.length > 0 && (
                    <View style={s.subItemList}>
                      {cat.subItems.map((sub, idx) => {
                        const subDot = subDotColor(sub, cat.dailyDose);
                        const isLast = idx === cat.subItems.length - 1;
                        return (
                          <View
                            key={sub.id}
                            style={[s.subItemRow, !isLast && s.subItemRowDivider]}
                          >
                            <TouchableOpacity
                              style={s.subItemLeft}
                              onPress={() => handleSubItemPress(sub, cat)}
                              activeOpacity={0.7}
                            >
                              <View style={[s.subColorDot, { backgroundColor: subDot }]} />
                              <View style={s.subInfo}>
                                <Text style={s.subBrand}>{sub.brand}</Text>
                                <Text style={s.subSpec} numberOfLines={1}>{sub.spec}</Text>
                              </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={s.subActiveToggle}
                              onPress={() => handleToggleSubItemActive(sub, cat.id)}
                              activeOpacity={0.7}
                              hitSlop={6}
                            >
                              <Ionicons
                                name={sub.isActive ? 'checkmark-circle' : 'ellipse-outline'}
                                size={20}
                                color={sub.isActive ? C.green : C.textSecondary}
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleSubItemQtyPress(sub, cat)}
                              activeOpacity={0.7}
                              hitSlop={8}
                              style={{ paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Ionicons name="create-outline" size={16} color={C.textSecondary} />
                            </TouchableOpacity>
                            {inlineEditId === sub.id ? (
                              <View style={s.subItemRight}>
                                <TextInput
                                  style={s.subRemainingInput}
                                  value={inlineEditValue}
                                  onChangeText={setInlineEditValue}
                                  onBlur={() => handleInlineEditConfirm(sub, cat.id, inlineEditValue)}
                                  onSubmitEditing={() => handleInlineEditConfirm(sub, cat.id, inlineEditValue)}
                                  keyboardType="numeric"
                                  autoFocus
                                  selectTextOnFocus
                                  returnKeyType="done"
                                  maxLength={5}
                                />
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={s.subItemRight}
                                onPress={() => { setInlineEditId(sub.id); setInlineEditValue(String(sub.remaining)); }}
                                activeOpacity={0.7}
                              >
                                <Text style={s.subRemaining}>
                                  {sub.remaining} {translateDoseUnit(sub.doseUnit)}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        ) : (
          <View style={s.comingSoonCard}>
            <Ionicons name="people-outline" size={48} color={C.textSecondary} />
            <Text style={s.comingSoonTitle}>{i18n.t('dashboard.multiAccount')}</Text>
            <Text style={s.comingSoonDesc}>{i18n.t('dashboard.multiAccountComingSoon')}</Text>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── Modals (all at same level — avoids Android nested-Modal bug) ── */}

      {selectedCat && !showDoseEditor && !showTimingPicker && !showCatSwitcher && (
        <CategoryModal
          item={selectedCat}
          qty={currentQty}
          originalQty={originalQty}
          dose={currentDose}
          doseUnit={currentDoseUnit}
          timing={currentTiming}
          editingName={editingName}
          nameInput={nameInput}
          restockUrl={buildPlatformSearchUrl(selectedCat.nameEn || selectedCat.name, defaultRestockPlatform)}
          onChangeQty={setCurrentQty}
          onSaveQty={saveQty}
          onEditDose={() => setShowDoseEditor(true)}
          onEditTiming={() => setShowTimingPicker(true)}
          onStartRename={() => { setEditingName(true); setNameInput(selectedCat.name); }}
          onConfirmRename={handleRename}
          onNameInputChange={setNameInput}
          onDelete={handleDeleteCategory}
          onClose={closeModal}
        />
      )}

      {showDoseEditor && (
        <DoseEditModal
          initialValue={currentDose}
          initialUnit={currentDoseUnit}
          onConfirm={handleDoseConfirm}
          onClose={() => setShowDoseEditor(false)}
        />
      )}

      {showTimingPicker && (
        <TimingPickerModal
          current={currentTiming}
          onSelect={handleTimingSelect}
          onClose={() => setShowTimingPicker(false)}
        />
      )}

      {showCatSwitcher && (
        <CatSwitcherModal
          items={items}
          current={selectedCat?.name ?? ''}
          onSelect={switchCategory}
          onClose={() => setShowCatSwitcher(false)}
        />
      )}

      {showSubItemAdjust && subItemAdjustTarget && (
        <SubItemAdjustModal
          sub={subItemAdjustTarget.sub}
          qty={subItemAdjustQty}
          onChangeQty={setSubItemAdjustQty}
          onConfirm={saveSubItemQty}
          onDelete={handleDeleteSubItem}
          onClose={() => { setShowSubItemAdjust(false); setSubItemAdjustTarget(null); }}
          onUpdateBrandSpec={handleUpdateSubItemBrandSpec}
        />
      )}

      {showDiscountModal && (
        <DiscountModal onClose={() => setShowDiscountModal(false)} />
      )}

      {showQuickAdd && (
        <QuickAddModal
          existingNames={items.map(c => c.name)}
          onConfirm={handleQuickAdd}
          onClose={() => setShowQuickAdd(false)}
        />
      )}

    </SafeAreaView>
  );
}

// ─── Styles: Screen ───────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },

  header:    { paddingTop: 12, marginBottom: 16 },
  brandRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  brand:     { fontSize: 26, fontWeight: '800', color: C.textPrimary, letterSpacing: 0.5 },
  brandAccent: { fontSize: 26, fontWeight: '800', color: C.accent, letterSpacing: 0.5 },
  discountBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.accent + '18', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.accent + '40',
  },
  tabRow: {
    flexDirection: 'row', backgroundColor: C.card,
    borderRadius: 10, padding: 4, borderWidth: 1, borderColor: C.border,
  },
  tab:         { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive:   { backgroundColor: C.accent },
  tabText:     { fontSize: 14, fontWeight: '500', color: C.textSecondary },
  tabTextActive: { color: '#fff', fontWeight: '700' },

  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: C.border,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  cardLabel: { fontSize: 11, color: C.textSecondary, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },

  statRow:     { flexDirection: 'row', marginBottom: 16 },
  statItem:    { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: C.border, marginVertical: 2 },
  statMini:    { fontSize: 11, color: C.textSecondary, marginBottom: 5 },
  statBig:     { fontSize: 26, fontWeight: '800', color: C.accent },
  statSub:     { fontSize: 13, color: C.textSecondary, marginLeft: 2 },
  statMed:     { fontSize: 17, fontWeight: '700' },

  progressTrack: { height: 8, backgroundColor: '#21262D', borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  progressFill:  { height: '100%', backgroundColor: C.accent, borderRadius: 4 },
  progressMeta:  { flexDirection: 'row', justifyContent: 'space-between' },
  progressMetaText: { fontSize: 11, color: C.textSecondary },
  taxDisclaimer: { fontSize: 11, color: '#8B949E', textAlign: 'center', marginTop: 10 },

  beginnerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.accent + '12', borderRadius: 10,
    borderWidth: 1, borderColor: C.accent + '40',
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14,
  },
  beginnerBtnText: { flex: 1, fontSize: 13, fontWeight: '600', color: C.accent },

  alert: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#B91C1C',
    borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: '#EF4444',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8,
    elevation: 6,
  },
  alertIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  alertText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },

  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.textPrimary, letterSpacing: 0.3 },

  // ── Category card ──
  catCard: {
    backgroundColor: C.card, borderRadius: 12, marginBottom: 10,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  catHeaderRow: { flexDirection: 'row', alignItems: 'stretch' },
  catStripe:    { width: 4 },
  catBody:      { flex: 1, padding: 14 },
  catTopRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  catNameGroup: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 },
  colorDot:     { width: 9, height: 9, borderRadius: 5 },
  catName:      { fontSize: 15, fontWeight: '600', color: C.textPrimary },
  catDays:      { fontSize: 13, fontWeight: '700' },
  chevronBtn:   {
    width: 44, alignItems: 'center', justifyContent: 'center',
    borderLeftWidth: 1, borderLeftColor: C.border,
  },
  catTrack: { height: 4, backgroundColor: '#21262D', borderRadius: 2, overflow: 'hidden' },
  catFill:  { height: '100%', borderRadius: 2 },

  // ── Coming Soon card ──
  comingSoonCard: {
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border,
    marginTop: 32, paddingVertical: 48, paddingHorizontal: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  comingSoonTitle: {
    fontSize: 17, fontWeight: '700', color: C.textPrimary,
    marginTop: 16, marginBottom: 8,
  },
  comingSoonDesc: {
    fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20,
  },

  // ── Sub-items ──
  subItemList:     { borderTopWidth: 1, borderTopColor: C.border },
  subItemRow:      { flexDirection: 'row', alignItems: 'center' },
  subItemRowDivider: { borderBottomWidth: 1, borderBottomColor: '#21262D' },
  subItemLeft: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingLeft: 36, paddingVertical: 11,
  },
  subActiveToggle: {
    paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center',
  },
  subItemRight: {
    paddingHorizontal: 12, alignItems: 'flex-end', justifyContent: 'center',
  },
  subColorDot:     { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  subInfo:         { flex: 1 },
  subBrand:        { fontSize: 13, fontWeight: '600', color: C.textPrimary },
  subSpec:         { fontSize: 11, color: C.textSecondary, marginTop: 1 },
  subRemaining:    { fontSize: 12, fontWeight: '700', color: C.textSecondary },
  subRemainingInput: {
    fontSize: 12, fontWeight: '700', color: C.textPrimary,
    backgroundColor: '#21262D', borderRadius: 6,
    borderWidth: 1, borderColor: C.accent + '88',
    width: 52, textAlign: 'center',
    paddingHorizontal: 4, paddingVertical: 2,
  },
});

// ─── Styles: Modal (shared) ───────────────────────────────────────────────────

const m = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20,
  },
  card: {
    width: '100%', backgroundColor: '#1C2128',
    borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 20, maxHeight: '88%',
  },

  modalTitle:    { fontSize: 18, fontWeight: '700', color: C.textPrimary },
  modalSubtitle: { fontSize: 13, color: C.textSecondary, marginTop: 3 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#30363D', alignItems: 'center', justifyContent: 'center',
  },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: C.textSecondary,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
  },

  detailRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  detailLabel:    { flex: 1, fontSize: 14, color: C.textSecondary, marginLeft: 8 },
  detailValue:    { fontSize: 14, fontWeight: '600', color: C.textPrimary },
  editableRow: {
    backgroundColor: C.accent + '0D', borderRadius: 8,
    paddingHorizontal: 10, marginHorizontal: -10,
    borderWidth: 1, borderColor: C.accent + '30', marginBottom: 2,
  },
  editableValueRow: { flexDirection: 'row', alignItems: 'center' },

  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 12 },
  qtyBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#30363D', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  qtyBtnDisabled: { opacity: 0.35 },
  qtyDisplay:     { alignItems: 'center', minWidth: 72 },
  qtyNum:         { fontSize: 32, fontWeight: '800', color: C.textPrimary },
  qtyUnit:        { fontSize: 12, color: C.textSecondary, marginTop: -4 },
  qtyInlineInput: {
    fontSize: 32, fontWeight: '800', color: C.textPrimary,
    backgroundColor: '#0D1117', borderRadius: 10, borderWidth: 1, borderColor: C.accent + '88',
    textAlign: 'center', paddingHorizontal: 8, paddingVertical: 4, minWidth: 72,
  },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, backgroundColor: '#2EA043', borderRadius: 12, paddingVertical: 13, marginBottom: 10,
  },
  saveBtnDisabled:    { backgroundColor: '#21262D', borderWidth: 1, borderColor: C.border },
  saveBtnText:        { color: '#fff', fontSize: 15, fontWeight: '700' },
  saveBtnTextDisabled: { color: C.textSecondary },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: C.accent, borderRadius: 12, paddingVertical: 14, marginBottom: 10,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  secondaryBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#21262D', borderRadius: 12, paddingVertical: 13,
    borderWidth: 1, borderColor: C.border,
  },
  secondaryBtnText: { color: C.textSecondary, fontSize: 15, fontWeight: '600' },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, borderRadius: 12, paddingVertical: 13, marginBottom: 10,
    backgroundColor: C.red + '12', borderWidth: 1, borderColor: C.red + '44',
  },
  deleteBtnText: { color: C.red, fontSize: 15, fontWeight: '600' },
});

// ─── Styles: Dose Edit Modal ──────────────────────────────────────────────────

const de = StyleSheet.create({
  card: {
    width: '100%', backgroundColor: '#1C2128',
    borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 20,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title:  { fontSize: 18, fontWeight: '700', color: C.textPrimary },
  hint: {
    fontSize: 11, fontWeight: '600', color: C.textSecondary,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
  },
  input: {
    backgroundColor: '#0D1117', borderRadius: 12, borderWidth: 1, borderColor: C.border,
    color: C.textPrimary, fontSize: 36, fontWeight: '800',
    textAlign: 'center', paddingVertical: 14, paddingHorizontal: 16, marginBottom: 4,
  },
  unitRow: { flexDirection: 'row', gap: 10 },
  unitBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    backgroundColor: '#21262D', alignItems: 'center',
  },
  unitBtnActive:  { backgroundColor: C.accent + '22', borderColor: C.accent },
  unitText:       { fontSize: 16, fontWeight: '600', color: C.textSecondary },
  unitTextActive: { color: C.accent, fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 10 },
});

// ─── Styles: Timing Picker Modal ──────────────────────────────────────────────

const tp = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  hint:   { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#21262D',
  },
  optText:       { fontSize: 15, color: C.textSecondary, fontWeight: '500' },
  optTextActive: { color: C.accent, fontWeight: '700' },
});

// ─── Styles: Category Modal Header ───────────────────────────────────────────

const mo = StyleSheet.create({
  // Default header: stripe + name + pencil + close in one row
  defaultHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4,
  },

  // Editing header: dropdown + close on top row
  topRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  catSwitchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.accent + '15', borderRadius: 10,
    borderWidth: 1, borderColor: C.accent + '40',
    paddingHorizontal: 12, paddingVertical: 7, maxWidth: '75%',
  },
  catSwitchLabel: { fontSize: 11, color: C.textSecondary, fontWeight: '600' },
  catSwitchName:  { fontSize: 13, color: C.accent, fontWeight: '700', flexShrink: 1 },

  // Editing name row: stripe + input + confirm
  nameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4,
  },
  stripe: { width: 4, height: 22, borderRadius: 2 },
  nameInput: {
    flex: 1, fontSize: 16, fontWeight: '700', color: C.textPrimary,
    backgroundColor: '#0D1117', borderRadius: 8, borderWidth: 1,
    borderColor: C.accent, paddingHorizontal: 10, paddingVertical: 8,
  },
  confirmBtn: {
    backgroundColor: C.accent, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  confirmBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});

// ─── Styles: Category Switcher Modal ─────────────────────────────────────────

const cs = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 4,
  },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 13, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#21262D',
  },
  dot:           { width: 8, height: 8, borderRadius: 4 },
  optText:       { flex: 1, fontSize: 15, color: C.textSecondary, fontWeight: '500' },
  optTextActive: { color: C.accent, fontWeight: '700' },
});

// ─── Styles: Discount Modal ───────────────────────────────────────────────────

const dc = StyleSheet.create({
  errorText: {
    fontSize: 14, color: C.textSecondary, textAlign: 'center', paddingVertical: 20,
  },
  codeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0D1117', borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    padding: 14, marginBottom: 10,
  },
  codeMain:  { flex: 1, marginRight: 12 },
  codeText:  { fontSize: 22, fontWeight: '800', color: C.accent, letterSpacing: 1, marginBottom: 4 },
  descText:  { fontSize: 13, color: C.textPrimary, marginBottom: 8 },
  metaRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaChip:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaChipText: { fontSize: 11, fontWeight: '600', color: C.accent },
  copyBtn: {
    backgroundColor: C.accent, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 12,
    alignItems: 'center', justifyContent: 'center', gap: 4,
    flexDirection: 'row',
  },
  copyBtnDone: { backgroundColor: '#2EA043' },
  copyBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

// ─── Styles: Quick Add Modal ──────────────────────────────────────────────────

const sa = StyleSheet.create({
  metaRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 6, marginBottom: 2,
  },
  metaInput: {
    backgroundColor: '#21262D', borderRadius: 10, borderWidth: 1, borderColor: C.accent + '80',
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.textPrimary,
  },
});

const qa = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  label:      { fontSize: 13, fontWeight: '600', color: C.textSecondary, marginBottom: 6, letterSpacing: 0.3 },
  input: {
    backgroundColor: '#21262D', borderRadius: 10, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.textPrimary,
  },
  btnRow:      { flexDirection: 'row', gap: 10 },
  confirmBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2EA043', borderRadius: 12, paddingVertical: 13,
  },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
