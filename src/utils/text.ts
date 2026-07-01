const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " "
};

export function decodeBasicEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return ENTITY_MAP[entity] ?? match;
  });
}

export function stripHtml(value: string | undefined): string {
  if (!value) return "";
  return decodeBasicEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

export function compactWhitespace(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanText(value: string | undefined): string {
  return compactWhitespace(stripHtml(value));
}

export function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 20)).trimEnd()}\n...[truncated]`;
}

export function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function stableUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|ref|source|fbclid|gclid)/i.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function splitForSlack(text: string, maxChars = 2800): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > maxChars) {
    const cutAt = Math.max(
      rest.lastIndexOf("\n", maxChars),
      rest.lastIndexOf("。", maxChars),
      rest.lastIndexOf(" ", maxChars)
    );
    const size = cutAt > maxChars * 0.5 ? cutAt + 1 : maxChars;
    chunks.push(rest.slice(0, size).trim());
    rest = rest.slice(size).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}
