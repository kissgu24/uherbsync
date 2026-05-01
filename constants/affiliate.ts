export const IHERB_RCODE = 'YOUR_RCODE_HERE'; // 等聯盟碼下來替換這裡

export function buildIHerbSearchUrl(keyword: string): string {
  return `https://tw.iherb.com/search?kw=${encodeURIComponent(keyword)}&rcode=${IHERB_RCODE}`;
}

export function buildIHerbProductUrl(url: string): string {
  if (!url) return '';
  const base = url.split('?')[0];
  return `${base}?rcode=${IHERB_RCODE}`;
}
