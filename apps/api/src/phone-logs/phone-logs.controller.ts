import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { PhoneLogsService } from "./phone-logs.service";
import { PublicRetrievalJob, RetrievePhoneLogsService } from "./retrieve-phone-logs.service";
import { ServiceType } from "./phone-logs.types";

@Controller("phone-logs")
export class PhoneLogsController {
  constructor(
    private readonly phoneLogsService: PhoneLogsService,
    private readonly retrievePhoneLogsService: RetrievePhoneLogsService,
  ) {}

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

  @Post("nicknames")
  saveNickname(@Body("phoneNumber") phoneNumber: string, @Body("nickname") nickname: string) {
    return this.phoneLogsService.saveNickname(phoneNumber, nickname);
  }

  @Post("retrieve")
  startRetrieval(): PublicRetrievalJob {
    return this.retrievePhoneLogsService.startRetrieval();
  }

  @Get("retrieve/:jobId")
  getRetrievalJob(@Param("jobId") jobId: string): PublicRetrievalJob {
    return this.retrievePhoneLogsService.getJob(jobId);
  }

  @Post("retrieve/:jobId/confirmation-code")
  submitConfirmationCode(@Param("jobId") jobId: string, @Body("code") code: string): PublicRetrievalJob {
    return this.retrievePhoneLogsService.submitConfirmationCode(jobId, code);
  }
}
