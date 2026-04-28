import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface RuntimeItemViewProps {
  readonly symbol: ReactNode;
  readonly title: ReactNode;
  readonly summary?: ReactNode;
  readonly meta?: ReactNode;
  readonly tags?: ReactNode;
  readonly active?: boolean;
  readonly className?: string;
}

type RuntimeItemProps = RuntimeItemViewProps &
  (
    | ({ readonly onClick: () => void } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title">)
    | ({ readonly onClick?: undefined } & Omit<HTMLAttributes<HTMLDivElement>, "title">)
  );

const runtimeItemClassName = ({
  active,
  className,
}: Pick<RuntimeItemViewProps, "active" | "className">) =>
  cn("runtime-item", active && "runtime-item-active", className);

const RuntimeItemContents = ({ symbol, title, summary, meta, tags }: RuntimeItemViewProps) => (
  <>
    <span className="runtime-item-symbol" aria-hidden="true">
      {symbol}
    </span>
    <span className="runtime-item-body">
      <span className="runtime-item-title-row">
        <span className="runtime-item-title">{title}</span>
        {meta !== undefined && <span className="runtime-item-right">{meta}</span>}
      </span>
      {summary !== undefined && <span className="runtime-item-summary">{summary}</span>}
      {tags !== undefined && <span className="runtime-item-tags">{tags}</span>}
    </span>
  </>
);

export function RuntimeItem(props: RuntimeItemProps) {
  const { symbol, title, summary, meta, tags, active, className, onClick, ...rest } = props;
  const itemProps = {
    className: runtimeItemClassName({ active, className }),
  };

  if (onClick === undefined) {
    return (
      <div {...(rest as HTMLAttributes<HTMLDivElement>)} {...itemProps}>
        <RuntimeItemContents
          symbol={symbol}
          title={title}
          summary={summary}
          meta={meta}
          tags={tags}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      {...itemProps}
      onClick={onClick}
    >
      <RuntimeItemContents
        symbol={symbol}
        title={title}
        summary={summary}
        meta={meta}
        tags={tags}
      />
    </button>
  );
}
