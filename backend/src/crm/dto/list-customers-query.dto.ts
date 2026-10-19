import { IsIn, IsOptional } from "class-validator";
import { CUSTOMER_PERSON_TYPES, CUSTOMER_STATUSES } from "./create-customer.dto";
import { PaginationDto } from "./pagination.dto";

export class ListCustomersQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(CUSTOMER_PERSON_TYPES)
  personType?: (typeof CUSTOMER_PERSON_TYPES)[number];

  @IsOptional()
  @IsIn(CUSTOMER_STATUSES)
  status?: (typeof CUSTOMER_STATUSES)[number];
}
