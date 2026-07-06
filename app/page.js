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

function newSessionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}`;
}

function formatRelativeTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const SUGGESTIONS = [
  "Summarize my uploaded document",
  "Explain this concept in simple terms",
  "Help me draft a professional email",
];

export default function Home() {
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState("default");
  const [recentChats, setRecentChats] = useState([]);
  const [chatSearch, setChatSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const attachMenuRef = useRef(null);
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);
  const loadingPhrases = ["Thinking", "Searching", "Reading documents", "Reasoning", "Writing answer"];

  const fetchRecentChats = async () => {
    try {
      const res = await fetch("/api/sessions");
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
      setRecentChats(data.sessions || []);
    } catch {
      setRecentChats([]);
    }
  };

  useEffect(() => {
    setSessionId(newSessionId());
    fetchRecentChats();
  }, []);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!showAttachMenu) return;
    const onPointerDown = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showAttachMenu]);

  const activeChatTitle =
    recentChats.find((c) => c.id === sessionId)?.title || "New conversation";

  const started = messages.length > 0;

  // Filter the sidebar list live as the user types in the search box
  const filteredChats = recentChats.filter((chat) =>
    chat.title.toLowerCase().includes(chatSearch.toLowerCase())
  );

  const loadChat = async (id) => {
    if (loading || id === sessionId) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error(data.detail || "Could not load chat.");
      }
      setSessionId(id);
      setMessages(data.messages || []);
      setInput("");
      setSelectedFile(null);
      setShowAttachMenu(false);
      setSidebarOpen(false);
    } catch (err) {
      setMessages([{ role: "assistant", text: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

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
    setSessionId(newSessionId());
    setSidebarOpen(false);
  };

  const handleFilePicked = (file) => {
    if (!file) return;
    setSelectedFile(file);
    setShowAttachMenu(false);
  };

  const fetchDocuments = async () => {
    setDocsLoading(true);
    try {
      const res = await fetch("/api/documents");
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
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

    // If this is the very first message, add this chat to the sidebar
    if (!started) {
      const title = (input || attachedName || "New chat").slice(0, 40);
      setRecentChats((prev) => [
        { id: sessionId, title, updated_at: new Date().toISOString() },
        ...prev.filter((c) => c.id !== sessionId),
      ]);
    }

    setInput("");
    setSelectedFile(null);
    setLoading(true);

    const formData = new FormData();
    if (input.trim()) formData.append("message", input);
    if (attachedFile) formData.append("file", attachedFile);
    formData.append("session_id", sessionId);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const raw = await res.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(
          raw?.slice(0, 200) || `Server error (${res.status}). Is the Python backend running?`
        );
      }
      if (!res.ok) {
        const detail = data.detail ?? data.error ?? "Request failed.";
        const message = typeof detail === "string" ? detail : JSON.stringify(detail);
        throw new Error(message.length > 300 ? `${message.slice(0, 300)}...` : message);
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.response, steps: data.steps || [] },
      ]);
      if (data.session_id) {
        setSessionId(data.session_id);
      }
      fetchRecentChats();
    } catch (err) {
      // If this was cancelled by "New Chat", stay silent — state was already reset
      if (err.name !== "AbortError") {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: `Error: ${err.message}` },
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
      case "menu":
        return (
          <svg {...common}>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        );
      default:
        return null;
    }
  };

  const attachOptions = [
    { icon: "file", tint: "#EEF2FF", ink: "#4338CA", label: "Upload file", action: () => fileInputRef.current?.click() },
    { icon: "book", tint: "#ECFDF5", ink: "#047857", label: "Document library", action: () => { setShowAttachMenu(false); toggleLibrary(); } },
    { icon: "clock", tint: "#FDF2F8", ink: "#BE185D", label: "Search chats", action: () => { setShowAttachMenu(false); setShowSearch(true); } },
    { icon: "plus", tint: "#F5F3FF", ink: "#6D28D9", label: "New chat", action: startNewChat },
  ];

  const canSend = (input.trim() || selectedFile) && !loading;

  const sidebarContent = (
    <>
      <div className="p-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
            style={{ background: "linear-gradient(135deg, #818CF8, #4338CA)" }}
          >
            <Icon name="sparkle" className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-lg font-display font-semibold text-[#1A1A1E] leading-tight">
              AI Agent
            </h1>
            <p className="text-[11px] text-[#8A8F98]">Document-aware assistant</p>
          </div>
        </div>
      </div>

      <div className="p-4 border-b border-[var(--border)]">
        <button
          onClick={startNewChat}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 font-medium text-sm rounded-xl text-white shadow-sm hover:shadow-md active:scale-[0.98] transition-all"
          style={{ background: "linear-gradient(135deg, #6366F1, #4338CA)" }}
        >
          <Icon name="plus" className="w-4 h-4" />
          New chat
        </button>
      </div>

      <div className="p-4 border-b border-[var(--border)] space-y-2">
        <button
          onClick={() => setShowSearch((s) => !s)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
            showSearch ? "bg-[#EEF2FF] text-[#4338CA]" : "text-[#6B7280] hover:bg-[#F4F4F6] hover:text-[#1A1A1E]"
          }`}
        >
          <Icon name="search" className="w-4 h-4" />
          Search chats
        </button>
        {showSearch && (
          <input
            autoFocus
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            placeholder="Filter conversations..."
            className="w-full text-sm bg-white border border-[var(--border)] rounded-lg px-3 py-2 outline-none focus:border-[#A5B4FC] focus:ring-2 focus:ring-[#EEF2FF] transition"
          />
        )}
        <button
          onClick={toggleLibrary}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
            showLibrary ? "bg-[#ECFDF5] text-[#047857]" : "text-[#6B7280] hover:bg-[#F4F4F6] hover:text-[#1A1A1E]"
          }`}
        >
          <Icon name="book" className="w-4 h-4" />
          Document library
        </button>
        {showLibrary && (
          <div className="bg-[#FAFAFB] border border-[var(--border)] rounded-xl p-3 text-xs text-[#6B7280] space-y-2 max-h-36 overflow-y-auto chat-scroll">
            {docsLoading && <p className="text-[#B0B4BB] animate-pulse">Loading documents...</p>}
            {!docsLoading && documents.length === 0 && (
              <p className="text-[#C4C7CD]">No documents uploaded yet</p>
            )}
            {documents.map((d) => (
              <div key={d.name} className="flex items-center gap-2">
                <Icon name="file" className="w-3.5 h-3.5 shrink-0 text-[#A5B4FC]" />
                <span className="truncate flex-1">{d.name}</span>
                <span className="text-[#C4C7CD] shrink-0">{d.chunks} chunks</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 flex-1 overflow-y-auto chat-scroll min-h-0">
        <p className="text-[10px] font-semibold tracking-widest text-[#B0B4BB] mb-3 px-1 uppercase">
          Recent
        </p>
        {filteredChats.length === 0 ? (
          <p className="text-xs text-[#C4C7CD] px-1 leading-relaxed">
            {recentChats.length === 0
              ? "Your conversations will appear here."
              : "No chats match your search."}
          </p>
        ) : (
          <div className="space-y-1">
            {filteredChats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                onClick={() => loadChat(chat.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-all group ${
                  chat.id === sessionId
                    ? "bg-[#EEF2FF] text-[#4338CA] shadow-sm"
                    : "text-[#6B7280] hover:bg-[#F4F4F6] hover:text-[#1A1A1E]"
                }`}
              >
                <p className="text-sm truncate font-medium">{chat.title}</p>
                <p className="text-[10px] text-[#B0B4BB] mt-0.5 group-hover:text-[#8A8F98]">
                  {formatRelativeTime(chat.updated_at)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-[var(--background)] text-[#1A1A1E] overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-[280px] bg-[var(--sidebar)] border-r border-[var(--border)] flex flex-col shadow-xl md:shadow-none transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Top bar */}
        <header className="shrink-0 flex items-center gap-3 px-4 md:px-6 py-3 border-b border-[var(--border)] bg-white/80 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-[#6B7280] hover:bg-[#F4F4F6]"
          >
            <Icon name="menu" className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {started ? activeChatTitle : "AI Agent"}
            </p>
            {started && (
              <p className="text-[11px] text-[#8A8F98]">
                {loading ? "Thinking..." : `${messages.length} messages`}
              </p>
            )}
          </div>
        </header>

        {/* Chat body */}
        <div
          className="flex-1 overflow-y-auto chat-scroll relative"
          style={{
            background:
              "radial-gradient(circle at 20% 0%, rgba(165,180,252,0.12) 0%, transparent 45%), radial-gradient(circle at 80% 100%, rgba(129,140,248,0.08) 0%, transparent 40%)",
          }}
        >
          {!started ? (
            <div className="h-full flex flex-col items-center justify-center px-6 pb-32">
              <div
                className="absolute top-1/4 w-56 h-56 rounded-full blur-3xl -z-10 animate-glow-pulse"
                style={{
                  background:
                    "radial-gradient(circle, rgba(165,180,252,0.4) 0%, transparent 70%)",
                }}
              />
              <h2 className="text-4xl md:text-5xl font-display font-semibold text-center text-[#1A1A1E] mb-2">
                How can I help?
              </h2>
              <p className="text-[#8A8F98] text-center max-w-md mb-10 text-sm md:text-base">
                Ask questions, upload PDFs or DOCX files, and get answers powered by AI.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInput(s)}
                    className="text-left text-sm px-4 py-3.5 rounded-2xl border border-[var(--border)] bg-white hover:border-[#C7D2FE] hover:bg-[#FAFAFF] hover:shadow-sm transition-all text-[#4B5563]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-6">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex items-end gap-3 animate-fade-in-up ${
                    m.role === "user" ? "flex-row-reverse" : ""
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                      m.role === "user"
                        ? "bg-gradient-to-br from-[#C7D2FE] to-[#A5B4FC]"
                        : "bg-gradient-to-br from-[#818CF8] to-[#4338CA] text-white"
                    }`}
                  >
                    {m.role === "user" ? (
                      <span className="text-[10px] font-bold text-[#312E81]">You</span>
                    ) : (
                      <Icon name="sparkle" className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div
                    className={`max-w-[85%] md:max-w-[75%] ${
                      m.role === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`px-4 py-3 leading-relaxed text-[15px] shadow-sm ${
                        m.role === "user"
                          ? "bg-[var(--bubble-user)] text-[#312E81] rounded-2xl rounded-br-md"
                          : "bg-[var(--bubble-assistant)] text-[#1A1A1E] rounded-2xl rounded-bl-md border border-[var(--border)]"
                      }`}
                    >
                      {m.role === "assistant" && m.steps && m.steps.length > 0 && (
                        <details className="mb-3 group">
                          <summary className="text-xs text-[#8A8F98] cursor-pointer select-none list-none flex items-center gap-1.5 hover:text-[#4338CA] transition-colors">
                            <span className="inline-block transition-transform group-open:rotate-90">▸</span>
                            {m.steps.length} step{m.steps.length !== 1 ? "s" : ""} taken
                          </summary>
                          <div className="mt-2 pl-3 border-l-2 border-[#EEF2FF] space-y-1 text-xs text-[#A8ACB4]">
                            {m.steps.map((s, idx) => (
                              <div key={idx}>{s}</div>
                            ))}
                          </div>
                        </details>
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
                        <div className="flex items-center gap-1.5 text-xs text-[#8A8F98] mt-2 pt-2 border-t border-[#E8E8ED]">
                          <Icon name="paperclip" className="w-3 h-3" />
                          {m.fileName}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-3 px-1 animate-fade-in-up">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#818CF8] to-[#4338CA] flex items-center justify-center">
                    <Icon name="sparkle" className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white border border-[var(--border)] shadow-sm">
                    <div className="flex items-center gap-2 text-sm text-[#8A8F98]">
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#818CF8] animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#818CF8] animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#818CF8] animate-bounce [animation-delay:300ms]" />
                      </span>
                      <span key={loadingPhraseIndex}>{loadingPhrases[loadingPhraseIndex]}</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="shrink-0 px-4 md:px-6 pb-5 pt-2 bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent">
          <div
            ref={attachMenuRef}
            className="relative max-w-3xl mx-auto bg-white border border-[var(--border)] rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] focus-within:border-[#A5B4FC] focus-within:shadow-[0_4px_28px_rgba(99,102,241,0.12)] transition-all"
          >
            {selectedFile && (
              <div className="mx-3 mt-3 flex items-center gap-2 bg-[#F4F4F6] rounded-xl px-3 py-2 text-xs text-[#3A3A3F]">
                <Icon name="paperclip" className="w-3.5 h-3.5 text-[#8A8F98]" />
                <span className="truncate flex-1">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="text-[#B0B4BB] hover:text-[#6B7280] p-0.5"
                >
                  <Icon name="x" className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-end gap-1 p-2">
              <button
                type="button"
                onClick={() => setShowAttachMenu((v) => !v)}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors shrink-0 ${
                  showAttachMenu
                    ? "bg-[#EEF2FF] text-[#4338CA]"
                    : "text-[#8A8F98] hover:bg-[#F4F4F6] hover:text-[#4338CA]"
                }`}
              >
                <Icon name="plus" className="w-5 h-5" />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.txt,.md,.csv,.json"
                onChange={(e) => handleFilePicked(e.target.files?.[0])}
              />

              <textarea
                rows={1}
                className="flex-1 px-2 py-2.5 outline-none bg-transparent placeholder:text-[#B0B4BB] resize-none max-h-32 text-[15px] leading-relaxed"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message AI Agent..."
              />

              <button
                type="button"
                onClick={sendMessage}
                disabled={!canSend}
                className={`w-10 h-10 flex items-center justify-center rounded-xl shrink-0 transition-all ${
                  canSend
                    ? "bg-[#4338CA] text-white hover:bg-[#3730A3] shadow-sm hover:shadow-md active:scale-95"
                    : "bg-[#E5E5EA] text-[#B0B4BB] cursor-not-allowed"
                }`}
              >
                <Icon name="send" className="w-4 h-4" />
              </button>
            </div>

            {showAttachMenu && (
              <div className="absolute bottom-full left-2 mb-2 bg-white border border-[var(--border)] shadow-[0_12px_40px_rgba(0,0,0,0.1)] rounded-2xl py-2 w-56 z-10 animate-fade-in-up">
                {attachOptions.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={opt.action}
                    className="w-full flex items-center gap-3 px-3 py-2.5 mx-1 rounded-xl hover:bg-[#F4F4F6] text-sm text-[#3A3A3F] transition-colors"
                    style={{ width: "calc(100% - 8px)" }}
                  >
                    <span
                      className="w-8 h-8 flex items-center justify-center rounded-full shrink-0"
                      style={{ background: opt.tint, color: opt.ink }}
                    >
                      <Icon name={opt.icon} className="w-4 h-4" />
                    </span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-center text-[10px] text-[#C4C7CD] mt-2">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </main>
    </div>
  );
}