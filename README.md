# Structural Agent

A desktop AI assistant for structural engineers that drives desktop structural engineering software (ETABS, SAP2000, Revit, AutoCAD, Enercalc) using local Model Context Protocol (MCP) servers.

## Monorepo Architecture

- **`client/`**: Tauri v2 desktop application with an **Autodesk Weave** design system UI, interactive project file tree side pane, and real-time MCP driver automation console.
- **`agent/`**: Agent core orchestrator (will coordinate user instructions, LLM reasoning, and tool calls to local MCP drivers).
- **`mcps/`**: Local Model Context Protocol servers communicating directly with desktop structural software (CSI OAPI, Revit IPC, DXF/AutoCAD, etc.).
- **`shared/`**: Common schemas and data models across services.
- **`scripts/`**: Automation and packaging scripts.

## Getting Started

### Client
```bash
cd client
npm run dev      # Launch Vite frontend preview
npm run tauri dev # Launch Tauri desktop app
```
