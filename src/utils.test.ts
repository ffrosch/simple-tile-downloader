import { describe, test, expect } from "bun:test";
import { formatBytes } from "./utils";

describe("formatBytes", () => {
  test("formats zero bytes", () => {
    expect(formatBytes(0)).toBe("0 Bytes");
  });

  test("formats single byte", () => {
    expect(formatBytes(1)).toBe("1 Byte");
  });

  test("formats bytes (< 1 KB)", () => {
    expect(formatBytes(100)).toBe("100.00 Bytes");
    expect(formatBytes(1023)).toBe("1023.00 Bytes");
  });

  test("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.00 KB");
    expect(formatBytes(1536)).toBe("1.50 KB");
    expect(formatBytes(10240)).toBe("10.00 KB");
  });

  test("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1.00 MB");
    expect(formatBytes(1572864)).toBe("1.50 MB");
    expect(formatBytes(10485760)).toBe("10.00 MB");
  });

  test("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1.00 GB");
    expect(formatBytes(1610612736)).toBe("1.50 GB");
  });

  test("respects decimal places", () => {
    expect(formatBytes(1536, 0)).toBe("2 KB");
    expect(formatBytes(1536, 1)).toBe("1.5 KB");
    expect(formatBytes(1536, 3)).toBe("1.500 KB");
  });

  test("handles negative decimals", () => {
    expect(formatBytes(1536, -1)).toBe("2 KB");
  });

  test("formats typical tile sizes", () => {
    // Typical PNG tile ~5-50 KB
    expect(formatBytes(5120)).toBe("5.00 KB");
    expect(formatBytes(15360)).toBe("15.00 KB");
    expect(formatBytes(51200)).toBe("50.00 KB");
  });
});
