# Integrating Structural Engineering Software as Tools

This guide outlines the patterns and protocols for connecting Statikor's Python backend to industry structural engineering software.

---

## 1. CSI OAPI Integration (ETABS & SAP2000)

CSI provides the **Open Architecture API (OAPI)** to automate model creation, meshing, analysis execution, and results extraction.

### Python OAPI Connection Pattern:
```python
# Connect to an active ETABS instance
import comtypes.client
from langchain_core.tools import tool

def get_etabs_app():
    """Attaches to an active ETABS session or launches a new one."""
    helper = comtypes.client.CreateObject("ETABSv1.Helper")
    helper = helper.QueryInterface(comtypes.gen.ETABSv1.cHelper)
    return helper.GetObject("CSI.ETABS.API.ETABSObject")

@tool
def get_column_reactions(column_name: str, load_combo: str) -> dict:
    """Extracts base reactions from the active ETABS model for a specific column and load combo.
    
    Args:
        column_name (str): Label of the column (e.g. 'C1', 'C4').
        load_combo (str): Governing load combination (e.g. '1.2D + 1.6L').
    """
    myETABSObject = get_etabs_app()
    SapModel = myETABSObject.SapModel
    
    # Set combo and extract joint reactions
    SapModel.Results.Setup.DeselectAllCasesAndCombosForOutput()
    SapModel.Results.Setup.SetComboSelectedForOutput(load_combo)
    
    # Call OAPI Results.JointReact...
    ...
    return {"column": column_name, "P_kip": 245.5, "Mx_kip_ft": 42.1, "My_kip_ft": 18.3}
```

---

## 2. Autodesk Revit Integration

To drive Revit from our FastAPI sidecar:

1. **pyRevit / Revit API HTTP Server**:
   - Run a lightweight local HTTP listener inside Revit (using pyRevit or a Revit C# Add-In).
   - Statikor tools send REST requests to query elements or inject geometry.
2. **Revit Batch Processor (Headless)**:
   - For offline batch model processing without keeping the full UI open.
3. **Common Tool Capabilities**:
   - `get_revit_framing_schedule(level: str)`: Reads structural beam/column sizes and schedules.
   - `update_revit_member_size(element_id: str, new_size: str)`: Updates a member's family type based on design software results.

---

## 3. StructurePoint spColumn Automation

spColumn supports batch mode processing via `.col` text files:

```python
import subprocess
from pathlib import Path
from langchain_core.tools import tool

@tool
def design_concrete_column(b_in: float, h_in: float, fc_ksi: float, p_kip: float, mx_kip_ft: float) -> dict:
    """Invokes StructurePoint spColumn in batch mode to design rebar for an axial + flexural column.
    
    Generates the .col input file, invokes spColumn.exe in batch mode, and parses the output report.
    """
    col_input = f"""[spColumn Input File]
Section: Rectangular {b_in} x {h_in}
Materials: f'c={fc_ksi}, fy=60
Loads: P={p_kip}, Mx={mx_kip_ft}
...
"""
    # Write temp file and execute: spColumn.exe /b input.col
    # Parse output .out file for rebar configuration and interaction ratio
    return {"bars": "8 - #8", "rho_percent": 1.95, "interaction_ratio": 0.88}
```

---

## 4. Weyerhaeuser Forte & Enercalc Automation

- **Forte**: Uses XML interchange files to batch-run floor joists, drop beams, and header sizing.
- **Enercalc**: Uses XML/JSON project data files and CLI flags to evaluate spread footings, masonry walls, and wood/steel beams.

### Tool Pattern:
1. Write the project parameters into the software's native input/XML format.
2. Call the executable with batch flags (`/batch`, `/run`, `/export`).
3. Parse the generated output report/JSON.
4. Return the structured results directly into LangGraph.

---

## 5. Microsoft Excel Integration (`xlwings` / `openpyxl`)

Structural engineering firms maintain proprietary design spreadsheets:

```python
import xlwings as xw
from langchain_core.tools import tool

@tool
def evaluate_custom_calc_sheet(sheet_path: str, inputs: dict) -> dict:
    """Populates an engineering calculation spreadsheet and reads the computed results.
    
    Args:
        sheet_path (str): Path to the Excel calculation file (.xlsx, .xlsm).
        inputs (dict): Cell addresses and values to inject (e.g. {'B4': 25.0, 'B5': 120.0}).
    """
    app = xw.App(visible=False)
    wb = app.books.open(sheet_path)
    ws = wb.sheets[0]
    
    for cell, val in inputs.items():
        ws.range(cell).value = val
        
    wb.app.calculate()
    results = {
        "governing_ratio": ws.range("E15").value,
        "status": ws.range("E16").value
    }
    wb.close()
    app.quit()
    return results
```
