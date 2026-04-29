import type { ReactNode } from "react";
import { StackRow } from "./stack-list";

export interface TreeNodeModel {
  readonly id: string;
  readonly marker?: ReactNode;
  readonly title: ReactNode;
  readonly summary?: ReactNode;
  readonly meta?: ReactNode;
  readonly tags?: ReactNode;
  readonly selected?: boolean;
  readonly onClick?: () => void;
  readonly children?: ReadonlyArray<TreeNodeModel>;
}

export function TreeView({ nodes }: { readonly nodes: ReadonlyArray<TreeNodeModel> }) {
  return (
    <ul className="tree-view">
      {nodes.map((node) => (
        <TreeNode key={node.id} node={node} />
      ))}
    </ul>
  );
}

function TreeNode({ node }: { readonly node: TreeNodeModel }) {
  const children = node.children ?? [];
  return (
    <li className="tree-view-entry">
      <StackRow
        marker={node.marker}
        title={node.title}
        summary={node.summary}
        meta={node.meta}
        tags={node.tags}
        selected={node.selected}
        onClick={node.onClick}
      />
      {children.length > 0 && (
        <ul className="tree-view">
          {children.map((child) => (
            <TreeNode key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}
