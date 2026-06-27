import { runResearchMorb, type MorbResearchRequest, type MorbResearchResult } from "./morb_research";

export type MorbStatus = "idle" | "working" | "complete";

type MorbManagerSnapshot = {
  status: MorbStatus;
  lastResult: MorbResearchResult | null;
};

class MorbManager {
  private snapshot: MorbManagerSnapshot = {
    status: "idle",
    lastResult: null,
  };

  getStatus() {
    return this.snapshot.status;
  }

  getLastResult() {
    return this.snapshot.lastResult;
  }

  async runResearch(request: MorbResearchRequest): Promise<MorbResearchResult> {
    this.snapshot = { ...this.snapshot, status: "working" };
    const result = await runResearchMorb(request);
    this.snapshot = { status: "complete", lastResult: result };
    return result;
  }

  reset() {
    this.snapshot = { ...this.snapshot, status: "idle" };
  }
}

export const morbManager = new MorbManager();
