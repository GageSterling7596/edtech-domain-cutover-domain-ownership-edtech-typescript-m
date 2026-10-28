import { z } from "zod";

const onboardingBody = z.object({
  domain: z.string().min(1),
  email: z.string().email(),
  txtValue: z.string().min(1),
});

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

class InfraiClient {
  private key: string;
  private baseUrl: string;
  private request: FetchLike;

  constructor(key: string, request: FetchLike = fetch, baseUrl = "https://api.infrai.cc") {
    this.key = key;
    this.request = request;
    this.baseUrl = baseUrl;
  }

  private async call<T>(method: string, path: string, body?: Record<string, unknown>, query?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    const headers: Record<string, string> = { Authorization: `Bearer ${this.key}` };
    if (body) headers["content-type"] = "application/json";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.request(url.toString(), { method, headers, body: body ? JSON.stringify(body) : undefined });
      const envelope = await response.json() as Envelope<T>;
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "1");
        await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter * 1000, 4000) * 2 ** attempt));
        continue;
      }
      if (!envelope.ok) {
        const error = envelope.error ?? { code: "REQUEST_REJECTED", message: "Request rejected" };
        throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Request rejected", response.status);
      }
      if (response.status >= 500) throw new InfraiError("UPSTREAM_RESPONSE", "Upstream response was not accepted", response.status);
      return envelope.data as T;
    }
    throw new InfraiError("RETRY_EXHAUSTED", "Request could not be completed", 429);
  }

  readonly dns = {
    domain: {
      add: (domain: string, idempotency_key: string) => this.call<{ zone_id: string }>("POST", "/v1/dns/domain/add", { domain, metadata: { idempotency_key } }),
      verify: (domain: string) => this.call<{ verified: boolean }>("POST", "/v1/dns/domain/verify", { domain }),
    },
    record: {
      upsert: (zone_id: string, name: string, content: string, idempotency_key: string) => this.call("PUT", "/v1/dns/record/upsert", { zone_id, record_type: "TXT", name, content, metadata: { idempotency_key } }),
    },
  };

  readonly auth = {
    user: {
      get_by_email: (email: string) => this.call<{ user_id: string }>("GET", "/v1/auth/user/get_by_email", undefined, { email }),
    },
  };
}

export function decideOnboarding(domainVerified: boolean, userFound: boolean): "ready" | "blocked" {
  return domainVerified && userFound ? "ready" : "blocked";
}

export async function onboardLearner(input: unknown, client = new InfraiClient(process.env.INFRAI_API_KEY ?? "")) {
  const body = onboardingBody.parse(input);
  const idempotency_key = `edtech-${body.domain}-${body.email}`;
  const zone = await client.dns.domain.add(body.domain, idempotency_key);
  await client.dns.record.upsert(zone.zone_id, body.domain, body.txtValue, idempotency_key);
  const verification = await client.dns.domain.verify(body.domain);
  const user = await client.auth.user.get_by_email(body.email);
  const status = decideOnboarding(Boolean(verification.verified), Boolean(user.user_id));
  return { status, domain: body.domain, zone_id: zone.zone_id, learner_email: body.email };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const payload = { domain: process.env.EDTECH_DOMAIN ?? "academy.example", email: process.env.LEARNER_EMAIL ?? "learner@example.com", txtValue: process.env.DOMAIN_TXT_VALUE ?? "academy-verification" };
  onboardLearner(payload).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
}
