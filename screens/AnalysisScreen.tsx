import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Modal, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { CategoryItem, loadCategoryItems } from '../db/db';

// ─── Theme ────────────────────────────────────────────────────────────────────

const C = {
  bg: '#0D1117',
  card: '#161B22',
  cardAlt: '#1C2128',
  border: '#30363D',
  accent: '#4D9EFF',
  textPrimary: '#E6EDF3',
  textSecondary: '#8B949E',
  green: '#3FB950',
};

// ─── Constants ────────────────────────────────────────────────────────────────

const GENDERS = ['男', '女', '不透露'] as const;
type Gender = typeof GENDERS[number] | '';

const GOALS = ['延緩衰老', '健身', '改善膚質', '提升代謝', '改善經痛', '其他'] as const;
type Goal = typeof GOALS[number];

const QUESTIONS = [
  { label: '補充方向評估', text: '評估我目前的保健品組合是否完整且合理？' },
  { label: '覆蓋程度',     text: '有哪些成分可能重複或衝突？' },
  { label: '檢視完整度',   text: '依照我的健康目標，建議我補充哪些目前缺少的保健品？' },
  { label: '使用時機',     text: '服用時機和劑量有需要調整的地方嗎？' },
  { label: '須注意事項',   text: '其他你認為我應該注意的事項？' },
  { label: '評分',         text: '以健康目標配合補劑狀況，幫我評價一個 PR 等級（0~100），並說明原因。' },
] as const;

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildPrompt(
  gender: Gender,
  age: string,
  goals: Goal[],
  otherGoal: string,
  items: CategoryItem[],
  selectedSubIds: Set<string>,
  selectedQIds: Set<number>,
): string {
  const genderStr = gender || '不詳';
  const ageStr = age.trim() || '不詳';
  const goalList = goals.map(g => (g === '其他' ? otherGoal.trim() || '其他' : g));
  const goalsStr = goalList.length > 0 ? goalList.join('、') : '未填寫';

  const lines: string[] = [];
  for (const cat of items) {
    for (const sub of cat.subItems) {
      if (selectedSubIds.has(sub.id)) {
        lines.push(
          `- ${cat.name}：${sub.brand} ${sub.spec}，每日 ${cat.dailyDose} ${cat.doseUnit}，${cat.timing}`,
        );
      }
    }
  }

  const supplementsBlock =
    lines.length > 0 ? lines.join('\n') : '（未選擇任何保健品）';

  const questionsBlock = QUESTIONS
    .filter((_, i) => selectedQIds.has(i))
    .map((q, idx) => `${idx + 1}. ${q.text}`)
    .join('\n');

  return [
    `我是一位 ${ageStr} 歲的 ${genderStr}，健康目標是：${goalsStr}。目前每天服用的保健品如下：`,
    supplementsBlock,
    '',
    '請根據以上資訊：',
    questionsBlock,
  ].join('\n');
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AnalysisScreen() {
  const [gender, setGender] = useState<Gender>('');
  const [age, setAge] = useState('');
  const [goals, setGoals] = useState<Set<Goal>>(new Set());
  const [otherGoal, setOtherGoal] = useState('');
  const [items, setItems] = useState<CategoryItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [selectedSubIds, setSelectedSubIds] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const [selectedQIds, setSelectedQIds] = useState<Set<number>>(
    new Set([0])
  );

  async function loadItems() {
    const loaded = await loadCategoryItems();
    setItems(loaded);
    setSelectedSubIds(new Set(loaded.flatMap(cat => cat.subItems.map(s => s.id))));
  }

  useEffect(() => {
    (async () => {
      await loadItems();
      setItemsLoading(false);
    })();
  }, []);

  // ── Goal toggle ─────────────────────────────────────────────────────────────

  function toggleGoal(g: Goal) {
    setGoals(prev => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  // ── Checklist toggle ────────────────────────────────────────────────────────

  function toggleSubItem(id: string) {
    setSelectedSubIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCategory(cat: CategoryItem) {
    const subIds = cat.subItems.map(s => s.id);
    const allSelected = subIds.length > 0 && subIds.every(id => selectedSubIds.has(id));
    setSelectedSubIds(prev => {
      const next = new Set(prev);
      if (allSelected) subIds.forEach(id => next.delete(id));
      else subIds.forEach(id => next.add(id));
      return next;
    });
  }

  // ── Question toggle ─────────────────────────────────────────────────────────

  function toggleQuestion(i: number) {
    setSelectedQIds(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  // ── Refresh items ───────────────────────────────────────────────────────────

  async function handleRefresh() {
    setRefreshing(true);
    await loadItems();
    setRefreshing(false);
    setRefreshed(true);
    setTimeout(() => setRefreshed(false), 1500);
  }

  // ── Generate & copy ─────────────────────────────────────────────────────────

  function handleGenerate() {
    if (selectedQIds.size === 0) {
      Alert.alert('提示', '請至少選擇一個問題');
      return;
    }
    const prompt = buildPrompt(
      gender, age,
      Array.from(goals) as Goal[],
      otherGoal,
      items,
      selectedSubIds,
      selectedQIds,
    );
    setGeneratedPrompt(prompt);
    setCopied(false);
    setShowModal(true);
  }

  async function handleCopy() {
    await Clipboard.setStringAsync(generatedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={s.brand}>AI 保健品</Text>
          <Text style={s.brandAccent}>分析</Text>
        </View>

        {/* ── Section 1: Basic Info ── */}
        <Text style={s.sectionTitle}>基本資料</Text>
        <View style={s.card}>
          <Text style={s.fieldLabel}>性別</Text>
          <View style={s.genderRow}>
            {GENDERS.map(g => (
              <TouchableOpacity
                key={g}
                style={[s.genderBtn, gender === g && s.genderBtnActive]}
                onPress={() => setGender(g)}
                activeOpacity={0.75}
              >
                <Text style={[s.genderText, gender === g && s.genderTextActive]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.fieldLabel, { marginTop: 18 }]}>年齡</Text>
          <TextInput
            style={s.textInput}
            value={age}
            onChangeText={t => setAge(t.replace(/[^0-9]/g, ''))}
            keyboardType="numeric"
            maxLength={3}
            placeholder="請輸入年齡"
            placeholderTextColor={C.textSecondary}
            selectTextOnFocus
          />
        </View>

        {/* ── Section 2: Health Goals ── */}
        <Text style={s.sectionTitle}>健康目標</Text>
        <View style={s.card}>
          <View style={s.goalsGrid}>
            {GOALS.map(g => {
              const active = goals.has(g);
              return (
                <TouchableOpacity
                  key={g}
                  style={[s.goalChip, active && s.goalChipActive]}
                  onPress={() => toggleGoal(g)}
                  activeOpacity={0.75}
                >
                  {active && (
                    <Ionicons name="checkmark" size={13} color={C.accent} style={{ marginRight: 4 }} />
                  )}
                  <Text style={[s.goalText, active && s.goalTextActive]}>{g}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {goals.has('其他') && (
            <TextInput
              style={[s.textInput, { marginTop: 12 }]}
              value={otherGoal}
              onChangeText={setOtherGoal}
              placeholder="請描述你的健康目標"
              placeholderTextColor={C.textSecondary}
              maxLength={100}
            />
          )}
        </View>

        {/* ── Section 3: Supplement Checklist ── */}
        <View style={s.sectionTitleRow}>
          <Text style={[s.sectionTitle, { marginBottom: 0 }]}>納入分析的保健品</Text>
          <View style={s.refreshRow}>
            {refreshed && <Text style={s.refreshedText}>已更新</Text>}
            <TouchableOpacity onPress={handleRefresh} disabled={refreshing} hitSlop={10}>
              <Ionicons
                name="refresh-outline"
                size={19}
                color={refreshing ? C.textSecondary : C.accent}
              />
            </TouchableOpacity>
          </View>
        </View>

        {itemsLoading ? (
          <ActivityIndicator color={C.accent} style={{ marginVertical: 24 }} />
        ) : items.length === 0 ? (
          <View style={s.card}>
            <Text style={s.emptyText}>尚無庫存資料，請先在主頁新增保健品</Text>
          </View>
        ) : (
          items.map(cat => {
            const subIds = cat.subItems.map(s => s.id);
            const allSel = subIds.length > 0 && subIds.every(id => selectedSubIds.has(id));
            const someSel = !allSel && subIds.some(id => selectedSubIds.has(id));

            return (
              <View key={cat.id} style={s.catBlock}>
                {/* Category header */}
                <TouchableOpacity
                  style={s.catHeaderRow}
                  onPress={() => toggleCategory(cat)}
                  activeOpacity={0.7}
                >
                  <View style={[s.checkbox, (allSel || someSel) && s.checkboxChecked]}>
                    {allSel
                      ? <Ionicons name="checkmark" size={14} color="#fff" />
                      : someSel
                      ? <View style={s.checkboxMinus} />
                      : null}
                  </View>
                  <Text style={s.catName}>{cat.name}</Text>
                  <Text style={s.catMeta} numberOfLines={1}>
                    {cat.dailyDose} {cat.doseUnit}／天・{cat.timing}
                  </Text>
                </TouchableOpacity>

                {/* Sub-items */}
                {cat.subItems.map((sub, idx) => {
                  const checked = selectedSubIds.has(sub.id);
                  const isLast = idx === cat.subItems.length - 1;
                  return (
                    <TouchableOpacity
                      key={sub.id}
                      style={[s.subRow, !isLast && s.subRowDivider]}
                      onPress={() => toggleSubItem(sub.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[s.checkbox, s.checkboxSub, checked && s.checkboxChecked]}>
                        {checked && <Ionicons name="checkmark" size={13} color="#fff" />}
                      </View>
                      <View style={s.subInfo}>
                        <Text style={s.subBrand}>{sub.brand}</Text>
                        <Text style={s.subSpec} numberOfLines={1}>{sub.spec}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })
        )}

        {/* ── Section 4: Questions ── */}
        <Text style={s.sectionTitle}>分析問題</Text>
        <View style={s.card}>
          <View style={s.questionsGrid}>
            {QUESTIONS.map((q, i) => {
              const active = selectedQIds.has(i);
              return (
                <TouchableOpacity
                  key={i}
                  style={[s.questionChip, active && s.questionChipActive]}
                  onPress={() => toggleQuestion(i)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.questionChipText, active && s.questionChipTextActive]}>
                    {q.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Generate Button ── */}
        <TouchableOpacity style={s.generateBtn} onPress={handleGenerate} activeOpacity={0.85}>
          <Ionicons name="sparkles-outline" size={18} color="#fff" />
          <Text style={s.generateBtnText}>產出 AI 分析提示</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Prompt Modal (bottom sheet) ── */}
      {showModal && (
        <Modal
          transparent
          animationType="slide"
          visible
          onRequestClose={() => setShowModal(false)}
        >
          <View style={m.overlay}>
            <View style={m.sheet}>
              <View style={m.sheetHandle} />
              <View style={m.sheetHeader}>
                <View style={m.sheetTitleRow}>
                  <Ionicons name="sparkles" size={18} color={C.accent} />
                  <Text style={m.sheetTitle}>AI 分析提示詞</Text>
                </View>
                <TouchableOpacity
                  style={m.closeBtn}
                  onPress={() => setShowModal(false)}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={18} color={C.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={m.divider} />
              <Text style={m.disclaimer}>⚠️ 以下內容僅供參考，不構成醫療建議，請諮詢專業醫師或營養師後再調整保健品使用方式。</Text>
              <ScrollView style={m.textScroll} showsVerticalScrollIndicator={false}>
                <Text style={m.promptText} selectable>{generatedPrompt}</Text>
              </ScrollView>
              <View style={m.divider} />
              <TouchableOpacity
                style={[m.copyBtn, copied && m.copyBtnDone]}
                onPress={handleCopy}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={copied ? 'checkmark-circle' : 'copy-outline'}
                  size={18}
                  color="#fff"
                />
                <Text style={m.copyBtnText}>{copied ? '已複製 ✓' : '一鍵複製'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },

  header: { flexDirection: 'row', alignItems: 'baseline', paddingTop: 12, marginBottom: 20 },
  brand:       { fontSize: 26, fontWeight: '800', color: C.textPrimary, letterSpacing: 0.5 },
  brandAccent: { fontSize: 26, fontWeight: '800', color: C.accent, letterSpacing: 0.5 },

  sectionTitle: {
    fontSize: 15, fontWeight: '700', color: C.textPrimary,
    marginBottom: 10, letterSpacing: 0.3,
  },
  sectionTitleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  refreshRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  refreshedText: { fontSize: 11, color: C.green, fontWeight: '600' },

  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 16,
    marginBottom: 18, borderWidth: 1, borderColor: C.border,
  },

  fieldLabel: {
    fontSize: 11, fontWeight: '600', color: C.textSecondary,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
  },

  genderRow: { flexDirection: 'row', gap: 10 },
  genderBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    backgroundColor: C.cardAlt, alignItems: 'center',
  },
  genderBtnActive:  { backgroundColor: C.accent + '22', borderColor: C.accent },
  genderText:       { fontSize: 15, fontWeight: '600', color: C.textSecondary },
  genderTextActive: { color: C.accent, fontWeight: '700' },

  textInput: {
    backgroundColor: '#0D1117', borderRadius: 12, borderWidth: 1, borderColor: C.border,
    color: C.textPrimary, fontSize: 16, fontWeight: '600',
    paddingVertical: 12, paddingHorizontal: 14,
  },

  goalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  goalChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.cardAlt,
  },
  goalChipActive:  { backgroundColor: C.accent + '18', borderColor: C.accent + '60' },
  goalText:        { fontSize: 14, fontWeight: '500', color: C.textSecondary },
  goalTextActive:  { color: C.accent, fontWeight: '700' },

  emptyText: { fontSize: 14, color: C.textSecondary, textAlign: 'center', paddingVertical: 8 },

  // Category block
  catBlock: {
    backgroundColor: C.card, borderRadius: 12, marginBottom: 10,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  catHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 2, borderColor: C.border,
    backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: C.accent, borderColor: C.accent },
  checkboxSub:     { width: 18, height: 18, borderRadius: 4 },
  checkboxMinus: {
    width: 10, height: 2, borderRadius: 1, backgroundColor: C.accent,
  },
  catName: { flex: 1, fontSize: 15, fontWeight: '600', color: C.textPrimary },
  catMeta: { fontSize: 11, color: C.textSecondary, flexShrink: 1 },

  subRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 14, paddingLeft: 36,
    borderTopWidth: 1, borderTopColor: '#21262D',
  },
  subRowDivider: { borderBottomWidth: 0 },
  subInfo:  { flex: 1 },
  subBrand: { fontSize: 13, fontWeight: '600', color: C.textPrimary },
  subSpec:  { fontSize: 11, color: C.textSecondary, marginTop: 1 },

  questionsGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  questionChip: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.cardAlt,
  },
  questionChipActive:     { backgroundColor: C.accent, borderColor: C.accent },
  questionChipText:       { fontSize: 13, fontWeight: '600', color: C.textSecondary },
  questionChipTextActive: { color: '#fff' },

  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 9, backgroundColor: '#2EA043', borderRadius: 14,
    paddingVertical: 16, marginBottom: 4,
    shadowColor: '#3FB950', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  generateBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

const m = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.cardAlt, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderBottomWidth: 0, borderColor: C.border,
    paddingHorizontal: 20, paddingBottom: 28, maxHeight: '82%',
  },
  sheetHandle: {
    width: 38, height: 4, borderRadius: 2, backgroundColor: C.border,
    alignSelf: 'center', marginTop: 10, marginBottom: 6,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 10,
  },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetTitle:    { fontSize: 17, fontWeight: '700', color: C.textPrimary },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#30363D', alignItems: 'center', justifyContent: 'center',
  },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 12 },
  disclaimer: { fontSize: 12, color: '#FF9500', lineHeight: 18, marginBottom: 10 },
  textScroll: { flexGrow: 0, maxHeight: 340 },
  promptText: {
    fontSize: 14, color: C.textPrimary, lineHeight: 22,
    fontFamily: undefined,
  },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: C.accent, borderRadius: 12, paddingVertical: 14,
  },
  copyBtnDone:  { backgroundColor: C.green },
  copyBtnText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
});
