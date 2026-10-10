export function assertTestDatabase() {
  if (process.env.TEST_MYSQL !== "true")
    throw new Error("Explizite Testkonfiguration erforderlich.");
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (!/^([a-z0-9_]+_test|test_[a-z0-9_]+)$/.test(name))
    throw new Error(
      "Tests erfordern eine separate Datenbank mit _test-Suffix oder test_-Präfix.",
    );
}
