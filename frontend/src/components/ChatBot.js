import React, { useState, useRef, useEffect } from 'react';
import { sendChat } from '../services/api';
import { useAuth } from '../context/AuthContext';

const WELCOME = "Hi! I'm HydroBot. I can answer questions about your water usage, bills, forecasts, and account. Try one of the suggestions below or type your own question.";

const CUSTOMER_SUGGESTIONS = [
  "What's my current balance?",
  "Show my last 3 months of usage",
  "Do I have any active alerts?",
  "What's my forecasted usage?",
  "How is my bill calculated?",
  "What does CCF mean?",
];

const ADMIN_SUGGESTIONS = [
  "Show system overview",
  "Which accounts are delinquent?",
  "What are the current billing rates?",
  "What triggers an anomaly alert?",
  "What does a pending shutoff mean?",
];

function ChatBot() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: 'assistant', content: WELCOME }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  const suggestions = user?.role === 'customer' ? CUSTOMER_SUGGESTIONS : ADMIN_SUGGESTIONS;

  // Pick which suggestions to show after the latest response.
  // On the welcome message show all. After each exchange rotate a set of 4
  // so the chips feel fresh without needing AI context.
  const visibleSuggestions = (() => {
    const assistantCount = messages.filter(m => m.role === 'assistant').length;
    if (assistantCount <= 1) return suggestions;                        // initial: show all
    const lastUserText = messages.filter(m => m.role === 'user').slice(-1)[0]?.content;
    const pool = suggestions.filter(s => s !== lastUserText);           // drop just-asked
    const offset = ((assistantCount - 1) * 3) % pool.length;
    const shown = [];
    for (let i = 0; shown.length < 4; i++) shown.push(pool[(offset + i) % pool.length]);
    return shown;
  })();

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || loading) return;

    const newMessages = [...messages, { role: 'user', content: trimmed }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    const history = newMessages.slice(1, -1);

    try {
      const res = await sendChat(trimmed, history);
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.response }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I'm unavailable right now." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full text-white flex items-center justify-center text-xl transition-all duration-200"
        style={{
          background: open
            ? 'linear-gradient(135deg, #0A4C78 0%, #062d47 100%)'
            : 'linear-gradient(135deg, #1EA7D6 0%, #0A4C78 100%)',
          boxShadow: open
            ? '0 4px 20px rgba(10, 76, 120, 0.45)'
            : '0 4px 24px rgba(30, 167, 214, 0.50), 0 0 0 1px rgba(30, 167, 214, 0.20)',
        }}
        title="HydroBot"
      >
        {open ? '✕' : '💧'}
      </button>

      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col"
          style={{ height: '460px' }}
        >
          {/* Header */}
          <div className="text-white px-4 py-3 rounded-t-2xl flex items-center gap-2 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #1EA7D6 0%, #0A4C78 100%)' }}>
            <span className="text-lg">💧</span>
            <div>
              <p className="font-bold text-sm">HydroBot</p>
              <p className="text-xs opacity-75">Water billing assistant</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-xs px-3 py-2 rounded-xl text-sm leading-snug ${
                    m.role === 'user'
                      ? 'text-white rounded-br-sm'
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  }`}
                  style={m.role === 'user' ? { background: 'linear-gradient(135deg, #1EA7D6, #0A4C78)' } : {}}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-400 px-3 py-2 rounded-xl rounded-bl-sm text-sm">
                  <span className="animate-pulse">• • •</span>
                </div>
              </div>
            )}

            {/* Suggestion chips — repopulate after every assistant response */}
            {!loading && messages[messages.length - 1]?.role === 'assistant' && (
              <div className="pt-1 flex flex-wrap gap-1.5">
                {visibleSuggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs px-2.5 py-1.5 rounded-full border transition-all"
                    style={{
                      borderColor: 'rgba(30,167,214,0.35)',
                      color: '#0A4C78',
                      background: 'rgba(30,167,214,0.06)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(30,167,214,0.14)';
                      e.currentTarget.style.borderColor = 'rgba(30,167,214,0.6)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(30,167,214,0.06)';
                      e.currentTarget.style.borderColor = 'rgba(30,167,214,0.35)';
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-2 border-t border-gray-200 flex gap-2 flex-shrink-0">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask a question..."
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-hydro-spark-blue"
              disabled={loading}
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="text-white px-3 py-2 rounded-lg text-sm disabled:opacity-40 transition-all"
              style={{ background: 'linear-gradient(135deg, #1EA7D6, #0A4C78)' }}
            >
              &#8594;
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default ChatBot;
