/**
 * Briefing — jsx-md components for rendering the worker's system prompt.
 *
 * <Briefing> renders task + criteria + context into a structured section.
 * <WorkerPrompt> composes base prompt + briefing + report instructions.
 *
 * These are rendering functions called by the runtime (inside delegate),
 * not by the LLM. The LLM fills structured fields; the runtime renders.
 *
 * @jsxImportSource @theseus.run/jsx-md
 */

import type { VNode } from "@theseus.run/jsx-md";
import { Bold, Code, H2, Hr, Li, Md, P, Ul } from "@theseus.run/jsx-md";
import { report } from "./report.ts";
import type { DelegateInput } from "./types.ts";

// ---------------------------------------------------------------------------
// <Briefing> — renders task + criteria + context
// ---------------------------------------------------------------------------

export function Briefing({ task, criteria, context }: DelegateInput): VNode {
  return (
    <>
      <H2>Briefing</H2>
      <P>
        <Bold>Task:</Bold> {task}
      </P>
      {criteria.length > 0 && (
        <>
          <P>
            <Bold>Done when:</Bold>
          </P>
          <Ul>
            {criteria.map((c) => (
              <Li>{c}</Li>
            ))}
          </Ul>
        </>
      )}
      {context && (
        <>
          <P>
            <Bold>Context:</Bold>
          </P>
          <P>{context}</P>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// <WorkerPrompt> — full system prompt for a briefed worker
// ---------------------------------------------------------------------------

export function WorkerPrompt({
  basePrompt,
  briefing,
}: {
  readonly basePrompt: string;
  readonly briefing: DelegateInput;
}): VNode {
  return (
    <>
      <Md>{basePrompt}</Md>
      <Hr />
      <Briefing {...briefing} />
      <Hr />
      <P>
        When done, call the <Code>{report.name}</Code> tool:
      </P>
      <Ul>
        <Li>
          <Bold>success</Bold> — task completed, content is the deliverable
        </Li>
        <Li>
          <Bold>error</Bold> — not completed but you found actionable information
        </Li>
        <Li>
          <Bold>defect</Bold> — infrastructure broken, tools not working
        </Li>
      </Ul>
    </>
  );
}
