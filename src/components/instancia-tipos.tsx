import * as React from "react";

export type TipoInstancia =
  | "whatsapp"
  | "instagram"
  | "telegram"
  | "mercadolivre"
  | "olx"
  | "magalu"
  | "shopee";

type TipoInfo = {
  value: TipoInstancia;
  label: string;
  color: string;
  Icon: React.FC<{ className?: string }>;
};

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 2.1.55 4.15 1.6 5.96L2 22l4.25-1.11a9.9 9.9 0 0 0 5.79 1.85h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.79 14.16c-.25.7-1.44 1.36-1.99 1.42-.53.06-1.19.08-1.93-.12-.44-.12-1-.31-1.73-.62-3.03-1.31-5-4.36-5.16-4.56-.15-.2-1.24-1.65-1.24-3.15s.79-2.24 1.07-2.55c.28-.31.61-.39.81-.39.2 0 .41.01.58.02.19 0 .44-.07.68.52.25.6.86 2.09.94 2.24.08.15.13.32.03.52-.1.2-.15.32-.3.5-.15.17-.32.39-.46.53-.15.15-.31.31-.13.61.18.3.79 1.31 1.7 2.12 1.17 1.04 2.16 1.36 2.46 1.52.3.15.48.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.68-.15.28.1 1.77.83 2.07.98.3.15.5.22.58.35.08.13.08.75-.17 1.45Z" />
  </svg>
);

const InstagramIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M12 2.2c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.21 15.58 2.2 15.2 2.2 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.21 8.8 2.2 12 2.2Zm0 3.2a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2Zm0 10.9a4.3 4.3 0 1 1 0-8.6 4.3 4.3 0 0 1 0 8.6Zm6.85-11.15a1.55 1.55 0 1 1-3.1 0 1.55 1.55 0 0 1 3.1 0Z" />
  </svg>
);

const TelegramIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M9.78 15.28l-.4 4.05c.57 0 .82-.24 1.12-.53l2.7-2.55 5.6 4.09c1.03.57 1.76.27 2.03-.95L23.9 3.83c.35-1.53-.55-2.13-1.55-1.76L1.14 10.3C-.35 10.88-.33 11.7.89 12.07l5.36 1.67L18.7 5.98c.58-.36 1.11-.16.68.21" />
  </svg>
);

const MercadoLivreIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M12 3C6.5 3 2 6.4 2 10.6c0 1.5.6 2.9 1.7 4-.1.7-.5 1.6-1.2 2.4 1.4-.1 2.7-.7 3.6-1.4C7.6 16.4 9.7 17 12 17s4.4-.6 5.9-1.4c.9.7 2.2 1.3 3.6 1.4-.7-.8-1.1-1.7-1.2-2.4 1.1-1.1 1.7-2.5 1.7-4C22 6.4 17.5 3 12 3Zm-3.3 6.4c.7 0 1.2.5 1.2 1.2s-.5 1.2-1.2 1.2-1.2-.5-1.2-1.2.5-1.2 1.2-1.2Zm6.6 0c.7 0 1.2.5 1.2 1.2s-.5 1.2-1.2 1.2-1.2-.5-1.2-1.2.5-1.2 1.2-1.2ZM8 13.5c1.1.7 2.5 1 4 1s2.9-.3 4-1c-.6 1.4-2.2 2.4-4 2.4s-3.4-1-4-2.4Z" />
  </svg>
);

const OlxIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <text x="12" y="17" textAnchor="middle" fontSize="11" fontWeight="900" fill="currentColor" fontFamily="ui-sans-serif, system-ui">OLX</text>
  </svg>
);

const MagaluIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <text x="12" y="17" textAnchor="middle" fontSize="11" fontWeight="900" fill="currentColor" fontFamily="ui-sans-serif, system-ui">ML</text>
  </svg>
);

const ShopeeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M12 2.2c-2.4 0-4.4 1.9-4.5 4.3H4.2c-.5 0-.9.4-.9.9L2.6 20c0 1 .8 1.8 1.8 1.8h15.2c1 0 1.8-.8 1.8-1.8l-.7-12.6c0-.5-.4-.9-.9-.9h-3.3C15.4 4.1 13.4 2.2 12 2.2Zm0 1.7c1.4 0 2.6 1.1 2.7 2.6H9.3c.1-1.5 1.3-2.6 2.7-2.6Zm-.4 6.4c1.9 0 3 .9 3 2.3 0 .4-.3.7-.7.7s-.7-.3-.7-.7c0-.5-.5-.9-1.6-.9-1 0-1.5.4-1.5.9 0 .6.6.8 1.9 1.1 1.5.4 2.9.9 2.9 2.4 0 1.5-1.3 2.4-3.2 2.4-2 0-3.3-1-3.3-2.4 0-.4.3-.7.7-.7s.7.3.7.7c0 .6.7 1 1.9 1s1.8-.4 1.8-1c0-.6-.5-.8-1.9-1.1-1.4-.4-2.9-.9-2.9-2.4 0-1.3 1.2-2.3 2.9-2.3Z" />
  </svg>
);

export const TIPOS_INSTANCIA: TipoInfo[] = [
  { value: "whatsapp", label: "WhatsApp", color: "#25D366", Icon: WhatsAppIcon },
  { value: "instagram", label: "Instagram", color: "#E4405F", Icon: InstagramIcon },
  { value: "telegram", label: "Telegram", color: "#229ED9", Icon: TelegramIcon },
  { value: "mercadolivre", label: "Mercado Livre", color: "#FFE600", Icon: MercadoLivreIcon },
  { value: "olx", label: "OLX", color: "#6E3AFF", Icon: OlxIcon },
  { value: "magalu", label: "Magazine Luiza", color: "#0086FF", Icon: MagaluIcon },
  { value: "shopee", label: "Shopee", color: "#EE4D2D", Icon: ShopeeIcon },
];

export function getTipoInfo(tipo?: string | null): TipoInfo {
  return TIPOS_INSTANCIA.find((t) => t.value === tipo) ?? TIPOS_INSTANCIA[0];
}

export function TipoBadge({ tipo, size = 40 }: { tipo?: string | null; size?: number }) {
  const info = getTipoInfo(tipo);
  const isYellow = info.color.toUpperCase() === "#FFE600";
  return (
    <div
      className="flex items-center justify-center rounded-lg"
      style={{ background: info.color, width: size, height: size, color: isYellow ? "#1f2937" : "#ffffff" }}
      title={info.label}
    >
      <info.Icon className="h-5 w-5" />
    </div>
  );
}
