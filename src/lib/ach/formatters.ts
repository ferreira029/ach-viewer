import type { Locale } from "@/lib/i18n";

function getIntlLocale(locale: Locale) {
  return locale === "pt" ? "pt-BR" : "en-US";
}

export function formatCurrencyFromCents(valueInCents: number, locale: Locale = "en") {
  return new Intl.NumberFormat(getIntlLocale(locale), {
    style: "currency",
    currency: "USD",
  }).format(valueInCents / 100);
}

export function formatCount(value: number, locale: Locale = "en") {
  return new Intl.NumberFormat(getIntlLocale(locale)).format(value);
}
