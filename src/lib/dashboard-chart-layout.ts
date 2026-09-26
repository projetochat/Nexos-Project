export const DASHBOARD_CHART_MARGIN = { top: 4, right: 4, bottom: 0, left: 0 };

export const MOBILE_MESSAGE_HOUR_TICKS = ["00h", "05h", "10h", "15h", "20h"];

export const DESKTOP_MESSAGE_HOUR_TICKS = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, "0")}h`,
);

export function messageHourTicks(isMobile: boolean) {
  return isMobile ? MOBILE_MESSAGE_HOUR_TICKS : DESKTOP_MESSAGE_HOUR_TICKS;
}
