import { loadEnvConfig } from "@next/env";

import {
  getEnvironmentErrorVariables,
  getServerEnv,
} from "../src/lib/env";

loadEnvConfig(process.cwd());

try {
  const env = getServerEnv();

  if (process.env.VERCEL_ENV === "production" && !env.DEMO_MODE) {
    throw new Error("DEMO_MODE must be true for the public course deployment");
  }

  console.log("Environment configuration is valid.");
} catch (error) {
  const variables = getEnvironmentErrorVariables(error);
  const variableList = variables.length > 0 ? variables.join(", ") : "unknown";

  console.error(`Invalid environment configuration: ${variableList}`);
  process.exitCode = 1;
}
