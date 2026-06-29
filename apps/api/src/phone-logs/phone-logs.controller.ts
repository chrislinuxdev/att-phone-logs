import { Controller, Get, Param } from "@nestjs/common";
import { PhoneLogsService } from "./phone-logs.service";
import { ServiceType } from "./phone-logs.types";

@Controller("phone-logs")
export class PhoneLogsController {
  constructor(private readonly phoneLogsService: PhoneLogsService) {}

  @Get("options")
  getOptions() {
    return this.phoneLogsService.getOptions();
  }

  @Get("files")
  getFiles() {
    return this.phoneLogsService.getFileMetadata();
  }

  @Get("files/:id")
  getFile(@Param("id") id: string) {
    return this.phoneLogsService.getFile(id);
  }

  @Get("aggregate/:serviceType/:lineNumber")
  getAggregate(@Param("serviceType") serviceType: ServiceType, @Param("lineNumber") lineNumber: string) {
    return this.phoneLogsService.getAggregate(serviceType, lineNumber);
  }
}
