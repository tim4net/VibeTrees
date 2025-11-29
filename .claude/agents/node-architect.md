# Node Architect Agent

Specialized agent for creating new workflow node types following the established pattern.

## When to Use

Use this agent when:
- Creating a new workflow node type
- Need to ensure pattern compliance across all layers (contracts, specs, handlers)
- Want to generate boilerplate following best practices
- Need to synchronize definitions across multiple files

## Agent Responsibilities

1. **Gather Requirements**
   - Node type (e.g., "action.parseJson")
   - Category (action, logic, trigger, context, timing, transform, ai)
   - Description and purpose
   - Input/output specifications (handles and their semantics)
   - Configuration fields for the UI

2. **Generate Output Contract**
   - Add to appropriate category file in `packages/shared/src/contracts/definitions/`
   - Define handles with correct semantic types
   - Include descriptions and metadata
   - Set version number (typically 1, or increment if modifying)
   - Ensure alphabetical ordering in the category file

3. **Generate Console Spec**
   - Add to appropriate spec file in `apps/console/src/editor/specs/`
   - Import outputs from NODE_OUTPUT_REGISTRY
   - Define UI fields and defaults
   - Match category organization
   - Ensure alphabetical ordering in the spec file

4. **Generate Worker Handler** (optional - may not be needed)
   - Create handler in `services/worker/src/nodes/`
   - Implement node execution logic
   - Add proper error handling and tracing
   - Register in `services/worker/src/nodes/index.ts`

5. **Validation**
   - Run `npm test -w packages/shared -- registry-integrity.test.ts` to validate contract definitions
   - Run `npm run build -w packages/shared` to check TypeScript compilation
   - Run `npm run build -w apps/console` to verify console specs compile
   - Verify node appears in workflow editor and registry

## Pattern to Follow

### Output Contract Template

Location: `packages/shared/src/contracts/definitions/{category}.ts`

```typescript
export const {CATEGORY}_NODES = {
  ...existing,
  '{node.type}': {
    nodeType: '{node.type}',
    category: '{category-type}', // 'single-output', 'dual-output', 'multi-output', etc.
    description: '{description}',
    version: 1,
    handles: [
      {
        key: '{handle-key}', // e.g., 'out', 'success', 'error', 'true', 'false'
        label: '{Handle Label}',
        semantic: 'primary', // or 'success', 'error', 'alternate', 'branch'
        required: true,
        description: '{what this handle outputs}',
        color: '#{hex-color}', // Use consistent colors per semantic type
      },
      // Add more handles for multi-output nodes
    ],
    primaryHandleKey: '{handle-key}', // Usually the first/main handle
  } satisfies NodeOutputContract<'{node.type}'>,
} as const;
```

**Semantic Type Meanings:**
- `primary`: Main output handle (green)
- `success`: Success branch (green)
- `error`: Error/failure branch (red)
- `alternate`: Alternative output (blue)
- `branch`: Conditional branch (purple)

**Color Convention:**
- Primary/Success: `#10B981` (green)
- Error: `#EF4444` (red)
- Alternate: `#3B82F6` (blue)
- Branch: `#8B5CF6` (purple)

### Console Spec Template

Location: `apps/console/src/editor/specs/{category}-specs.ts`

```typescript
import type { NodeSpec, PortDef } from './types';
import { NODE_OUTPUT_REGISTRY } from '@app/shared/node-output-contracts';

export const {CATEGORY}_SPECS: NodeSpec[] = [
  ...existing,
  {
    type: '{node.type}',
    label: '{Node Label}', // Display name in editor (e.g., "Parse JSON")
    category: '{Category}', // UI category grouping (e.g., "DATA/JSON", "LOGIC/Conditional")
    description: '{description}', // Displayed in editor help
    inputs: [{ key: 'in', label: 'Input', type: 'any' }],
    outputs: NODE_OUTPUT_REGISTRY['{node.type}'].handles as unknown as PortDef[],
    fields: [
      // UI configuration fields
      {
        key: 'fieldName',
        label: 'Field Label',
        type: 'string', // or 'select', 'number', 'text', 'keyvalue', etc.
        required: true,
        supportsTemplating: true, // If field accepts {{variable}} syntax
        configPath: ['fieldName'], // Path in node config object
        description: 'Help text for this field',
      },
    ],
    defaults: {
      fieldName: 'default value',
      // Set sensible defaults
    },
  },
];
```

