import { randomUUID } from "crypto";

export const TEST_PASSWORD = "TestPassword123!";
export const TEST_USER_METADATA = {
  name: "Test User",
  role: "admin",
};

// Dedicated test firm ID - isolates test data from production
// This UUID is used across all test fixtures to prevent data contamination
export const TEST_FIRM_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
export const TEST_FIRM_NAME = "Test Firm (Report Fixtures)";

export const makeTestEmail = () => `test-${randomUUID()}@example.com`;
export const makeTestFirmName = () => `Test Firm ${randomUUID().slice(0, 8)}`;
export const makeTestClientName = () => `Test Client ${randomUUID().slice(0, 8)}`;
