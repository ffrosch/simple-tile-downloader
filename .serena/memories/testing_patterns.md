# Testing Patterns and Best Practices

## Test Structure

### Bun Test Framework
```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
```

### Lifecycle Hooks
- `beforeAll()` - Setup before all tests (e.g., start mock server)
- `afterAll()` - Cleanup after all tests (e.g., stop server)
- `beforeEach()` - Setup before each test (not used in current suite)
- `afterEach()` - Cleanup after each test (not used in current suite)

## Mock Server Pattern

### Bun.serve for Testing
```typescript
let server: ReturnType<typeof Bun.serve> | null = null;

beforeAll(() => {
  server = Bun.serve({
    port: TEST_PORT,
    fetch(req) {
      // Handle requests
      return new Response(data, { headers: { ... } });
    }
  });
});

afterAll(() => {
  server?.stop();
});
```

### Benefits
- No external dependencies
- Fast execution
- Full control over responses
- Realistic HTTP testing

## Test Data Strategy

### Small, Fast Test Cases
- Use minimal bounding boxes
- Limit zoom ranges
- Keep tile counts manageable (<50 for unit tests)
- Focus on correctness, not performance

### Example Test Data
```typescript
const config = {
  bbox: [13.3, 52.5, 13.4, 52.55],  // ~0.1° area
  minZoom: 11,
  maxZoom: 13,  // 3 zoom levels only
  crs: "EPSG:3857"
};
```

## Async Generator Testing

### Pattern for Testing Generators
```typescript
test("async generator test", async () => {
  const results = [];
  
  for await (const item of generator()) {
    results.push(item);
    // Validate each item
    expect(item).toHaveProperty("requiredField");
  }
  
  // Validate collection
  expect(results.length).toBe(expectedCount);
});
```

## Error Testing

### Testing Exceptions
```typescript
test("throws error for invalid input", () => {
  expect(() => {
    functionThatThrows(invalidInput);
  }).toThrow("Expected error message");
});
```

### Specific Error Messages
```typescript
expect(() => {
  tilesConfig({ crs: "INVALID" });
}).toThrow("Couldn't get the extent");
```

## Validation Patterns

### Property Validation
```typescript
for (const item of items) {
  expect(item.url).toMatch(/pattern/);
  expect(item.size).toBeGreaterThan(0);
  expect(item.type).toBe("expected");
}
```

### Range Validation
```typescript
expect(tile.z).toBeGreaterThanOrEqual(config.minZoom);
expect(tile.z).toBeLessThanOrEqual(config.maxZoom);
```

## Test Organization

### Describe Blocks
- Group related tests
- One describe block per exported function/class
- Use descriptive names

### Test Names
- Start with action: "calculates", "throws", "handles", "respects"
- Be specific: not just "works", but "downloads tiles matching README example"
- Describe edge cases: "handles single zoom level"

## Running Tests

### Commands
```bash
bun test                 # Run all tests
bun test src/index.test.ts  # Run specific file
bun test --watch        # Watch mode
```

### Expected Output
```
✓ test name [1.00ms]
✓ test name [2.00ms]

9 pass
0 fail
114 expect() calls
Ran 9 tests across 1 file. [56.00ms]
```

## Common Pitfalls

### 1. Timing Issues
- Mock servers may be too fast (sub-millisecond responses)
- Don't rely on exact timing for progressive tests
- Test behavior, not timing

### 2. Async Cleanup
- Always stop servers in afterAll
- Use optional chaining: `server?.stop()`
- Handle promise rejections

### 3. Type Safety
- Use explicit types for test data
- TypeScript will catch API mismatches
- Leverage IDE autocomplete

### 4. Test Isolation
- Each test should be independent
- Don't rely on test execution order
- Clean up side effects

## Best Practices

### DO
✅ Use descriptive test names
✅ Test edge cases and error paths
✅ Validate all important properties
✅ Keep tests fast (<100ms per test)
✅ Clean up resources (servers, files)

### DON'T
❌ Test implementation details
❌ Write brittle timing-dependent tests
❌ Leave resources running
❌ Use magic numbers without explanation
❌ Skip error testing

## Future Enhancements

### Coverage Reporting
```bash
bun test --coverage
```

### Performance Testing
- Test with larger datasets separately
- Use performance marks for benchmarking
- Set reasonable timeout limits

### Integration Tests
- Test against real tile servers (in separate suite)
- Use environment variables for configuration
- Mark as slow/integration tests

### Continuous Integration
```yaml
# .github/workflows/test.yml
- run: bun install
- run: bun test
```
