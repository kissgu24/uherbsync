import { Linking } from 'react-native';
import { buildIHerbSearchUrl } from '../constants/affiliate';

export type ReorderTarget = {
  keyword: string;
  url?: string;
};

export function executeReorder(target: ReorderTarget): void {
  const { keyword, url: rawUrl = '' } = target;
  if (__DEV__) console.log('[DEBUG SOURCE] Raw input to reorder:', rawUrl);

  let finalUrl: string;
  if (/coupang\.com/i.test(rawUrl)) {
    finalUrl = `https://www.tw.coupang.com/np/search?q=${encodeURIComponent(keyword)}`;
  } else if (rawUrl) {
    finalUrl = rawUrl;
  } else {
    finalUrl = buildIHerbSearchUrl(keyword);
  }

  try {
    const u = new URL(finalUrl);
    u.protocol = 'https:';
    finalUrl = u.toString().replace(/\?$/, '');
  } catch {
    finalUrl = finalUrl.replace('http://', 'https://').replace(/\?$/, '');
  }

  if (__DEV__) console.log('[REORDER EXECUTE] Sending to OS:', finalUrl);
  Linking.openURL(finalUrl).catch(err => console.warn('Could not open URL:', err));
}
