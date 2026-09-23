# Rezel Project Rules

## Core Rule

Rezel should be developed as a production-grade desktop AI system.

Every feature must maintain:
- Security
- Modularity
- Maintainability
- Performance

---

# Architecture Rules

## Separation of Responsibilities

Frontend:
- Handles UI and user interaction only.

AI Layer:
- Handles reasoning, planning, and tool selection.

Security Layer:
- Validates every sensitive action.

Rust Backend:
- Handles native operating system operations.

---

# Security Rules

Never allow:

- Direct system command execution from UI.
- AI model direct access to operating system.
- Unsafe automation without permission.

All system actions must follow:

Request
↓
Validation
↓
Permission Check
↓
Execution
↓
Audit Log

---

# Code Rules

Prefer:

- Small reusable components.
- Clear naming.
- Type safety.
- Modular files.

Avoid:

- Large monolithic files.
- Duplicate logic.
- Temporary hacks.
- Unnecessary dependencies.

---

# AI Development Rules

When adding AI features:

1. Define the purpose.
2. Define inputs and outputs.
3. Add safety restrictions.
4. Test failure cases.

AI should assist the user, not blindly execute instructions.

---

# UI Rules

Rezel UI should maintain:

- Futuristic design.
- Clean spacing.
- Smooth animations.
- Premium desktop application feel.

Avoid:

- Generic dashboards.
- Cluttered interfaces.
- Excessive buttons.
- Poor hierarchy.

---

# Change Rules

Before modifying existing systems:

1. Understand current architecture.
2. Check dependencies.
3. Make the smallest required change.

Do not rewrite working systems without reason.

---

# Documentation Rule

After completing major features:

Update:
- Progress report
- Architecture notes
- Relevant documentation