import { useCallback, useRef, type KeyboardEvent, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type PromptFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  hint?: string;
};

export function PromptField({
  className,
  value,
  onChange,
  onSubmit,
  hint,
  disabled,
  ...props
}: PromptFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey && onSubmit) {
        event.preventDefault();
        if (value.trim()) onSubmit();
      }
    },
    [onSubmit, value],
  );

  return (
    <div className="prompt-field-shell">
      <div className={cn("prompt-field", className)}>
        <span className="prompt-field-glyph" aria-hidden="true">
          ›
        </span>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            resize();
          }}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={1}
          className="prompt-field-input"
          {...props}
        />
      </div>
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}
