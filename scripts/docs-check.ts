import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const docsRoot = "docs";
const allowedTopFolders = new Set([
  "archive",
  "brainstorms",
  "clients",
  "design-notes",
  "direction",
  "drafts",
  "maps",
  "primitives",
  "runtime",
]);
const allowedStatuses = new Set(["current", "draft", "brainstorm", "archived", "active-rationale"]);
const folderStatusRules = new Map<string, string>([
  ["archive", "archived"],
  ["brainstorms", "brainstorm"],
  ["design-notes", "active-rationale"],
  ["drafts", "draft"],
]);
const currentFolders = new Set(["clients", "direction", "maps", "primitives", "runtime"]);
const allowedOwners = new Set([
  "archive",
  "brainstorms",
  "clients",
  "design-notes",
  "direction",
  "docs",
  "drafts",
  "primitives",
  "runtime",
]);
const markdownFiles: string[] = [];
const errors: string[] = [];

const walk = (dir: string): void => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".md")) markdownFiles.push(fullPath);
  }
};

const frontmatterFor = (text: string): Record<string, string> => {
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---", 4);
  if (end === -1) return {};
  const entries: Record<string, string> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    entries[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return entries;
};

const checkRelativeMarkdownLinks = (file: string, text: string): void => {
  const linkPattern = /\[[^\]]+\]\(([^)]+\.md(?:#[^)]+)?)\)/g;
  for (const match of text.matchAll(linkPattern)) {
    const rawTarget = match[1];
    if (rawTarget === undefined) continue;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rawTarget)) continue;
    const targetPath = rawTarget.split("#")[0];
    if (targetPath === undefined) continue;
    const resolved = path.normalize(path.join(path.dirname(file), targetPath));
    if (!existsSync(resolved)) errors.push(`${file}: missing Markdown link target ${rawTarget}`);
  }
};

const checkFile = (file: string): void => {
  const text = readFileSync(file, "utf8");
  if (text.includes("[[")) errors.push(`${file}: contains Obsidian wikilink syntax`);
  if (/docs\/(?:0[1-9]|[0-9]{2})-/.test(text)) {
    errors.push(`${file}: references a numbered docs folder`);
  }
  if (/\/(?:0[0-9]|[0-9]{3})-[^/\s)]+\.md/.test(text)) {
    errors.push(`${file}: references a numbered docs note`);
  }

  const frontmatter = frontmatterFor(text);
  for (const key of ["status", "owner", "kind", "updated"]) {
    if (frontmatter[key] === undefined) errors.push(`${file}: missing frontmatter property ${key}`);
  }
  if (frontmatter.status !== undefined && !allowedStatuses.has(frontmatter.status)) {
    errors.push(`${file}: invalid status ${frontmatter.status}`);
  }
  if (frontmatter.owner !== undefined && !allowedOwners.has(frontmatter.owner)) {
    errors.push(`${file}: invalid owner ${frontmatter.owner}`);
  }

  const folder = file.split(path.sep)[1];
  if (folder !== undefined) {
    const expectedStatus = folderStatusRules.get(folder);
    if (expectedStatus !== undefined && frontmatter.status !== expectedStatus) {
      errors.push(`${file}: expected status ${expectedStatus} for ${folder}/`);
    }
    if (currentFolders.has(folder) && frontmatter.status === "archived") {
      errors.push(`${file}: archived status does not belong in ${folder}/`);
    }
    if (
      frontmatter.owner !== undefined &&
      folder !== "maps" &&
      file !== path.join(docsRoot, "README.md")
    ) {
      if (folder !== frontmatter.owner) {
        errors.push(`${file}: expected owner ${folder}`);
      }
    }
  }

  checkRelativeMarkdownLinks(file, text);
};

for (const entry of readdirSync(docsRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && !allowedTopFolders.has(entry.name)) {
    errors.push(`${docsRoot}/${entry.name}: unexpected top-level docs folder`);
  }
}

walk(docsRoot);
for (const file of markdownFiles) checkFile(file);

if (errors.length > 0) {
  for (const error of errors) {
    await Bun.write(Bun.stderr, `${error}\n`);
  }
  process.exit(1);
}

await Bun.write(Bun.stdout, `docs:check passed (${markdownFiles.length} Markdown files)\n`);
