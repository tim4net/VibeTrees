import { phase1Cleanup } from './phase-1-cleanup.mjs';
// Additional phases to be created in Task 10
// import { phase2Agnostic } from './phase-2-agnostic.mjs';
// import { phase3Mcp } from './phase-3-mcp.mjs';
// import { phase4MultiAgent } from './phase-4-multi-agent.mjs';
// import { phase5Updates } from './phase-5-updates.mjs';
// import { phase6Testing } from './phase-6-testing.mjs';
// import { phase7Polish } from './phase-7-polish.mjs';

export const phases = [
  phase1Cleanup,
  // phase2Agnostic,
  // phase3Mcp,
  // phase4MultiAgent,
  // phase5Updates,
  // phase6Testing,
  // phase7Polish
];

export function getPhase(number) {
  return phases.find(p => p.number === number);
}

export function getAllPhases() {
  return phases;
}
