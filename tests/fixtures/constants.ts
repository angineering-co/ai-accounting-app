import { randomUUID } from "crypto";

export const TEST_PASSWORD = "TestPassword123!";
export const TEST_USER_METADATA = {
  name: "Test User",
  role: "admin",
};

export const makeTestEmail = () => `test-${randomUUID()}@example.com`;
export const makeTestFirmName = () => `Test Firm ${randomUUID().slice(0, 8)}`;
export const makeTestClientName = () => `Test Client ${randomUUID().slice(0, 8)}`;
