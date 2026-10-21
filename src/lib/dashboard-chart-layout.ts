export const DASHBOARD_CHART_MARGIN = { top: 4, right: 4, bottom: 0, left: 0 };

export const DASHBOARD_CHART_TEXT_COLOR = "var(--foreground)";

export const DESKTOP_MESSAGE_HOUR_TICKS = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, "0")}h`,
);

export const MOBILE_MESSAGE_HOUR_TICKS = [...DESKTOP_MESSAGE_HOUR_TICKS];

export function messageHourTicks(isMobile: boolean) {
  return isMobile ? MOBILE_MESSAGE_HOUR_TICKS : DESKTOP_MESSAGE_HOUR_TICKS;
}

export function messageTrafficSummary(
  data: Array<{ recebidas: number; enviadas: number; total: number }>,
  contactsTotal: number,
) {
  return data.reduce<{ recebidas: number; enviadas: number; total: number; contatos: number }>(
    (summary, item) => ({
      recebidas: summary.recebidas + item.recebidas,
      enviadas: summary.enviadas + item.enviadas,
      total: summary.total + item.total,
      contatos: summary.contatos,
    }),
    { recebidas: 0, enviadas: 0, total: 0, contatos: contactsTotal },
  );
}

export function formatDashboardAxisLabel(value: unknown, maxLength = 18) {
  const label = String(value ?? "");
  if (label.length <= maxLength) return label;
  return `${label.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

function dashboardLabelWidth(value: unknown) {
  return Array.from(String(value ?? "")).reduce((width, character) => {
    if (/\s/.test(character)) return width + 3.2;
    if (/[MW@#%&]/.test(character)) return width + 8;
    if (/[A-Z0-9]/.test(character)) return width + 6.4;
    return width + 5.6;
  }, 0);
}

export function formatDashboardAxisLabelToWidth(value: unknown, maxWidth: number) {
  const label = String(value ?? "");
  if (dashboardLabelWidth(label) <= maxWidth) return label;

  const ellipsisWidth = dashboardLabelWidth("...");
  let usedWidth = 0;
  let visible = "";
  for (const character of label) {
    const characterWidth = dashboardLabelWidth(character);
    if (usedWidth + characterWidth + ellipsisWidth > maxWidth) break;
    visible += character;
    usedWidth += characterWidth;
  }
  return `${visible.trimEnd() || label.slice(0, 1)}...`;
}

export function dashboardCategoryAxisLayout(labels: unknown[], containerWidth: number) {
  const availableWidth = containerWidth > 0 ? containerWidth : 480;
  const longestLabelWidth = labels.reduce<number>(
    (longest, label) => Math.max(longest, dashboardLabelWidth(label)),
    0,
  );
  const maxLabelWidth = Math.max(58, Math.min(190, availableWidth * 0.38));
  const width = Math.min(Math.max(76, longestLabelWidth + 18), Math.max(76, maxLabelWidth + 12));

  return {
    maxLabelWidth,
    width: Math.round(width),
    marginLeft: availableWidth < 360 ? 0 : 4,
  };
}

export function dashboardColumnAxisLayout(labels: unknown[], containerWidth: number) {
  const availableWidth = containerWidth > 0 ? containerWidth : 480;
  const categoryCount = Math.max(1, labels.length);
  const plotWidth = Math.max(120, availableWidth - 46);
  const slotWidth = plotWidth / categoryCount;
  const longestLabelWidth = labels.reduce<number>(
    (longest, label) => Math.max(longest, dashboardLabelWidth(label)),
    0,
  );
  const angled = longestLabelWidth > slotWidth * 0.9;
  const maxLabelWidth = angled
    ? Math.max(48, Math.min(180, slotWidth * 1.85))
    : Math.max(40, slotWidth * 0.9);
  const visibleLabelWidth = Math.min(longestLabelWidth, maxLabelWidth);

  return {
    angle: angled ? -35 : 0,
    textAnchor: angled ? ("end" as const) : ("middle" as const),
    height: angled ? Math.round(Math.max(54, Math.min(92, visibleLabelWidth * 0.58 + 20))) : 30,
    maxLabelWidth,
    marginBottom: angled ? 4 : 0,
  };
}
