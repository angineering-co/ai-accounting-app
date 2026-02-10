# Testing Strategy & Guidelines

This project uses **Vitest** for testing. We employ a mix of unit tests (colocated) and integration tests (centralized) to ensure code quality and system reliability.

## 📂 Directory Structure

```text
tests/
├── integration/         # High-level integration tests (DB, API, Services)
│   └── services/        # Service-level integration tests
├── fixtures/            # Static test data (JSON, SQL, Files) - NO LOGIC
│   ├── files/           # Binary files (xlsx, etc.)
│   └── reports/         # structured test cases for reports
├── utils/               # Helper functions and setup logic
│   ├── constants.ts     # Shared test constants
│   ├── supabase.ts      # Supabase client & fixture helpers
│   └── report-fixtures.ts # Logic to load/seed report fixtures
└── setup.ts             # Global test environment setup
```

## 🧪 Testing Categories

### 1. Unit Tests

- **Location**: Colocated with source code (e.g., `lib/domain/roc-period.test.ts` next to `roc-period.ts`).
- **Scope**: Pure logic, domain models, utility functions.
- **Dependencies**: No external dependencies (DB, API) should be mocked or required.
- **Goal**: Test business logic in isolation.

### 2. Integration Tests

- **Location**: `tests/integration/`
- **Scope**: Service layers, database interactions, full workflows.
- **Dependencies**: Uses a **real Supabase instance** (local or CI).
- **Goal**: Verify that comprehensive flows work with the actual database and infrastructure.

## 🛠 Usage

### Running Tests

```bash
npm test          # Run all tests
npm run test:run  # Run all tests once (no watch mode)
```

### Writing Integration Tests

We rely heavily on high-level integration tests backed by a real database.

**1. Database Fixtures**
Use the helpers in `tests/utils/supabase.ts` to create isolated test environments for each test file.

```typescript
import {
  createTestFixture,
  cleanupTestFixture,
  getServiceClient,
} from "@/tests/utils/supabase";

describe("My Service", () => {
  const supabase = getServiceClient();
  let fixture;

  beforeAll(async () => {
    // Creates a unique Firm, Client, and User for this test suite
    fixture = await createTestFixture(supabase);
  });

  afterAll(async () => {
    // Cleans up all data created for this fixture
    await cleanupTestFixture(supabase, fixture);
  });

  it("should do something", async () => {
    // Use fixture.firmId, fixture.clientId, etc.
  });
});
```

**2. Test Data**
Place large static data (JSON, XLSX) in `tests/fixtures/` and import them in your tests. Avoid hardcoding large data objects in test files.
