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

export function dashboardLabelWidth(value: unknown) {
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
  if (maxWidth < ellipsisWidth + dashboardLabelWidth(Array.from(label)[0] ?? "")) return "…";
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
  const width = Math.min(Math.max(32, longestLabelWidth + 18), Math.max(32, maxLabelWidth + 12));

  return {
    maxLabelWidth,
    width: Math.round(width),
    marginLeft: availableWidth < 360 ? 0 : 4,
  };
}

/** Shows up to three complete words in at most two balanced lines. */
export function dashboardColumnLabelLines(value: unknown) {
  const words = String(value ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 3);
  const label = words.join(" ");
  if (words.length < 2) return [label];
  if (words.length === 3) {
    const [first, middle, last] = words;
    if (dashboardLabelWidth(middle) > dashboardLabelWidth(`${first} ${last}`)) {
      return [first, middle];
    }
    if (dashboardLabelWidth(first) > dashboardLabelWidth(`${middle} ${last}`)) {
      return [first, `${middle} ${last}`];
    }
    if (dashboardLabelWidth(last) > dashboardLabelWidth(`${first} ${middle}`)) {
      return [`${first} ${middle}`, last];
    }
  }
  let best = [label];
  let bestWidth = Infinity;
  for (let index = 1; index < words.length; index += 1) {
    const lines = [words.slice(0, index).join(" "), words.slice(index).join(" ")];
    const width = Math.max(...lines.map(dashboardLabelWidth));
    if (width < bestWidth) {
      best = lines;
      bestWidth = width;
    }
  }
  return best;
}

/** Rotated extents around the midpoint of the right-aligned line endpoints. */
export function dashboardColumnLabelMetrics(value: unknown) {
  const lines = dashboardColumnLabelLines(value);
  const width = Math.max(0, ...lines.map(dashboardLabelWidth));
  const height = lines.length * 13;
  return {
    lines,
    width,
    height,
    endpointOffset: ((lines.length - 1) * 13 * Math.SQRT1_2) / 2,
    leftExtent: width * Math.SQRT1_2 + ((lines.length - 1) * 13 * Math.SQRT1_2) / 2,
    projectedSize: (width + height) * Math.SQRT1_2,
  };
}

export function dashboardColumnAxisLayout(labels: unknown[], containerWidth: number) {
  const availableWidth = containerWidth > 0 ? containerWidth : 480;
  const categoryCount = Math.max(1, labels.length);
  const slotWidth = Math.max(1, (availableWidth - 40) / categoryCount);
  const metrics = labels.map(dashboardColumnLabelMetrics);
  const longestWidth = Math.max(0, ...metrics.map((item) => item.width));
  const angle = categoryCount >= 5 && longestWidth + 4 > slotWidth ? -45 : 0;
  const fontSize = angle ? 9 : 10;
  const lineHeight = (13 * fontSize) / 10;
  // At 45°, both text width and the line separation consume category space.
  const maxLabelWidth = angle
    ? Math.max(5, Math.min(72, (slotWidth - 4) / Math.SQRT1_2 - 2 * lineHeight))
    : Math.max(5, slotWidth - 8);
  const height = angle ? Math.ceil((maxLabelWidth + 2 * lineHeight) * Math.SQRT1_2 + 6) : 32;
  return {
    angle,
    textAnchor: angle ? ("end" as const) : ("middle" as const),
    fontSize,
    lineHeight,
    height,
    maxLabelWidth,
    minWidth: availableWidth,
    marginLeft: 0,
    marginRight: 4,
    marginBottom: 0,
    slotWidth,
  };
}

/** Apply word grouping first, then abbreviate only the lines that exceed their slot. */
export function dashboardColumnAxisLabelLines(
  value: unknown,
  layout: ReturnType<typeof dashboardColumnAxisLayout>,
) {
  return dashboardColumnLabelLines(value).map((line) =>
    (layout.maxLabelWidth * 10) / layout.fontSize < dashboardLabelWidth("...")
      ? dashboardLabelWidth(line) <= (layout.maxLabelWidth * 10) / layout.fontSize
        ? line
        : "…"
      : formatDashboardAxisLabelToWidth(line, (layout.maxLabelWidth * 10) / layout.fontSize),
  );
}

/** Horizontal bars can wrap all words when the row has room for two legible lines. */
export function dashboardBarAxisLabelLines(
  value: unknown,
  maxWidth: number,
  rowSlot: number,
  fontSize = 10,
) {
  const label = String(value ?? "").trim();
  const width = (maxWidth * 10) / fontSize;
  const lineHeight = fontSize * 1.3;
  if (dashboardLabelWidth(label) <= width) return [label];
  const words = label.split(/\s+/);
  let lines = [label];
  if (words.length > 1 && rowSlot >= 2 * lineHeight + 2) {
    let bestWidth = Infinity;
    for (let index = 1; index < words.length; index += 1) {
      const candidate = [words.slice(0, index).join(" "), words.slice(index).join(" ")];
      const widest = Math.max(...candidate.map(dashboardLabelWidth));
      if (widest < bestWidth) {
        lines = candidate;
        bestWidth = widest;
      }
    }
  }
  return lines.map((line) => formatDashboardAxisLabelToWidth(line, width));
}
