"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Loader2, Send, Bot, User } from "lucide-react";

interface AiAdvisorProps {
  financialData: {
    entrate: number;
    uscite: number;
    tasse: number;
    regime: string;
  };
}

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function AiAdvisor({ financialData }: AiAdvisorProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Avvio automatico al caricamento
  useEffect(() => {
    if (messages.length === 0) {
      sendMessage(null, "Fai un'analisi super rapida della mia situazione di questo mese in 2-3 righe. Salutami come il mio 'AI Fiscal Advisor' e dammi un consiglio utile sui miei dati attuali.");
    }
  }, []); // Eseguito solo una volta

  const sendMessage = async (e?: React.FormEvent | null, customText?: string) => {
    if (e) e.preventDefault();
    
    const textToSend = customText || input;
    if (!textToSend.trim() && !customText) return;

    if (!customText) setInput(""); // Pulisci input solo se è l'utente a scrivere
    
    const newMessages = [...messages, { role: "user", content: textToSend } as Message];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/ai-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          financialData,
          messages: newMessages 
        }),
      });
      
      const data = await res.json();
      if (data.reply) {
        setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      }
    } catch (error) {
      console.error("AI Chat failed:", error);
      setMessages(prev => [...prev, { role: "assistant", content: "Scusa, ho riscontrato un errore di connessione." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ios-card h-[420px] max-h-[420px] flex flex-col p-4">
      <div className="flex items-center gap-2 mb-4 border-b border-black/5 dark:border-white/5 pb-3">
        <div className="p-2 bg-blue-500/10 rounded-lg">
          <Sparkles className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold m-0">AI Fiscal Advisor</h3>
          <p className="text-xs opacity-60 m-0">Assistente in tempo reale</p>
        </div>
      </div>

      {/* Area Messaggi */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-3 pr-2 mb-3">
        {messages.map((msg, idx) => {
          // Nascondiamo il primissimo messaggio dell'utente per evitare che veda il prompt tecnico
          if (idx === 0 && msg.role === "user") return null;

          return (
            <div key={idx} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === "user" ? "bg-black/10 dark:bg-white/10" : "bg-blue-500/20"}`}>
                {msg.role === "user" ? <User size={14} className="opacity-70" /> : <Bot size={14} className="text-blue-500" />}
              </div>
              <div className={`p-3 text-sm rounded-xl max-w-[85%] whitespace-pre-wrap break-words ${
                msg.role === "user" 
                  ? "bg-blue-500 text-white rounded-tr-none" 
                  : "bg-black/5 dark:bg-white/5 rounded-tl-none"
              }`}>
                {msg.content}
              </div>
            </div>
          );
        })}
        
        {loading && (
          <div className="flex gap-2 flex-row">
            <div className="w-6 h-6 rounded-full flex items-center justify-center bg-blue-500/20">
              <Bot size={14} className="text-blue-500" />
            </div>
            <div className="p-3 text-sm rounded-xl bg-black/5 dark:bg-white/5 rounded-tl-none">
              <Loader2 className="w-4 h-4 animate-spin opacity-50" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={sendMessage} className="flex gap-2 items-center">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Chiedi un consiglio o fai una simulazione..."
          className="flex-1 p-3 text-sm bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button 
          type="submit" 
          disabled={loading || !input.trim()}
          className="p-3 bg-blue-500 text-white rounded-xl disabled:opacity-50 transition-opacity"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
