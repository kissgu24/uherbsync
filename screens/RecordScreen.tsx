import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { loadOrders, deleteOrder, updateOrderOverseas, OrderRecord } from '../db/db';
import { buildRestockUrl } from '../constants/affiliate';
import { i18n } from '../i18n';
import { useLanguage } from '../contexts/LanguageContext';
import { formatCurrency } from '../utils/currency';

// ─── Theme ────────────────────────────────────────────────────────────────────

const C = {
  bg:            '#0D1117',
  card:          '#161B22',
  cardAlt:       '#1C2128',
  border:        '#30363D',
  accent:        '#4D9EFF',
  textPrimary:   '#E6EDF3',
  textSecondary: '#8B949E',
  red:           '#FF4D4D',
  divider:       '#21262D',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type HalfYearGroup = {
  key: string;
  label: string;
  orders: OrderRecord[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function halfYearKey(date: string): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth() < 6 ? 'H1' : 'H2'}`;
}

function halfYearLabel(key: string): string {
  const [year, half] = key.split('-');
  return `${year} ${half === 'H1' ? i18n.t('record.firstHalf') : i18n.t('record.secondHalf')}`;
}

function groupOrders(orders: OrderRecord[]): HalfYearGroup[] {
  const map = new Map<string, OrderRecord[]>();
  for (const o of orders) {
    const k = halfYearKey(o.date);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(o);
  }
  return [...map.keys()]
    .sort()
    .reverse()
    .map(key => ({ key, label: halfYearLabel(key), orders: map.get(key)! }));
}

// ─── Layer 3: Item Detail Row ─────────────────────────────────────────────────

type ItemRowProps = {
  item: OrderRecord['items'][number];
  isLast: boolean;
};

function ItemRow({ item, isLast }: ItemRowProps) {
  const { language } = useLanguage();
  const brand = item.brand || item.productName;
  const spec = (item.spec && item.spec !== item.brand) ? item.spec : '';
  return (
    <View style={[d.row, !isLast && d.rowDivider]}>
      <Text style={d.colCat} numberOfLines={1}>{item.categoryName || '—'}</Text>
      <TouchableOpacity
        style={d.colBrand}
        onPress={() => {
          const url = buildRestockUrl('', `${brand} ${spec}`.trim());
          Linking.openURL(url);
        }}
        activeOpacity={0.7}
      >
        <Text style={d.brandTxt} numberOfLines={1}>{brand}</Text>
        {!!spec && <Text style={d.specTxt} numberOfLines={1}>{spec}</Text>}
      </TouchableOpacity>
      <Text style={d.colQty}>×{item.qty}</Text>
      <Text style={d.colAmt}>{formatCurrency(item.amount, language)}</Text>
    </View>
  );
}

// ─── Layer 2: Order Row ───────────────────────────────────────────────────────

type OrderRowProps = {
  order: OrderRecord;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onToggleOverseas: () => void;
};

function OrderRow({ order, expanded, onToggle, onDelete, onToggleOverseas }: OrderRowProps) {
  const { language } = useLanguage();
  return (
    <View style={[o.card, expanded && o.cardExpanded]}>

      {/* ── Collapsed header ── */}
      <View style={o.header}>
        <TouchableOpacity style={o.headerMain} onPress={onToggle} activeOpacity={0.7}>
          <Text style={o.date}>{formatDate(order.date)}</Text>
          <View style={o.tagRow}>
            <View style={o.tag}>
              <Ionicons name="person-outline" size={10} color={C.textSecondary} />
              <Text style={o.tagTxt}>{i18n.t('record.personTag')}</Text>
            </View>
            <TouchableOpacity
              style={[o.tag, order.isOverseas && o.tagOverseas]}
              onPress={onToggleOverseas}
              hitSlop={6}
              activeOpacity={0.7}
            >
              <Ionicons name="airplane-outline" size={10} color={order.isOverseas ? '#F0A500' : C.textSecondary} />
              <Text style={[o.tagTxt, order.isOverseas && { color: '#F0A500' }]}>
                {i18n.t('record.overseas')}
              </Text>
            </TouchableOpacity>
            {!!order.discountCode && (
              <View style={[o.tag, o.tagAccent]}>
                <Ionicons name="pricetag-outline" size={10} color={C.accent} />
                <Text style={[o.tagTxt, { color: C.accent }]}>{order.discountCode}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <Text style={o.amt}>{formatCurrency(order.totalAmount, language)}</Text>

        <TouchableOpacity style={o.iconBtn} onPress={onDelete} hitSlop={8} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={15} color={C.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={o.iconBtn} onPress={onToggle} hitSlop={4} activeOpacity={0.7}>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={15}
            color={C.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* ── Layer 3: item list ── */}
      {expanded && (
        <View style={d.list}>
          {/* Column headers */}
          <View style={[d.row, d.headerRow]}>
            <Text style={[d.colCat, d.hdrTxt]}>{i18n.t('record.colCategory')}</Text>
            <View style={d.colBrand}>
              <Text style={d.hdrTxt}>{i18n.t('record.colBrandSpec')}</Text>
            </View>
            <Text style={[d.colQty, d.hdrTxt]}>{i18n.t('record.colQty')}</Text>
            <Text style={[d.colAmt, d.hdrTxt]}>{i18n.t('record.colAmount')}</Text>
          </View>

          {order.items.map((item, idx) => (
            <ItemRow
              key={idx}
              item={item}
              isLast={idx === order.items.length - 1}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Layer 1: Half-Year Group ─────────────────────────────────────────────────

type GroupRowProps = {
  group: HalfYearGroup;
  groupExpanded: boolean;
  expandedOrders: Set<string>;
  onToggleGroup: () => void;
  onToggleOrder: (id: string) => void;
  onDeleteOrder: (order: OrderRecord) => void;
  onToggleOverseas: (order: OrderRecord) => void;
};

function GroupRow({
  group, groupExpanded, expandedOrders,
  onToggleGroup, onToggleOrder, onDeleteOrder, onToggleOverseas,
}: GroupRowProps) {
  const { language } = useLanguage();
  const totalAmount = group.orders.reduce((s, o) => s + o.totalAmount, 0);

  return (
    <View style={g.card}>
      {/* Group header */}
      <TouchableOpacity style={g.header} onPress={onToggleGroup} activeOpacity={0.75}>
        <View style={g.left}>
          <Text style={g.label}>{group.label}</Text>
          <Text style={g.meta}>{i18n.t('record.ordersMeta', { count: group.orders.length, amount: formatCurrency(totalAmount, language) })}</Text>
        </View>
        <Ionicons
          name={groupExpanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={C.textSecondary}
        />
      </TouchableOpacity>

      {/* Expanded order list */}
      {groupExpanded && (
        <View style={g.body}>
          {group.orders.map((order, idx) => (
            <View key={order.id} style={idx < group.orders.length - 1 ? g.orderDivider : undefined}>
              <OrderRow
                order={order}
                expanded={expandedOrders.has(order.id)}
                onToggle={() => onToggleOrder(order.id)}
                onDelete={() => onDeleteOrder(order)}
                onToggleOverseas={() => onToggleOverseas(order)}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RecordScreen() {
  const { language } = useLanguage();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      loadOrders()
        .then(data => {
          if (!active) return;
          setOrders(data);
          setLoading(false);
        })
        .catch(() => {
          if (!active) return;
          setOrders([]);
          setLoading(false);
        });
      return () => { active = false; };
    }, [])
  );

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleOrder(id: string) {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleToggleOverseas(order: OrderRecord) {
    const next = !order.isOverseas;
    try {
      await updateOrderOverseas(order.id, next);
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, isOverseas: next } : o));
    } catch {}
  }

  function handleDelete(order: OrderRecord) {
    Alert.alert(
      i18n.t('record.deleteTitle'),
      i18n.t('record.deleteMsg'),
      [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        {
          text: i18n.t('common.confirmDelete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteOrder(order.id);
              setOrders(prev => prev.filter(o => o.id !== order.id));
              setExpandedOrders(prev => {
                const next = new Set(prev);
                next.delete(order.id);
                return next;
              });
            } catch {
              Alert.alert(i18n.t('common.error'), i18n.t('record.deleteError'));
            }
          },
        },
      ],
    );
  }

  const groups = groupOrders(orders);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator style={{ flex: 1 }} color={C.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.title}>{i18n.t('record.title')}</Text>

        {/* ── Grouped List ── */}
        {groups.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="document-text-outline" size={44} color={C.border} />
            <Text style={s.emptyText}>{i18n.t('record.empty')}</Text>
            <Text style={s.emptyHint}>{i18n.t('record.emptyHint')}</Text>
          </View>
        ) : (
          groups.map(group => (
            <GroupRow
              key={group.key}
              group={group}
              groupExpanded={expandedGroups.has(group.key)}
              expandedOrders={expandedOrders}
              onToggleGroup={() => toggleGroup(group.key)}
              onToggleOrder={toggleOrder}
              onDeleteOrder={handleDelete}
              onToggleOverseas={handleToggleOverseas}
            />
          ))
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles: Screen ───────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12 },

  title: { fontSize: 24, fontWeight: '800', color: C.textPrimary, marginBottom: 16 },

  empty:     { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 16, fontWeight: '600', color: C.textSecondary },
  emptyHint: { fontSize: 12, color: C.border, textAlign: 'center', paddingHorizontal: 32 },
});

// ─── Styles: Layer 1 — Group ──────────────────────────────────────────────────

const g = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 16,
    marginBottom: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16,
  },
  left:  { flex: 1 },
  label: { fontSize: 18, fontWeight: '700', color: C.textPrimary, marginBottom: 4 },
  meta:  { fontSize: 13, color: C.textSecondary },
  body:  { borderTopWidth: 1, borderTopColor: C.border },
  orderDivider: { borderBottomWidth: 1, borderBottomColor: C.divider },
});

// ─── Styles: Layer 2 — Order ──────────────────────────────────────────────────

const o = StyleSheet.create({
  card:         { backgroundColor: C.card },
  cardExpanded: { backgroundColor: '#13181F' },

  header:     { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingVertical: 11 },
  headerMain: { flex: 1 },

  date:   { fontSize: 13, fontWeight: '700', color: C.textPrimary, marginBottom: 5 },
  tagRow: { flexDirection: 'row', gap: 5 },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#21262D', borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: C.border,
  },
  tagAccent:   { borderColor: C.accent + '44', backgroundColor: C.accent + '12' },
  tagOverseas: { borderColor: '#F0A50044', backgroundColor: '#F0A50012' },
  tagTxt:    { fontSize: 10, color: C.textSecondary, fontWeight: '500' },

  amt:     { fontSize: 14, fontWeight: '800', color: C.accent, marginRight: 4 },
  iconBtn: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
});

// ─── Styles: Layer 3 — Item Detail ───────────────────────────────────────────

const d = StyleSheet.create({
  list:      { borderTopWidth: 1, borderTopColor: C.border },
  headerRow: { backgroundColor: '#1C2128', paddingVertical: 6 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 9,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: C.divider },

  // Column layout
  colCat:   { flex: 1, paddingRight: 4, color: C.accent },
  colBrand: { flex: 1.8, paddingRight: 4 },
  colQty:   { width: 32, textAlign: 'right' as const, paddingRight: 4, color: C.accent },
  colAmt:   { width: 64, textAlign: 'right' as const, color: C.accent },

  // Text styles
  hdrTxt:   { fontSize: 9, fontWeight: '600' as const, color: C.textSecondary, letterSpacing: 0.5 },
  brandTxt: { fontSize: 12, fontWeight: '600' as const, color: C.accent, textDecorationLine: 'underline' as const },
  specTxt:  { fontSize: 10, color: C.textSecondary, marginTop: 1 },
});
