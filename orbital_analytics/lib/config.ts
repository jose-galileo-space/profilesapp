export interface OrbConfig {
  stageName: "alpha" | "beta" | "prod";
  removalPolicy: "DESTROY" | "RETAIN";
  processingMemory: number; // MB
}

export const StageConfigs: Record<string, OrbConfig> = {
  alpha: {
    stageName: "alpha",
    removalPolicy: "DESTROY",
    processingMemory: 3008,
  },
  beta: { stageName: "beta", removalPolicy: "RETAIN", processingMemory: 1024 },
  prod: { stageName: "prod", removalPolicy: "RETAIN", processingMemory: 1024 },
};
