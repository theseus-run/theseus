/**
 * Define phase — chat with read-only Theseus to shape the mission.
 *
 * Left:  chat thread + input (ask_user questions, user answers)
 * Right: mission definition building up (goal, criteria, artifacts)
 */

import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import type { Mission } from "@/lib/queries";
import { missions } from "@/lib/queries";
import { makeLocalId } from "@/lib/time";

// ---------------------------------------------------------------------------
// Definition panel (right sidebar — same side as mission control)
// ---------------------------------------------------------------------------

function DefinitionPanel({ mission }: { mission: Mission }) {
  return (
    <div className="h-full overflow-y-auto p-4 border-l border-border">
      {/* Goal */}
      <div className="mb-6">
        <h3 className="text-muted-foreground uppercase tracking-wider mb-1 font-semibold">goal</h3>
        {mission.goal ? (
          <p className="text-foreground">{mission.goal}</p>
        ) : (
          <p className="text-muted-foreground italic">defining...</p>
        )}
      </div>

      {/* Criteria */}
      <div className="mb-6">
        <h3 className="text-muted-foreground uppercase tracking-wider mb-2 font-semibold">
          criteria
        </h3>
        {mission.criteria.length === 0 ? (
          <p className="text-zinc-600">-- none yet --</p>
        ) : (
          <ul className="space-y-1">
            {mission.criteria.map((c) => (
              <li key={c.text} className="flex items-start gap-1">
                <span className="shrink-0">
                  {c.status === "met" ? (
                    <span className="text-green-400">[x]</span>
                  ) : c.status === "failed" ? (
                    <span className="text-red-400">[!]</span>
                  ) : (
                    <span className="text-zinc-600">[ ]</span>
                  )}
                </span>
                <span className={c.status === "met" ? "text-green-400" : "text-foreground"}>
                  {c.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Artifacts */}
      <div className="mb-6">
        <h3 className="text-muted-foreground uppercase tracking-wider mb-2 font-semibold">
          artifacts
        </h3>
        {mission.artifacts.length === 0 ? (
          <p className="text-zinc-600">-- none --</p>
        ) : (
          <ul className="space-y-1">
            {mission.artifacts.map((a) => (
              <li key={`${a.source}:${a.ref}`}>
                <span className="text-zinc-600">[{a.direction === "input" ? "in" : "out"}]</span>{" "}
                <span className="text-muted-foreground">{a.source}:</span>{" "}
                <span className="text-foreground">{a.title || a.ref}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat thread + input (left)
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: "user" | "theseus";
  content: string;
}

function DefineChat({
  messages,
  onSend,
  lockReady,
  onLock,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  lockReady: boolean;
  onLock: () => void;
}) {
  const [input, setInput] = useState("");

  const handleSubmit = useCallback(() => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
  }, [input, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {messages.map((msg) => (
            <div key={msg.id} className="leading-relaxed">
              <span className={`mr-1 ${msg.role === "user" ? "text-foreground" : "text-blue-400"}`}>
                {msg.role === "user" ? "you>" : "theseus>"}
              </span>
              <span className={msg.role === "user" ? "text-foreground" : "text-muted-foreground"}>
                {msg.content}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Input + Lock */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground shrink-0">&gt;</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="answer or adjust..."
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {lockReady && (
            <button type="button" onClick={onLock} className="btn btn-confirm">
              lock
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DefinePage() {
  const { missionId } = useParams({ strict: false }) as { missionId: string };
  const navigate = useNavigate();
  const { data: mission } = useQuery(missions.detail(missionId));

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      role: "theseus",
      content: "I'll help define this mission. Let me look at the codebase first...",
    },
  ]);

  const handleSend = useCallback((text: string) => {
    setChatMessages((prev) => [...prev, { id: makeLocalId(), role: "user", content: text }]);
  }, []);

  const handleLock = useCallback(() => {
    navigate({ to: "/missions/$missionId", params: { missionId } });
  }, [missionId, navigate]);

  if (!mission) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        loading...
      </div>
    );
  }

  return (
    <div className="flex h-full ">
      {/* Chat + input (left, main area) */}
      <div className="flex-[2] min-w-0">
        <DefineChat
          messages={chatMessages}
          onSend={handleSend}
          lockReady={mission.criteria.length > 0}
          onLock={handleLock}
        />
      </div>

      {/* Definition panel (right sidebar) */}
      <div className="flex-[1] min-w-[280px] max-w-[400px]">
        <DefinitionPanel mission={mission} />
      </div>
    </div>
  );
}
