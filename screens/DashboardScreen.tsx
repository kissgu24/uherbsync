import React, { useState, useRef, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
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
import { CategoryItem, loadCategoryItems, saveCategoryItems, loadOrders, updateSubItemRemaining, updateSubItemActive, updateCategoryDose, updateCategoryTiming, getSetting, setSetting, runDailyDeductionIfNeeded } from '../db/db';
import { COUNTRY_RULES, CountryCode } from '../constants/countryRules';
import { buildIHerbSearchUrl, buildIHerbProductUrl } from '../constants/affiliate';
import { supabase } from '../lib/supabase';

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

const ACCOUNTS = ['本人', '多帳號管理'];

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

function formatCurrency(n: number, currency: string) {
  return `${currency}${n.toLocaleString()}`;
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
            <Text style={de.title}>調整每日用量</Text>
          </View>
          <View style={m.divider} />
          <Text style={de.hint}>數量</Text>
          <TextInput
            style={de.input}
            value={inputText}
            onChangeText={t => setInputText(t.replace(/[^0-9]/g, ''))}
            keyboardType="numeric"
            maxLength={4}
            selectTextOnFocus
            placeholderTextColor={C.textSecondary}
          />
          <Text style={[de.hint, { marginTop: 14 }]}>單位</Text>
          <View style={de.unitRow}>
            {DOSE_UNITS.map(u => (
              <TouchableOpacity
                key={u}
                style={[de.unitBtn, unit === u && de.unitBtnActive]}
                onPress={() => setUnit(u)}
                activeOpacity={0.75}
              >
                <Text style={[de.unitText, unit === u && de.unitTextActive]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={m.divider} />
          <View style={de.btnRow}>
            <TouchableOpacity style={[m.secondaryBtn, { flex: 1 }]} onPress={onClose}>
              <Text style={m.secondaryBtnText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[m.primaryBtn, { flex: 1 }]} onPress={handleConfirm}>
              <Text style={m.primaryBtnText}>確認</Text>
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
              <Text style={m.modalTitle}>選擇服用時機</Text>
              <Text style={tp.hint}>點擊選項即可更改</Text>
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
                <Text style={[tp.optText, isActive && tp.optTextActive]}>{opt}</Text>
                {isActive
                  ? <Ionicons name="checkmark-circle" size={20} color={C.accent} />
                  : <Ionicons name="chevron-forward" size={16} color={C.border} />
                }
              </TouchableOpacity>
            );
          })}
          <View style={m.divider} />
          <TouchableOpacity style={m.secondaryBtn} onPress={onClose}>
            <Text style={m.secondaryBtnText}>取消</Text>
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
            <Text style={m.modalTitle}>切換大類</Text>
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
            <Text style={m.secondaryBtnText}>取消</Text>
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
    if (!dateStr) return '無限期';
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
              <Text style={m.modalTitle}>折扣碼</Text>
            </View>
            <TouchableOpacity style={m.closeBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={18} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={m.divider} />

          {loading ? (
            <ActivityIndicator color={C.accent} style={{ marginVertical: 24 }} />
          ) : error ? (
            <Text style={dc.errorText}>無法取得折扣碼，請稍後再試</Text>
          ) : codes.length === 0 ? (
            <Text style={dc.errorText}>目前沒有可用的折扣碼</Text>
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
                            有效至 {formatExpiry(code.expiry_date)}
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
                      <Text style={dc.copyBtnText}>{isCopied ? '已複製 ✓' : '複製'}</Text>
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
  onChangeQty: (n: number) => void;
  onSaveQty: () => void;
  onReset: () => void;
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
  editingName, nameInput,
  onChangeQty, onSaveQty, onReset, onEditDose, onEditTiming,
  onStartRename, onConfirmRename, onNameInputChange,
  onDelete, onClose,
}: CategoryModalProps) {
  const dotColor = categoryDotColor(item);
  const isDirty = qty !== originalQty;
  const primaryBottleSize = item.subItems[0]?.bottleSize ?? 60;

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
                <Text style={mo.confirmBtnText}>確認</Text>
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
          <Text style={m.sectionLabel}>庫存詳情</Text>
          <DetailRow icon="layers-outline" label="剩餘數量" value={`${qty} ${doseUnit}`} />
          <EditableDetailRow icon="repeat-outline" label="每日用量" value={`${dose} ${doseUnit}／天`} onPress={onEditDose} />
          <DetailRow icon="calendar-outline" label="預計用完" value={calcFinishDate(qty, dose)} />
          <EditableDetailRow icon="time-outline" label="服用時機" value={timing} onPress={onEditTiming} />

          <View style={m.divider} />

          {/* ── Qty Adjuster ── */}
          <Text style={m.sectionLabel}>手動調整庫存</Text>
          <View style={m.qtyRow}>
            <TouchableOpacity
              style={[m.qtyBtn, qty <= 0 && m.qtyBtnDisabled]}
              onPress={() => onChangeQty(Math.max(0, qty - 1))}
              disabled={qty <= 0}
            >
              <Ionicons name="remove" size={22} color={qty <= 0 ? C.border : C.textPrimary} />
            </TouchableOpacity>
            <View style={m.qtyDisplay}>
              <Text style={m.qtyNum}>{qty}</Text>
              <Text style={m.qtyUnit}>{doseUnit}</Text>
            </View>
            <TouchableOpacity
              style={[m.qtyBtn, qty >= primaryBottleSize && m.qtyBtnDisabled]}
              onPress={() => onChangeQty(Math.min(primaryBottleSize, qty + 1))}
              disabled={qty >= primaryBottleSize}
            >
              <Ionicons name="add" size={22} color={qty >= primaryBottleSize ? C.border : C.textPrimary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[m.saveBtn, !isDirty && m.saveBtnDisabled]}
            onPress={isDirty ? onSaveQty : undefined}
            disabled={!isDirty}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color={isDirty ? '#fff' : C.textSecondary} />
            <Text style={[m.saveBtnText, !isDirty && m.saveBtnTextDisabled]}>確定修改</Text>
          </TouchableOpacity>

          <TouchableOpacity style={m.resetBtn} onPress={onReset}>
            <Ionicons name="refresh-outline" size={13} color={C.textSecondary} />
            <Text style={m.resetText}>重置為滿（{primaryBottleSize} {doseUnit}）</Text>
          </TouchableOpacity>

          <View style={m.divider} />

          <TouchableOpacity
            style={m.primaryBtn}
            onPress={() => Linking.openURL(item.iherbUrl)}
            activeOpacity={0.8}
          >
            <Ionicons name="cart-outline" size={16} color="#fff" />
            <Text style={m.primaryBtnText}>前往 iHerb 補貨</Text>
          </TouchableOpacity>

          <TouchableOpacity style={m.deleteBtn} onPress={onDelete} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={15} color={C.red} />
            <Text style={m.deleteBtnText}>刪除品項</Text>
          </TouchableOpacity>

          <TouchableOpacity style={m.secondaryBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={m.secondaryBtnText}>關閉</Text>
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
};

function SubItemAdjustModal({ sub, qty, onChangeQty, onConfirm, onDelete, onClose }: SubItemAdjustProps) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={m.overlay} onPress={onClose}>
        <Pressable style={m.card} onPress={() => {}}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={m.modalTitle}>調整庫存</Text>
            <TouchableOpacity style={m.closeBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={18} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={m.modalSubtitle}>{sub.brand}</Text>
          <Text style={[m.modalSubtitle, { marginTop: 2 }]}>{sub.spec}</Text>
          <View style={m.divider} />
          <View style={m.qtyRow}>
            <TouchableOpacity
              style={[m.qtyBtn, qty <= 0 && m.qtyBtnDisabled]}
              onPress={() => onChangeQty(Math.max(0, qty - 1))}
              disabled={qty <= 0}
            >
              <Ionicons name="remove" size={22} color={qty <= 0 ? C.border : C.textPrimary} />
            </TouchableOpacity>
            <View style={m.qtyDisplay}>
              <Text style={m.qtyNum}>{qty}</Text>
              <Text style={m.qtyUnit}>{sub.doseUnit}</Text>
            </View>
            <TouchableOpacity style={m.qtyBtn} onPress={() => onChangeQty(qty + 1)}>
              <Ionicons name="add" size={22} color={C.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={m.divider} />
          <TouchableOpacity style={m.saveBtn} onPress={onConfirm} activeOpacity={0.8}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
            <Text style={m.saveBtnText}>確定修改</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[m.secondaryBtn, { marginTop: 10 }]} onPress={onClose} activeOpacity={0.7}>
            <Text style={m.secondaryBtnText}>取消</Text>
          </TouchableOpacity>
          <TouchableOpacity style={m.deleteBtn} onPress={onDelete} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={15} color={C.red} />
            <Text style={m.deleteBtnText}>刪除此子品項</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Low Stock Notification ───────────────────────────────────────────────────

async function checkLowStockNotifications(items: CategoryItem[]): Promise<void> {
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
          title: '⚠️ 庫存即將不足',
          body: `${si.brand} ${si.spec} 剩餘約 ${days} 天，記得補貨！`,
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
  const { renameCategory, addCategory, removeCategory, consumePendingItems, isReady } = useCategories();
  const [activeAccount, setActiveAccount] = useState(0);
  const [items, setItems] = useState<CategoryItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const itemsReadyRef = useRef(false);
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

  const [country, setCountry] = useState<CountryCode>('TW');
  const [sortPreference, setSortPreference] = useState<'days' | 'custom'>('days');
  const [taxData, setTaxData] = useState({
    usedCount: 0, remainCount: 0, spentAmount: 0, remainAmount: 0, pct: 0,
  });
  const alertCat = items.find(cat => categoryTotalDays(cat) <= 7);

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
          setItems(saved);
        } else {
          setItems(INITIAL_ITEMS);
          await saveCategoryItems(INITIAL_ITEMS);
        }
      } catch (e) {
        console.error('DashboardScreen initial load error', e);
        setItems(INITIAL_ITEMS);
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
    saveCategoryItems(items);
  }, [items]);

  // ── Reload country setting + tax quota from DB on focus ───────────────
  useFocusEffect(
    React.useCallback(() => {
      async function loadTaxData() {
        try {
          const [savedCountry, savedSort] = await Promise.all([
            getSetting('country'),
            getSetting('sort_preference'),
          ]);
          const c: CountryCode =
            savedCountry === 'TW' || savedCountry === 'JP' || savedCountry === 'KR' || savedCountry === 'OFF'
              ? savedCountry
              : 'TW';
          setCountry(c);
          if (savedSort === 'days' || savedSort === 'custom') setSortPreference(savedSort);

          const rule = COUNTRY_RULES[c];
          const orders = await loadOrders();

          if (c === 'OFF') {
            const allSpent = orders.reduce((s, o) => s + o.totalAmount, 0);
            setTaxData({ usedCount: 0, remainCount: 0, spentAmount: allSpent, remainAmount: 0, pct: 0 });
            return;
          }

          const [start, end] = halfYearRange();
          const periodOrders = orders.filter(o => {
            const d = new Date(o.date);
            return d >= start && d <= end && o.totalAmount <= rule.taxFreePerOrder;
          });
          const count = periodOrders.length;
          const spent = periodOrders.reduce((s, o) => s + o.totalAmount, 0);

          if (rule.quotaCount > 0) {
            const remain = Math.max(0, rule.quotaCount - count);
            setTaxData({
              usedCount: count,
              remainCount: remain,
              spentAmount: spent,
              remainAmount: remain * rule.taxFreePerOrder,
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
      setItems(prev => {
        let next = [...prev];
        for (const { categoryName, subItem } of pending) {
          const idx = next.findIndex(c => c.name === categoryName);
          if (idx >= 0) {
            next = next.map((cat, i) => {
              if (i !== idx) return cat;
              const existIdx = cat.subItems.findIndex(si => si.spec === subItem.spec);
              if (existIdx >= 0) {
                // Same spec already exists → accumulate remaining
                const newSubs = cat.subItems.map((si, j) =>
                  j === existIdx ? { ...si, remaining: si.remaining + subItem.remaining } : si
                );
                return { ...cat, subItems: newSubs };
              }
              return { ...cat, subItems: [...cat.subItems, subItem] };
            });
          } else {
            next = [...next, {
              id: `cat_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              name: categoryName,
              nameEn: '',
              maxDays: 30,
              dailyDose: 1,
              doseUnit: '顆',
              timing: '飯後',
              iherbUrl: buildIHerbSearchUrl(categoryName),
              subItems: [subItem],
            }];
          }
        }
        return next;
      });
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
      Alert.alert('名稱不可為空');
      return;
    }

    const isDuplicate = items.some(cat => cat.id !== selectedCat.id && cat.name === trimmed);
    if (isDuplicate) {
      Alert.alert('名稱重複', '已有相同的大類名稱，請使用其他名稱');
      return;
    }

    const oldName = selectedCat.name;
    setItems(prev => prev.map(cat => cat.id === selectedCat.id ? { ...cat, name: trimmed } : cat));
    renameCategory(oldName, trimmed);
    addCategory(trimmed);
    setSelectedCat(prev => prev ? { ...prev, name: trimmed } : null);
    setEditingName(false);
  }

  function handleSubItemPress(sub: SubItem, parentCat: CategoryItem) {
    Alert.alert(
      '補充保健品',
      `${sub.brand}\n${sub.spec}`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '前往 iHerb 搜尋',
          onPress: () => {
            Linking.openURL(buildIHerbSearchUrl(`${sub.brand} ${sub.spec}`));
          },
        },
      ],
    );
  }

  function handleSubItemQtyPress(sub: SubItem, cat: CategoryItem) {
    setSubItemAdjustTarget({ sub, catId: cat.id });
    setSubItemAdjustQty(sub.remaining);
    setShowSubItemAdjust(true);
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

  function handleDeleteSubItem() {
    if (!subItemAdjustTarget) return;
    const { sub, catId } = subItemAdjustTarget;
    const cat = items.find(c => c.id === catId);
    if (!cat) return;

    Alert.alert(
      '確認刪除',
      `確定移除「${sub.brand} ${sub.spec}」？此操作無法復原。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '確認刪除',
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
      '確認刪除',
      `確定要移除「${cat.name}」及其所有子項目嗎？`,
      [
        { text: '取消', style: 'cancel', onPress: () => openModal(cat) },
        {
          text: '確認刪除',
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

        {activeAccount === 0 ? (
          <>
            {/* ── Tax Quota Card ── */}
            {(() => {
              const rule = COUNTRY_RULES[country];
              const showCountCol = rule.quotaCount > 0 || country === 'OFF';
              const headerLabel = country === 'OFF'
                ? '免稅追蹤（已停用）'
                : `本期免稅額度（${halfYearLabel()}）`;
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
                          <Text style={s.statMini}>已用筆數</Text>
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
                      <Text style={s.statMini}>累計花費</Text>
                      <Text style={[s.statMed, { color: C.orange }]}>
                        {formatCurrency(taxData.spentAmount, rule.currency || 'NT$')}
                      </Text>
                    </View>
                    {showCountCol && (
                      <>
                        <View style={s.statDivider} />
                        <View style={s.statItem}>
                          <Text style={s.statMini}>剩餘額度</Text>
                          <Text style={[s.statMed, { color: C.green }]}>
                            {formatCurrency(taxData.remainAmount, rule.currency || 'NT$')}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${Math.round(taxData.pct * 100)}%` as `${number}%` }]} />
                  </View>
                  <View style={s.progressMeta}>
                    <Text style={s.progressMetaText}>額度使用進度</Text>
                    <Text style={[s.progressMetaText, { color: C.accent }]}>{Math.round(taxData.pct * 100)}%</Text>
                  </View>
                  <Text style={s.taxDisclaimer}>※ 免稅規則僅供參考，實際以海關規定為準</Text>
                </View>
              );
            })()}

            {/* ── Emergency Alert Banner ── */}
            {alertCat && (
              <TouchableOpacity style={s.alert} activeOpacity={0.85} onPress={() => openModal(alertCat)}>
                <View style={s.alertIcon}>
                  <Ionicons name="warning" size={18} color="#fff" />
                </View>
                <Text style={s.alertText} numberOfLines={1}>
                  {alertCat.name} 剩餘 {categoryTotalDays(alertCat)} 天，立即補貨
                </Text>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            )}

            {/* ── Category List ── */}
            <Text style={s.sectionTitle}>保健品庫存</Text>

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
                        <Text style={[s.catDays, { color: dotColor }]}>{totalDays} 天</Text>
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
                              style={s.subItemRight}
                              onPress={() => handleSubItemQtyPress(sub, cat)}
                              activeOpacity={0.7}
                            >
                              <Text style={s.subRemaining}>
                                {sub.remaining} {sub.doseUnit}
                              </Text>
                            </TouchableOpacity>
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
            <Text style={s.comingSoonTitle}>多帳號管理</Text>
            <Text style={s.comingSoonDesc}>此功能即將推出，敬請期待！</Text>
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
          onChangeQty={setCurrentQty}
          onSaveQty={saveQty}
          onReset={() => setCurrentQty(selectedCat.subItems[0]?.bottleSize ?? 60)}
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
        />
      )}

      {showDiscountModal && (
        <DiscountModal onClose={() => setShowDiscountModal(false)} />
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

  alert: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#B91C1C',
    borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: '#EF4444',
  },
  alertIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  alertText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.textPrimary, marginBottom: 10, letterSpacing: 0.3 },

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
  subItemRow:      { flexDirection: 'row', alignItems: 'stretch' },
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

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, backgroundColor: '#2EA043', borderRadius: 12, paddingVertical: 13, marginBottom: 10,
  },
  saveBtnDisabled:    { backgroundColor: '#21262D', borderWidth: 1, borderColor: C.border },
  saveBtnText:        { color: '#fff', fontSize: 15, fontWeight: '700' },
  saveBtnTextDisabled: { color: C.textSecondary },

  resetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#21262D', borderWidth: 1, borderColor: C.border,
  },
  resetText: { fontSize: 13, color: C.textSecondary },

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
