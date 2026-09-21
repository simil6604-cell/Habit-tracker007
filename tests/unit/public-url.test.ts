import { describe, expect, it } from "vitest";
import { isPrivateAddress, verifyPublicUrl } from "@/lib/net/public-url";

/**
 * The app fetches one thing on the user's behalf: a league-table page from a
 * link they paste. That fetch happens on the server, which sits inside the
 * deployment's network, so the link is not just a link — it is a request the
 * user gets to aim. These tests are the list of places it may not be aimed.
 */
describe("isPrivateAddress", () => {
  const privateOnes = [
    "127.0.0.1",
    "127.1.2.3",
    "0.0.0.0",
    "10.0.0.5",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.1",
    "169.254.169.254", // the cloud metadata address — the one that matters most
    "100.64.0.1",
    "192.0.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1", // loopback wearing an IPv6 shape
    "::ffff:7f00:1", // the same, written in hex
    "64:ff9b::7f00:1", // and again, via NAT64
  ];

  for (const ip of privateOnes) {
    it(`refuses ${ip}`, () => expect(isPrivateAddress(ip)).toBe(true));
  }

  const publicOnes = ["1.1.1.1", "8.8.8.8", "93.184.216.34", "172.32.0.1", "171.255.255.255", "2606:4700::1111"];
  for (const ip of publicOnes) {
    it(`allows ${ip}`, () => expect(isPrivateAddress(ip)).toBe(false));
  }

  it("refuses anything it cannot classify rather than guessing", () => {
    expect(isPrivateAddress("not-an-address")).toBe(true);
    expect(isPrivateAddress("")).toBe(true);
    expect(isPrivateAddress("10.0.0")).toBe(true);
  });
});

describe("verifyPublicUrl", () => {
  it("refuses a loopback name", async () => {
    const v = await verifyPublicUrl("http://localhost/standings");
    expect(v.ok).toBe(false);
  });

  it("refuses a loopback literal", async () => {
    expect((await verifyPublicUrl("http://127.0.0.1:3000/")).ok).toBe(false);
    expect((await verifyPublicUrl("http://[::1]/")).ok).toBe(false);
  });

  it("refuses the cloud metadata endpoint", async () => {
    const v = await verifyPublicUrl("http://169.254.169.254/latest/meta-data/");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain("private network");
  });

  it("refuses a private address written in decimal or with a userinfo trick", async () => {
    // http://user@host/ — the host is what counts, not what precedes the "@".
    expect((await verifyPublicUrl("http://expected.example.com@127.0.0.1/")).ok).toBe(false);
    expect((await verifyPublicUrl("http://10.0.0.1/")).ok).toBe(false);
  });

  it("refuses a non-web port even on a public host", async () => {
    const v = await verifyPublicUrl("http://1.1.1.1:6379/");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain("port 80 or 443");
  });

  it("refuses a non-http scheme", async () => {
    expect((await verifyPublicUrl("file:///etc/passwd")).ok).toBe(false);
    expect((await verifyPublicUrl("gopher://1.1.1.1/")).ok).toBe(false);
  });

  it("refuses something that is not a URL at all", async () => {
    expect((await verifyPublicUrl("just some words")).ok).toBe(false);
    expect((await verifyPublicUrl("")).ok).toBe(false);
  });

  it("allows a public address", async () => {
    const v = await verifyPublicUrl("https://1.1.1.1/table");
    expect(v.ok).toBe(true);
  });
});
