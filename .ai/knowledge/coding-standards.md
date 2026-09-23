# Rezel Coding Standards

## General Principles

Code must be:

- Readable
- Modular
- Type-safe
- Easy to maintain
- Production-oriented

Prefer clarity over clever solutions.

---

# TypeScript Standards

## Types

Always use explicit types for:

- Function parameters
- Return values
- Important state objects

Avoid:

```ts
any
```

unless there is a strong reason.

Prefer:

```ts
interface UserState {
  status: string;
  active: boolean;
}
```

---

# React Standards

## Components

Use functional components.

Example:

```tsx
export function ComponentName() {
  return (
    <div>
    </div>
  );
}
```

---

## Component Structure

Preferred order:

1. Imports
2. Types/interfaces
3. Constants
4. Component
5. Hooks
6. Logic
7. Return JSX

---

## Naming

Components:

```
PascalCase
```

Example:

```
HologramHUD.tsx
CommandOrb.tsx
```

Functions:

```
camelCase
```

Example:

```
getSystemMetrics()
validatePermission()
```

Files should describe their purpose.

---

# React Architecture

Keep components focused.

Avoid:

- Huge components
- Mixed responsibilities
- Business logic inside UI components

Prefer:

```
Component
 |
 Hook
 |
 Service
 |
 Backend
```

---

# State Management

Before adding global state:

Ask:

- Is this shared?
- Is local state enough?
- Does it belong in a service?

Avoid unnecessary complexity.

---

# Rust Standards

Follow:

- Clear module separation
- Safe error handling
- Explicit Result types

Avoid:

- Unhandled errors
- Unsafe operations
- Hardcoded paths

---

# File Organization

Keep features grouped.

Example:

```
components/
  hud/
    HologramHUD.tsx

services/
  ai/
    AgentCore.ts

services/
  security/
    PermissionManager.ts
```

---

# Imports

Prefer clean imports.

Avoid:

```ts
../../../components/file
```

when aliases are available.

---

# Dependencies

Before adding a package:

Check:

1. Is it already installed?
2. Is it necessary?
3. Does it increase maintenance?

Avoid unnecessary dependencies.

---

# Performance

Important areas:

- Three.js rendering
- Animations
- AI response handling
- Background processes

Avoid:

- Unnecessary re-renders
- Heavy calculations in UI
- Blocking operations

---

# Testing Rule

Before marking a feature complete:

Verify:

- Build succeeds
- No TypeScript errors
- No console errors
- Existing features still work