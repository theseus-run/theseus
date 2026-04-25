/**
 * New mission — initial input.
 */

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { makeLocalId } from "@/lib/time";

export function NewMissionPage() {
  const navigate = useNavigate();
  const [goal, setGoal] = useState("");

  const handleSubmit = useCallback(() => {
    if (!goal.trim()) return;
    // TODO: call client.createMission(goal) -> returns missionId
    const stubId = makeLocalId("m-");
    navigate({ to: "/missions/$missionId/define", params: { missionId: stubId } });
  }, [goal, navigate]);

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
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="w-full max-w-2xl">
        <h1 className="text-muted-foreground uppercase tracking-wider mb-4 font-semibold">
          new mission
        </h1>

        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="what needs to be done?"
          rows={4}
          className="input"
        />

        <div className="flex items-center justify-between mt-2">
          <p className="text-zinc-600">paste links to issues, docs, etc.</p>
          <button type="button" onClick={handleSubmit} disabled={!goal.trim()} className="btn">
            start
          </button>
        </div>
      </div>
    </div>
  );
}
