import React, { useState, useRef, useEffect } from 'react';
import { FileText, Loader2, ArrowUp, Calculator } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { ProjectState } from '../types/fs';
import { streamChat, AGENT_BASE_URL } from '../services/agentApi';

export interface ToolCallRecord {
  tool: string;
  input?: Record<string, unknown>;
  output?: unknown;
}

interface Message {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  toolCalls?: ToolCallRecord[];
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
  const [toolStatus, setToolStatus] = useState<string | null>(null);

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
  }, [messages, isGenerating, toolStatus, hasStarted]);

  const handleSendPrompt = async (promptText: string) => {
    const text = promptText.trim();
    if (!text || isGenerating) return;

    const userMsg: Message = {
      id: String(Date.now()),
      sender: 'user',
      content: text,
    };

    const agentMsgId = String(Date.now() + 1);
    const initialAgentMsg: Message = {
      id: agentMsgId,
      sender: 'agent',
      content: '',
      toolCalls: [],
    };

    setMessages((prev) => [...prev, userMsg, initialAgentMsg]);
    setInput('');
    setIsGenerating(true);
    setToolStatus(null);

    try {
      await streamChat(
        { prompt: text },
        {
          onToken: (token) => {
            setToolStatus(null);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId ? { ...m, content: m.content + token } : m
              )
            );
          },
          onToolStart: (toolName, toolInput) => {
            const friendlyName = toolName === 'max_moment_ss_beam'
              ? 'Calculating simply supported beam max moment...'
              : `Running ${toolName}...`;
            setToolStatus(friendlyName);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId
                  ? {
                      ...m,
                      toolCalls: [
                        ...(m.toolCalls || []),
                        { tool: toolName, input: toolInput },
                      ],
                    }
                  : m
              )
            );
          },
          onToolEnd: (toolName, output) => {
            setToolStatus('Formulating engineering explanation...');
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId
                  ? {
                      ...m,
                      toolCalls: (m.toolCalls || []).map((tc) =>
                        tc.tool === toolName && tc.output === undefined
                          ? { ...tc, output }
                          : tc
                      ),
                    }
                  : m
              )
            );
          },
          onDone: () => {
            setToolStatus(null);
            setIsGenerating(false);
          },
          onError: (err) => {
            setToolStatus(null);
            setIsGenerating(false);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId
                  ? {
                      ...m,
                      content:
                        m.content ||
                        `⚠️ Error from agent: ${err.message}`,
                    }
                  : m
              )
            );
          },
        }
      );
    } catch (err: unknown) {
      setToolStatus(null);
      setIsGenerating(false);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentMsgId
            ? {
                ...m,
                content:
                  m.content ||
                  `⚠️ Could not connect to Python sidecar on ${AGENT_BASE_URL}.\nMake sure the agent daemon is running (\`cd agent && uv run start-agent\`).\nError: ${errorMessage}`,
              }
            : m
        )
      );
    }
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
            ) : (msg.content || (msg.toolCalls && msg.toolCalls.length > 0)) ? (
              <div
                key={msg.id}
                className="w-full transition-opacity duration-300 py-1 space-y-3"
              >
                {/* Permanent Tool Execution Cards */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="space-y-2">
                    {msg.toolCalls.map((tc, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-[#0d2a45] bg-[#040e1b] overflow-hidden text-xs font-mono shadow-sm"
                      >
                        <div className="flex items-center justify-between px-3.5 py-2 bg-[#06162a] border-b border-[#0d2a45]">
                          <div className="flex items-center space-x-2 text-[#00c8e6]">
                            <Calculator className="w-3.5 h-3.5 text-[#00c8e6]" />
                            <span className="font-semibold text-hud-text">
                              {tc.tool === 'max_moment_ss_beam'
                                ? 'Simply Supported Beam Moment Calculator'
                                : tc.tool}
                            </span>
                          </div>
                          <span className="text-[10px] uppercase tracking-wider text-[#436480] font-sans">
                            Deterministic Calculation
                          </span>
                        </div>
                        <div className="p-3 space-y-1.5 text-[#8ba2b9]">
                          {tc.input && Object.keys(tc.input).length > 0 && (
                            <div className="flex items-baseline space-x-2">
                              <span className="text-[#436480] min-w-[55px]">Inputs:</span>
                              <span className="text-hud-text">
                                {Object.entries(tc.input)
                                  .map(([k, v]) => `${k} = ${v}`)
                                  .join(', ')}
                              </span>
                            </div>
                          )}
                          {tc.output !== undefined && (
                            <div className="flex items-baseline space-x-2">
                              <span className="text-[#436480] min-w-[55px]">Result:</span>
                              <span className="text-[#00e5a3] font-semibold">
                                {typeof tc.output === 'object'
                                  ? JSON.stringify(tc.output)
                                  : `${tc.output} kip·ft`}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Markdown + LaTeX Body */}
                {msg.content && (
                  <div className="text-sm leading-relaxed text-hud-text select-text font-sans">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
                      components={{
                        p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                        code: ({ children }) => (
                          <code className="bg-[#05111e] border border-[#0d2847] px-1.5 py-0.5 rounded text-[#00c8e6] font-mono text-xs">
                            {children}
                          </code>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            ) : null
          )}

          {/* Thinking / Calculation State */}
          {isGenerating && (
            <div className="flex items-center space-x-2 py-2 text-xs text-hud-text">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00c8e6]" />
              <span className="font-mono text-[11px] text-[#44596d]">
                {toolStatus || 'Thinking...'}
              </span>
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
                placeholder={hasStarted ? 'Prompt Statikor' : placeholder}
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
