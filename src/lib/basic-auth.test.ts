import { describe, expect, it } from "vitest";
import { authenticateBasic, parseBasicUsers } from "./basic-auth";

const users = parseBasicUsers("jun:longpass1,mom:longpass2");

function header(name: string, password: string) {
  return `Basic ${Buffer.from(`${name}:${password}`).toString("base64")}`;
}

describe("basic auth", () => {
  it("parses name:password pairs", () => {
    expect(users).toEqual([
      { name: "jun", password: "longpass1" },
      { name: "mom", password: "longpass2" },
    ]);
    expect(parseBasicUsers("")).toEqual([]);
  });

  it("accepts the right password and rejects the wrong one", () => {
    expect(authenticateBasic(header("mom", "longpass2"), users)).toBe("mom");
    expect(authenticateBasic(header("mom", "nope"), users)).toBeNull();
    expect(authenticateBasic(header("stranger", "longpass1"), users)).toBeNull();
    expect(authenticateBasic(null, users)).toBeNull();
  });
});
