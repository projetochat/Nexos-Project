import * as React from "react";

export const DashboardMaximizedContext = React.createContext(false);

export function useDashboardMaximized() {
  return React.useContext(DashboardMaximizedContext);
}
