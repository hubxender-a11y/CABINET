export function formatMoney(amount: number | string, currency: string) {
  const maximumFractionDigits = currency === "USD" ? 2 : 0;
  return `${new Intl.NumberFormat("fr-CD", {
    maximumFractionDigits,
  }).format(Number(amount))} ${currency}`;
}

export function formatDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
) {
  return new Intl.DateTimeFormat("fr-CD", {
    ...options,
    timeZone: "Africa/Kinshasa",
  }).format(typeof value === "string" ? new Date(value) : value);
}
