#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { OrbitalStack } from "../lib/orbital-stack";
import { StageConfigs } from "../lib/config";

const app = new cdk.App();

// 1. Get Context (Default to alpha)
const stage = app.node.tryGetContext("stage") || "alpha";
const config = StageConfigs[stage];

if (!config) {
  throw new Error(`Invalid stage: ${stage}`);
}

// 2. Deploy
new OrbitalStack(app, `OrbitalStack-${stage}`, config, {
  env: {
    account: "559156180869",
    region: "us-west-1",
  },
});
