import { Module } from "@nestjs/common";
import { AttAuthService } from "./att-auth.service";
import { PhoneLogsController } from "./phone-logs.controller";
import { PhoneLogsDatabaseService } from "./phone-logs.db";
import { PhoneLogsService } from "./phone-logs.service";
import { RetrievePhoneLogsService } from "./retrieve-phone-logs.service";

@Module({
  controllers: [PhoneLogsController],
  providers: [AttAuthService, PhoneLogsDatabaseService, PhoneLogsService, RetrievePhoneLogsService],
})
export class PhoneLogsModule {}
