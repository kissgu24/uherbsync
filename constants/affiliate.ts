export const IHERB_RCODE    = 'YOUR_RCODE_HERE'; // 等聯盟碼下來替換這裡
export const AMAZON_TAG     = 'uherbsync-20';
export const VITACOST_RCODE = '';
export const SWANSON_RCODE  = '';

export type RestockPlatform = 'iherb' | 'amazon' | 'vitacost' | 'swanson';

export function buildIHerbSearchUrl(keyword: string): string {
  return `https://tw.iherb.com/search?kw=${encodeURIComponent(keyword)}&rcode=${IHERB_RCODE}`;
}

export function buildIHerbProductUrl(url: string): string {
  if (!url) return '';
  const base = url.split('?')[0];
  return `${base}?rcode=${IHERB_RCODE}`;
}

export function detectPlatform(url: string): RestockPlatform | null {
  if (!url) return null;
  if (url.includes('iherb.com')) return 'iherb';
  if (url.includes('amazon.com')) return 'amazon';
  if (url.includes('vitacost.com')) return 'vitacost';
  if (url.includes('swansonvitamins.com')) return 'swanson';
  return null;
}

export function buildPlatformSearchUrl(keyword: string, platform: RestockPlatform): string {
  const kw = encodeURIComponent(keyword);
  switch (platform) {
    case 'amazon':   return `https://www.amazon.com/s?k=${kw}&tag=${AMAZON_TAG}`;
    case 'vitacost': return `https://www.vitacost.com/search#q=${kw}`;
    case 'swanson':  return `https://www.swansonvitamins.com/search?keywords=${kw}`;
    default:         return buildIHerbSearchUrl(keyword);
  }
}

export function buildRestockUrl(productUrl: string, keyword: string): string {
  if (productUrl) {
    if (productUrl.includes('iherb.com')) {
      return buildIHerbProductUrl(productUrl);
    }
    if (productUrl.includes('amazon.com')) {
      const base = productUrl.split('?')[0];
      return `${base}?tag=${AMAZON_TAG}`;
    }
    return productUrl; // vitacost / swanson — no affiliate tag
  }
  return buildIHerbSearchUrl(keyword);
}
