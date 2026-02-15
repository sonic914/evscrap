/** 금액 포맷 (KRW 기본) */
export function formatAmount(amount: number | undefined | null, currency = 'KRW'): string {
  if (amount == null) return '-';
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency }).format(amount);
}
