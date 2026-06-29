import { Module } from "@nestjs/common";
import { PhoneLogsModule } from "./phone-logs/phone-logs.module";

@Module({
  imports: [PhoneLogsModule],
})
export class AppModule {}
