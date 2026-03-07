"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { Loader2, MessageSquare, Send, AtSign } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { getStaffRoleLabel } from "@/lib/team/staff-role";

type MessageItem = {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar_url?: string | null;
  content: string;
  created_at: string;
};

type MentionMember = {
  id: string;
  full_name: string;
  role: string;
};

type MessagesResponse = {
  success?: boolean;
  linked?: boolean;
  teamId?: string | null;
  currentUserId?: string;
  members?: MentionMember[];
  messages?: MessageItem[];
  error?: string;
};

type MentionToken = {
  query: string;
  start: number;
  end: number;
};

type SelectedMention = {
  id: string;
  full_name: string;
};

function getMentionToken(text: string, caretPosition: number): MentionToken | null {
  if (caretPosition < 0) return null;
  const beforeCaret = text.slice(0, caretPosition);
  const atIndex = beforeCaret.lastIndexOf("@");
  if (atIndex < 0) return null;

  // Mention should start at beginning or after whitespace/punctuation.
  if (atIndex > 0) {
    const previousChar = beforeCaret[atIndex - 1];
    if (previousChar && /[^\s([{-]/.test(previousChar)) {
      return null;
    }
  }

  const candidate = beforeCaret.slice(atIndex + 1);
  if (candidate.includes("\n") || /\s/.test(candidate)) {
    return null;
  }

  return {
    query: candidate,
    start: atIndex,
    end: caretPosition,
  };
}

export default function MessagesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [linked, setLinked] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [members, setMembers] = useState<MentionMember[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [draft, setDraft] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<SelectedMention[]>([]);
  const [mentionToken, setMentionToken] = useState<MentionToken | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
        setMembers([]);
        setTeamId(null);
        setCurrentUserId(payload.currentUserId || null);
        setLoading(false);
        return;
      }

      setLinked(true);
      setError(null);
      setTeamId(payload.teamId || null);
      setCurrentUserId(payload.currentUserId || null);
      setMembers(Array.isArray(payload.members) ? payload.members : []);
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

  const mentionSuggestions = useMemo(() => {
    if (!mentionToken) return [] as MentionMember[];
    const query = mentionToken.query.trim().toLowerCase();

    return members
      .filter((member) => member.id !== currentUserId)
      .filter((member) =>
        query.length === 0
          ? true
          : member.full_name.toLowerCase().includes(query),
      )
      .slice(0, 6);
  }, [currentUserId, members, mentionToken]);

  function updateMentionToken(nextDraft: string, caretPosition: number) {
    const token = getMentionToken(nextDraft, caretPosition);
    setMentionToken(token);
  }

  function handleDraftChange(nextValue: string) {
    setDraft(nextValue);
    const caretPosition = textareaRef.current?.selectionStart ?? nextValue.length;
    updateMentionToken(nextValue, caretPosition);
  }

  function applyMention(member: MentionMember) {
    if (!mentionToken) return;

    const before = draft.slice(0, mentionToken.start);
    const after = draft.slice(mentionToken.end);
    const mentionText = `@${member.full_name} `;
    const nextDraft = `${before}${mentionText}${after}`;
    const nextCaret = before.length + mentionText.length;

    setDraft(nextDraft);
    setMentionToken(null);
    setSelectedMentions((prev) => {
      if (prev.some((entry) => entry.id === member.id)) return prev;
      return [...prev, { id: member.id, full_name: member.full_name }];
    });

    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(nextCaret, nextCaret);
    });
  }

  async function handleSendMessage(e: { preventDefault(): void }) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;

    const mentionUserIds = selectedMentions
      .filter((mention) =>
        content.toLowerCase().includes(`@${mention.full_name.toLowerCase()}`),
      )
      .map((mention) => mention.id);

    setSending(true);
    setError(null);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, mentionUserIds }),
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
    setSelectedMentions([]);
    setMentionToken(null);
    setSending(false);
    await loadMessages(false);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  if (!linked) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-2xl py-12 text-center">
          <MessageSquare size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="font-semibold text-slate-700">Sem equipa associada</p>
          <p className="text-sm text-slate-500 mt-1">
            Liga-te a um escalão para usar mensagens da equipa técnica.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-5rem)] md:h-[calc(100dvh-1rem)] min-h-0 flex flex-col bg-white md:max-w-4xl md:mx-auto md:rounded-2xl md:border md:border-slate-200 md:mt-4">
      <div className="px-4 md:px-6 py-3 border-b bg-slate-50/70">
        <h1 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <MessageSquare size={16} className="text-slate-500" />
          Mensagens da Equipa Técnica
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Usa <span className="font-semibold">@</span> para mencionar colegas e gerar alerta específico.
        </p>
      </div>

      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 md:px-6 py-4 space-y-2 bg-slate-50/40"
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
                  className={`max-w-[88%] rounded-2xl px-3 py-2 shadow-sm ${
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

      <div className="border-t bg-white px-3 md:px-6 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3 sticky bottom-0 z-10">
        <div className="relative">
          {mentionToken && mentionSuggestions.length > 0 ? (
            <div className="absolute bottom-full mb-2 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-20">
              {mentionSuggestions.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="w-full text-left px-3 py-2.5 hover:bg-slate-50"
                  onClick={() => applyMention(member)}
                >
                  <p className="text-sm font-medium text-slate-800">
                    @{member.full_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {getStaffRoleLabel(member.role)}
                  </p>
                </button>
              ))}
            </div>
          ) : null}

          <form
            onSubmit={handleSendMessage}
            className="flex flex-col gap-2 md:flex-row md:items-end"
          >
            <div className="relative flex-1">
              <AtSign
                size={14}
                className="absolute left-2.5 top-2.5 text-slate-400 pointer-events-none"
              />
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => handleDraftChange(event.target.value)}
                onClick={(event) =>
                  updateMentionToken(
                    event.currentTarget.value,
                    event.currentTarget.selectionStart ?? event.currentTarget.value.length,
                  )
                }
                onKeyUp={(event) =>
                  updateMentionToken(
                    event.currentTarget.value,
                    event.currentTarget.selectionStart ?? event.currentTarget.value.length,
                  )
                }
                placeholder="Escreve uma mensagem para a equipa técnica..."
                maxLength={1200}
                disabled={sending}
                rows={2}
                className="w-full min-h-[48px] max-h-40 resize-none rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-base md:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <Button
              type="submit"
              className="h-10 w-full rounded-xl bg-emerald-600 px-4 font-semibold text-white hover:bg-emerald-700 md:h-11 md:min-w-[124px] md:w-auto md:rounded-2xl md:px-5 md:shadow-sm"
              disabled={sending || !draft.trim()}
            >
              {sending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>A enviar...</span>
                </>
              ) : (
                <>
                  <Send size={15} />
                  <span>Enviar</span>
                </>
              )}
            </Button>
          </form>
        </div>

        {error ? <p className="text-sm text-red-600 mt-2">{error}</p> : null}
      </div>
    </div>
  );
}
