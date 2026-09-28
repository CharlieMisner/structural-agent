import React, { useState, useRef, useEffect } from 'react';
import { FileText, Loader2, ArrowUp } from 'lucide-react';
import { ProjectState } from '../types/fs';

interface Message {
  id: string;
  sender: 'user' | 'agent';
  content: string;
}

interface PromptWorkspaceProps {
  project: ProjectState;
}

const SUGGESTIONS = [
  'Design me a steel beam',
  'Design me a concrete column',
  'Calculate seismic loads',
  'Calculate wind loads',
];

export const PromptWorkspace: React.FC<PromptWorkspaceProps> = ({ project }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Once focused, the wave animation and glow are permanently disabled and will never wave again
  const [hasBeenFocused, setHasBeenFocused] = useState(false);

  // Single random suggestion chosen on load
  const [placeholder] = useState(() => {
    const randomOption = SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)];
    return `Try "${randomOption}"...`;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasStarted = messages.length > 0;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (hasStarted) {
      scrollToBottom();
    }
  }, [messages, isGenerating, hasStarted]);

  const handleSendPrompt = (promptText: string) => {
    const text = promptText.trim();
    if (!text || isGenerating) return;

    const userMsg: Message = {
      id: String(Date.now()),
      sender: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsGenerating(true);

    setTimeout(() => {
      let response = '';
      const lower = text.toLowerCase();

      if (lower.includes('steel beam') || lower.includes('beam')) {
        response = `**AISC 360-16 Steel Beam Design**\n\n• **Span**: $L = 24.0\\text{ ft}$, Unbraced Length $L_b = 8.0\\text{ ft}$\n• **Loads**: $w_D = 1.1\\text{ k/ft}$, $w_L = 2.2\\text{ k/ft}$\n• **Selected Section**: **W18×40** (ASTM A992, $F_y = 50\\text{ ksi}$)\n  - Moment Demand $M_u = 279\\text{ k-ft} \\le \\phi M_n = 294\\text{ k-ft}$ (D/C = 0.95)\n  - Live Load Deflection $\\Delta_{LL} = L/420 \\le L/360$ (Pass)\n  - Shear Demand $V_u = 46.5\\text{ kips} \\le \\phi V_n = 169\\text{ kips}$ (Pass)`;
      } else if (lower.includes('concrete column') || lower.includes('column')) {
        response = `**ACI 318-19 Tied Concrete Column Design**\n\n• **Dimensions**: $20\\text{ in} \\times 20\\text{ in}$ Square Column\n• **Concrete Strength**: $f'_c = 5,000\\text{ psi}$, Reinforcement $f_y = 60\\text{ ksi}$\n• **Factored Demand**: $P_u = 950\\text{ kips}$, $M_u = 185\\text{ k-ft}$\n• **Reinforcement Ratio**: $\\rho_g = 2.0\\%$ (8 #9 longitudinal bars)\n• **Ties**: #4 ties @ $16\\text{ in}$ o.c. (meets seismic confinement requirements)`;
      } else if (lower.includes('seismic')) {
        response = `**ASCE 7-22 Equivalent Lateral Force (ELF) Seismic Calculation**\n\n• **Location Parameters**: $S_s = 1.35\\text{g}$, $S_1 = 0.52\\text{g}$, Site Class D\n• **Design Spectral Accelerations**: $S_{DS} = 0.99\\text{g}$, $S_{D1} = 0.62\\text{g}$\n• **Seismic Design Category**: **SDC D**\n• **Response Modification Factor**: $R = 8$ (Special Moment Frame)\n• **Seismic Response Coefficient**: $C_s = 0.0825$\n• **Total Effective Weight**: $W = 12,450\\text{ kips}$\n• **Calculated Base Shear**: $V = C_s W = 1,027\\text{ kips}$`;
      } else if (lower.includes('wind')) {
        response = `**ASCE 7-22 Directional Wind Load Analysis**\n\n• **Basic Wind Speed**: $V = 115\\text{ mph}$, Risk Category II\n• **Exposure Category**: C, Elevation $z_g = 900\\text{ ft}$\n• **Velocity Pressure at Roof**: $q_z = 32.4\\text{ psf}$\n• **Windward Pressure Coefficient**: $C_p = 0.8$\n• **Leeward Pressure Coefficient**: $C_p = -0.5$\n• **Total Design Wind Base Shear**: $V_w = 418\\text{ kips}$`;
      } else if (project.selectedFile) {
        response = `Inspecting **\`${project.selectedFile.name}\`**.\n\nParsed structural definitions and boundary conditions. Ready to run calculations or automate verification routines.`;
      } else {
        response = `Received prompt: "${text}". Querying structural standards and local project models to formulate the engineering calculation.`;
      }

      const agentMsg: Message = {
        id: String(Date.now() + 1),
        sender: 'agent',
        content: response,
      };

      setMessages((prev) => [...prev, agentMsg]);
      setIsGenerating(false);
    }, 700);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendPrompt(input);
  };

  return (
    <main className="flex-1 h-full flex flex-col bg-[#03070d] text-hud-text relative overflow-hidden select-none">
      {/* Messages Stream Area (Fills pane once conversation starts) */}
      <div
        className={`flex-1 overflow-y-auto transition-all duration-700 ease-in-out ${
          hasStarted
            ? 'opacity-100 p-4 sm:p-6 md:p-8'
            : 'opacity-0 max-h-0 pointer-events-none p-0 overflow-hidden'
        }`}
      >
        <div className="max-w-3xl w-full mx-auto space-y-6">
          {messages.map((msg) =>
            msg.sender === 'user' ? (
              <div
                key={msg.id}
                className="flex justify-end transition-opacity duration-300"
              >
                <div className="max-w-2xl px-4 py-3 rounded-lg text-sm leading-relaxed bg-[#071322] border border-[#0e2236] text-hud-text">
                  <div className="whitespace-pre-wrap select-text font-sans">{msg.content}</div>
                </div>
              </div>
            ) : (
              <div
                key={msg.id}
                className="w-full transition-opacity duration-300 py-1"
              >
                <div className="text-sm leading-relaxed text-hud-text whitespace-pre-wrap select-text font-sans">
                  {msg.content}
                </div>
              </div>
            )
          )}

          {/* Thinking State */}
          {isGenerating && (
            <div className="flex items-center space-x-2 py-2 text-xs text-hud-text">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00c8e6]" />
              <span className="font-mono text-[11px] text-[#44596d]">Processing calculations...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Top Spacer to keep prompt dead-center when empty */}
      <div
        className={`transition-all duration-700 ease-in-out ${
          hasStarted ? 'flex-0 h-0' : 'flex-1'
        }`}
      />

      {/* Center Section: Headline + Prompt Bar */}
      <div
        className={`w-full transition-all duration-700 ease-in-out shrink-0 ${
          hasStarted
            ? 'px-4 sm:px-6 md:px-8 pb-4 sm:pb-6 md:pb-8 pt-2 bg-transparent'
            : 'max-w-xl mx-auto px-4 py-0'
        }`}
      >
        <div className={`w-full mx-auto transition-all duration-700 ${hasStarted ? 'max-w-3xl' : 'max-w-xl'}`}>
          {/* Headline above the prompt: left-justified over prompt input */}
          <div
            className={`transition-all duration-700 ease-in-out text-left ${
              hasStarted
                ? 'opacity-0 max-h-0 pointer-events-none scale-95 overflow-hidden -translate-y-3 mb-0'
                : 'opacity-100 max-h-24 scale-100 mb-6'
            }`}
          >
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-hud-text">
              What are we designing today, Charlie?
            </h1>
          </div>

          {/* Active File Reference Pill */}
          {project.selectedFile && (
            <div className="flex items-center space-x-1.5 text-xs text-[#44596d] mb-2 font-mono">
              <FileText className="w-3.5 h-3.5 text-[#00c8e6]" />
              <span>Target: </span>
              <span className="text-hud-text font-medium bg-[#071322] px-2 py-0.5 rounded border border-[#0e2236]">
                {project.selectedFile.name}
              </span>
            </div>
          )}

          {/* Ambient Glow Container: Once focused, wave is permanently extinguished and never waves again */}
          <div className={`prompt-glow-container w-full ${hasBeenFocused ? 'glow-extinguished' : ''}`}>
            {/* 1. Base ambient optical glow */}
            <div className="prompt-base-glow" />

            {/* 2. Perimeter wave shimmer (smoothly sweeps right; permanently stops on focus) */}
            <div className="prompt-shimmer-wave" />

            {/* 3. Input Form Box */}
            <form
              onSubmit={onSubmit}
              className="relative z-10 flex items-center rounded-xl bg-[#040b14] border border-[#00f0ff]/30 focus-within:border-[#00f0ff]/60 overflow-hidden shadow-lg transition-colors"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onFocus={() => setHasBeenFocused(true)}
                onChange={(e) => setInput(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-transparent pl-4 pr-12 py-3.5 text-sm text-hud-text placeholder-[#47647d] focus:outline-none font-mono"
              />
              <button
                type="submit"
                disabled={!input.trim() || isGenerating}
                className="absolute right-2.5 p-2 rounded-lg bg-[#00c8e6] hover:bg-[#38bdf8] disabled:opacity-20 disabled:hover:bg-[#00c8e6] text-[#03070d] transition-all"
                title="Execute Prompt"
              >
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Bottom Spacer to maintain dead-center alignment when empty */}
      <div
        className={`transition-all duration-700 ease-in-out ${
          hasStarted ? 'flex-0 h-0' : 'flex-1'
        }`}
      />
    </main>
  );
};
