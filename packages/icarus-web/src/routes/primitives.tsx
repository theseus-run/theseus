import { useState } from "react";
import { ActivityMark } from "@/components/ui/activity-mark";
import { Button } from "@/components/ui/button";
import { PayloadView } from "@/components/ui/payload-view";
import {
  SectionBlock,
  SectionBlockAction,
  SectionBlockBody,
  SectionBlockHeader,
  SectionBlockTitle,
} from "@/components/ui/section-block";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetMeta,
  SheetSection,
  SheetStack,
  SheetTitle,
} from "@/components/ui/sheet";
import { StackList, StackRow } from "@/components/ui/stack-list";
import { StatCell, StatGrid } from "@/components/ui/stat-grid";
import { StatusMark } from "@/components/ui/status-mark";
import { StatusStrip, StatusStripItem } from "@/components/ui/status-strip";
import {
  TitleBlock,
  TitleBlockEyebrow,
  TitleBlockMeta,
  TitleBlockSubtitle,
  TitleBlockTitle,
} from "@/components/ui/title-block";
import { Token } from "@/components/ui/token";
import { TreeView } from "@/components/ui/tree-view";

const samplePayload = {
  id: "sample-001",
  state: "done",
  nested: {
    count: 3,
    enabled: true,
  },
  notes: ["compact", "readable", "stable"],
};

