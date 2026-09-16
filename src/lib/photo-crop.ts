export function cropGeometry(width: number, height: number, zoom: number, x: number, y: number) {
  const scale = Math.max(1 / width, 1 / height) * Math.max(1, Math.min(4, zoom));
  const displayWidth = width * scale;
  const displayHeight = height * scale;
  const offsetX = Math.max(-(displayWidth - 1) / 2, Math.min((displayWidth - 1) / 2, x));
  const offsetY = Math.max(-(displayHeight - 1) / 2, Math.min((displayHeight - 1) / 2, y));
  const side = 1 / scale;
  return {
    displayWidth,
    displayHeight,
    offsetX,
    offsetY,
    side,
    sourceX: (width - side) / 2 - offsetX * side,
    sourceY: (height - side) / 2 - offsetY * side,
  };
}
