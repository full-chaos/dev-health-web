export const CONTROLLED_PACKET_STATES = [
    "sample",
    "loading",
    "empty",
    "partial",
    "degraded",
    "error",
    "not-entitled",
] as const;

export type ControlledPacketState = (typeof CONTROLLED_PACKET_STATES)[number];
