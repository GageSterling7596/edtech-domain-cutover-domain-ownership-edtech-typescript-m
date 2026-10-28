import assert from "node:assert/strict";
import { decideOnboarding } from "./domain_ownership_service.ts";

assert.equal(decideOnboarding(true, true), "ready");
assert.equal(decideOnboarding(false, true), "blocked");
assert.equal(decideOnboarding(true, false), "blocked");
console.log("onboarding decision test passed");
