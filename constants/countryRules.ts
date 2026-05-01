export type CountryCode = 'TW' | 'JP' | 'KR' | 'OFF';

export type CountryRule = {
  currency: string;
  taxFreePerOrder: number;
  quotaCount: number;   // 0 = no per-period limit (hide count column)
  freeShipping: number; // 0 = hide shipping status light
  periodLabel: string;
};

export const COUNTRY_RULES: Record<CountryCode, CountryRule> = {
  TW:  { currency: 'NT$', taxFreePerOrder: 2000,   quotaCount: 6, freeShipping: 1250,  periodLabel: '半年' },
  JP:  { currency: '¥',   taxFreePerOrder: 16666,  quotaCount: 0, freeShipping: 5500,  periodLabel: '每次' },
  KR:  { currency: '₩',   taxFreePerOrder: 150000, quotaCount: 0, freeShipping: 55000, periodLabel: '每次' },
  OFF: { currency: '',    taxFreePerOrder: 0,      quotaCount: 0, freeShipping: 0,     periodLabel: '' },
};

export const COUNTRY_OPTIONS: Array<{ code: CountryCode; label: string; flag: string }> = [
  { code: 'TW',  label: '台灣',  flag: '🇹🇼' },
  { code: 'JP',  label: '日本',  flag: '🇯🇵' },
  { code: 'KR',  label: '韓國',  flag: '🇰🇷' },
  { code: 'OFF', label: '關閉',  flag: '🚫' },
];
