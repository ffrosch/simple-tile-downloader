# Development Guide - Simple Tile Downloader

Comprehensive guide for developing, testing, and maintaining the simple-tile-downloader project.

---

## Quick Start Commands

### Installation
```bash
bun install
```

### Build
```bash
bun run build
```
- Bundles JavaScript to `dist/index.js` (browser target)
- Generates TypeScript declarations to `dist/index.d.ts`

### Manual Build Steps
```bash
# Bundle JavaScript
bun build ./src/index.ts --outfile=dist/index.js --target=browser --packages=external

# Generate type declarations
bun run build:declaration
# or: tsc --project tsconfig.types.json
```

### Testing
```bash
bun test              # Run all tests
bun test --watch      # Watch mode
bun test src/crs.test.ts  # Specific file
```

### Type Checking
```bash
tsc --noEmit
```
Validates TypeScript types without emitting files

### Clean Build
```bash
rm -rf dist/
bun run build
```

---

## Architecture Patterns

### 1. Async Generator Pattern
**Where**: `fetchTiles()` function  
**Purpose**: Stream tiles progressively with controlled parallelism

**Implementation**:
- Uses `async function*` generator syntax
- Yields `FetchedTile` objects as they complete via `Promise.race()`
- Maintains Set of pending downloads for backpressure control
- Blocks when `maxParallelDownloads` limit reached

**Benefits**:
- Memory efficient (no buffering)
- Progressive processing (start before all downloads complete)
- Natural backpressure (consumer controls flow)

**Example**:
```typescript
for await (const tile of fetchTiles(config)) {
  console.log(`Downloaded tile: z=${tile.z} x=${tile.x} y=${tile.y}`);
  // Process tile immediately, no need to wait for all tiles
}
```

### 2. Configuration-First Design
**Pattern**: Separate configuration calculation from execution

**Implementation**:
```typescript
const config = await processTilesConfig(config);  // Calculate & validate
for await (const tile of fetchTiles(config)) { }  // Execute
```

**Benefits**:
- Validate inputs early (before downloads start)
- Inspect tile counts before committing to download
- Reusable configurations
- Clear separation of concerns

### 3. URL Template System
**Pattern**: String placeholder replacement for tile URLs

**Placeholders**:
- `{x}`, `{y}`, `{z}`: Standard XYZ coordinates
- `{-y}`: TMS inverted Y-axis support
- `{s}`: Subdomain rotation

**Implementation**:
- Simple string `.replace()` calls (no regex)
- Subdomain cycling via modulo indexing
- TMS calculation: `2^zoom - 1 - y`

### 4. Factory Pattern
**Where**: `Tiles` class  
**Pattern**: Static async factory method prevents incomplete initialization

**Implementation**:
```typescript
class Tiles {
  private constructor(config: FetchTilesConfig) { }
  
  static async create(config: TilesConfig): Promise<Tiles> {
    const fetchConfig = await processTilesConfig(config);
    return new Tiles(fetchConfig);
  }
}
```

**Benefits**:
- Can't create instance without async initialization
- Forces proper configuration processing
- Type-safe construction

### 5. Runtime CRS Fetching with Caching
**Pattern**: Lazy load CRS definitions from epsg.io with intelligent caching

**Implementation**:
```typescript
// First call: fetches from epsg.io (~200ms)
const extent = await getCRSExtent('EPSG:3857');

// Subsequent calls: uses cache (<1ms)
const extent2 = await getCRSExtent('EPSG:3857');
```

**Benefits**:
- Zero bundle size for CRS database
- Supports any EPSG code (6000+ projections)
- Always up-to-date definitions
- Fast after first fetch

---

## Error Handling Guidelines

### Validation Errors (throw immediately)
```typescript
if (!extent) {
  throw new Error(`Couldn't get the extent for ${crs}`);
}

if (url.includes("{s}") && !subdomains) {
  throw new Error(`Missing subdomains argument for URL ${url}`);
}
```

**When to use**:
- Configuration errors in `processTilesConfig()`
- Invalid CRS or bbox
- Missing required parameters
- Early validation before async operations

### Async Errors (Promise rejection)
```typescript
if (!response.ok) {
  return Promise.reject(
    new Error(`GET ${response.url} failed with ${response.status}`)
  );
}
```

**When to use**:
- HTTP fetch failures
- Non-image responses
- Individual tile download errors
- Network issues

### No Silent Failures
- All errors must be observable
- Use descriptive error messages
- Include context (URL, status, coordinates)

---

## Code Organization

### Barrel Exports
- `index.ts` re-exports public API only
- Internal helpers stay private
- Clean import paths for consumers

### Type Segregation
- All types in `types.ts`
- Implementation in respective files
- Clear contract separation

### Single Responsibility
- `processTilesConfig`: Configuration calculation only
- `fetchTile`: Single download only
- `fetchTiles`: Batch orchestration only
- `getCRSExtent`: CRS extent fetching only
- `createXYZTileGrid`: Tile grid creation only

---

## Quality Assurance Checklist

### After Code Changes

#### 1. Build Verification
```bash
bun run build
```
- Ensure build completes without errors
- Check that `dist/index.js` and `dist/index.d.ts` are generated
- Verify no TypeScript compilation errors

#### 2. Type Checking
```bash
tsc --noEmit
```
- Validate TypeScript types without emitting files
- Ensure strict mode compliance
- Check for type errors

#### 3. Run Tests
```bash
bun test
```
- All tests must pass
- No skipped tests without justification
- Check test output for warnings

#### 4. Code Review Self-Check
- [ ] Adherence to TypeScript strict mode
- [ ] Naming conventions (camelCase/PascalCase)
- [ ] Proper error handling in async code
- [ ] Type annotations are complete
- [ ] No `any` types without justification
- [ ] Functions have explicit return types

#### 5. Documentation
- Update README.md if public API changes
- Update type definitions if interfaces change
- Add JSDoc comments for new exported functions
- Add inline comments for complex logic

#### 6. Git Workflow
```bash
# Review changes
git diff