export function PrimitivesPage() {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="workbench-shell h-full overflow-auto">
      <div className="workbench-frame primitives-page">
        <TitleBlock>
          <TitleBlockEyebrow>UI primitives</TitleBlockEyebrow>
          <TitleBlockTitle>Durable operator vocabulary.</TitleBlockTitle>
          <TitleBlockSubtitle>
            Neutral examples for lists, trees, sections, tags, payloads, and sheets.
          </TitleBlockSubtitle>
          <TitleBlockMeta>
            <Token tone="good">stable</Token>
            <Token>minimal</Token>
            <Token variant="plain">no product names</Token>
          </TitleBlockMeta>
        </TitleBlock>

        <div className="primitives-grid">
          <SectionBlock className="primitives-wide">
            <SectionBlockHeader>
              <SectionBlockTitle>composition stress</SectionBlockTitle>
              <SectionBlockAction>
                <ActivityMark>mixed</ActivityMark>
              </SectionBlockAction>
            </SectionBlockHeader>
            <SectionBlockBody>
              <TitleBlock>
                <TitleBlockEyebrow>nested title</TitleBlockEyebrow>
                <TitleBlockTitle>
                  Primitives should compose without layout surprises.
                </TitleBlockTitle>
                <TitleBlockSubtitle>
                  This section mixes title, stats, status, rows, tree, tags, and payload in one
                  operator surface.
                </TitleBlockSubtitle>
                <TitleBlockMeta>
                  <Token variant="plain">stacked</Token>
                  <Token variant="plain">nested</Token>
                  <Token variant="plain">wrapped</Token>
                </TitleBlockMeta>
              </TitleBlock>

              <StatusStrip>
                <StatusStripItem>queued 2</StatusStripItem>
                <StatusStripItem>running 1</StatusStripItem>
                <StatusStripItem>blocked 0</StatusStripItem>
                <StatusStripItem>done 8</StatusStripItem>
              </StatusStrip>

              <StatGrid>
                <StatCell label="progress" value="8/10" tone="good" />
                <StatCell label="active" value="1" tone="process" />
                <StatCell label="attention" value="0" />
                <StatCell label="depth" value="3" />
              </StatGrid>

              <StackList>
                <StackRow
                  title="row with inline activity"
                  summary="A row can carry live status, metadata, and tags without changing height unpredictably."
                  meta={<ActivityMark>working</ActivityMark>}
                  tags={
                    <>
                      <Token variant="plain">primary</Token>
                      <Token variant="plain" tone="process">
                        active
                      </Token>
                    </>
                  }
                />
                <StackRow
                  title="row with payload nearby"
                  summary="Payloads should live below rows or in sheets, not inside the row body."
                  meta="ready"
                />
              </StackList>

              <TreeView
                nodes={[
                  {
                    id: "mix-root",
                    title: "root surface",
                    summary: "contains sections",
                    meta: "done",
                    tags: <Token variant="plain">root</Token>,
                    children: [
                      {
                        id: "mix-child-a",
                        title: "list branch",
                        summary: "dense rows",
                        meta: "running",
                        tags: (
                          <Token variant="plain" tone="process">
                            active
                          </Token>
                        ),
                      },
                      {
                        id: "mix-child-b",
                        title: "payload branch",
                        summary: "detail content opens elsewhere",
                        meta: "ready",
                      },
                    ],
                  },
                ]}
              />

              <PayloadView
                value={{
                  state: "composed",
                  surfaces: ["title", "status", "stats", "list", "tree", "payload"],
                  rule: "large content becomes a nested inspector",
                }}
                format="json"
              />
            </SectionBlockBody>
          </SectionBlock>

          <SectionBlock>
            <SectionBlockHeader>
              <SectionBlockTitle>section</SectionBlockTitle>
              <SectionBlockAction>
                <Button size="sm" variant="ghost">
                  action
                </Button>
              </SectionBlockAction>
            </SectionBlockHeader>
            <SectionBlockBody>
              <p>
                Sections group one operator question. If content becomes large, it should open a
                deeper inspector instead of growing inline forever.
              </p>
            </SectionBlockBody>
          </SectionBlock>

          <SectionBlock>
            <SectionBlockHeader>
              <SectionBlockTitle>stats</SectionBlockTitle>
            </SectionBlockHeader>
            <SectionBlockBody>
              <StatGrid>
                <StatCell label="progress" value="3/4" tone="good" />
                <StatCell label="active" value="1" tone="process" />
                <StatCell label="blocked" value="0" />
                <StatCell label="failed" value="0" />
              </StatGrid>
            </SectionBlockBody>
          </SectionBlock>

          <SectionBlock>
            <SectionBlockHeader>
              <SectionBlockTitle>stack list</SectionBlockTitle>
            </SectionBlockHeader>
            <SectionBlockBody>
              <StackList>
                <StackRow
                  title="selected row"
                  summary="A dense text row with summary, metadata, and tags."
                  meta="done"
                  selected
                  tags={
                    <>
                      <Token variant="plain">primary</Token>
                      <Token variant="plain" tone="good">
                        ok
                      </Token>
                    </>
                  }
                />
                <StackRow
                  title="long row title that wraps without forcing horizontal scroll"
                  summary="Long summaries should wrap naturally without reserving icon space."
                  meta="running"
                  tags={<Token variant="plain">compact</Token>}
                  onClick={() => {}}
                />
                <StackRow title="static row" summary="Rows can be static or buttons." />
              </StackList>
            </SectionBlockBody>
          </SectionBlock>

          <SectionBlock>
            <SectionBlockHeader>
              <SectionBlockTitle>activity</SectionBlockTitle>
            </SectionBlockHeader>
            <SectionBlockBody>
              <div className="grid gap-[calc(var(--lh)/2)]">
                <StatusMark symbol="*" tone="good">
                  ready
                </StatusMark>
                <StatusMark symbol="!" tone="danger">
                  attention needed
                </StatusMark>
                <ActivityMark>processing</ActivityMark>
                <ActivityMark active={false} tone="muted">
                  idle
                </ActivityMark>
                <StatusStrip>
                  <StatusStripItem>queued 2</StatusStripItem>
                  <StatusStripItem>running 1</StatusStripItem>
                  <StatusStripItem>done 8</StatusStripItem>
                </StatusStrip>
              </div>
            </SectionBlockBody>
          </SectionBlock>

          <SectionBlock>
            <SectionBlockHeader>
              <SectionBlockTitle>tree</SectionBlockTitle>
            </SectionBlockHeader>
            <SectionBlockBody>
              <TreeView
                nodes={[
                  {
                    id: "root",
                    title: "root item",
                    summary: "topology root",
                    meta: "done",
                    selected: true,
                    children: [
                      {
                        id: "child-a",
                        title: "child item",
                        summary: "nested branch",
                        meta: "running",
                      },
                      {
                        id: "child-b",
                        title: "second child with a longer label",
                        summary: "connectors stay outside rows",
                        meta: "pending",
                        children: [
                          {
                            id: "grandchild",
                            title: "deep item",
                            summary: "still readable",
                            meta: "failed",
                          },
                        ],
                      },
                    ],
                  },
                ]}
              />
            </SectionBlockBody>
          </SectionBlock>

          <SectionBlock>
            <SectionBlockHeader>
              <SectionBlockTitle>tags</SectionBlockTitle>
            </SectionBlockHeader>
            <SectionBlockBody>
              <div className="title-block-meta">
                <Token>framed</Token>
                <Token tone="good">good</Token>
                <Token tone="process">process</Token>
                <Token tone="danger">danger</Token>
                <Token variant="plain" label="key" value="value" />
              </div>
            </SectionBlockBody>
          </SectionBlock>

          <SectionBlock>
            <SectionBlockHeader>
              <SectionBlockTitle>payload</SectionBlockTitle>
            </SectionBlockHeader>
            <SectionBlockBody>
              <PayloadView value={samplePayload} format="json" />
            </SectionBlockBody>
          </SectionBlock>

          <SectionBlock>
            <SectionBlockHeader>
              <SectionBlockTitle>sheet</SectionBlockTitle>
              <SectionBlockAction>
                <Button size="sm" onClick={() => setSheetOpen(true)}>
                  open
                </Button>
              </SectionBlockAction>
            </SectionBlockHeader>
            <SectionBlockBody>
              <p>Inspector surfaces reuse the same section and list vocabulary.</p>
            </SectionBlockBody>
          </SectionBlock>
        </div>

        <SheetStack>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent onDismissRequest={() => setSheetOpen(false)}>
              <Button
                variant="ghost"
                size="sm"
                className="sheet-close-button"
                onClick={() => setSheetOpen(false)}
              >
                close
              </Button>
              <SheetHeader>
                <div>
                  <SheetTitle>Inspector</SheetTitle>
                  <SheetMeta>
                    <Token>sheet</Token>
                    <Token tone="process">open</Token>
                  </SheetMeta>
                </div>
              </SheetHeader>
              <SheetBody>
                <SheetSection>
                  <p className="eyebrow">overview</p>
                  <StatusStrip>
                    <StatusStripItem>sheet</StatusStripItem>
                    <StatusStripItem>nested content</StatusStripItem>
                  </StatusStrip>
                  <StatGrid>
                    <StatCell label="items" value="3" />
                    <StatCell label="active" value="1" tone="process" />
                  </StatGrid>
                </SheetSection>
                <SheetSection>
                  <p className="eyebrow">activity</p>
                  <StackList>
                    <StackRow
                      title="inspector row"
                      summary="The sheet uses the same stack row primitive as the page."
                      meta={<ActivityMark active={false}>idle</ActivityMark>}
                    />
                    <StackRow
                      title="follow-up row"
                      summary="Nested details can become another sheet later."
                      meta="ready"
                    />
                  </StackList>
                </SheetSection>
                <SheetSection>
                  <p className="eyebrow">details</p>
                  <PayloadView value={samplePayload} format="json" />
                </SheetSection>
              </SheetBody>
            </SheetContent>
          </Sheet>
        </SheetStack>
      </div>
    </div>
  );
}
