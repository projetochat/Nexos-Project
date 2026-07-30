import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DepartmentsController } from "./departments.controller";

@Module({
  imports: [AuthModule],
  controllers: [DepartmentsController],
})
export class DepartmentsModule {}
