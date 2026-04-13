/**
 * Home — mission list.
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { missions } from "@/lib/queries";
import type { MissionSummary } from "@/lib/queries";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function MissionRow({ mission }: { mission: MissionSummary }) {
  const to =
    mission.status === "defining"
      ? `/missions/${mission.id}/define`
      : `/missions/${mission.id}`;

  const statusColor = {
    defining: "text-yellow-400",
    active: "text-blue-400",
    closed: "text-zinc-500",
  }[mission.status];

  return (
    <Link
      to={to}
      className="flex items-baseline gap-2 px-4 py-2 hover:bg-secondary/50 transition-colors border-b border-border"
    >
      <span className={`shrink-0 ${statusColor}`}>
        [{mission.status}]
      </span>
      <span className="flex-1 text-foreground truncate">{mission.goal}</span>
      {mission.criteriaTotal > 0 && (
        <span className="text-muted-foreground shrink-0">
          [{mission.criteriaMet}/{mission.criteriaTotal}]
        </span>
      )}
      <span className="text-zinc-600 shrink-0 w-8 text-right">
        {timeAgo(mission.createdAt)}
      </span>
    </Link>
  );
}

export function MissionListPage() {
  const { data: allMissions = [], isLoading } = useQuery(missions.list());

  const active = allMissions.filter((m) => m.status !== "closed");
  const closed = allMissions.filter((m) => m.status === "closed");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        loading...
      </div>
    );
  }

  if (allMissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">-- no missions --</p>
        <Link
          to="/missions/new"
          className="btn"
        >
          + new mission
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {active.length > 0 && (
        <div>
          <div className="px-4 py-2 text-muted-foreground uppercase tracking-wider font-semibold">
            active
          </div>
          {active.map((m) => (
            <MissionRow key={m.id} mission={m} />
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <div>
          <div className="px-4 py-2 text-muted-foreground uppercase tracking-wider font-semibold mt-1">
            closed
          </div>
          {closed.map((m) => (
            <MissionRow key={m.id} mission={m} />
          ))}
        </div>
      )}
    </div>
  );
}
