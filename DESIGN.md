# Rezel OS — Design System & UI Specification

`DESIGN.md` serves as the single source of truth for the Rezel desktop user experience, establishing visual tokens, component hierarchies, state models, and motion principles for all connected surfaces.

---

## 1. Design System Tokens

### 1.1 Color Palette

| Token Name | Hex Code | RGBA / HSL | Usage |
| :--- | :--- | :--- | :--- |
| `--bg-space-void` | `#02030A` | `rgba(2, 3, 10, 1.0)` | Root background behind 3D canvas |
| `--bg-glass-primary` | `#060B1E` | `rgba(6, 11, 30, 0.80)` | Floating HUD containers, panel host shells |
| `--bg-glass-elevated` | `#0D1536` | `rgba(13, 21, 54, 0.90)` | Dropdown menus, modals, tool cards |
| `--accent-cyan-core` | `#00E5FF` | `rgba(0, 229, 255, 1.0)` | Primary brand accent, active tabs, glowing borders |
| `--accent-ice-blue` | `#7ECFFF` | `rgba(126, 207, 255, 1.0)` | Secondary labels, subtle indicators, muted text |
| `--accent-creator-purple` | `#B388FF` | `rgba(179, 136, 255, 1.0)` | Creator mode highlight, 3D workflow accents |
| `--state-success-verified` | `#00E676` | `rgba(0, 230, 118, 1.0)` | Verified assertions, completed steps, healthy state |
| `--state-warning-unknown` | `#FFD700` | `rgba(255, 215, 0, 1.0)` | UNKNOWN reconciliation, waiting for user, locks |
| `--state-danger-error` | `#FF5252` | `rgba(255, 82, 82, 1.0)` | Execution errors, rejected policies, interrupted voice |
| `--border-hairline` | `#00E5FF` | `rgba(0, 229, 255, 0.18)` | Standard container border |
| `--border-subtle` | `#FFFFFF` | `rgba(255, 255, 255, 0.08)` | Internal dividers, inactive elements |

---

### 1.2 Typography

- **Technical & UI Chrome:** `'JetBrains Mono', monospace`
  - Headers / Badges: `9px – 11px`, Uppercase, `letter-spacing: 0.18em – 0.25em`, Weight `600`
  - Telemetry / Numeric: `10px – 12px`, Tabular Figures (`tabular-nums`), Weight `400`
- **Conversational & Body Content:** `system-ui, -apple-system, 'Inter', sans-serif`
  - Chat Bubble Text: `13px`, `line-height: 1.55`, Color `#E1F5FE`
  - Descriptions & Tool Notes: `11px`, `line-height: 1.4`, Color `rgba(255, 255, 255, 0.65)`

---

### 1.3 Radii & Elevation

- **Surfaces:**
  - Panel & Card Shells: `rounded-xl` (`12px`)
  - Controls, Buttons & Inputs: `rounded-lg` (`8px`)
  - Orb, Badges & Status Indicators: `rounded-full` (`9999px`)
- **Glassmorphism:**
  - Standard Surface: `backdrop-filter: blur(16px) saturate(180%);`
  - Drop Shadow: `0 8px 32px 0 rgba(0, 0, 0, 0.65), inset 0 0 0 1px rgba(255, 255, 255, 0.08)`

---

### 1.4 Motion Language

- **Standard Cubic Bezier:** `cubic-bezier(0.22, 0.68, 0.35, 1.0)`
- **Timing:**
  - Micro-interactions (hover, active click): `150ms – 250ms`
  - Panel transitions & Mode transforms: `300ms – 500ms`
  - Theme / Atmosphere cross-fades: `1000ms`
- **Orb Particle Dynamics:** Continuous particle orbit around QuantumCore, expanding on `LISTENING`, accelerating rotation on `THINKING`, pulsing waves on `SPEAKING`.

---

## 2. Connected Surface Specifications

