import request from "supertest";
import { describe, expect, it } from "vitest";
import { app, DEMO_PASSWORD, login } from "./helpers";

describe("login", () => {
  it("returns a token and the user for a correct password", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "dev@demo.local", password: DEMO_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user.role).toBe("REQUESTER");
    expect(response.body.user.teamName).toBe("Payments");
  });

  it("rejects a wrong password", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "dev@demo.local", password: "wrong-password" });
    expect(response.status).toBe(401);
  });

  it("needs a token for protected endpoints", async () => {
    const response = await request(app).get("/api/requests");
    expect(response.status).toBe(401);
  });

  it("returns the logged in user from /me", async () => {
    const token = await login("lead@demo.local");
    const response = await request(app).get("/api/auth/me").set("Authorization", "Bearer " + token);
    expect(response.status).toBe(200);
    expect(response.body.email).toBe("lead@demo.local");
  });
});
