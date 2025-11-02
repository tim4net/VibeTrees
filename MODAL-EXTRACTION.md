# Modal Extraction Guide

**Progress:** 1/12 modals extracted

## Pattern

### 1. Extract modal HTML to template file
```bash
# Create template file
public/templates/modals/{modal-name}.html

# Move modal HTML from index.html to template file
# Keep the complete modal structure including all IDs and event handlers
```

### 2. Update template-loader.js
```javascript
// Add to preloadModals() array
const modalTemplates = [
  'modals/create-worktree.html',
  'modals/{new-modal}.html',  // ← Add here
];
```

### 3. Replace in index.html
```html
<!-- Before: Full modal HTML (100+ lines) -->
<div id="modal-name" class="modal">...</div>

<!-- After: Just container reference -->
<!-- Container already exists: <div id="modals-container"></div> -->
```

## Remaining Modals to Extract (11)

Located in `index.html`:
- [ ] New Project Modal (line ~126)
- [ ] Folder Browser Modal (line ~178)
- [ ] Close Worktree Modal (line ~201)
- [ ] Import Worktree Modal (line ~328)
- [ ] Diagnostics Modal (line ~353)
- [ ] File Changes Modal (line ~397)
- [ ] Service Startup Progress Modal (line ~445)
- [ ] Database Operations Modal (line ~476)
- [ ] Sync Prompt Modal (line ~589)
- [ ] Update Available Modal (line ~602)
- [ ] Service Startup Modal (line ~804)

## Benefits
- **Reduced index.html**: 965 → 864 lines (1 modal done)
- **Target**: ~400-500 lines after all extractions
- **Maintainability**: Modals in separate files
- **Reusability**: Templates can be reused/composed
- **Performance**: Lazy loading possible in future

## Current Status
✅ Template system infrastructure complete
✅ Create Worktree modal extracted
✅ Modal scroll fix applied (overflow: auto)
⏳ 11 modals remaining
