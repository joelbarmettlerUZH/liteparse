import { describe, expect, it } from "vitest";
import { strToPostScript, strToSubscriptString, cleanOcrTableArtifacts } from "./textUtils";

describe("test processing textUtils", () => {
  it("test strToSubscriptString full conversion", () => {
    const originalStr = "hello123";
    const finalStr = strToSubscriptString(originalStr);
    expect(finalStr).toBe("ₕₑₗₗₒ₁₂₃");
  });

  it("test strToSubscriptString fail conversion", () => {
    const originalStr = "hello123!";
    const finalStr = strToSubscriptString(originalStr);
    expect(finalStr).toBe("hello123!");
  });

  it("test strToPostScript full conversion", () => {
    const originalStr = "hello123";
    const finalStr = strToPostScript(originalStr);
    expect(finalStr).toBe("ʰᵉˡˡᵒ¹²³");
  });

  it("test strToPostScript fail conversion", () => {
    const originalStr = "hello123!";
    const finalStr = strToPostScript(originalStr);
    expect(finalStr).toBe("hello123!");
  });

  it("test cleanOcrTableArtifacts removes trailing bracket from number", () => {
    expect(cleanOcrTableArtifacts("44520]")).toBe("44520");
    expect(cleanOcrTableArtifacts("9,674]")).toBe("9,674");
    expect(cleanOcrTableArtifacts("0.3|")).toBe("0.3");
    expect(cleanOcrTableArtifacts("63,790|")).toBe("63,790");
  });

  it("test cleanOcrTableArtifacts removes leading bracket from number", () => {
    expect(cleanOcrTableArtifacts("|123")).toBe("123");
    expect(cleanOcrTableArtifacts("[456")).toBe("456");
  });

  it("test cleanOcrTableArtifacts preserves brackets in non-numeric text", () => {
    expect(cleanOcrTableArtifacts("(note)")).toBe("(note)");
    expect(cleanOcrTableArtifacts("[ref]")).toBe("[ref]");
    expect(cleanOcrTableArtifacts("hello]")).toBe("hello]");
  });

  it("test cleanOcrTableArtifacts handles special numeric patterns", () => {
    expect(cleanOcrTableArtifacts("*-123")).toBe("*-123");
    expect(cleanOcrTableArtifacts("Z")).toBe("Z");
    expect(cleanOcrTableArtifacts("N/A")).toBe("N/A");
  });
});
