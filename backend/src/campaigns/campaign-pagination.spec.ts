import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ListCampaignsQueryDto, ListCampaignRecipientsQueryDto } from "./dto/campaign.dto";
describe("campaign pagination over HTTP", () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  it.each([ListCampaignsQueryDto, ListCampaignRecipientsQueryDto])(
    "accepts query string page sizes for %s",
    async (metatype) => {
      const result = await pipe.transform(
        { page: "1", pageSize: "50" },
        { type: "query", metatype },
      );
      expect(result.pageSize).toBe(50);
      expect(result.page).toBe(1);
      await expect(
        pipe.transform({ pageSize: "wrong" }, { type: "query", metatype }),
      ).rejects.toThrow();
      await expect(
        pipe.transform({ pageSize: "101" }, { type: "query", metatype }),
      ).rejects.toThrow();
    },
  );
});
