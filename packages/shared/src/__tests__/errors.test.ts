import { describe, expect, it } from "bun:test";
import { BYO20Error } from "../errors";

describe("BYO20Error", () => {
    describe("constructor", () => {
        it("sets name to BYO20Error", () => {
            const e = new BYO20Error("BYO-1101", "test message");
            expect(e.name).toBe("BYO20Error");
        });

        it("sets code", () => {
            const e = new BYO20Error("BYO-2101", "db failed");
            expect(e.code).toBe("BYO-2101");
        });

        it("sets message", () => {
            const e = new BYO20Error("BYO-1101", "rules failed");
            expect(e.message).toBe("rules failed");
        });

        it("is an instance of Error", () => {
            const e = new BYO20Error("BYO-1101", "test");
            expect(e).toBeInstanceOf(Error);
        });

        it("is an instance of BYO20Error", () => {
            const e = new BYO20Error("BYO-1101", "test");
            expect(e).toBeInstanceOf(BYO20Error);
        });
    });

    describe("context", () => {
        it("is undefined when not provided", () => {
            const e = new BYO20Error("BYO-1101", "test");
            expect(e.context).toBeUndefined();
        });

        it("is set when provided", () => {
            const e = new BYO20Error("BYO-1101", "test", {
                context: { campaignId: "abc-123", round: 3 },
            });
            expect(e.context).toEqual({ campaignId: "abc-123", round: 3 });
        });
    });

    describe("userMessage", () => {
        it("is undefined when not provided", () => {
            const e = new BYO20Error("BYO-1101", "test");
            expect(e.userMessage).toBeUndefined();
        });

        it("is set when provided", () => {
            const e = new BYO20Error("BYO-6301", "safeStorage failed", {
                userMessage: "Please re-enter your API key in campaign settings.",
            });
            expect(e.userMessage).toBe("Please re-enter your API key in campaign settings.");
        });
    });

    describe("code namespacing", () => {
        it("accepts BYO-1xxx (engine) codes", () => {
            expect(new BYO20Error("BYO-1101", "test").code).toBe("BYO-1101");
        });

        it("accepts BYO-6xxx (desktop) codes", () => {
            expect(new BYO20Error("BYO-6201", "test").code).toBe("BYO-6201");
        });
    });
});

describe("Result narrowing", () => {
    it("ok:true result exposes value", () => {
        const result = { ok: true as const, value: 42 };
        if (result.ok) {
            expect(result.value).toBe(42);
        } else {
            throw new Error("Should have been ok");
        }
    });

    it("ok:false result exposes error", () => {
        const result = {
            ok: false as const,
            error: { reason: "no spell slot", action_type: "cast_spell" },
        };
        if (!result.ok) {
            expect(result.error.reason).toBe("no spell slot");
            expect(result.error.action_type).toBe("cast_spell");
        } else {
            throw new Error("Should have been a rejection");
        }
    });

    it("ok:false result can carry context", () => {
        const result = {
            ok: false as const,
            error: {
                reason: "target out of range",
                action_type: "attack",
                context: { requiredRangeFt: 5, actualDistanceFt: 15 },
            },
        };
        if (!result.ok) {
            expect(result.error.context?.requiredRangeFt).toBe(5);
        }
    });
});
