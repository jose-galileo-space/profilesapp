export interface OrbConfig {
  stageName: "alpha" | "beta" | "prod";
  removalPolicy: "DESTROY" | "RETAIN";
  processingMemory: number; // MB
  // Stage-level default API throttle (baseline abuse protection, applies
  // regardless of per-tenant usage-plan keys). See lib/orbital-stack.ts E7.
  apiRateLimit: number; // steady-state requests/sec
  apiBurstLimit: number; // burst capacity
}

export const StageConfigs: Record<string, OrbConfig> = {
  alpha: {
    stageName: "alpha",
    removalPolicy: "DESTROY",
    processingMemory: 3008,
    apiRateLimit: 50,
    apiBurstLimit: 100,
  },
  beta: {
    stageName: "beta",
    removalPolicy: "RETAIN",
    processingMemory: 1024,
    apiRateLimit: 100,
    apiBurstLimit: 200,
  },
  prod: {
    stageName: "prod",
    removalPolicy: "RETAIN",
    processingMemory: 1024,
    apiRateLimit: 200,
    apiBurstLimit: 400,
  },
};

// Commercial tiers → API Gateway usage-plan limits (E7). Tenants using direct
// machine-to-machine API access get a key bound to their tier's plan.
export interface ApiTier {
  name: string;
  rateLimit: number; // req/sec
  burstLimit: number;
  monthlyQuota: number; // requests/month
}

export const ApiTiers: ApiTier[] = [
  { name: "Watch", rateLimit: 5, burstLimit: 10, monthlyQuota: 50_000 },
  { name: "Pro", rateLimit: 25, burstLimit: 50, monthlyQuota: 500_000 },
  { name: "Enterprise", rateLimit: 100, burstLimit: 200, monthlyQuota: 5_000_000 },
];