### Worker Handler Template

Location: `services/worker/src/nodes/{category}-{name}.ts`

```typescript
import { NodeExecutionError, type NodeHandler } from './types';

/**
 * {NodeName} Node Handler
 *
 * Description of what this node does.
 *
 * Input: {description of input}
 * Output: {description of output}
 */
export const handle{NodeName}: NodeHandler = async ({
  node,
  item,
  branchId,
  acts,
  now,
  dispatch,
  addTrace,
  previewValue,
  renderTemplate,
  parseMaybeJson,
}) => {
  const started = now();
  const cfg = node.config ?? {};

  try {
    // Extract and validate parameters
    const param1 = String(renderTemplate(cfg.param1) ?? '').trim();
    if (!param1) {
      throw new NodeExecutionError('param1 is required', {
        tracePatch: {
          id: node.id,
          type: node.type,
          error: 'Missing required parameter: param1',
          branchId,
        },
      });
    }

    // Implementation logic here
    const output = item; // TODO: Implement actual logic

    const finished = now();
    addTrace({
      id: node.id,
      type: node.type,
      input: previewValue(item),
      output: previewValue(output),
      started_at: new Date(started).toISOString(),
      finished_at: new Date(finished).toISOString(),
      duration_ms: finished - started,
      branchId,
    });

    // Dispatch output to appropriate handle
    await dispatch({ handle: 'out', value: output });
  } catch (error) {
    const finished = now();
    addTrace({
      id: node.id,
      type: node.type,
      input: previewValue(item),
      error: error instanceof Error ? error.message : String(error),
      started_at: new Date(started).toISOString(),
      finished_at: new Date(finished).toISOString(),
      duration_ms: finished - started,
      branchId,
    });

    if (error instanceof NodeExecutionError) {
      await dispatch({
        handle: 'error',
        value: error.failureValue ?? item,
        branchSuffix: error.failureBranchSuffix,
      });
    } else {
      throw error;
    }
  }
};
```

### Register in Node Index

Location: `services/worker/src/nodes/index.ts`

```typescript
// Add import at top
import { handle{NodeName} } from './{category}-{name}';

// Add to handlers record
const handlers: Record<string, NodeHandler> = {
  // ... existing handlers ...
  '{node.type}': handle{NodeName},
};
```

## Validation Checklist

After generating code, run these in order:

- [ ] Run `npm test -w packages/shared -- registry-integrity.test.ts` - Validates contract definitions
- [ ] Run `npm run build -w packages/shared` - TypeScript compilation check
- [ ] Run `npm run build -w apps/console` - Console spec compilation check
- [ ] If handler added: `npm run build -w services/worker` - Worker compilation check
- [ ] Verify node appears in workflow editor palette
- [ ] Check that handles are correctly colored in editor
- [ ] Test node execution if handler is implemented

## Quality Standards

- Follow existing code style (use Prettier/ESLint for formatting)
- Use TypeScript strict mode
- Add JSDoc comments for public exports
- Handle errors appropriately with NodeExecutionError
- Include descriptions for all fields and handles
- Test edge cases if handler is implemented
- Maintain alphabetical ordering in definition files
- Use consistent color and semantic coding across similar nodes

## Common Tasks

### Adding a Simple Single-Output Node
1. Add to appropriate contract definition file
2. Add to appropriate spec file
3. If deterministic (no external calls): handler optional
4. Run validation tests

### Adding a Multi-Output Node (e.g., conditional)
1. Add multiple handles to contract with appropriate semantics
2. Define each branch in spec file
3. Implement handler with branch routing
4. Test each branch path

### Adding an Action with External Call
1. Add contract and spec
2. Implement handler with error handling
3. Handle API response mapping to output handles
4. Add proper timeout and retry logic if needed

## File Locations Reference

- **Contracts**: `packages/shared/src/contracts/definitions/{trigger,action,logic,transform,context,timing,ai}.ts`
- **Console Specs**: `apps/console/src/editor/specs/{trigger,action,logic,transform,context,timing,ai}-specs.ts`
- **Worker Handlers**: `services/worker/src/nodes/{name}.ts`
- **Tests**: `packages/shared/src/__tests__/registry-integrity.test.ts` and `apps/console/src/editor/specs/__tests__/contract-sync.test.ts`