# Stage changes
git add <files>

# Commit with descriptive message
git commit -m "feat: description"  # or fix:/docs:/refactor:/test:

# Push to feature branch
git push origin feature/branch-name
```

### Before Release

#### Version Bump
- Update version in `package.json`
- Follow semantic versioning
- Update CHANGELOG (if exists)

#### Build Clean
```bash
rm -rf dist/
bun run build
```

#### Package Check
- Verify `dist/` contains correct artifacts
- Test type declarations work in consuming project
- Check package.json exports are correct
- Verify files array includes only necessary files

---

## Testing Guidelines

### Test Structure with Bun
```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";

describe("feature name", () => {
  beforeAll(() => {
    // Setup (e.g., start mock server)
  });

  afterAll(() => {
    // Cleanup (e.g., stop server)
  });

  test("descriptive test name", () => {
    // Test implementation
    expect(actual).toBe(expected);
  });
});
```

### Mock Server Pattern
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

### Test Data Strategy
- Use minimal bounding boxes
- Limit zoom ranges
- Keep tile counts manageable (<50 for unit tests)
- Focus on correctness, not performance

### Async Generator Testing
```typescript
test("async generator test", async () => {
  const results = [];
  
  for await (const item of generator()) {
    results.push(item);
    expect(item).toHaveProperty("requiredField");
  }
  
  expect(results.length).toBe(expectedCount);
});
```

### Error Testing
```typescript
test("throws error for invalid input", async () => {
  await expect(async () => {
    await functionThatThrows(invalidInput);
  }).toThrow("Expected error message");
});
```

**See `testing_patterns` memory for comprehensive testing guidelines**

---

## Performance Considerations

### Parallelism
- Default: 6 concurrent downloads (browser limit ~6-8 per domain)
- Subdomain rotation increases effective parallelism
- Configurable via `maxParallelDownloads` option

### Memory
- Generator pattern prevents buffering
- Only `maxParallelDownloads` tiles in memory
- Blobs passed to consumer immediately

### Scalability
- Tiles grow exponentially with zoom (4x per level)
- Generator pattern handles arbitrary counts
- Consumer controls processing rate

### CRS Fetching
- First call: ~200ms (network fetch from epsg.io)
- Subsequent calls: <1ms (in-memory cache)
- Use `preloadCommonCRS()` for instant access

---

## Common Development Tasks

### Adding a New Feature
1. Design: Consider architecture impact
2. Types: Update `types.ts` if needed
3. Implementation: Follow single responsibility principle
4. Tests: Add comprehensive test coverage
5. Documentation: Update README and JSDoc
6. Validation: Run all quality checks

### Fixing a Bug
1. Reproduce: Create failing test first
2. Investigate: Use debugger or console.log
3. Fix: Implement minimal fix
4. Test: Verify test now passes
5. Regression: Ensure no other tests break
6. Document: Add comment explaining fix if non-obvious

### Improving Performance
1. Measure: Identify actual bottleneck
2. Benchmark: Create performance test
3. Optimize: Implement improvement
4. Verify: Confirm improvement with benchmark
5. Trade-offs: Document any trade-offs made

### Updating Dependencies
1. Check: Review changelog for breaking changes
2. Update: Update package.json
3. Install: `bun install`
4. Test: Run full test suite
5. Build: Verify build succeeds
6. Manual test: Test critical paths manually

---

## Debugging Tips

### TypeScript Errors
- Check strict mode compliance
- Verify all type annotations
- Use `// @ts-expect-error` with explanation (sparingly)

### Test Failures
- Read error message carefully
- Check test data validity
- Verify mock server is running (for integration tests)
- Use `console.log` to inspect values

### Build Issues
- Clean build: `rm -rf dist/ && bun run build`
- Check tsconfig.json settings
- Verify all imports are correct
- Check for circular dependencies

### Runtime Errors
- Check browser console for errors
- Verify tile URLs are correct
- Check CRS is valid (try epsg.io/<code>)
- Verify bbox is within CRS extent

---

## Best Practices

### DO ✅
- Use descriptive variable and function names
- Write tests for new features and bug fixes
- Follow existing code patterns
- Keep functions small and focused
- Document complex logic
- Use TypeScript strict mode
- Handle errors explicitly
- Cache expensive operations

### DON'T ❌
- Use `any` type without justification
- Skip error handling
- Leave console.log in production code
- Commit commented-out code
- Push to main/master branch directly
- Skip tests
- Ignore TypeScript errors
- Hardcode values that should be configurable

---

## Resources

### Documentation References
- **Testing**: See `testing_patterns` memory
- **Code Style**: See `code_style_conventions` memory
- **Architecture**: See `codebase_structure` memory
- **Analysis**: See `code_analysis_findings_2025_10_23` memory

### External Resources
- **Bun**: https://bun.sh/docs
- **TypeScript**: https://www.typescriptlang.org/docs
- **proj4**: http://proj4js.org/
- **epsg.io**: https://epsg.io/

### Related Memories
- `priority_improvements_2025_10_23` - Planned improvements
- `session_2025_10_23_comprehensive_analysis` - Latest analysis
- `project_overview` - Project information
