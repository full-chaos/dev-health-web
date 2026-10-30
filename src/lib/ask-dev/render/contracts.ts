/**
 * The ACR contract types the E8 ports read, under the names ask-dev's `@/lib/contracts` gives them
 * (CHAOS-11941). They are web's own generated types from its ACR pin; this module only renames,
 * so a ported file keeps ask-dev's imports one-to-one.
 */
import type {
    ACRContextFabricInvestigationResultV1,
    CohortMemberDriver as GeneratedCohortMemberDriver,
    InterpretedQuestion as GeneratedInterpretedQuestion,
} from "@/lib/acr/generated";

export type {
    ClaimedFact,
    ClaimedFactRow,
    Cohort,
    CohortMember,
    CohortMemberDriver,
    RenderPoint,
    RenderPointSource,
    RenderSeries,
    RenderShape,
    ScalarValue,
    SubjectRef,
} from "@/lib/acr/generated";

export type InvestigationResult = ACRContextFabricInvestigationResultV1;
export type CohortDriverWindow = GeneratedCohortMemberDriver["window"];
export type InterpretedShape = GeneratedInterpretedQuestion["shape"];
