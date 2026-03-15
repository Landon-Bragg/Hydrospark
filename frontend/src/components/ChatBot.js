import React, { useState, useRef, useEffect } from 'react';
import { sendChat } from '../services/api';

const WELCOME = 'Hi! Ask me about your water usage, bills, forecasts, or alerts.';

function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: 'assistant', content: WELCOME }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    // Pass history excluding the initial welcome message
    const history = newMessages.slice(1, -1);

    try {
      const res = await sendChat(text, history);
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
          style={{ height: '420px' }}
        >
          <div className="text-white px-4 py-3 rounded-t-2xl flex items-center gap-2 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1EA7D6 0%, #0A4C78 100%)' }}>
            <span className="text-lg">💧</span>
            <div>
              <p className="font-bold text-sm">HydroBot</p>
              <p className="text-xs opacity-75">Ask about usage, bills &amp; more</p>
            </div>
          </div>

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
            <div ref={bottomRef} />
          </div>

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
              onClick={send}
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
