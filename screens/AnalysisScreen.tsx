import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Modal, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { CategoryItem, loadCategoryItems, logEvent } from '../db/db';
import { i18n } from '../i18n';
import { useLanguage } from '../contexts/LanguageContext';

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

const GENDER_KEYS = ['male', 'female', 'prefer_not'] as const;
type GenderKey = typeof GENDER_KEYS[number] | '';

const GOAL_KEYS = ['anti_aging', 'fitness', 'skin', 'metabolism', 'menstrual', 'other'] as const;
type GoalKey = typeof GOAL_KEYS[number];

const QUESTION_COUNT = 6;

// ─── i18n Helpers ─────────────────────────────────────────────────────────────

function genderLabel(key: GenderKey): string {
  const map: Record<string, string> = {
    male:       i18n.t('analysis.genderMale'),
    female:     i18n.t('analysis.genderFemale'),
    prefer_not: i18n.t('analysis.genderPrivate'),
  };
  return map[key] ?? '';
}

function goalLabel(key: GoalKey): string {
  const map: Record<string, string> = {
    anti_aging: i18n.t('analysis.goalAntiAging'),
    fitness:    i18n.t('analysis.goalFitness'),
    skin:       i18n.t('analysis.goalSkin'),
    metabolism: i18n.t('analysis.goalMetabolism'),
    menstrual:  i18n.t('analysis.goalMenstrual'),
    other:      i18n.t('analysis.goalOther'),
  };
  return map[key] ?? key;
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildPrompt(
  gender: GenderKey,
  age: string,
  goals: GoalKey[],
  otherGoal: string,
  items: CategoryItem[],
  selectedSubIds: Set<string>,
  selectedQIds: Set<number>,
): string {
  const genderStr = gender ? genderLabel(gender) : i18n.t('analysis.promptUnknown');
  const ageStr    = age.trim() || i18n.t('analysis.promptUnknown');
  const sep       = i18n.t('analysis.promptGoalSep');
  const goalList  = goals.map(g =>
    g === 'other' ? (otherGoal.trim() || i18n.t('analysis.goalOther')) : goalLabel(g)
  );
  const goalsStr = goalList.length > 0 ? goalList.join(sep) : i18n.t('analysis.promptNoGoals');

  const lines: string[] = [];
  for (const cat of items) {
    for (const sub of cat.subItems) {
      if (selectedSubIds.has(sub.id)) {
        lines.push(
          i18n.t('analysis.promptSupLine', {
            category: cat.name,
            brand:    sub.brand,
            spec:     sub.spec,
            dose:     cat.dailyDose,
            unit:     cat.doseUnit,
            timing:   cat.timing,
          }),
        );
      }
    }
  }

  const supplementsBlock = lines.length > 0 ? lines.join('\n') : i18n.t('analysis.promptNoSupplements');

  const questionsBlock = Array.from({ length: QUESTION_COUNT }, (_, i) => i)
    .filter(i => selectedQIds.has(i))
    .map((i, idx) => `${idx + 1}. ${i18n.t(`analysis.q${i}Text`)}`)
    .join('\n');

  const intro      = i18n.t('analysis.promptIntro', { age: ageStr, gender: genderStr, goals: goalsStr });
  const supsHeader = i18n.t('analysis.promptSupsHeader');
  const askHeader  = i18n.t('analysis.promptAskHeader');

  const parts = [intro];
  if (supsHeader) parts.push(supsHeader);
  parts.push(supplementsBlock, '', askHeader, questionsBlock);
  return parts.join('\n');
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AnalysisScreen() {
  const { language } = useLanguage();
  const [gender, setGender] = useState<GenderKey>('');
  const [age, setAge] = useState('');
  const [goals, setGoals] = useState<Set<GoalKey>>(new Set());
  const [otherGoal, setOtherGoal] = useState('');
  const [items, setItems] = useState<CategoryItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [selectedSubIds, setSelectedSubIds] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const [selectedQIds, setSelectedQIds] = useState<Set<number>>(new Set([0]));

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

  function toggleGoal(g: GoalKey) {
    const isSelecting = !goals.has(g);
    const nextGoals = new Set(goals);
    if (nextGoals.has(g)) nextGoals.delete(g);
    else nextGoals.add(g);
    setGoals(prev => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
    if (isSelecting) {
      logEvent({
        event_type: 'select_reason',
        target_type: 'reason',
        target_id: g,
        context: {
          screen: 'AnalysisScreen',
          current_selection: Array.from(nextGoals),
        },
      });
    }
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
      Alert.alert(i18n.t('analysis.alertTitle'), i18n.t('analysis.alertMsg'));
      return;
    }
    const prompt = buildPrompt(
      gender, age,
      Array.from(goals) as GoalKey[],
      otherGoal, items, selectedSubIds, selectedQIds,
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
          <Text style={s.brand}>{i18n.t('analysis.titleMain')}</Text>
          <Text style={s.brandAccent}>{i18n.t('analysis.titleAccent')}</Text>
        </View>

        {/* ── Section 1: Basic Info ── */}
        <Text style={s.sectionTitle}>{i18n.t('analysis.basicInfo')}</Text>
        <View style={s.card}>
          <Text style={s.fieldLabel}>{i18n.t('analysis.gender')}</Text>
          <View style={s.genderRow}>
            {GENDER_KEYS.map(key => (
              <TouchableOpacity
                key={key}
                style={[s.genderBtn, gender === key && s.genderBtnActive]}
                onPress={() => setGender(key)}
                activeOpacity={0.75}
              >
                <Text style={[s.genderText, gender === key && s.genderTextActive]}>
                  {genderLabel(key)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.fieldLabel, { marginTop: 18 }]}>{i18n.t('analysis.age')}</Text>
          <TextInput
            style={s.textInput}
            value={age}
            onChangeText={t => setAge(t.replace(/[^0-9]/g, ''))}
            keyboardType="numeric"
            maxLength={3}
            placeholder={i18n.t('analysis.agePlaceholder')}
            placeholderTextColor={C.textSecondary}
            selectTextOnFocus
          />
        </View>

        {/* ── Section 2: Health Goals ── */}
        <Text style={s.sectionTitle}>{i18n.t('analysis.healthGoals')}</Text>
        <View style={s.card}>
          <View style={s.goalsGrid}>
            {GOAL_KEYS.map(key => {
              const active = goals.has(key);
              return (
                <TouchableOpacity
                  key={key}
                  style={[s.goalChip, active && s.goalChipActive]}
                  onPress={() => toggleGoal(key)}
                  activeOpacity={0.75}
                >
                  {active && (
                    <Ionicons name="checkmark" size={13} color={C.accent} style={{ marginRight: 4 }} />
                  )}
                  <Text style={[s.goalText, active && s.goalTextActive]}>{goalLabel(key)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {goals.has('other') && (
            <TextInput
              style={[s.textInput, { marginTop: 12 }]}
              value={otherGoal}
              onChangeText={setOtherGoal}
              placeholder={i18n.t('analysis.otherGoalPlaceholder')}
              placeholderTextColor={C.textSecondary}
              maxLength={100}
            />
          )}
        </View>

        {/* ── Section 3: Supplement Checklist ── */}
        <View style={s.sectionTitleRow}>
          <Text style={[s.sectionTitle, { marginBottom: 0 }]}>{i18n.t('analysis.supplementsTitle')}</Text>
          <View style={s.refreshRow}>
            {refreshed && <Text style={s.refreshedText}>{i18n.t('analysis.updated')}</Text>}
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
            <Text style={s.emptyText}>{i18n.t('analysis.empty')}</Text>
          </View>
        ) : (
          items.map(cat => {
            const subIds  = cat.subItems.map(s => s.id);
            const allSel  = subIds.length > 0 && subIds.every(id => selectedSubIds.has(id));
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
                    {i18n.t('analysis.catMetaFormat', {
                      dose: cat.dailyDose,
                      unit: cat.doseUnit,
                      timing: cat.timing,
                    })}
                  </Text>
                </TouchableOpacity>

                {/* Sub-items */}
                {cat.subItems.map((sub, idx) => {
                  const checked = selectedSubIds.has(sub.id);
                  const isLast  = idx === cat.subItems.length - 1;
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
        <Text style={s.sectionTitle}>{i18n.t('analysis.questionsTitle')}</Text>
        <View style={s.card}>
          <View style={s.questionsGrid}>
            {Array.from({ length: QUESTION_COUNT }, (_, i) => i).map(i => {
              const active = selectedQIds.has(i);
              return (
                <TouchableOpacity
                  key={i}
                  style={[s.questionChip, active && s.questionChipActive]}
                  onPress={() => toggleQuestion(i)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.questionChipText, active && s.questionChipTextActive]}>
                    {i18n.t(`analysis.q${i}Label`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Generate Button ── */}
        <TouchableOpacity style={s.generateBtn} onPress={handleGenerate} activeOpacity={0.85}>
          <Ionicons name="sparkles-outline" size={18} color="#fff" />
          <Text style={s.generateBtnText}>{i18n.t('analysis.generateBtn')}</Text>
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
                  <Text style={m.sheetTitle}>{i18n.t('analysis.promptTitle')}</Text>
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
              <Text style={m.disclaimer}>{i18n.t('analysis.disclaimer')}</Text>
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
                <Text style={m.copyBtnText}>
                  {copied ? i18n.t('analysis.copiedBtn') : i18n.t('analysis.copyBtn')}
                </Text>
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
  divider:    { height: 1, backgroundColor: C.border, marginVertical: 12 },
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
