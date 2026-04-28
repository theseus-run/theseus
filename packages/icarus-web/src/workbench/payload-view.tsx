import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type PayloadFormat = "json" | "markdown" | "text";

export function PayloadView({
  value,
  format,
  surface = "block",
}: {
  readonly value: unknown;
  readonly format: PayloadFormat;
  readonly surface?: "block" | "inline";
}) {
  if (format === "markdown") {
    if (surface === "inline") {
      return (
        <span className="payload-markdown payload-markdown-inline markdown-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <span className="payload-markdown-line">{children}</span>,
              ul: ({ children }) => <span className="payload-markdown-list">{children}</span>,
              ol: ({ children }) => <span className="payload-markdown-list">{children}</span>,
              li: ({ children }) => <span className="payload-markdown-list-item">{children}</span>,
            }}
          >
            {formatText(value)}
          </ReactMarkdown>
        </span>
      );
    }
    return (
      <div className={`payload-markdown payload-markdown-${surface} markdown-body`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{formatText(value)}</ReactMarkdown>
      </div>
    );
  }

  if (format === "json") {
    return (
      <pre className="payload-block payload-json">
        <JsonTokens value={formatJson(value)} />
      </pre>
    );
  }

  return <pre className="payload-block">{formatText(value)}</pre>;
}

function JsonTokens({ value }: { readonly value: string }) {
  const tokens = jsonParts(value);
  return (
    <>
      {tokens.map((token) =>
        token.className === "" ? (
          <span key={token.key}>{token.text}</span>
        ) : (
          <span key={token.key} className={token.className}>
            {token.text}
          </span>
        ),
      )}
    </>
  );
}

interface JsonPart {
  readonly key: string;
  readonly text: string;
  readonly className: string;
}

const jsonTokenPattern =
  /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}[\],:]/g;

const jsonParts = (value: string): ReadonlyArray<JsonPart> => {
  const parts: Array<JsonPart> = [];
  let cursor = 0;
  for (const match of value.matchAll(jsonTokenPattern)) {
    const start = match.index ?? cursor;
    const token = match[0];
    if (cursor < start) {
      parts.push({
        key: `text:${cursor}`,
        text: value.slice(cursor, start),
        className: "",
      });
    }
    const end = start + token.length;
    parts.push({
      key: `token:${start}`,
      text: token,
      className: jsonTokenClass(token, value.slice(end)),
    });
    cursor = end;
  }
  if (cursor < value.length) {
    parts.push({
      key: `text:${cursor}`,
      text: value.slice(cursor),
      className: "",
    });
  }
  return parts;
};

const jsonTokenClass = (token: string, afterToken: string): string => {
  if (/^"(?:\\.|[^"\\])*"$/.test(token) && /^\s*:/.test(afterToken)) return "json-key";
  if (/^"(?:\\.|[^"\\])*"$/.test(token)) return "json-string";
  if (/^-?\d/.test(token)) return "json-number";
  if (token === "true" || token === "false") return "json-boolean";
  if (token === "null") return "json-null";
  if (/^[{}[\],:]$/.test(token)) return "json-punctuation";
  return "";
};

const formatJson = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2) ?? String(value);
};

const formatText = (value: unknown): string =>
  typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? String(value));
