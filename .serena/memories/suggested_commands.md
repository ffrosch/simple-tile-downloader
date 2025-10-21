# Suggested Commands

## Development Commands

### Install Dependencies
```bash
bun install
```

### Build Project
```bash
bun run build
```
- Bundles JavaScript to `dist/index.js` (browser target)
- Generates TypeScript declarations to `dist/index.d.ts`

### Build Steps (Manual)
```bash
# Bundle JavaScript
bun build ./src/index.ts --outfile=dist/index.js --target=browser --packages=external

# Generate type declarations
bun run build:declaration
# or: tsc --project tsconfig.types.json
```

## Testing Commands
**Note**: No test suite currently configured

To add testing:
```bash
bun test
```

## Linting/Formatting
**Note**: No linter/formatter configured yet

To add (recommended):
```bash
# Install tooling
bun add -d @biomejs/biome
# or
bun add -d eslint prettier

# Run checks
bun run lint
bun run format
```

## Git Commands
```bash
# Check status
git status

# Create feature branch
git checkout -b feature/your-feature

# Stage changes
git add .

# Commit
git commit -m "description"
```

## File Operations (Linux)
```bash
# List files
ls -la

# Find files
find src -name "*.ts"

# Search content
grep -r "pattern" src/

# View file
cat src/index.ts

# Change directory
cd src/
```

## Package Management
**Use Bun, not npm/yarn/pnpm**:
```bash
bun install <package>
bun add <package>
bun remove <package>
```

## Running Scripts
```bash
bun run <script-name>
```

## Development Server (if needed)
```bash
bun --hot ./index.ts
```
