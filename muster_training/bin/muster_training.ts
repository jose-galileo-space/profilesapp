#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { MusterTrainingStack } from "../lib/muster-training-stack";

const app = new cdk.App();

new MusterTrainingStack(app, "MusterTrainingStack", {
  env: {
    account: "559156180869",
    region:  "us-west-1",
  },
});
