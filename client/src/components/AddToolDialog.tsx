import React, { useEffect } from 'react';
import { X, Wrench } from 'lucide-react';

interface AddToolDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTool: (toolId: string) => void;
}

interface ToolExample {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
}

const TOOL_EXAMPLES: ToolExample[] = [
  {
    id: 'forteweb',
    name: 'ForteWEB',
    description: 'Weyerhaeuser Wood Joist, Beam & Column Sizing',
    category: 'Wood Design',
    enabled: true,
  },
  {
    id: 'enercalc',
    name: 'Enercalc',
    description: 'Component Analysis, Footings, Retaining Walls',
    category: 'Component Sizing',
    enabled: false,
  },
  {
    id: 'revit',
    name: 'Autodesk Revit',
    description: 'BIM Analytical Model & Structural Framing',
    category: 'BIM & Modeling',
    enabled: false,
  },
  {
    id: 'etabs',
    name: 'CSI ETABS',
    description: 'Building Structural Analysis & Lateral Drift',
    category: 'Building FEA',
    enabled: false,
  },
  {
    id: 'sap2000',
    name: 'CSI SAP2000',
    description: 'General 3D Finite Element Structural Analysis',
    category: '3D FEA',
    enabled: false,
  },
  {
    id: 'spcolumn',
    name: 'spColumn',
    description: 'StructurePoint Biaxial Concrete Column Design',
    category: 'Concrete',
    enabled: false,
  },
  {
    id: 'risa3d',
    name: 'RISA-3D',
    description: 'General Structural Framing, Steel & Trusses',
    category: 'Frame Analysis',
    enabled: false,
  },
  {
    id: 'ramsteel',
    name: 'RAM Steel',
    description: 'Bentley Gravity & Lateral Steel Framing',
    category: 'Steel Framing',
    enabled: false,
  },
  {
    id: 'excel',
    name: 'Microsoft Excel',
    description: 'Custom Structural Calculation Books & Ledgers',
    category: 'Calculations',
    enabled: false,
  },
];

export const AddToolDialog: React.FC<AddToolDialogProps> = ({
  isOpen,
  onClose,
  onSelectTool,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#050d18] border border-[#00f0ff]/30 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-hud-text"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-12 px-4 border-b border-[#0e2236] flex items-center justify-between bg-[#03070d] shrink-0">
          <div className="flex items-center space-x-2">
            <Wrench className="w-4 h-4 text-[#00c8e6]" />
            <h2 className="text-sm font-semibold font-mono text-hud-text tracking-wide uppercase">
              Add Tool
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#55697d] hover:text-white hover:bg-[#0e2236] transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1">
          <div className="mb-4">
            <p className="text-xs text-[#728aa0] font-mono leading-relaxed">
              Select a structural engineering software or calculation tool to integrate into this project.
            </p>
          </div>

          {/* Grid of Example Buttons: ForteWEB first, all other buttons disabled */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {TOOL_EXAMPLES.map((tool) => {
              if (tool.enabled) {
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => {
                      onSelectTool(tool.id);
                    }}
                    className="flex flex-col text-left p-3.5 rounded-lg bg-[#071728] hover:bg-[#0a233d] border border-[#00c8e6]/50 hover:border-[#00c8e6] shadow-[0_0_12px_rgba(0,200,230,0.12)] hover:shadow-[0_0_18px_rgba(0,200,230,0.25)] transition-all group relative cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full mb-1.5">
                      <span className="font-semibold text-xs text-[#00f0ff] font-mono group-hover:text-white transition-colors">
                        {tool.name}
                      </span>
                      <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#00c8e6]/20 text-[#00c8e6] border border-[#00c8e6]/30">
                        Available
                      </span>
                    </div>
                    <span className="text-[11px] text-[#8ca3b8] leading-snug">
                      {tool.description}
                    </span>
                  </button>
                );
              }

              return (
                <button
                  key={tool.id}
                  type="button"
                  disabled
                  className="flex flex-col text-left p-3.5 rounded-lg bg-[#030914] border border-[#0e2236] opacity-40 cursor-not-allowed select-none"
                >
                  <div className="flex items-center justify-between w-full mb-1.5">
                    <span className="font-medium text-xs text-[#62778c] font-mono">
                      {tool.name}
                    </span>
                    <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#0b1624] text-[#475d73] border border-[#142334]">
                      Disabled
                    </span>
                  </div>
                  <span className="text-[11px] text-[#475d73] leading-snug">
                    {tool.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="h-11 px-4 border-t border-[#0e2236] flex items-center justify-end bg-[#03070d] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1 text-xs font-mono rounded bg-[#071322] hover:bg-[#0d2238] border border-[#0e2236] hover:border-[#00c8e6]/30 text-hud-text transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
