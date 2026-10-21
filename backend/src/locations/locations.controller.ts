import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { LocationsService } from "./locations.service";

@Controller("locations")
@UseGuards(JwtAuthGuard)
export class LocationsController {
  constructor(@Inject(LocationsService) private readonly locations: LocationsService) {}

  @Get("countries")
  countries() {
    return this.locations.countries();
  }

  @Get("divisions")
  divisions(@Query("countryCode") countryCode = "") {
    return this.locations.divisions(countryCode);
  }

  @Get("cities")
  cities(
    @Query("q") q?: string,
    @Query("countryCode") countryCode?: string,
    @Query("divisionId") divisionId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.locations.cities({ q, countryCode, divisionId, page, pageSize });
  }

  @Get("cities/:id")
  city(@Param("id") id: string) {
    return this.locations.city(id);
  }
}
