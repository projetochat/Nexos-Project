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
