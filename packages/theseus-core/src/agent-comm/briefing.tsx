/** @jsxImportSource @theseus.run/jsx-md */

/**
 * Briefing — jsx-md components for rendering agent-comm orders.
 *
 * These are runtime rendering components. The protocol packet is structured;
 * this layer turns it into clear instructions for an LLM actor.
 */

import type { VNode } from "@theseus.run/jsx-md";
import { Bold, Code, H2, H3, Hr, Li, Md, P, Ul } from "@theseus.run/jsx-md";
import type { Order } from "./order.ts";
import { report } from "./report.ts";

const ListSection = ({
  title,
  items,
}: {
  readonly title: string;
  readonly items?: ReadonlyArray<string> | undefined;
}): VNode =>
  items && items.length > 0 ? (
    <>
      <P>
        <Bold>{title}:</Bold>
      </P>
      <Ul>
        {items.map((item) => (
          <Li>{item}</Li>
        ))}
      </Ul>
    </>
  ) : null;

export function OrderBriefing({ order }: { readonly order: Order }): VNode {
  return (
    <>
      <H2>Order</H2>
      <P>
        <Bold>Objective:</Bold> {order.objective}
      </P>
      {order.intent && (
        <P>
          <Bold>Intent:</Bold> {order.intent}
        </P>
      )}
      <ListSection title="Success criteria" items={order.successCriteria} />
      {order.bounds && (
        <>
          <H3>Bounds</H3>
          <ListSection title="Scope" items={order.bounds.scope} />
          <ListSection title="Constraints" items={order.bounds.constraints} />
        </>
      )}
      {order.authority && (
        <>
          <H3>Authority</H3>
          <ListSection title="Runtime grant refs" items={order.authority.grantRefs} />
          <ListSection title="Actions" items={order.authority.actions} />
          <ListSection title="Tools" items={order.authority.tools} />
          <ListSection title="Limits" items={order.authority.limits} />
          <ListSection title="Escalation" items={order.authority.escalation} />
        </>
      )}
      {order.context && order.context.length > 0 && (
        <>
          <H3>Context</H3>
          <Ul>
            {order.context.map((block) => (
              <Li>
                <Bold>{block.label ?? block.kind}:</Bold> {block.text}
              </Li>
            ))}
          </Ul>
        </>
      )}
      {order.expectedReport && (
        <P>
          <Bold>Expected report:</Bold> {order.expectedReport}
        </P>
      )}
    </>
  );
}

export function GruntPrompt({
  basePrompt,
  order,
}: {
  readonly basePrompt: string;
  readonly order: Order;
}): VNode {
  return (
    <>
      <Md>{basePrompt}</Md>
      <Hr />
      <OrderBriefing order={order} />
      <Hr />
      <H2>Terminal Protocol</H2>
      <P>
        When the order is complete, blocked, or defective, call <Code>{report.name}</Code> exactly
        once and then stop.
      </P>
      <Ul>
        <Li>
          <Bold>complete</Bold> — objective satisfied under the success criteria
        </Li>
        <Li>
          <Bold>blocked</Bold> — you operated correctly but cannot complete as ordered
        </Li>
        <Li>
          <Bold>defect</Bold> — protocol, runtime, tool, or infrastructure failure
        </Li>
      </Ul>
      <P>Include evidence when possible. Do not claim completion without evidence.</P>
      <P>
        If success criteria are supplied, report whether each criterion is satisfied, unsatisfied,
        or unknown, and link supporting evidence when possible.
      </P>
    </>
  );
}
