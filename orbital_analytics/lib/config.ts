export interface OrbConfig {
  stageName: "alpha" | "beta" | "prod";
  removalPolicy: "DESTROY" | "RETAIN";

  // Compute Scaling
  processingMemory: number; // MB (e.g., 128 for Alpha, 1024 for Prod)
  concurrentLambdas: number; // Reserved concurrency

  // Feature Flags
  enableDetailedMetrics: boolean;
}

export const getDefaultConfig = (
  stageName: "alpha" | "beta" | "prod"
): OrbConfig => {
  switch (stageName) {
    case "alpha":
      return {
        stageName: "alpha",
        removalPolicy: "DESTROY",
        processingMemory: 128,
        concurrentLambdas: 5,
        enableDetailedMetrics: true,
      };
    case "beta":
      return {
        stageName: "beta",
        removalPolicy: "RETAIN",
        processingMemory: 512,
        concurrentLambdas: 10,
        enableDetailedMetrics: true,
      };
    case "prod":
      return {
        stageName: "prod",
        removalPolicy: "RETAIN",
        processingMemory: 1024,
        concurrentLambdas: 20,
        enableDetailedMetrics: false,
      };
    default:
      throw new Error(`Unknown stage name: ${stageName}`);
  }
};