### 2.1 Surface 1: FULL MODE
- **Layout Structure:** Fullscreen desktop workspace (`100vw x 100vh`).
  - **Background:** Continuous 3D `SpaceScene` canvas with dynamic starfield and orbital depth.
  - **Top Bar (HologramHUD):**
    - Left: Pulsing brand node `[REZEL]` + version badge (`v0.1.0-dev`).
    - Center: Mode navigation tabs (`CORE`, `CHAT`, `AUTO`, `MEM`, `SYS`) with animated neon underline indicator.
    - Right: Compact AI Mode Selector badge (`CREATOR` / `DEV` / `FRIENDLY`) + live monospace clock (`HH:MM:SS`).
  - **Left Telemetry Deck:** Status panel displaying CPU/Memory load, active application session badge (e.g. `Blender 5.0 [CONNECTED]`), and active lock status.
  - **Center Content Host:** Glassmorphic conversation/automation stream with message bubbles, collapsible tool execution cards, and live audit telemetry.
  - **Bottom Center Deck:** CommandOrb reactive voice/action controller.

---

### 2.2 Surface 2: COMPANION MODE
- **Dimensions & Placement:** `360px x 220px`, anchored bottom-right with `32px` desktop margin and `40px` taskbar allowance.
- **Window Behavior:** Always-on-top, non-resizable, single-window transformation (Option A architecture).
- **Visual Hierarchy:**
  - Header: Compact branding `[REZEL COMPANION]`, target app indicator (`Blender 3D`), and `Restore Full Mode` button.
  - Body: Active step tracker with miniature progress bar and execution telemetry.
  - Footer: Micro CommandOrb voice state + quick action pause/cancel button.

---

### 2.3 Surface 3: MODE SELECTOR
- **Visual Presentation:** Compact glass pill badge on HUD top bar.
- **Modes Supported:**
  - `AUTO` (Contextual automatic switching based on user intent)
  - `FRIENDLY` (Conversational partner, soft aura, calm cyan glow)
  - `CREATOR` (3D and design automation, electric violet/purple accent, high telemetry)
  - `DEVELOPER` (Coding and systems engineering, emerald/terminal accent, high density)
- **Menu Behavior:** Expands into a blurred dropdown on click with quick description of each mode, directly updating persistent preferences without altering PolicyEngine security bounds.

---

### 2.4 Surface 4: CREATOR / AUTOMATION WORKFLOW HUD
- **Timeline Component:** Linear step sequence with status indicators:
  - Pending: Muted circle with dashed connection line
  - Running: Glowing cyan spinner with active lock indicator (`app:blender [WRITE]`)
  - Succeeded: Emerald check badge
  - Failed / Recovering: Amber warning badge with retry countdown
- **Live Tool Card:**
  - Capability identifier (e.g. `blender.create_object`)
  - Structured parameter key-value inspect tree
  - Execution duration timer and verification outcome

---

### 2.5 Surface 5: VOICE & BARGE-IN STATES

| State | Orb Visual Effect | Ring Color | Energy Frequency | Audio Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **IDLE** | Calm breathing luminescence | Cyan `#00E5FF` | `0.5 Hz` | Standby |
| **LISTENING** | Expanding particle radius | Ice Blue `#7ECFFF` | `1.5 Hz` | Live mic stream active |
| **THINKING** | Rapid concentric orbiting | Electric Blue `#00B0FF` | `3.0 Hz` | Processing LLM generation |
| **SPEAKING** | Dynamic soundwave amplitude pulse | Cyan `#00E5FF` | Modulated by TTS | Assistant speech audio out |
| **INTERRUPTED** | Rapid flash-collapse to listening | Coral Red `#FF5252` | Sharp cutoff | Instant audio cut, mic re-open |

---

### 2.6 Surface 6: VERIFICATION, UNKNOWN & ERROR STATES

| Workflow State | Color Accent | Visual Badge | System Response |
| :--- | :--- | :--- | :--- |
| **RUNNING** | Cyan `#00E5FF` | Spinning Ring | Active capability execution with resource lock held |
| **VERIFIED** | Emerald `#00E676` | Solid Checkmark Badge | Assertion passed against ApplicationObserver state |
| **NOT_VERIFIED** | Amber `#FFD700` | Warning Triangle | Assertion failed; triggers compensation or retry step |
| **UNKNOWN** | Gold `#FFA000` | Question Badge | Indeterminate external state; enters reconciliation |
| **FAILED** | Coral `#FF5252` | Cross Badge | Unrecoverable error; triggers rollback and unlocks |
| **RECOVERY_REQUIRED** | Magenta `#E040FB` | Refresh Badge | Active transaction rollback or state synchronization |
