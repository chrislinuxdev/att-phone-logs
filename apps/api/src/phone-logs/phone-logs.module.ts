import { Module } from "@nestjs/common";
import { PhoneLogsController } from "./phone-logs.controller";
import { PhoneLogsService } from "./phone-logs.service";

@Module({
  controllers: [PhoneLogsController],
  providers: [PhoneLogsService],
})
export class PhoneLogsModule {}
