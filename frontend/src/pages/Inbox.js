import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getSupportThreads, getThreadMessages, sendToCustomer,
  getMyMessages, sendMyMessage,
  sendNotification, getNotifications, markNotificationRead, deleteNotification,
  getSentNotifications,
} from '../services/api';

// ── Shared helpers ────────────────────────────────────────────────────────────

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Staff Inbox (admin / billing) ─────────────────────────────────────────────

function StaffInbox() {
  const [tab, setTab] = useState('messages');
  const [threads, setThreads] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [compose, setCompose] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);

  // Notification form
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifTarget, setNotifTarget] = useState('all');
  const [notifUserId, setNotifUserId] = useState('');
  const [notifSending, setNotifSending] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState('');

  // Sent alerts history
  const [sentNotifs, setSentNotifs] = useState([]);
  const [sentLoading, setSentLoading] = useState(false);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadThreads();
    loadSentNotifs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadThreads = async () => {
    setLoading(true);
    try {
      const r = await getSupportThreads();
      setThreads(r.data.threads || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadSentNotifs = async () => {
    setSentLoading(true);
    try {
      const r = await getSentNotifications();
      setSentNotifs(r.data.sent_notifications || []);
    } catch (e) {
      console.error(e);
    } finally {
      setSentLoading(false);
    }
  };

  const selectThread = async (customerId) => {
    setSelectedCustomerId(customerId);
    setMsgLoading(true);
    try {
      const r = await getThreadMessages(customerId);
      setMessages(r.data.messages || []);
      // Refresh threads to reset unread count
      loadThreads();
    } catch (e) {
      console.error(e);
    } finally {
      setMsgLoading(false);
    }
  };

  const handleSend = async () => {
    if (!compose.trim() || !selectedCustomerId) return;
    setSending(true);
    try {
      const r = await sendToCustomer(selectedCustomerId, compose.trim());
      setMessages(prev => [...prev, r.data.message]);
      setCompose('');
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const handleSendNotification = async () => {
    if (!notifTitle.trim() || !notifMessage.trim()) return;
    if (notifTarget === 'specific' && !notifUserId) return;
    setNotifSending(true);
    setNotifSuccess('');
    try {
      const payload = { title: notifTitle.trim(), message: notifMessage.trim() };
      if (notifTarget === 'specific') payload.user_id = parseInt(notifUserId);
      const r = await sendNotification(payload);
      setNotifSuccess(`Alert sent to ${r.data.sent_to} user${r.data.sent_to !== 1 ? 's' : ''}.`);
      setNotifTitle('');
      setNotifMessage('');
      setNotifTarget('all');
      setNotifUserId('');
      loadSentNotifs();
    } catch (e) {
      console.error(e);
    } finally {
      setNotifSending(false);
    }
  };

  const selectedThread = threads.find(t => t.customer_id === selectedCustomerId);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-hydro-deep-aqua" style={{ letterSpacing: '-0.03em' }}>
          Support Inbox
        </h1>
        <p className="text-sm text-gray-400 mt-1">Communicate with customers and send alerts</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {['messages', 'alerts'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: tab === t ? 'rgba(10,76,120,0.12)' : 'transparent',
              color: tab === t ? '#0A4C78' : '#6b7280',
              border: tab === t ? '1px solid rgba(10,76,120,0.22)' : '1px solid transparent',
            }}
          >
            {t === 'messages' ? 'Messages' : 'Send Alert'}
          </button>
        ))}
      </div>

      {/* ── Messages tab ── */}
      {tab === 'messages' && (
        <div className="card p-0 overflow-hidden" style={{ display: 'flex', height: '600px' }}>
          {/* Thread list */}
          <div style={{
            width: '280px', flexShrink: 0, borderRight: '1px solid #e5e7eb',
            overflowY: 'auto', background: '#f9fafb',
          }}>
            <div className="p-3 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customers</p>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="hydro-spinner" />
              </div>
            ) : threads.length === 0 ? (
              <p className="text-sm text-gray-400 p-4">No customer accounts yet.</p>
            ) : (
              threads.map(thread => (
                <button
                  key={thread.customer_id}
                  onClick={() => selectThread(thread.customer_id)}
                  className="w-full text-left p-3 transition-all border-b border-gray-100"
                  style={{
                    background: selectedCustomerId === thread.customer_id
                      ? 'rgba(10,76,120,0.08)' : 'transparent',
                  }}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-800 truncate pr-2">
                      {thread.customer_name}
                    </span>
                    {thread.unread_count > 0 && (
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: '#0A4C78', color: '#fff' }}>
                        {thread.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center mt-0.5">
                    <p className="text-xs text-gray-400 truncate pr-2">
                      {thread.last_message
                        ? thread.last_message.content.slice(0, 40) + (thread.last_message.content.length > 40 ? '…' : '')
                        : 'No messages yet'}
                    </p>
                    <span className="text-xs text-gray-300 flex-shrink-0">
                      {thread.last_message ? formatTime(thread.last_message.created_at) : ''}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Message thread */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!selectedCustomerId ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Select a customer to view messages
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div className="px-4 py-3 border-b border-gray-200 bg-white">
                  <p className="font-semibold text-gray-800">{selectedThread?.customer_name}</p>
                  <p className="text-xs text-gray-400">ID: {selectedThread?.location_id}</p>
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                  {msgLoading ? (
                    <div className="flex justify-center py-8"><div className="hydro-spinner" /></div>
                  ) : messages.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 mt-8">
                      No messages yet. Start the conversation below.
                    </p>
                  ) : (
                    messages.map(msg => {
                      const isStaff = msg.sender_role !== 'customer';
                      return (
                        <div key={msg.id}
                          className={`flex mb-3 ${isStaff ? 'justify-end' : 'justify-start'}`}>
                          <div style={{
                            maxWidth: '70%',
                            padding: '8px 12px',
                            borderRadius: isStaff ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                            background: isStaff ? '#0A4C78' : '#f3f4f6',
                            color: isStaff ? '#fff' : '#1f2937',
                          }}>
                            <p className="text-sm" style={{ lineHeight: '1.4' }}>{msg.content}</p>
                            <p className="text-xs mt-1 opacity-60">{formatTime(msg.created_at)}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Compose */}
                <div className="p-3 border-t border-gray-200 bg-white flex gap-2">
                  <input
                    type="text"
                    value={compose}
                    onChange={e => setCompose(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Type a message…"
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !compose.trim()}
                    className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
                  >
                    {sending ? '…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Send Alert tab ── */}
      {tab === 'alerts' && (
        <div className="space-y-6 max-w-xl">
          {/* Compose form */}
          <div className="card">
            <h2 className="text-lg font-bold text-hydro-deep-aqua mb-4">Send Alert to Customers</h2>
            <p className="text-sm text-gray-500 mb-5">
              Alerts appear as notifications on the customer's dashboard and inbox.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Recipients</label>
                <div className="flex gap-3">
                  {['all', 'specific'].map(opt => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value={opt}
                        checked={notifTarget === opt}
                        onChange={() => setNotifTarget(opt)}
                      />
                      <span className="text-sm text-gray-700">
                        {opt === 'all' ? 'All customers' : 'Specific customer'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {notifTarget === 'specific' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                  <select
                    value={notifUserId}
                    onChange={e => setNotifUserId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                  >
                    <option value="">— Select a customer —</option>
                    {threads.filter(t => t.user_id).map(t => (
                      <option key={t.user_id} value={t.user_id}>
                        {t.customer_name} ({t.location_id})
                      </option>
                    ))}
                  </select>
                  {loading && <p className="text-xs text-gray-400 mt-1">Loading customers…</p>}
                  {!loading && threads.filter(t => t.user_id).length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">No customer accounts found.</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={notifTitle}
                  onChange={e => setNotifTitle(e.target.value)}
                  placeholder="e.g. Scheduled Maintenance"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={notifMessage}
                  onChange={e => setNotifMessage(e.target.value)}
                  rows={4}
                  placeholder="Write your alert message here…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 resize-none"
                />
              </div>

              {notifSuccess && (
                <div className="p-3 rounded-lg text-sm text-green-700 bg-green-50 border border-green-200">
                  {notifSuccess}
                </div>
              )}

              <button
                onClick={handleSendNotification}
                disabled={notifSending || !notifTitle.trim() || !notifMessage.trim() || (notifTarget === 'specific' && !notifUserId)}
                className="btn-primary w-full py-2.5 disabled:opacity-50"
              >
                {notifSending ? 'Sending…' : 'Send Alert'}
              </button>
            </div>
          </div>

          {/* Sent history */}
          <div className="card">
            <h2 className="text-lg font-bold text-hydro-deep-aqua mb-4">Sent Alert History</h2>
            {sentLoading ? (
              <div className="flex justify-center py-6"><div className="hydro-spinner" /></div>
            ) : sentNotifs.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No alerts sent yet.</p>
            ) : (
              <div className="space-y-3">
                {sentNotifs.map((n, i) => (
                  <div key={i} className="p-3 rounded-xl border border-gray-100 bg-gray-50">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{n.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium whitespace-nowrap flex-shrink-0">
                        {n.recipient_count} {n.recipient_count === 1 ? 'recipient' : 'recipients'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">{formatTime(n.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Customer Inbox ────────────────────────────────────────────────────────────

function CustomerInbox() {
  const [tab, setTab] = useState('notifications');
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState([]);
  const [compose, setCompose] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openNotif, setOpenNotif] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [notifsRes, msgsRes] = await Promise.all([
        getNotifications().catch(() => ({ data: { notifications: [] } })),
        getMyMessages().catch(() => ({ data: { messages: [] } })),
      ]);
      setNotifications(notifsRes.data.notifications || []);
      setMessages(msgsRes.data.messages || []);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id, e) => {
    e?.stopPropagation();
    try {
      await deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (openNotif?.id === id) setOpenNotif(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenNotif = (notif) => {
    setOpenNotif(notif);
    if (!notif.is_read) {
      handleMarkRead(notif.id);
      setOpenNotif({ ...notif, is_read: true });
    }
  };

  const handleSend = async () => {
    if (!compose.trim()) return;
    setSending(true);
    try {
      const r = await sendMyMessage(compose.trim());
      setMessages(prev => [...prev, r.data.message]);
      setCompose('');
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="hydro-spinner" />
      <p className="text-sm text-gray-400 font-medium">Loading inbox…</p>
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-hydro-deep-aqua" style={{ letterSpacing: '-0.03em' }}>
          My Inbox
        </h1>
        <p className="text-sm text-gray-400 mt-1">Notifications and messages from your utility provider</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('notifications')}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
          style={{
            background: tab === 'notifications' ? 'rgba(10,76,120,0.12)' : 'transparent',
            color: tab === 'notifications' ? '#0A4C78' : '#6b7280',
            border: tab === 'notifications' ? '1px solid rgba(10,76,120,0.22)' : '1px solid transparent',
          }}
        >
          Notifications
          {unreadCount > 0 && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: '#0A4C78', color: '#fff' }}>
              {unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('messages')}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: tab === 'messages' ? 'rgba(10,76,120,0.12)' : 'transparent',
            color: tab === 'messages' ? '#0A4C78' : '#6b7280',
            border: tab === 'messages' ? '1px solid rgba(10,76,120,0.22)' : '1px solid transparent',
          }}
        >
          Messages
        </button>
      </div>

      {/* ── Notifications ── */}
      {tab === 'notifications' && (
        <div className="space-y-3 max-w-2xl">
          {notifications.length === 0 ? (
            <div className="card text-center py-12 text-gray-400 text-sm">
              No notifications yet.
            </div>
          ) : (
            notifications.map(notif => (
              <div
                key={notif.id}
                className="card w-full transition-all hover:shadow-md cursor-pointer"
                style={{
                  borderLeft: notif.is_read ? '3px solid #e5e7eb' : '3px solid #0A4C78',
                  opacity: notif.is_read ? 0.7 : 1,
                }}
                onClick={() => handleOpenNotif(notif)}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {!notif.is_read && (
                        <span className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: '#0A4C78' }} />
                      )}
                      <p className="font-semibold text-gray-800">{notif.title}</p>
                    </div>
                    <p className="text-sm text-gray-600 mt-1 truncate">{notif.message}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      From {notif.created_by_name || 'HydroSpark'} · {formatTime(notif.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-400">Open →</span>
                    <button
                      onClick={(e) => handleDelete(notif.id, e)}
                      className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded"
                      title="Delete notification"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Notification detail modal */}
      {openNotif && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setOpenNotif(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4" style={{ background: '#0A4C78' }}>
              <p className="text-white font-bold text-lg">{openNotif.title}</p>
              <p className="text-blue-200 text-xs mt-0.5">
                From {openNotif.created_by_name || 'HydroSpark'} · {formatTime(openNotif.created_at)}
              </p>
            </div>
            <div className="px-6 py-5">
              <p className="text-gray-700 text-sm whitespace-pre-wrap" style={{ lineHeight: '1.6' }}>
                {openNotif.message}
              </p>
            </div>
            <div className="px-6 pb-5 flex justify-between items-center">
              <button
                onClick={() => handleDelete(openNotif.id)}
                className="text-sm font-medium px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition"
              >
                Delete
              </button>
              <button
                onClick={() => setOpenNotif(null)}
                className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Messages ── */}
      {tab === 'messages' && (
        <div className="card p-0 overflow-hidden max-w-2xl" style={{ display: 'flex', flexDirection: 'column', height: '500px' }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {messages.length === 0 ? (
              <p className="text-center text-sm text-gray-400 mt-8">
                No messages yet. Send a message below to contact support.
              </p>
            ) : (
              messages.map(msg => {
                const isMe = msg.sender_role === 'customer';
                return (
                  <div key={msg.id} className={`flex mb-3 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div style={{
                      maxWidth: '70%',
                      padding: '8px 12px',
                      borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      background: isMe ? '#0A4C78' : '#f3f4f6',
                      color: isMe ? '#fff' : '#1f2937',
                    }}>
                      {!isMe && (
                        <p className="text-xs font-semibold mb-1 opacity-60">
                          {msg.sender_name || 'Support'}
                        </p>
                      )}
                      <p className="text-sm" style={{ lineHeight: '1.4' }}>{msg.content}</p>
                      <p className="text-xs mt-1 opacity-60">{formatTime(msg.created_at)}</p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Compose */}
          <div className="p-3 border-t border-gray-200 flex gap-2">
            <input
              type="text"
              value={compose}
              onChange={e => setCompose(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Type a message to support…"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={handleSend}
              disabled={sending || !compose.trim()}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
            >
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Entry point ───────────────────────────────────────────────────────────────

function Inbox() {
  const { user } = useAuth();
  if (user?.role === 'customer') return <CustomerInbox />;
  return <StaffInbox />;
}

export default Inbox;
