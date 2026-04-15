import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toolCalls } from "./fixtures/transcript";
import { liveFrames } from "./fixtures/runtime";
import { missions } from "./fixtures/missions";
import type { Mission } from "./types";

type RedesignStateValue = {
  mission: Mission;
  missions: typeof missions;
  selectedTool: (typeof toolCalls)[number] | null;
  liveFrame: string;
  draftTitle: string;
  draftBrief: string;
  prompt: string;
  selectMission: (nextMission: Mission) => void;
  openTool: (toolId: string) => void;
  closeTool: () => void;
  setDraftTitle: (value: string) => void;
  setDraftBrief: (value: string) => void;
  setPrompt: (value: string) => void;
};

const RedesignStateContext = createContext<RedesignStateValue | null>(null);

export function RedesignStateProvider({ children }: { children: ReactNode }) {
  const [selectedMissionId, setSelectedMissionId] = useState(missions[0]!.id);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState(missions[0]!.title);
  const [draftBrief, setDraftBrief] = useState(missions[0]!.brief);
  const [prompt, setPrompt] = useState("");
  const [liveFrameIndex, setLiveFrameIndex] = useState(0);

  const mission = useMemo(
    () => missions.find((entry) => entry.id === selectedMissionId) ?? missions[0]!,
    [selectedMissionId],
  );

  const selectedTool = useMemo(
    () => toolCalls.find((entry) => entry.id === selectedToolId) ?? null,
    [selectedToolId],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveFrameIndex((index) => (index + 1) % liveFrames.length);
    }, 180);

    return () => window.clearInterval(timer);
  }, []);

  const value: RedesignStateValue = {
    mission,
    missions,
    selectedTool,
    liveFrame: liveFrames[liveFrameIndex]!,
    draftTitle,
    draftBrief,
    prompt,
    selectMission: (nextMission) => {
      setSelectedMissionId(nextMission.id);
      setDraftTitle(nextMission.title);
      setDraftBrief(nextMission.brief);
    },
    openTool: setSelectedToolId,
    closeTool: () => setSelectedToolId(null),
    setDraftTitle,
    setDraftBrief,
    setPrompt,
  };

  return <RedesignStateContext.Provider value={value}>{children}</RedesignStateContext.Provider>;
}

export function useRedesignState() {
  const value = useContext(RedesignStateContext);

  if (!value) {
    throw new Error("useRedesignState must be used inside RedesignStateProvider");
  }

  return value;
}
