import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StackRowViewProps {
  readonly marker?: ReactNode;
  readonly title: ReactNode;
  readonly summary?: ReactNode;
  readonly meta?: ReactNode;
  readonly tags?: ReactNode;
  readonly selected?: boolean;
  readonly className?: string;
}

type StackRowProps = StackRowViewProps &
  (
    | ({ readonly onClick: () => void } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title">)
    | ({ readonly onClick?: undefined } & Omit<HTMLAttributes<HTMLDivElement>, "title">)
  );

export function StackList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("stack-list", className)} {...props} />;
}

export function StackRow(props: StackRowProps) {
  const { marker, title, summary, meta, tags, selected, className, onClick, ...rest } = props;
  const classNames = cn(
    "stack-row",
    marker === undefined && "stack-row-no-marker",
    selected && "stack-row-selected",
    className,
  );
  const content = (
    <>
      {marker !== undefined && (
        <span className="stack-row-marker" aria-hidden="true">
          {marker}
        </span>
      )}
      <span className="stack-row-body">
        <span className="stack-row-title-line">
          <span className="stack-row-title">{title}</span>
          {meta !== undefined && <span className="stack-row-meta">{meta}</span>}
        </span>
        {summary !== undefined && <span className="stack-row-summary">{summary}</span>}
        {tags !== undefined && <span className="stack-row-tags">{tags}</span>}
      </span>
    </>
  );

  if (onClick === undefined) {
    return (
      <div {...(rest as HTMLAttributes<HTMLDivElement>)} className={classNames}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      className={classNames}
      onClick={onClick}
    >
      {content}
    </button>
  );
}
