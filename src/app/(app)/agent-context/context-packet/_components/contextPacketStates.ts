export const CONTROLLED_PACKET_STATES = [
    "sample",
    "complete",
    "loading",
    "empty",
    "partial",
    "degraded",
    "error",
    "not-entitled",
] as const;

export type ControlledPacketState = (typeof CONTROLLED_PACKET_STATES)[number];
