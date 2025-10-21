# Task Completion Checklist

## After Code Changes

### 1. Build Verification
```bash
bun run build
```
- Ensure build completes without errors
- Check that `dist/index.js` and `dist/index.d.ts` are generated
- Verify no TypeScript compilation errors

### 2. Type Checking
```bash
tsc --noEmit
```
- Validate TypeScript types without emitting files
- Ensure strict mode compliance
- Check for type errors

### 3. Manual Testing (No automated tests yet)
- Test core functions manually if changes affect:
  - `processTilesConfig()` calculation logic
  - `fetchTile()` download behavior
  - `fetchTiles()` generator/parallelism
- Verify OpenLayers integration still works

### 4. Code Review
- Check adherence to TypeScript strict mode
- Verify naming conventions (camelCase/PascalCase)
- Ensure proper error handling in async code
- Validate type annotations are complete

### 5. Documentation
- Update README.md if public API changes
- Update type definitions if interfaces change
- Add comments for complex logic

### 6. Git Workflow
```bash
# Review changes
git diff

# Stage changes
git add <files>

# Commit with descriptive message
git commit -m "feat: description" # or fix:/docs:/refactor:

# Push to feature branch
git push origin feature/branch-name
```

## Before Release

### Version Bump
- Update version in `package.json`
- Follow semantic versioning (currently 0.1.0-alpha)

### Build Clean
```bash
rm -rf dist/
bun run build
```

### Package Check
- Verify `dist/` contains correct artifacts
- Test type declarations work in consuming project
- Check package.json exports are correct

## Recommended Future Additions

### Testing
```bash
bun test
```
- Add unit tests for core functions
- Test error handling paths
- Validate tile coordinate calculations

### Linting
```bash
bun run lint
bun run lint:fix
```

### Formatting
```bash
bun run format
bun run format:check
```

### CI/CD
- GitHub Actions for automated testing
- Build verification on PRs
- Type checking in CI pipeline
