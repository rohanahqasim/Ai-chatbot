"use client";
import { useState, useRef, useEffect } from "react";

// Renders a fenced ```lang ... ``` block as a real code box with a working copy button.
function CodeBlock({ lang, content }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable — silently ignore
    }
  };

  return (
    <div className="my-2 rounded-xl overflow-hidden border border-[#2A2A32] bg-[#1E1E24] text-left">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#26262E] text-xs text-[#9CA3AF]">
        <span className="uppercase tracking-wide">{lang || "code"}</span>
        <button
          onClick={handleCopy}
          className="hover:text-white transition-colors"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-sm text-[#E5E7EB] leading-relaxed">
        <code>{content}</code>
      </pre>
    </div>
  );
}

// Splits assistant text on ```lang\n...\n``` fences into ordered text/code segments.
function parseMessageContent(text) {
  if (!text) return [{ type: "text", content: "" }];
  const segments = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "code", lang: match[1], content: match[2].replace(/\n$/, "") });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }
  return segments;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recentChats, setRecentChats] = useState([
    "Physics Lab",
    "Data Analysis",
    "Project Alpha",
  ]);
  const [chatSearch, setChatSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);
  const loadingPhrases = ["Thinking", "Searching", "Reading documents", "Reasoning", "Writing answer"];

  useEffect(() => {
    if (!loading) {
      setLoadingPhraseIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingPhraseIndex((i) => (i + 1) % loadingPhrases.length);
    }, 1000);
    return () => clearInterval(interval);
  }, [loading]);

  const started = messages.length > 0;

  // Filter the sidebar list live as the user types in the search box
  const filteredChats = recentChats.filter((c) =>
    c.toLowerCase().includes(chatSearch.toLowerCase())
  );

  const startNewChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setMessages([]);
    setInput("");
    setSelectedFile(null);
    setShowAttachMenu(false);
    setLoading(false);
  };

  const handleFilePicked = (file) => {
    if (!file) return;
    setSelectedFile(file);
    setShowAttachMenu(false);
  };

  const fetchDocuments = async () => {
    setDocsLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:8001/api/documents");
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch {
      setDocuments([]);
    } finally {
      setDocsLoading(false);
    }
  };

  const toggleLibrary = () => {
    const next = !showLibrary;
    setShowLibrary(next);
    if (next) fetchDocuments();
  };

  const sendMessage = async () => {
    if (!input.trim() && !selectedFile) return;

    const attachedFile = selectedFile;
    const attachedName = attachedFile?.name;

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        text: input || `Attached: ${attachedName}`,
        fileName: attachedName,
      },
    ]);

    // If this is the very first message, promote it to a "recent chat"
    if (!started) {
      const title = (input || attachedName || "New chat").slice(0, 30);
      setRecentChats((prev) => [title, ...prev]);
    }

    setInput("");
    setSelectedFile(null);
    setLoading(true);

    const formData = new FormData();
    if (input.trim()) formData.append("message", input);
    if (attachedFile) formData.append("file", attachedFile);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("http://127.0.0.1:8001/api/chat", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.response, steps: data.steps || [] },
      ]);
    } catch (err) {
      // If this was cancelled by "New Chat", stay silent — state was already reset
      if (err.name !== "AbortError") {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: "Error connecting to backend." },
        ]);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const Icon = ({ name, className }) => {
    const common = {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.7,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      className,
    };
    switch (name) {
      case "search":
        return (
          <svg {...common}>
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        );
      case "image":
        return (
          <svg {...common}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        );
      case "book":
        return (
          <svg {...common}>
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        );
      case "notebook":
        return (
          <svg {...common}>
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <path d="M8 3v18" />
            <path d="M12 8h5M12 12h5M12 16h5" />
          </svg>
        );
      case "clock":
        return (
          <svg {...common}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
        );
      case "plus":
        return (
          <svg {...common}>
            <path d="M12 5v14M5 12h14" />
          </svg>
        );
      case "paperclip":
        return (
          <svg {...common}>
            <path d="M21 12.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" />
          </svg>
        );
      case "send":
        return (
          <svg {...common}>
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        );
      case "sparkle":
        return (
          <svg {...common} fill="currentColor" stroke="none">
            <path d="M12 2l1.8 5.9L20 10l-6.2 2.1L12 18l-1.8-5.9L4 10l6.2-2.1L12 2z" />
          </svg>
        );
      case "x":
        return (
          <svg {...common}>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        );
      case "file":
        return (
          <svg {...common}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
        );
      default:
        return null;
    }
  };

  const attachOptions = [
    { icon: "file", tint: "#EEF2FF", ink: "#4338CA", label: "Upload File", action: () => fileInputRef.current?.click() },
    { icon: "book", tint: "#ECFDF5", ink: "#047857", label: "Documents", action: () => { setShowAttachMenu(false); toggleLibrary(); } },
    { icon: "notebook", tint: "#FFFBEB", ink: "#B45309", label: "Notebook", action: () => alert("Hook this up to your notebook store.") },
    { icon: "clock", tint: "#FDF2F8", ink: "#BE185D", label: "History", action: () => { setShowAttachMenu(false); setShowSearch(true); } },
    { icon: "plus", tint: "#F5F3FF", ink: "#6D28D9", label: "New Chat", action: startNewChat },
  ];

  return (
    <div className="flex h-screen bg-white text-[#1A1A1E]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap');
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes glow {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.08); }
        }
        .msg-in { animation: fadeInUp 0.35s ease-out; }
        ::selection { background: #E0E7FF; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #E5E5EA; border-radius: 999px; }
        ::-webkit-scrollbar-thumb:hover { background: #D1D1D8; }
      `}</style>
      {/* Sidebar */}
      <aside className="w-64 border-r border-[#F0F0F2] bg-[#FAFAFB] flex flex-col">
        <div className="p-6 pb-5 border-b border-[#EEEEF1]">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
              style={{ background: "linear-gradient(135deg, #818CF8, #4338CA)" }}
            >
              <Icon name="sparkle" className="w-4 h-4" />
            </div>
            <h1
              className="text-xl text-[#1A1A1E]"
              style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }}
            >
              AI Agent
            </h1>
          </div>
        </div>

        <div className="p-6 py-5 border-b border-[#EEEEF1]">
          <button
            onClick={startNewChat}
            className="w-full flex items-center gap-2 text-left py-2.5 px-3 font-medium text-sm rounded-xl bg-white border border-[#EEEEF1] shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:border-[#C7D2FE] hover:text-[#4338CA] active:scale-[0.98] transition-all"
          >
            <Icon name="plus" className="w-4 h-4" />
            New Chat
          </button>
        </div>

        <nav className="p-6 py-5 border-b border-[#EEEEF1] space-y-1 text-sm font-medium text-[#8A8F98]">
          <div
            className="hover:text-[#1A1A1E] hover:bg-white cursor-pointer flex items-center gap-2.5 px-2 py-2 rounded-lg border-l-2 border-transparent hover:border-[#A5B4FC] transition-all"
            onClick={() => setShowSearch((s) => !s)}
          >
            <Icon name="search" className="w-4 h-4" />
            Search Chats
          </div>
          {showSearch && (
            <input
              autoFocus
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder="Type to filter..."
              className="w-full text-sm bg-white border border-[#EEEEF1] rounded-lg px-3 py-1.5 outline-none focus:border-[#A5B4FC] focus:ring-2 focus:ring-[#EEF2FF] transition"
            />
          )}
          <div className="hover:text-[#1A1A1E] hover:bg-white cursor-pointer flex items-center gap-2.5 px-2 py-2 rounded-lg border-l-2 border-transparent hover:border-[#A5B4FC] transition-all">
            <Icon name="image" className="w-4 h-4" />
            Images
          </div>
          <div
            className="hover:text-[#1A1A1E] hover:bg-white cursor-pointer flex items-center gap-2.5 px-2 py-2 rounded-lg border-l-2 border-transparent hover:border-[#A5B4FC] transition-all"
            onClick={toggleLibrary}
          >
            <Icon name="book" className="w-4 h-4" />
            Library
          </div>
          {showLibrary && (
            <div className="bg-white border border-[#EEEEF1] rounded-lg p-3 text-xs text-[#6B7280] space-y-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              {docsLoading && <p className="text-[#B0B4BB]">Loading...</p>}
              {!docsLoading && documents.length === 0 && (
                <p className="text-[#C4C7CD]">No documents uploaded yet</p>
              )}
              {documents.map((d) => (
                <div key={d.name} className="flex justify-between truncate">
                  <span className="truncate">{d.name}</span>
                  <span className="text-[#C4C7CD] ml-2 shrink-0">{d.chunks}</span>
                </div>
              ))}
            </div>
          )}
          <div className="hover:text-[#1A1A1E] hover:bg-white cursor-pointer flex items-center gap-2.5 px-2 py-2 rounded-lg border-l-2 border-transparent hover:border-[#A5B4FC] transition-all">
            <Icon name="notebook" className="w-4 h-4" />
            Notebooks
          </div>
        </nav>

        <div className="p-6 pt-5 flex-1 overflow-y-auto">
          <p className="text-[11px] font-semibold tracking-wide text-[#B0B4BB] mb-3 px-2">RECENT CHATS</p>
          {filteredChats.length === 0 ? (
            <p className="text-xs text-[#C4C7CD] px-2">No matching chats</p>
          ) : (
            filteredChats.map((c, idx) => (
              <div
                key={idx}
                className="text-sm py-2 px-2 rounded-lg cursor-pointer truncate hover:bg-white hover:text-[#1A1A1E] text-[#6B7280] border-l-2 border-transparent hover:border-[#A5B4FC] transition-all"
              >
                {c}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main
        className={`flex-1 flex flex-col p-6 transition-all duration-500 ${
          started ? "justify-between" : "justify-center items-center"
        }`}
        style={{
          backgroundImage: "radial-gradient(#F0F0F3 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        {!started && (
          <div className="relative flex flex-col items-center mb-10">
            <div
              className="absolute -top-8 w-40 h-40 rounded-full blur-3xl -z-10"
              style={{
                background: "radial-gradient(circle, rgba(165,180,252,0.35) 0%, rgba(255,255,255,0) 70%)",
                animation: "glow 4s ease-in-out infinite",
              }}
            ></div>
            <h1
              className="text-5xl text-center text-[#1A1A1E]"
              style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }}
            >
              AI Agent
            </h1>
            <div
              className="mt-3 h-[2px] w-12 rounded-full"
              style={{ background: "linear-gradient(90deg, #A5B4FC, #818CF8)" }}
            ></div>
          </div>
        )}

        {started && (
          <div className="w-full max-w-2xl mx-auto flex-1 overflow-y-auto space-y-5 px-1">
            {messages.map((m, i) => (
              <div key={i} className={`flex items-start gap-3 msg-in ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 mt-1"
                  style={{
                    background:
                      m.role === "user"
                        ? "linear-gradient(135deg, #C7D2FE, #A5B4FC)"
                        : "linear-gradient(135deg, #818CF8, #4338CA)",
                  }}
                >
                  {m.role === "user" ? (
                    <span className="text-[11px] font-semibold text-[#312E81]">You</span>
                  ) : (
                    <Icon name="sparkle" className="w-3.5 h-3.5" />
                  )}
                </div>
                <div
                  className={`p-4 leading-relaxed max-w-[80%] ${
                    m.role === "user"
                      ? "bg-[#EEF2FF] text-[#312E81] rounded-2xl rounded-tr-sm shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                      : "bg-[#FAFAFB] rounded-2xl rounded-tl-sm border border-[#F0F0F2]"
                  }`}
                >
                  {m.role === "assistant" && m.steps && m.steps.length > 0 && (
                    <div className="text-xs text-[#A8ACB4] mb-2.5 space-y-1 border-l-2 border-[#EEEEF1] pl-2.5">
                      {m.steps.map((s, idx) => (
                        <div key={idx}>{s}</div>
                      ))}
                    </div>
                  )}
                  {parseMessageContent(m.text).map((seg, idx) =>
                    seg.type === "code" ? (
                      <CodeBlock key={idx} lang={seg.lang} content={seg.content} />
                    ) : (
                      <span key={idx} className="whitespace-pre-wrap">
                        {seg.content}
                      </span>
                    )
                  )}
                  {m.fileName && (
                    <div className="flex items-center gap-1.5 text-xs text-[#8A8F98] mt-1.5">
                      <Icon name="paperclip" className="w-3 h-3" />
                      {m.fileName}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2.5 px-4 py-2 text-[#8A8F98] text-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#A5B4FC] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#818CF8]"></span>
                </span>
                <span key={loadingPhraseIndex} className="msg-in tracking-wide">
                  {loadingPhrases[loadingPhraseIndex]}
                  <span className="inline-block animate-pulse">...</span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Input Bar - centered on empty state, pinned to bottom once chat has started */}
        <div
          className={`relative w-full max-w-2xl bg-white border border-[#E5E5EA] rounded-full flex items-center p-2 shadow-[0_2px_10px_rgba(0,0,0,0.04)] focus-within:border-[#A5B4FC] focus-within:shadow-[0_2px_14px_rgba(99,102,241,0.12)] transition-all ${
            started ? "mt-4 mx-auto" : ""
          }`}
        >
          <button
            onClick={() => setShowAttachMenu((v) => !v)}
            className="w-9 h-9 flex items-center justify-center text-[#8A8F98] rounded-full hover:bg-[#F4F4F6] hover:text-[#4338CA] transition-colors"
          >
            <Icon name="plus" className="w-5 h-5" />
          </button>

          {/* hidden native file input, triggered from the menu */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => handleFilePicked(e.target.files[0])}
          />

          {showAttachMenu && (
            <div className="absolute bottom-14 left-0 bg-white border border-[#EEEEF1] shadow-[0_8px_24px_rgba(0,0,0,0.08)] rounded-2xl py-2 w-56 z-10 msg-in">
              {attachOptions.map((opt) => (
                <div
                  key={opt.label}
                  onClick={opt.action}
                  className="flex items-center gap-3 px-3 py-2.5 mx-1.5 rounded-xl hover:bg-[#F4F4F6] cursor-pointer text-sm text-[#3A3A3F] transition-colors"
                >
                  <span
                    className="w-7 h-7 flex items-center justify-center rounded-full shrink-0"
                    style={{ background: opt.tint, color: opt.ink }}
                  >
                    <Icon name={opt.icon} className="w-3.5 h-3.5" />
                  </span>
                  <span>{opt.label}</span>
                </div>
              ))}
            </div>
          )}

          {selectedFile && (
            <div className="absolute -top-11 left-4 bg-white border border-[#EEEEF1] text-xs px-3 py-1.5 rounded-full flex items-center gap-2 shadow-[0_2px_8px_rgba(0,0,0,0.06)] msg-in">
              <Icon name="paperclip" className="w-3 h-3 text-[#8A8F98]" />
              <span className="text-[#3A3A3F]">{selectedFile.name}</span>
              <button
                onClick={() => setSelectedFile(null)}
                className="text-[#B0B4BB] hover:text-[#6B7280]"
              >
                <Icon name="x" className="w-3 h-3" />
              </button>
            </div>
          )}

          <input
            className="flex-1 px-3 py-2 outline-none bg-transparent placeholder:text-[#B0B4BB]"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message AI Agent..."
          />
          <button
            onClick={sendMessage}
            className="w-10 h-10 flex items-center justify-center bg-[#1A1A1E] text-white rounded-full hover:bg-[#4338CA] hover:shadow-[0_4px_14px_rgba(67,56,202,0.35)] active:scale-95 transition-all"
          >
            <Icon name="send" className="w-4 h-4" />
          </button>
        </div>
      </main>
    </div>
  );
}