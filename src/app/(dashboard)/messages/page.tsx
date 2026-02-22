"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type MessageItem = {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar_url?: string | null;
  content: string;
  created_at: string;
};

type MessagesResponse = {
  success?: boolean;
  linked?: boolean;
  teamId?: string | null;
  currentUserId?: string;
  messages?: MessageItem[];
  error?: string;
};

export default function MessagesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [linked, setLinked] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [draft, setDraft] = useState("");

  const listRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, []);

  const loadMessages = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);

      const res = await fetch("/api/messages?limit=200", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as MessagesResponse | null;

      if (!res.ok || !payload) {
        setError(payload?.error || "Erro ao carregar mensagens.");
        setLoading(false);
        return;
      }

      if (payload.linked === false) {
        setLinked(false);
        setMessages([]);
        setTeamId(null);
        setCurrentUserId(payload.currentUserId || null);
        setLoading(false);
        return;
      }

      setLinked(true);
      setError(null);
      setTeamId(payload.teamId || null);
      setCurrentUserId(payload.currentUserId || null);
      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
      setLoading(false);

      requestAnimationFrame(() => {
        scrollToBottom();
      });
    },
    [scrollToBottom],
  );

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      void loadMessages();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [loadMessages]);

  useEffect(() => {
    if (!teamId) return;

    const channel = supabase
      .channel(`team-chat:${teamId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "team_messages",
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          void loadMessages(false);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadMessages, supabase, teamId]);

  async function handleSendMessage(e: { preventDefault(): void }) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;

    setSending(true);
    setError(null);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const payload = (await res.json().catch(() => null)) as
      | { success?: boolean; error?: string }
      | null;

    if (!res.ok || !payload?.success) {
      setError(payload?.error || "Erro ao enviar mensagem.");
      setSending(false);
      return;
    }

    setDraft("");
    setSending(false);
    await loadMessages(false);
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  if (!linked) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="font-semibold text-slate-700">Sem equipa associada</p>
            <p className="text-sm text-slate-500 mt-1">
              Liga-te a um escalão para usar mensagens da equipa técnica.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare size={16} className="text-slate-500" />
            Mensagens da Equipa Técnica
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <div
            ref={listRef}
            className="h-[55vh] min-h-[320px] overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {messages.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">
                Ainda não existem mensagens.
              </p>
            ) : (
              messages.map((message) => {
                const mine = currentUserId === message.sender_id;
                return (
                  <div
                    key={message.id}
                    className={`flex ${mine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm ${
                        mine
                          ? "bg-emerald-600 text-white"
                          : "bg-white border border-slate-200 text-slate-800"
                      }`}
                    >
                      <p
                        className={`text-[11px] font-semibold ${
                          mine ? "text-emerald-100" : "text-slate-500"
                        }`}
                      >
                        {message.sender_name}
                      </p>
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.content}
                      </p>
                      <p
                        className={`text-[10px] mt-1 ${
                          mine ? "text-emerald-100" : "text-slate-400"
                        }`}
                      >
                        {format(parseISO(message.created_at), "d MMM · HH:mm", {
                          locale: pt,
                        })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Escreve uma mensagem para a equipa técnica..."
              maxLength={1200}
              disabled={sending}
            />
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={sending || !draft.trim()}
            >
              {sending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={15} />
              )}
            </Button>
          </form>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
