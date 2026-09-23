# Rezel Architecture

## Purpose

Rezel is a desktop AI operating intelligence built with a modular architecture.
The system separates the user interface, AI reasoning, security, backend services,
and automation into independent layers.

---

# High-Level Architecture

User
↓
Boot Screen
↓
Home Screen
↓
Hologram HUD
↓
Command Interface
↓
AI Layer
↓
Security Layer
↓
Rust Backend
↓
Operating System

---

## Frontend

React + TypeScript

Main Components

- BootScreen
- HomeScreen
- SpaceScene
- HologramHUD
- CommandOrb
- StatusPanel
- PermissionConfirmModal

---

## AI Layer (Planned)

Responsible for:

- Conversation
- Planning
- Tool selection
- Memory
- AI providers

Planned modules

- AgentCore
- Planner
- ToolRegistry
- LocalMemory

Providers

- Ollama
- Gemini

---

## Security Layer

Purpose

Every action that can modify the computer must pass through the security layer.

Components

- PermissionManager
- SafetyValidator
- ToolExecutor
- AuditLogger

---

## Backend

Rust + Tauri

Responsibilities

- System commands
- Secure storage
- File access
- Telemetry
- Native APIs

---

## AI Providers

Local

- Ollama
- Qwen3:4b
- Gemma3:4b

Cloud

- Gemini API

---

## Development Principle

The UI should never directly execute system actions.

Flow:

UI
↓
AgentCore
↓
Security
↓
Rust Commands
↓
Operating System