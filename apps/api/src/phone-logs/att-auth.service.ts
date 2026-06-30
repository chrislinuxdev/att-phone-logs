import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { loadDotEnv, parseBoolean } from "./env.util";
import { PhoneLogsDatabaseService } from "./phone-logs.db";

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

const ATT_OVERVIEW_URL = "https://www.att.com/acctmgmt/overview";

type VerificationCodeRequest = () => Promise<string>;

@Injectable()
export class AttAuthService {
  constructor(private readonly db: PhoneLogsDatabaseService) {}

  async getAttCookie(options: { requestVerificationCode: VerificationCodeRequest }) {
    const repoRoot = this.resolveRepoRoot();
    const envPath = path.join(repoRoot, ".env");
    const screenshotDir = path.join(repoRoot, "logs");

    loadDotEnv(envPath);

    const username = process.env.ATT_USERNAME;
    const password = process.env.ATT_PASSWORD;
    const saveScreenshots = parseBoolean(process.env.ATT_SAVE_SCREENSHOTS, true);

    if (!username || !password) {
      throw new Error("Missing ATT_USERNAME or ATT_PASSWORD in .env");
    }

    if (saveScreenshots) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const context = {
      saveScreenshots,
      screenshotDir,
      trackedPages: new Set(),
      screenshotCounter: 0,
      getNextScreenshotCounter() {
        this.screenshotCounter += 1;
        return this.screenshotCounter;
      },
    };

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.ATT_CHROME_EXECUTABLE_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--window-size=1280,800",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await this.trackPage(page, "initial", context);

    browser.on("targetcreated", async target => {
      if (target.type() !== "page") {
        return;
      }

      const createdPage = await target.page();

      if (!createdPage) {
        return;
      }

      try {
        await createdPage.setViewport({ width: 1280, height: 800 });
      } catch (error) {
        // Page may have closed during ATT redirects.
      }

      await this.trackPage(createdPage, "targetcreated", context);
    });

    try {
      await page.goto("https://www.att.com/acctmgmt/login", {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      await page.waitForSelector("#userID", { timeout: 15000 });
      await page.type("#userID", username, { delay: 100 });
      await page.click("#continueFromUserLogin");
      await page.waitForSelector('#password, input[name="password"], input[type="password"]', { timeout: 30000 });

      const passwordField = await this.waitForSelectorAcrossFrames(page, '#password, input[name="password"], input[type="password"]', 30000);
      await passwordField.elementHandle.type(password, { delay: 100 });

      const passwordSubmitState = await this.waitForFreshPasswordSubmitState(passwordField.frame, 10000);
      this.logPasswordSubmitState(passwordSubmitState);

      const submitSelector = '#signin-submit-btn, button[type="submit"], input[type="submit"]';
      const sameFrameSubmitButton = await passwordField.frame.$(submitSelector).catch(() => null);

      if (sameFrameSubmitButton) {
        await sameFrameSubmitButton.click();
      } else {
        const submitButton = await this.waitForSelectorAcrossFrames(page, submitSelector, 10000);
        await submitButton.elementHandle.click();
      }

      await Promise.race([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null),
        this.waitForOtpOrChallengeRoute(page, 20000),
      ]);

      if (!this.isOverviewUrl(page.url())) {
        const handledVerificationCode = await this.handleVerificationCodeStep(page, options.requestVerificationCode);

        if (!handledVerificationCode) {
          await this.waitForOtpOrChallengeRoute(page, 10000);
          await this.sleep(3000);
        }
      }

      if (!this.isOverviewUrl(page.url())) {
        throw new Error(`ATT login did not reach ${ATT_OVERVIEW_URL}. Current URL: ${page.url() || "(blank)"}`);
      }

      const cookies = await browser.defaultBrowserContext().cookies();
      const cookieHeader = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
      const trimmedCookieHeader = this.trimCookieHeader(cookieHeader);

      if (!trimmedCookieHeader) {
        throw new Error("ATT login succeeded but no cookies were captured.");
      }

      await this.db.saveCookieHistory(trimmedCookieHeader, "att-login");
      await this.captureAllPages("success", browser, context);
      return trimmedCookieHeader;
    } catch (error) {
      await this.captureAllPages("error", browser, context);
      throw error;
    } finally {
      await this.captureAllPages("final", browser, context);
      await browser.close();
    }
  }

  private async handleVerificationCodeStep(page: any, requestVerificationCode: VerificationCodeRequest) {
    const deadline = Date.now() + 30000;

    while (Date.now() < deadline) {
      const codeValueField = await this.waitForSelectorAcrossFrames(
        page,
        'input[name="codeValue"], input[id="codeValue"]',
        1000,
      ).catch(() => null);

      if (codeValueField) {
        const verificationCode = await requestVerificationCode();

        if (!verificationCode) {
          throw new Error("Verification code was not entered.");
        }

        await codeValueField.elementHandle.click({ clickCount: 3 }).catch(() => {});
        await codeValueField.elementHandle.type(verificationCode, { delay: 100 });
        await this.submitVerificationStep(page);
        await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 45000 }).catch(() => {});
        return true;
      }

      await this.sleep(500);
    }

