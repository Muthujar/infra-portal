import { describe, expect, it } from "vitest";
import { canMove } from "../src/services/requestStatus.service";

describe("request state machine", () => {
  it("allows the normal path from request to completed server", () => {
    expect(canMove("PENDING_APPROVAL", "APPROVED")).toBe(true);
    expect(canMove("APPROVED", "PROVISIONING")).toBe(true);
    expect(canMove("PROVISIONING", "CONFIGURING")).toBe(true);
    expect(canMove("CONFIGURING", "COMPLETED")).toBe(true);
    expect(canMove("COMPLETED", "DECOMMISSIONING")).toBe(true);
    expect(canMove("DECOMMISSIONING", "DECOMMISSIONED")).toBe(true);
  });

  it("allows retry and clean up after a failure", () => {
    expect(canMove("FAILED", "APPROVED")).toBe(true);
    expect(canMove("FAILED", "DECOMMISSIONING")).toBe(true);
  });

  it("blocks skipping steps or reopening finished requests", () => {
    expect(canMove("PENDING_APPROVAL", "PROVISIONING")).toBe(false);
    expect(canMove("PENDING_APPROVAL", "COMPLETED")).toBe(false);
    expect(canMove("REJECTED", "APPROVED")).toBe(false);
    expect(canMove("DECOMMISSIONED", "APPROVED")).toBe(false);
    expect(canMove("COMPLETED", "APPROVED")).toBe(false);
  });
});
