import { describe, expect, it } from "vitest";
import { cropGeometry } from "./photo-crop";

describe("photo crop geometry", () => {
  it("centers landscape and portrait photos without distortion", () => {
    expect(cropGeometry(1600, 800, 1, 0, 0)).toMatchObject({ side: 800, sourceX: 400, sourceY: 0 });
    expect(cropGeometry(800, 1600, 1, 0, 0)).toMatchObject({ side: 800, sourceX: 0, sourceY: 400 });
  });
  it("keeps the entire frame covered at every zoom and drag boundary", () => {
    for (const [width, height] of [
      [1600, 800],
      [800, 1600],
      [100, 100],
    ]) {
      for (const zoom of [0, 1, 2, 4, 10])
        for (const x of [-100, 0, 100])
          for (const y of [-100, 0, 100]) {
            const crop = cropGeometry(width, height, zoom, x, y);
            expect(crop.sourceX).toBeGreaterThanOrEqual(-0.00001);
            expect(crop.sourceY).toBeGreaterThanOrEqual(-0.00001);
            expect(crop.sourceX + crop.side).toBeLessThanOrEqual(width + 0.00001);
            expect(crop.sourceY + crop.side).toBeLessThanOrEqual(height + 0.00001);
          }
    }
  });
  it("maps preview movement and zoom back to original image pixels", () => {
    expect(cropGeometry(1600, 800, 2, 0.25, -0.25)).toMatchObject({
      side: 400,
      sourceX: 500,
      sourceY: 300,
    });
  });
});
