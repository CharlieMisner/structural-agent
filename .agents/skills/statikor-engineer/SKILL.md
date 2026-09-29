---
name: statikor-engineer
description: >-
  Core guide for driving and developing Statikor—the desktop AI assistant that drives
  and automates real-world structural engineering software (Revit, Forte, Enercalc, SAP2000,
  ETABS, spColumn, RISA, RAM Steel, Excel). Use this skill whenever developing tools,
  software integrations, multi-agent orchestrations, or UI features for Statikor.
---

# Statikor Engineer Skill: Driving Structural Engineering Software

**Statikor's Core Mission**: Meet structural engineers where they already work.
Statikor does **not** aim to be a simple formula calculator. Instead, it is an agentic copilot that **drives, automates, and orchestrates existing professional structural engineering software** as tools.

Engineers rely on established, certified design and analysis software daily. Statikor acts as the intelligent bridge, allowing engineers to interact with, query, model, and automate these programs using natural language.

---

## 1. Supported Software Ecosystem

Statikor connects to and controls the following primary software packages:

| Category | Software Packages | Integration & Automation Methods |
| :--- | :--- | :--- |
| **BIM & Modeling** | Autodesk Revit, Autodesk Platform | Revit API, pyRevit, Revit Batch Processor, IFC/DirectContext |
| **FEA & Building Analysis** | CSI SAP2000, CSI ETABS | CSI OAPI (COM / Python `comtypes`), text/XML input files |
| **Component Design** | Enercalc, Weyerhaeuser Forte | CLI/batch execution, XML/JSON project exchange, COM automation |
| **Concrete & Rebar Design** | StructurePoint spColumn | spColumn Batch / text file (.col) automation |
| **Frame & 2D/3D Analysis** | RISA-2D, RISA-3D | COM API, RISA file exchange (.r3d/.r2d) |
| **Steel Framing Systems** | Bentley RAM Structural System (RAM Steel) | RAM DataAccess COM API |
| **Calculations & Data** | Microsoft Excel | `win32com`, `openpyxl`, `xlwings`, template automation |

---

## 2. Architecture: Software Connectors as Agent Tools

In Statikor, **Tools** are software connectors. Instead of evaluating formulas internally, the agent invokes tools that query, drive, or parse industry software.

```text
┌────────────────────────────────────────────────────────┐
│            Statikor Lead Orchestrator Agent            │
└───────────┬───────────────────┬───────────────────┬────┘
            │                   │                   │
            ▼                   ▼                   ▼
┌───────────────────────┐ ┌───────────────┐ ┌───────────────┐
│     Revit Connector   │ │ ETABS Connector│ │Enercalc/Forte │
│  (Read grids/framing) │ │ (Extract loads│ │(Size components│
└───────────────────────┘ └───────────────┘ └───────────────┘
```

### Typical End-to-End Workflow:
1. **Model Query**: User asks: *"What are the reactions on Column C3 from the ETABS model?"*
2. **Analysis Tool**: ETABS OAPI connector connects to the active ETABS instance, reads base reactions for load combinations.
3. **Component Design**: Agent passes reactions to the `spColumn` or `Enercalc` tool to verify rebar ratio or footing size.
4. **BIM Update**: Agent drives Revit to update the column family schedule or geometry.
5. **Spreadsheet Sync**: Agent writes calculation summaries directly into the project's Excel design ledger.

---

## 3. Multi-Agent Delegation Strategy

Because each software platform has vast API surfaces and unique data structures, Statikor uses dedicated **Software Specialist Subagents**:

1. **BIM Specialist (Revit Agent)**:
   - Queries framing members, material strengths, levels, grids, and analytical lines.
   - Creates/modifies Revit families, framing plans, and schedules.
2. **Building Analysis Specialist (ETABS / SAP2000 / RISA Agent)**:
   - Drives CSI OAPI / RISA COM.
   - Extracts member forces, nodal displacements, drift ratios, and modal participation factors.
3. **Component Sizing Specialist (Enercalc / Forte / spColumn Agent)**:
   - Automates discrete element design: wood joists/LVL in Forte, footings/retaining walls in Enercalc, biaxial concrete columns in spColumn.
4. **Calculation & Report Specialist (Excel Agent)**:
   - Reads/writes engineering design books, formats client deliverables, verifies check matrices.
5. **Lead Structural Orchestrator (Supervisor)**:
   - Understands the structural engineer's high-level intent.
   - Formulates the cross-software plan.
   - Coordinates data transfer between analysis, design, and BIM.

---

## 4. Engineering Principles & Guardrails

1. **Truth from the Software**:
   - The agent never guesses member capacities or internal forces. All numbers must come directly from software output, OAPI responses, or exported reports.
2. **Engineer in the Loop**:
   - For destructive actions (e.g. modifying a live Revit model, re-running a large 3D FEA mesh, or saving over an Excel design book), the agent must clearly present the proposed changes and ask for confirmation before executing.
3. **Session Awareness**:
   - Connectors should check if the target program (e.g. Revit or ETABS) is currently running with an open model before attempting COM/OAPI calls.
4. **Auditability**:
   - Always log the exact software version, input parameters, and file path of any software invoked.

---

## 5. Development References

- [Software Integrations Guide](./references/integrating-engineering-software.md): How to build connectors for Revit, ETABS, Forte, Enercalc, etc.
- [Multi-Agent Software Orchestration](./references/subagent-orchestration.md): Detailed patterns for coordinating multi-software workflows.
- [System Architecture](./references/architecture.md): Tauri v2 client, FastAPI sidecar daemon, and SSE event streaming.

