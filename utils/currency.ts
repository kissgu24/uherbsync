const USD_RATE = 32;

export function formatCurrency(amountNTD: number, language: string): string {
  if (language === 'en') {
    const usd = (amountNTD / USD_RATE).toFixed(2);
    return `$${usd}`;
  }
  return `NT$${amountNTD.toLocaleString()}`;
}

export function formatThreshold(amountNTD: number, language: string, fallbackCurrency = 'NT$'): string {
  if (language === 'en') {
    return `$${Math.round(amountNTD / USD_RATE)}`;
  }
  return `${fallbackCurrency}${amountNTD.toLocaleString()}`;
}
