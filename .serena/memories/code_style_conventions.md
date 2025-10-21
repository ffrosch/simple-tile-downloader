# Code Style and Conventions

## TypeScript Configuration
- **Strict Mode**: Enabled with all strict checks
- **Target**: ESNext (modern JavaScript features)
- **Module**: Preserve mode for bundler compatibility
- **Additional Checks**:
  - `noUncheckedIndexedAccess`: true
  - `noUnusedLocals`: true
  - `noUnusedParameters`: true
  - `noImplicitOverride`: true
  - `noUncheckedSideEffectImports`: true

## Naming Conventions
- **Functions**: camelCase (`processTilesConfig`, `fetchTile`, `fetchTiles`)
- **Types/Interfaces**: PascalCase (`TileRange`, `SourceConfig`, `TilesConfig`)
- **Type Aliases**: PascalCase (`Bbox`)
- **Variables**: camelCase

## Type Annotations
- **Explicit Types**: Interface definitions for public API
- **Return Types**: Explicit for exported functions
- **Generics**: Used where appropriate (AsyncGenerator)

## Code Organization
- **Exports**: Clean public API via index.ts barrel exports
- **Type Definitions**: Separate types.ts file
- **Implementation**: Core logic in tiles.ts
- **Single Responsibility**: Each file has clear purpose

## Async Patterns
- **Promises**: Used for single async operations (`fetchTile`)
- **Async Generators**: Used for streaming/parallel batch operations (`fetchTiles`)
- **Error Handling**: Promise rejection for fetch errors

## Module System
- **ES Modules**: `import`/`export` syntax
- **Type Imports**: `import type` for type-only imports
- **Package Type**: `"module"` in package.json
