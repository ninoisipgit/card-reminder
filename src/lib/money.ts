/** Money helpers. Amounts are whole centavos everywhere in the app. */

/** 150050 -> '₱1,500.50', 150000 -> '₱1,500' */
export function formatPeso(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const rest = abs % 100;
  return `${sign}₱${whole}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`;
}

/** Parses what a user types: '1500', '1,500.5', '₱ 1,500.50'. Returns null if it isn't a positive amount. */
export function parsePesoToCents(input: string): number | null {
  const cleaned = input.replace(/[₱,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return cents > 0 && Number.isSafeInteger(cents) ? cents : null;
}
