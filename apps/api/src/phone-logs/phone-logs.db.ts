import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import mongoose, { Model, Schema } from "mongoose";
import * as fs from "fs";
import * as path from "path";
import { loadDotEnv } from "./env.util";
import { normalizePhoneNumber } from "./phone-log-format";
import { ServiceType } from "./phone-logs.types";

export interface PhoneLogPayloadDocument {
  serviceType: ServiceType;
  phoneNumber: string;
  statementId: string;
  fileName: string;
  payload: unknown;
  backupPath?: string;
  source: string;
  importedAt?: Date;
  fetchedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PhoneNicknameMappingDocument {
  phoneNumber: string;
  nickname: string;
  source: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CookieHistoryDocument {
  cookieHeader: string;
  source: string;
  capturedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const phoneLogPayloadSchema = new Schema<PhoneLogPayloadDocument>({
  serviceType: { type: String, enum: ["VOICE", "TEXT"], required: true },
  phoneNumber: { type: String, required: true },
  statementId: { type: String, required: true },
  fileName: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, required: true },
  backupPath: { type: String },
  source: { type: String, required: true },
  importedAt: { type: Date },
  fetchedAt: { type: Date },
}, {
  collection: "phone_log_payloads",
  minimize: false,
  timestamps: true,
});

phoneLogPayloadSchema.index({ serviceType: 1, phoneNumber: 1, statementId: 1 }, { unique: true });
phoneLogPayloadSchema.index({ serviceType: 1, fileName: 1 }, { unique: true });

const phoneNicknameMappingSchema = new Schema<PhoneNicknameMappingDocument>({
  phoneNumber: { type: String, required: true, unique: true },
  nickname: { type: String, required: true },
  source: { type: String, required: true },
}, {
  collection: "phone_nickname_mappings",
  timestamps: true,
});

const cookieHistorySchema = new Schema<CookieHistoryDocument>({
  cookieHeader: { type: String, required: true },
  source: { type: String, required: true },
  capturedAt: { type: Date, required: true, default: () => new Date() },
}, {
  collection: "cookie_history",
  timestamps: true,
});

cookieHistorySchema.index({ capturedAt: -1 });

function getModel<T>(name: string, schema: Schema<T>, collectionName: string): Model<T> {
  return (mongoose.models[name] as Model<T> | undefined) || mongoose.model<T>(name, schema, collectionName);
}

export function getPhoneLogPayloadModel() {
  return getModel<PhoneLogPayloadDocument>("PhoneLogPayload", phoneLogPayloadSchema, "phone_log_payloads");
}

export function getPhoneNicknameMappingModel() {
  return getModel<PhoneNicknameMappingDocument>("PhoneNicknameMapping", phoneNicknameMappingSchema, "phone_nickname_mappings");
}

export function getCookieHistoryModel() {
  return getModel<CookieHistoryDocument>("CookieHistory", cookieHistorySchema, "cookie_history");
}

export function resolveRepoRoot() {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), "..", ".."),
    path.resolve(__dirname, "..", "..", "..", ".."),
  ];

  return candidates.find(candidate => fs.existsSync(path.join(candidate, ".env"))) || process.cwd();
}

export async function connectPhoneLogsDatabase() {
  const repoRoot = resolveRepoRoot();
  loadDotEnv(path.join(repoRoot, ".env"));

  const connectionString = process.env.MONGO_CONNECTION_STRING;
  const dbName = process.env.DB_NAME;

  if (!connectionString) {
    throw new Error("Missing MONGO_CONNECTION_STRING in .env");
  }

  if (!dbName) {
    throw new Error("Missing DB_NAME in .env");
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (mongoose.connection.readyState === 2) {
    await mongoose.connection.asPromise();
    return mongoose.connection;
  }

  await mongoose.connect(connectionString, { dbName });
  return mongoose.connection;
}

@Injectable()
export class PhoneLogsDatabaseService implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await connectPhoneLogsDatabase();
  }

  async onModuleDestroy() {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }

  async getPhoneLogPayloads() {
    await connectPhoneLogsDatabase();
    return getPhoneLogPayloadModel()
      .find()
      .sort({ serviceType: 1, fileName: -1 })
      .lean()
      .exec();
  }

  async upsertPhoneLogPayload(input: {
    serviceType: ServiceType;
    phoneNumber: string;
    statementId: string;
    fileName: string;
    payload: unknown;
    backupPath?: string;
    source: string;
    importedAt?: Date;
    fetchedAt?: Date;
  }) {
    await connectPhoneLogsDatabase();

    return getPhoneLogPayloadModel().findOneAndUpdate(
      {
        serviceType: input.serviceType,
        phoneNumber: normalizePhoneNumber(input.phoneNumber),
        statementId: input.statementId,
      },
      {
        $set: {
          ...input,
          phoneNumber: normalizePhoneNumber(input.phoneNumber),
        },
      },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
    ).lean().exec();
  }

  async deletePhoneLogPayload(serviceType: ServiceType, phoneNumber: string, statementId: string) {
    await connectPhoneLogsDatabase();
    await getPhoneLogPayloadModel().deleteOne({
      serviceType,
      phoneNumber: normalizePhoneNumber(phoneNumber),
      statementId,
    }).exec();
  }

  async getNicknameMap() {
    await connectPhoneLogsDatabase();
    const records = await getPhoneNicknameMappingModel().find().lean().exec();
    return new Map(records.map(record => [record.phoneNumber, record.nickname]));
  }

  async importNicknameIfMissing(phoneNumber: unknown, nickname: unknown, source = "import") {
    await connectPhoneLogsDatabase();
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    const cleanedNickname = String(nickname || "").trim();

    if (!normalizedPhoneNumber || !cleanedNickname) {
      return false;
    }

    const result = await getPhoneNicknameMappingModel().updateOne(
      { phoneNumber: normalizedPhoneNumber },
      {
        $setOnInsert: {
          phoneNumber: normalizedPhoneNumber,
          nickname: cleanedNickname,
          source,
        },
      },
      { upsert: true },
    ).exec();

    return Boolean(result.upsertedCount);
  }

  async upsertNicknameMapping(phoneNumber: unknown, nickname: unknown, source = "react-page") {
    await connectPhoneLogsDatabase();
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    const cleanedNickname = String(nickname || "").trim();

    if (!normalizedPhoneNumber || !cleanedNickname) {
      return null;
    }

    return getPhoneNicknameMappingModel().findOneAndUpdate(
      { phoneNumber: normalizedPhoneNumber },
      {
        $set: {
          phoneNumber: normalizedPhoneNumber,
          nickname: cleanedNickname,
          source,
        },
      },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
    ).lean().exec();
  }

  async saveCookieHistory(cookieHeader: string, source = "att-login", dedupe = false) {
    await connectPhoneLogsDatabase();
    const cleanedCookieHeader = String(cookieHeader || "").trim();

    if (!cleanedCookieHeader) {
      return null;
    }

    if (dedupe) {
      const existing = await getCookieHistoryModel().findOne({ cookieHeader: cleanedCookieHeader }).lean().exec();

      if (existing) {
        return null;
      }
    }

    return getCookieHistoryModel().create({
      cookieHeader: cleanedCookieHeader,
      source,
      capturedAt: new Date(),
    });
  }
}
