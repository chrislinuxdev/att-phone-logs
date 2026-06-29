import * as fs from "fs";

const originalEnvKeys = new Set(Object.keys(process.env));

export function loadDotEnv(envPath: string, initialEnvKeys = originalEnvKeys) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const envFile = fs.readFileSync(envPath, "utf8");

  for (const line of envFile.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (initialEnvKeys.has(key)) {
      continue;
    }

    process.env[key] = value;
  }
}

export function parseBoolean(value: unknown, defaultValue: boolean) {
  if (value == null || value === "") {
    return defaultValue;
  }

  return /^(1|true|yes|on)$/i.test(String(value).trim());
}
