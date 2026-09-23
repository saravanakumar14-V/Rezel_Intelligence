# CHANGELOG

## v0.0.1-dev

### Added
- Project planning completed.
- System architecture finalized.
- Technology stack finalized.
- Git repository initialized.

Added

- Production monorepo architecture

### Changed
- Connected local repository to GitHub.
- Created initial production folder structure.
## v0.0.2-dev

### Added
- React desktop application
- Tauri desktop runtime
- First executable Rezel window
- ### Added
- React + TypeScript + Vite application initialized in apps/desktop.
- ## v0.0.2-dev

### Added
- React + TypeScript + Vite application initialized.
- Tauri desktop runtime initialized.
- Added

Genesis Boot System

## v0.1.0-dev — 2026-07-19

### Added — Feature 2: Cinematic Space Scene (Stage 1)
- `@types/three` 0.185.1 added as devDependency (resolves TS7016)
- `CameraController.tsx` — mouse-reactive parallax camera (useEffect cleanup, no per-frame allocs)
- `StarsField.tsx` — 7,000 background stars + 400 space dust motes (2 draw calls, pre-computed Float32Arrays)
- `EnergyRing.tsx` — parameterised wireframe torus rings with additive blending
- `OrbitParticles.tsx` — 600-particle Fibonacci-sphere cloud (single Points draw call)
- `CoreLight.tsx` — ambient + point + hemisphere + rim lighting for deep space
- `QuantumCore.tsx` — multi-layer animated core (outer wireframe shell, mid emissive, inner nucleus, pulse via Math.sin)
- `SpaceScene.tsx` — main R3F Canvas wiring all sub-components + Bloom + Vignette post-processing
- `HomeScreen.tsx` — placeholder replaced; SpaceScene mounted as full-screen background
- `cn.ts` — clsx-based class name utility

### Fixed
- `BootScreen.tsx` — stale-closure bug in progress/message index effect resolved using ref tracking

### Changed — Rezel Boot Screen Cinematic AI Awakening Redesign
- `BootScreen.tsx` — Added AI phase tracking and refined sequencing
- `BootLogo.tsx` — Added AI energy core, holographic stabilization, cinematic scramble
- `BootMessages.tsx` — Reduced footprint, added AI startup logs
- `BootProgress.tsx` — Transformed into cinematic minimal block diagnostics
- `BootTransition.tsx` — Added subtle grid data movement and smooth energy fade out