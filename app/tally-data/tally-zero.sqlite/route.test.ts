import { describe, expect, it, vi } from "vitest";

import { GET, HEAD, parseRangeHeader } from "./route";

const DB_SIZE_BYTES = 198082560;

describe("tally SQLite route", () => {
  describe("HEAD", () => {
    it("advertises byte serving metadata", () => {
      const response = HEAD();

      expect(response.status).toBe(200);
      expect(response.headers.get("accept-ranges")).toBe("bytes");
      expect(response.headers.get("content-length")).toBe(
        String(DB_SIZE_BYTES)
      );
      expect(response.headers.get("content-encoding")).toBe("identity");
      expect(response.headers.get("cache-control")).toContain("no-transform");
    });
  });

  describe("parseRangeHeader", () => {
    it("accepts single bounded byte ranges", () => {
      expect(parseRangeHeader("bytes=0-15")).toEqual({
        isValid: true,
        header: "bytes=0-15",
      });
    });

    it("rejects missing ranges as a bad request", () => {
      expect(parseRangeHeader(null)).toEqual({
        isValid: false,
        status: 400,
      });
    });

    it("rejects malformed and multi ranges", () => {
      expect(parseRangeHeader("bytes=0-")).toEqual({
        isValid: false,
        status: 416,
      });
      expect(parseRangeHeader("bytes=-4096")).toEqual({
        isValid: false,
        status: 416,
      });
      expect(parseRangeHeader("bytes=0-15,32-63")).toEqual({
        isValid: false,
        status: 416,
      });
    });

    it("rejects out-of-bounds ranges", () => {
      expect(
        parseRangeHeader(`bytes=${DB_SIZE_BYTES}-${DB_SIZE_BYTES}`)
      ).toEqual({
        isValid: false,
        status: 416,
      });
      expect(parseRangeHeader("bytes=100-99")).toEqual({
        isValid: false,
        status: 416,
      });
    });

    it("rejects ranges larger than four MiB", () => {
      expect(parseRangeHeader("bytes=0-4194304")).toEqual({
        isValid: false,
        status: 416,
      });
    });
  });

  describe("GET", () => {
    it("rejects full-file requests", async () => {
      const response = await GET(new Request("https://example.test/db"));

      expect(response.status).toBe(400);
      expect(await response.text()).toBe("Range header is required");
    });

    it("returns 416 for invalid ranges", async () => {
      const response = await GET(
        new Request("https://example.test/db", {
          headers: { range: "bytes=0-4194304" },
        })
      );

      expect(response.status).toBe(416);
      expect(response.headers.get("content-range")).toBe(
        `bytes */${DB_SIZE_BYTES}`
      );
    });

    it("proxies valid ranges to Blob", async () => {
      const body = new Uint8Array([1, 2, 3, 4]);
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(body, {
          status: 206,
          headers: {
            "content-length": "4",
            "content-range": `bytes 0-3/${DB_SIZE_BYTES}`,
          },
        })
      );

      const response = await GET(
        new Request("https://example.test/db", {
          headers: { range: "bytes=0-3" },
        })
      );

      expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
        headers: { range: "bytes=0-3" },
      });
      expect(response.status).toBe(206);
      expect(response.headers.get("content-range")).toBe(
        `bytes 0-3/${DB_SIZE_BYTES}`
      );
      expect(response.headers.get("content-length")).toBe("4");
      expect(response.headers.get("content-encoding")).toBe("identity");

      fetchMock.mockRestore();
    });
  });
});
