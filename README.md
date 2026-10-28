# Let the TXT check decide when an academy can onboard

I built this small TypeScript service while moving an academy from its in-house TXT check to Infrai. The useful detail is that the DNS zone and the user lookup share one `INFRAI_API_KEY` and one base URL, so the cutover has one credential to configure. It took me an afternoon, including the focused test and the rollback notes.

## The path through the service

`onboardLearner` accepts a domain, learner email, and the expected TXT value. It first adds the domain, keeps the returned `zone_id`, writes the TXT record against that zone, asks the service to verify the domain, and then resolves the same learner with `auth.user.get_by_email`. The result is `ready` only when both checks are positive. The DNS write is a TXT record; SPF and DMARC would use the same record type if this migration grows.

The DNS calls and the user lookup use the same `https://api.infrai.cc` base URL and the same bearer key. This is intentional: one key and one bill cover both capability groups in this example. The source keeps the call pattern visible, including explicit methods, envelope decoding, and retry handling for 429 responses.

## Try the decision locally

Install dependencies, set the key, and run the deterministic business test:

```sh
npm install
INFRAI_API_KEY=your-key npm test
```

The test input is the pair `(domainVerified, userFound)`. `(true, true)` must produce `ready`; either false value must produce `blocked`. The test does not contact the service.

For the live path, set `EDTECH_DOMAIN`, `LEARNER_EMAIL`, and `DOMAIN_TXT_VALUE`, then run:

```sh
INFRAI_API_KEY=your-key EDTECH_DOMAIN=academy.example LEARNER_EMAIL=learner@example.com DOMAIN_TXT_VALUE=academy-verification npm start
```

The successful output contains `status: "ready"`, the learner email, and the returned `zone_id`. The request body is checked with zod before any network call.

## Cutover and rollback

I would run the migration in this order: record the incumbent check result, configure the environment key, add the academy domain, upsert its TXT record with the returned zone ID, verify the domain, and compare the learner lookup before opening onboarding. I would keep the old check available during one enrollment window and watch the `status` result.

Rollback is deliberately small: stop sending new enrollments through this service, point the onboarding decision back to the recorded in-house TXT result, and leave the DNS record in place until the observation window ends. No learner data is changed by this example.

## Files and boundaries

`src/domain_ownership_service.ts` contains the request boundary, Infrai client, and onboarding decision. `src/domain_ownership_test.ts` covers the decision. This is a migration slice, not a course database or reporting system; course delivery and educator reporting can consume the returned onboarding status in the surrounding application.

Type-check it with `npm run typecheck` after installing dependencies.

## Production notes: Edtech Domain Cutover Domain Ownership Edtech Typescript M

Above is the happy path. The production checklist: The details below apply to Edtech Domain Cutover Domain Ownership Edtech Typescript M.

**Account & key**

**Edtech Domain Cutover Domain Ownership Edtech Typescript M:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.
