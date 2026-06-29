import { describe, expect, it } from "vitest";

import { escapeHtml } from "./escape";

describe("escapeHtml", () => {
  it("escapes server-derived strings before HTML insertion", () => {
    const escaped = escapeHtml('<img src=x onerror="alert(1)">');

    expect(escaped).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(escaped).not.toContain("<img");
    expect(escaped).not.toContain("onerror=\"");
  });
});
