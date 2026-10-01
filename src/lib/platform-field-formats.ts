import { onlyDigits } from "./input-masks";

export function maskPlatformMoney(value: string) {
  const digits = onlyDigits(value);
  if (!digits) return "0,00";
  const padded = digits.padStart(3, "0");
  const integer = (padded.slice(0, -2).replace(/^0+(?=\d)/, "") || "0").replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ".",
  );
  return `${integer},${padded.slice(-2)}`;
}

export function parsePlatformMoneyToCents(value: string) {
  const digits = onlyDigits(value);
  return digits ? Number.parseInt(digits, 10) : 0;
}

export function formatPlatformMoneyInput(cents: number) {
  return (Math.max(0, cents) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPlatformCurrency(cents: number) {
  return (Math.max(0, cents) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
