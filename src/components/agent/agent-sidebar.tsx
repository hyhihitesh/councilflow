"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";
import { X, Zap, Send, Loader2, ChevronRight, AlertCircle } from "lucide-react";

type AgentSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

type ToolPart = {
  type: string;
  toolCallId: string;
  toolName?: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function ToolCard({ part }: { part: ToolPart }) {
  const isDone = part.state === "output" || part.state === "result";
  const isError = !!part.errorText;

  const toolLabels: Record<string, string> = {
    listProspects: "Querying Prospects",
    getMetrics: "Fetching Metrics",
    runResearch: "Triggering Research",
    draftOutreach: "Generating Drafts",
    movePipelineStage: "Moving Pipeline Stage",
  };

  const label = toolLabels[part.toolName ?? ""] ?? (part.toolName ?? "Tool call");

  return (
    <div className={`my-1.5 rounded border px-3 py-2 ${isError ? "border-red-100 bg-red-50" : "border-[#EBE8E0] bg-[#F7F6F2]"}`}>
      <div className="flex items-center gap-2">
        {!isDone ? (
          <Loader2 className="w-3 h-3 text-[#A19D94] animate-spin flex-shrink-0" />
        ) : isError ? (
          <AlertCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
        ) : (
          <div className="w-1.5 h-1.5 rounded-full bg-[#6B705C] flex-shrink-0" />
        )}
        <p className={`text-[10px] uppercase tracking-widest font-medium ${isError ? "text-red-600" : "text-[#716E68]"}`}>
          {isDone ? (isError ? `✗ ${label}` : `✓ ${label}`) : label}
        </p>
      </div>
      {isDone && part.output != null && !isError && (
        <p className="mt-1 text-[10px] text-[#A19D94] leading-relaxed font-mono break-all">
          {String(JSON.stringify(part.output)).slice(0, 120)}...
        </p>
      )}
      {isError && (
        <p className="mt-1 text-[10px] text-red-500">{part.errorText}</p>
      )}
    </div>
  );
}

const SUGGESTIONS = [
  "List my top qualified prospects",
  "Show my dashboard metrics",
  "Draft outreach for my newest prospect",
];

export function AgentSidebar({ isOpen, onClose }: AgentSidebarProps) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const submit = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    sendMessage({ text });
    setInput("");
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/10 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-0 right-0 h-full w-80 bg-[#FDFCFB] border-l border-[#EBE8E0] shadow-xl z-40
          flex flex-col transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBE8E0] bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-[#2C2A26] flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-[#F7F6F2]" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#2C2A26] tracking-tight">CouncilFlow AI</p>
              <div className="flex items-center gap-1">
                <div className={`w-1 h-1 rounded-full ${isStreaming ? "bg-amber-400 animate-pulse" : "bg-emerald-500"}`} />
                <p className="text-[9px] uppercase tracking-widest text-[#A19D94]">
                  {isStreaming ? "Thinking..." : "Ready"}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded text-[#A19D94] hover:text-[#2C2A26] hover:bg-[#F7F6F2] transition-all"
            aria-label="Close agent"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="w-10 h-10 rounded-sm bg-[#2C2A26] flex items-center justify-center mx-auto mb-4">
                <Zap className="w-5 h-5 text-[#F7F6F2]" />
              </div>
              <p className="text-xs font-medium text-[#2C2A26] mb-1">Your AI Agent</p>
              <p className="text-[11px] text-[#A19D94] leading-relaxed mb-6 max-w-[200px] mx-auto">
                I can research prospects, draft outreach, and manage your pipeline.
              </p>
              <div className="space-y-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      sendMessage({ text: s });
                    }}
                    className="w-full text-left px-3 py-2 rounded border border-[#EBE8E0] bg-white hover:border-[#D5D1C6] hover:bg-[#FDFCFB] transition-all text-[10px] text-[#716E68] font-medium flex items-center justify-between group"
                  >
                    <span>{s}</span>
                    <ChevronRight className="w-3 h-3 text-[#D5D1C6] group-hover:text-[#A19D94] transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`
                  max-w-[88%] text-[12px] leading-relaxed
                  ${message.role === "user"
                    ? "bg-[#2C2A26] text-[#F7F6F2] px-3 py-2 rounded-sm rounded-br-none"
                    : "text-[#2C2A26] w-full"
                  }
                `}
              >
                {message.parts?.map((part, i) => {
                  if (part.type === "text") {
                    return (
                      <p key={i} className="whitespace-pre-wrap">
                        {(part as { type: "text"; text: string }).text}
                      </p>
                    );
                  }
                  if (part.type.startsWith("tool-")) {
                    return (
                      <ToolCard
                        key={i}
                        part={part as unknown as ToolPart}
                      />
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ))}

          {isStreaming && messages[messages.length - 1]?.role === "user" && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 px-2 py-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#A19D94] animate-bounce [animation-delay:0ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-[#A19D94] animate-bounce [animation-delay:150ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-[#A19D94] animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded border border-red-100 bg-red-50 text-red-700">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <p className="text-[10px]">
                {error.message || "Something went wrong. Check that AI_GATEWAY_API_KEY is set."}
              </p>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="border-t border-[#EBE8E0] bg-white px-4 py-3"
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Ask about prospects, draft outreach..."
              disabled={isStreaming}
              rows={1}
              className="flex-1 resize-none bg-[#F7F6F2] border border-[#EBE8E0] rounded px-3 py-2 text-[12px] text-[#2C2A26] placeholder:text-[#A19D94] focus:outline-none focus:border-[#2C2A26] transition-all disabled:opacity-50 max-h-32 overflow-y-auto"
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded bg-[#2C2A26] text-[#F7F6F2] hover:bg-[#4A4742] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {isStreaming ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <p className="mt-1.5 text-[9px] text-[#D5D1C6] text-center">
            ↵ to send · Shift+↵ for new line
          </p>
        </form>
      </aside>
    </>
  );
}
