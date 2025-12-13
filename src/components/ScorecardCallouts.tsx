import type { ScorecardBand, ScorecardDelta } from "../lib/scorecard";
import type { ScorecardGuardrails, ScorecardViewModel } from "../lib/viewModels";
import { Section } from "./Section";
import Scorecard from "./Scorecard";
import CalloutsSnapshot from "./CalloutsSnapshot";

type ScorecardCalloutsProps = {
  scorecardView: "current" | "optimized";
  hasOptimized: boolean;
  onChangeView: (view: "current" | "optimized") => void;
  onPinBaseline: () => void;
  scorecardVM: ScorecardViewModel;
  scorecardBand: ScorecardBand | null;
  priceDeltas?: Array<{ tier: "good" | "better" | "best"; base: number; current: number; delta: number | null }>;
  callouts: {
    hasResult: boolean;
    basisLabel: string;
    ladderLabel: string;
    delta: ScorecardDelta | null;
    fallbackNarrative: ScorecardDelta | null;
    guardrails: ScorecardGuardrails;
    optimizerWhyLines: string[];
    binds?: string[];
    topDriverLine?: string | null;
    guardrailFloorLine?: string | null;
    validationNotes?: string[];
    riskNote?: string | null;
  };
};

export function ScorecardCallouts({
  scorecardView,
  hasOptimized,
  onChangeView,
  onPinBaseline,
  scorecardVM,
  scorecardBand,
  priceDeltas,
  callouts,
}: ScorecardCalloutsProps) {
  return (
    <>
      <Section id="scorecard" title="Scorecard">
        <Scorecard
          view={scorecardView}
          hasOptimized={hasOptimized}
          onChangeView={onChangeView}
          onPinBaseline={onPinBaseline}
          basis={scorecardVM.basis}
          kpis={scorecardVM.kpis}
          run={scorecardVM.run}
          baselineRun={scorecardVM.baselineRun}
          activeCustomers={scorecardVM.activeCustomers}
          baselineActiveCustomers={scorecardVM.baselineActiveCustomers}
          marginDeltaPP={scorecardVM.marginDeltaPP}
          guardrails={scorecardVM.guardrails}
          explain={scorecardVM.explain}
          band={scorecardBand}
            riskNote={callouts.riskNote}
            priceDeltas={priceDeltas}
          />
      </Section>

      <Section id="callouts" title="Callouts snapshot">
        <CalloutsSnapshot
          hasResult={callouts.hasResult}
          basisLabel={callouts.basisLabel}
          ladderLabel={callouts.ladderLabel}
          delta={callouts.delta}
          fallbackNarrative={callouts.fallbackNarrative}
          guardrails={callouts.guardrails}
          optimizerWhyLines={callouts.optimizerWhyLines}
          binds={callouts.binds}
          topDriverLine={callouts.topDriverLine}
          guardrailFloorLine={callouts.guardrailFloorLine}
          validationNotes={callouts.validationNotes}
          riskNote={callouts.riskNote}
        />
      </Section>
    </>
  );
}
