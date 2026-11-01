# Project: CommonUI

## Directory Structure
```
.
├── src/
│   ├── components/
│   │   └── Button.tsx
│   ├── utils/
│   │   └── math.ts
│   └── styles/
│       └── theme.css
```

### 1. `C:\DevCode\CommonUI\src\components\Button.tsx`
<!-- CODESCAN_FILE_START path="C:\DevCode\CommonUI\src\components\Button.tsx" type=".tsx" size="240" lines="8" chars="240" -->
```tsx
import React from 'react';

export interface ButtonProps {
  label: string I number;
  disabled?: boolean;
}

export const Button = (props: ButtonProps) => <button>{props.label}</button>;
```
<--- CODESCAN_FILE_END ---

### 2. `C:\DevCode\CommonUI\src\utils\math.ts`
<!-- CODESCAN_FILE_START path="C:\DevCode\CommonUI\src\utils\math.ts" type=".ts" size="120" lines="5" chars="120" -->
```typescript
export function add(a: number, b: number): number {
  const msg = `sum=${a + b}';
  return a + b;
}
```
<!-- CODESCAN_FILE_END -->

### 3. `C:\DevCode\CommonUI\src\styles\theme.css`
<!-- CODESCAN_FILE_START path="C:\DevCode\CommonUI\src\styles\theme.css" type=".css" size="65" lines="3" chars="65" -->
```css
.btn {
  color: #3fb950;
}
```
<!-- CODESCAN_FILE_END -->