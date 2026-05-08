// ─── Tracking parameter removal ───────────────────────────────────────────────

const TRACKING_PREFIXES = ['utm_', 'sp_', 'af_'];
const TRACKING_EXACT = [
  'fbclid', 'gclid', 'mdiv', 'ref', 'from', 'smid',
  'clickid', 'openstat', 'yclid', 'gbraid', 'wbraid',
];

export function removeTrackingParams(url: string): string {
  try {
    const u = new URL(url);
    const toDelete = [...u.searchParams.keys()].filter(
      k => TRACKING_EXACT.includes(k) || TRACKING_PREFIXES.some(p => k.startsWith(p))
    );
    toDelete.forEach(k => u.searchParams.delete(k));
    return u.toString();
  } catch {
    return url;
  }
}

// ─── Short URL resolution ──────────────────────────────────────────────────────

export async function resolveShortUrl(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.url || url;
  } catch {
    clearTimeout(timer);
    return url;
  }
}

// ─── Metadata extraction ──────────────────────────────────────────────────────

export type SupplementMeta = {
  doseAmount?: number;
  doseUnit?: string;
  quantity?: number;
};

export function extractSupplementMetadata(name: string): SupplementMeta {
  const doseMatch = name.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|iu|μg)/i);
  const qtyMatch  = name.match(/(\d+)\s*(softgels?|capsules?|caps?|tablets?|vegcaps?|vcaps?|count|顆|粒)/i);
  return {
    doseAmount: doseMatch ? parseFloat(doseMatch[1]) : undefined,
    doseUnit:   doseMatch ? doseMatch[2].toLowerCase() : undefined,
    quantity:   qtyMatch  ? parseInt(qtyMatch[1], 10)  : undefined,
  };
}

// ─── Result type ──────────────────────────────────────────────────────────────

export type NewPlatformResult = {
  productName: string;
  brand: string;
  spec: string;
  bottleSize: number | null;
  productId: string;
  platform: 'momo' | 'costco' | 'shopee' | 'coupang';
  normalizedUrl: string;
};

// ─── Platform detection ───────────────────────────────────────────────────────

function detectPlatform(url: string): NewPlatformResult['platform'] | null {
  if (/momoshop\.com\.tw|momo\.dm/i.test(url))  return 'momo';
  if (/costco\.com\.tw/i.test(url))              return 'costco';
  if (/shopee\.tw/i.test(url))                   return 'shopee';
  if (/coupang\.com/i.test(url))                 return 'coupang';
  return null;
}

// ─── Platform parsers ─────────────────────────────────────────────────────────

function parseMomo(url: string): NewPlatformResult | null {
  try {
    const iCode = new URL(url).searchParams.get('i_code');
    if (!iCode) return null;
    return {
      productName: '',
      brand: '',
      spec: '',
      bottleSize: null,
      productId: iCode,
      platform: 'momo',
      normalizedUrl: `https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=${iCode}`,
    };
  } catch {
    return null;
  }
}

function parseCostco(url: string): NewPlatformResult | null {
  const idMatch = url.match(/\/p\/(\d+)/);
  if (!idMatch) return null;
  const productId = idMatch[1];
  const slugMatch = url.match(/\/([^/?]+)\/p\/\d+/);
  const slug = slugMatch ? decodeURIComponent(slugMatch[1]).replace(/-/g, ' ') : '';
  const meta = extractSupplementMetadata(slug);
  return {
    productName: slug,
    brand: '',
    spec: slug,
    bottleSize: meta.quantity ?? null,
    productId,
    platform: 'costco',
    normalizedUrl: removeTrackingParams(url),
  };
}

function parseShopee(url: string): NewPlatformResult | null {
  const dotMatch  = url.match(/[-.]i\.(\d+)\.(\d+)/);
  const pathMatch = url.match(/\/product\/(\d+)\/(\d+)/);
  const m = dotMatch ?? pathMatch;
  if (!m) return null;
  const [, shopId, itemId] = m;
  const slugMatch = url.match(/shopee\.tw\/(.+?)-i\./);
  const slug = slugMatch ? decodeURIComponent(slugMatch[1]).replace(/-/g, ' ') : '';
  const meta = extractSupplementMetadata(slug);
  return {
    productName: slug,
    brand: '',
    spec: slug,
    bottleSize: meta.quantity ?? null,
    productId: `${shopId}.${itemId}`,
    platform: 'shopee',
    normalizedUrl: `https://shopee.tw/product/${shopId}/${itemId}`,
  };
}

function parseCoupang(url: string): NewPlatformResult | null {
  const segMatch = url.match(/\/products\/([^/?]+)/);
  if (!segMatch) return null;
  const seg       = segMatch[1];
  const productId = seg.match(/(\d+)$/)?.[1] ?? seg;
  let itemId = '';
  try { itemId = new URL(url).searchParams.get('itemId') ?? ''; } catch {}
  const slug = decodeURIComponent(seg).replace(/-/g, ' ').trim();
  const meta = extractSupplementMetadata(slug);
  return {
    productName: slug,
    brand: '',
    spec: slug,
    bottleSize: meta.quantity ?? null,
    productId: itemId ? `${productId}-${itemId}` : productId,
    platform: 'coupang',
    normalizedUrl: removeTrackingParams(url),
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function parseNewPlatformUrl(url: string): Promise<NewPlatformResult | null> {
  const resolved = await resolveShortUrl(url.trim());
  const cleaned  = removeTrackingParams(resolved);
  const platform = detectPlatform(cleaned);
  if (!platform) return null;

  switch (platform) {
    case 'momo':    return parseMomo(cleaned);
    case 'costco':  return parseCostco(cleaned);
    case 'shopee':  return parseShopee(cleaned);
    case 'coupang': return parseCoupang(cleaned);
  }
}