    return false;
  }

  private async submitVerificationStep(page: any) {
    const submitSelectors = [
      "#signin-submit-btn",
      'button[type="submit"]',
      'input[type="submit"]',
      'button[id*="continue" i]',
      'button[id*="verify" i]',
    ];

    for (const selector of submitSelectors) {
      const button = await this.waitForSelectorAcrossFrames(page, selector, 2000).catch(() => null);

      if (!button) {
        continue;
      }

      await button.elementHandle.click();
      return true;
    }

    throw new Error("Verification submit button not found.");
  }

  private async waitForSelectorAcrossFrames(page: any, selector: string, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      for (const frame of page.frames()) {
        const elementHandle = await frame.$(selector);

        if (elementHandle) {
          return { frame, elementHandle };
        }
      }

      await this.sleep(500);
    }

    throw new Error(`Waiting for selector \`${selector}\` failed`);
  }

  private async waitForFreshPasswordSubmitState(frame: any, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    let lastFieldState = null;

    while (Date.now() < deadline) {
      const fieldState = await this.getPasswordSubmitState(frame);

      if (fieldState) {
        lastFieldState = fieldState;
      }

      if (this.isPasswordSubmitStateReady(fieldState)) {
        return fieldState;
      }

      await this.sleep(250);
    }

    return lastFieldState || { values: {}, hiddenInputs: [] };
  }

  private async getPasswordSubmitState(frame: any) {
    const fieldSelectors = {
      trID: 'input[name="trID"]',
      verifySessionToken: 'input[name="verify-session-token"]',
      loginSuccessURL: 'input[name="loginSuccessURL"]',
      loginFailureURL: 'input[name="loginFailureURL"]',
      xFieldA: 'input[name="X-IOZYaZcd-a"]',
      xFieldB: 'input[name="X-IOZYaZcd-b"]',
      xFieldC: 'input[name="X-IOZYaZcd-c"]',
      xFieldD: 'input[name="X-IOZYaZcd-d"]',
      xFieldF: 'input[name="X-IOZYaZcd-f"]',
    };

    return frame.evaluate(selectors => {
      const values = {};

      for (const [key, selector] of Object.entries(selectors)) {
        const input = document.querySelector(selector as string) as HTMLInputElement | null;
        values[key] = input ? String(input.value || "") : "";
      }

      const hiddenInputs = Array.from(document.querySelectorAll('input[type="hidden"][name]'))
        .map(input => ({
          name: (input as HTMLInputElement).name,
          value: String((input as HTMLInputElement).value || ""),
        }))
        .filter(input => input.value.trim() !== "");

      return {
        values,
        hiddenInputs,
      };
    }, fieldSelectors).catch(() => null);
  }

  private isPasswordSubmitStateReady(fieldState: any) {
    if (!fieldState) {
      return false;
    }

    const values = fieldState.values || {};
    const coreKeys = ["trID", "verifySessionToken", "loginSuccessURL", "loginFailureURL"];
    const xFieldKeys = ["xFieldA", "xFieldB", "xFieldC", "xFieldD", "xFieldF"];
    const populatedCoreCount = coreKeys.filter(key => String(values[key] || "").trim() !== "").length;
    const hasAnyXField = xFieldKeys.some(key => String(values[key] || "").trim() !== "");

    return populatedCoreCount >= 2 || hasAnyXField;
  }

  private logPasswordSubmitState(fieldState: any) {
    const values = fieldState?.values || {};
    const hiddenInputs = fieldState?.hiddenInputs || [];

    console.log("Password-submit field snapshot:");
    console.log(`trID=${this.summarizeFieldValue(values.trID)}`);
    console.log(`verify-session-token=${this.summarizeFieldValue(values.verifySessionToken)}`);
    console.log(`loginSuccessURL=${this.summarizeFieldValue(values.loginSuccessURL)}`);
    console.log(`loginFailureURL=${this.summarizeFieldValue(values.loginFailureURL)}`);
    console.log(`hidden-inputs-present=${hiddenInputs.map(input => input.name).join(", ") || "(none)"}`);
  }

  private async waitForOtpOrChallengeRoute(page: any, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const currentUrl = page.url();

      if (currentUrl) {
        try {
          const parsedUrl = new URL(currentUrl);
          const iamOp = parsedUrl.searchParams.get("IAM_OP");
          const errorCode = parsedUrl.searchParams.get("errorCode");

          if (iamOp === "OTP" || errorCode) {
            return { currentUrl, iamOp, errorCode };
          }
        } catch (error) {
          // Ignore transient URLs.
        }
      }

      await this.sleep(500);
    }

    return null;
  }

  private async trackPage(page: any, reason: string, context: any) {
    const { trackedPages } = context;

    if (!page || trackedPages.has(page)) {
      return;
    }

    trackedPages.add(page);

    page.on("load", () => {
      this.capturePage(page, "load", context).catch(() => {});
    });

    page.on("domcontentloaded", () => {
      this.capturePage(page, "domcontentloaded", context).catch(() => {});
    });

    page.on("framenavigated", frame => {
      if (frame === page.mainFrame()) {
        this.capturePage(page, "navigate", context).catch(() => {});
      }
    });

    page.on("close", () => {
      trackedPages.delete(page);
    });

    await this.capturePage(page, reason, context);
  }

  private async captureAllPages(reason: string, browser: any, context: any) {
    if (!context.saveScreenshots) {
      return;
    }

    const pages = await browser.pages();

    for (const currentPage of pages) {
      await this.capturePage(currentPage, reason, context);
    }
  }

  private async capturePage(page: any, reason: string, context: any) {
    if (!context.saveScreenshots || !page || page.isClosed()) {
      return;
    }

    try {
      const viewport = page.viewport();

      if (viewport && (!viewport.width || !viewport.height)) {
        return;
      }

      const url = page.url();
      const title = await page.title().catch(() => "");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").replace("Z", "");
      const fileName = [
        timestamp,
        String(context.getNextScreenshotCounter()).padStart(3, "0"),
        this.safeFilePart(reason),
        this.safeFilePart(title),
        this.safeFilePart(url),
      ].filter(Boolean).join("-") + ".png";

      await page.screenshot({
        path: path.join(context.screenshotDir, fileName),
        fullPage: true,
      });
    } catch (error) {
      // Screenshots are diagnostic only.
    }
  }

  private trimCookieHeader(cookieHeader: string) {
    const cookieStartIndex = cookieHeader.indexOf("s_ecid=");
    return cookieStartIndex >= 0 ? cookieHeader.slice(cookieStartIndex) : cookieHeader;
  }

  private isOverviewUrl(currentUrl: string) {
    return String(currentUrl || "").includes("www.att.com/acctmgmt/overview");
  }

  private summarizeFieldValue(value: string) {
    const normalizedValue = String(value || "");

    if (!normalizedValue) {
      return "(empty)";
    }

    if (normalizedValue.length <= 120) {
      return normalizedValue;
    }

    return `${normalizedValue.slice(0, 60)}...${normalizedValue.slice(-20)} (len=${normalizedValue.length})`;
  }

  private safeFilePart(value: string) {
    return String(value || "page")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 80) || "page";
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private resolveRepoRoot() {
    const candidates = [
      process.cwd(),
      path.resolve(process.cwd(), "..", ".."),
      path.resolve(__dirname, "..", "..", "..", ".."),
    ];

    return candidates.find(candidate => fs.existsSync(path.join(candidate, ".env"))) || process.cwd();
  }
}
