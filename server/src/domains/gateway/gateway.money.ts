// Money and quantity formatting. Amounts are computed in cents to avoid float drift.

export const cents = (eur: number) => Math.round(eur * 100);
export const eurFromCents = (c: number) => c / 100;
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** unit price × quantity, rounded to the cent. */
export const lineTotal = (unitPrice: number, units: number) => eurFromCents(cents(unitPrice) * units);

export const sum = (values: number[]) => eurFromCents(values.reduce((s, v) => s + cents(v), 0));

/** €1,482.00 */
export const eur = (n: number, digits = 2) => `€${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

/** 1,000 */
export const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
