import "server-only";
import { z } from "zod";
import { generateObject } from "ai";
import { getModelForTenant } from "@/lib/ai/provider";

export const SeedPacketScanOutputSchema = z.object({
  cropName: z
    .string()
    .nullable()
    .describe(
      "The crop's correct, standard common name — proper capitalization and spelling, singular, e.g. \"Tomato\" or \"Swiss Chard\" — read off the packet, not the raw printed text verbatim if it's abbreviated, plural, or oddly cased. This feeds the same crop-resolution flow as typing a name in by hand. Null ONLY if the photo doesn't show a seed packet at all (e.g. it's a photo of something else entirely) — never a placeholder string explaining that; use the `notes` field for any explanation.",
    ),
  varietyName: z
    .string()
    .nullable()
    .describe(
      "The cultivar name if the packet shows one, e.g. \"Moneymaker\" — properly capitalized and spelled. Null if the packet only names the crop with no specific variety.",
    ),
  // The whole point of this agent: the user shouldn't have to count seeds or
  // do unit conversions themselves. Prefer an exact count if the packet
  // prints one; otherwise give a genuine best-effort estimate rather than
  // leaving the user to figure it out — null only when neither is possible
  // (the count/weight isn't legible at all, e.g. packet obscured or photo
  // too blurry to read anything).
  seedCount: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe(
      "How many individual seeds are in this packet. Read an exact printed count directly if visible (e.g. \"approx. 200 seeds\"). If only a weight is printed (e.g. \"1g\"), convert it to an estimated seed count using typical seed size for this crop. If neither a count nor a weight is legible, give a reasonable general estimate for a typical packet of this crop/variety rather than leaving this null — only use null if you genuinely cannot make any reasonable estimate at all (crop itself unidentifiable, packet unreadable).",
    ),
  seedCountIsEstimate: z
    .boolean()
    .describe(
      "True if seedCount is your own estimate (not an exact figure printed on the packet, or converted from a printed weight). False only if an exact seed count was printed and read directly.",
    ),
  notes: z
    .string()
    .nullable()
    .describe(
      "One short sentence flagging anything the user should double-check — e.g. \"Count is an estimate, packet didn't print a number\" or \"Variety name partly obscured, please confirm.\" Null if nothing needs flagging.",
    ),
});
export type SeedPacketScanOutput = z.infer<typeof SeedPacketScanOutputSchema>;

export type SeedPacketScanInput = {
  imageBuffer: Buffer;
  contentType: string;
};

export type SeedPacketScanResult = {
  output: SeedPacketScanOutput;
  provider: string;
  model: string;
};

const MOCK_OUTPUT: SeedPacketScanOutput = {
  cropName: "Tomato",
  varietyName: "Moneymaker",
  seedCount: 30,
  seedCountIsEstimate: true,
  notes: "[Mock scan — connect a Gemini API key to read a real packet.]",
};

/**
 * Reads a photographed seed packet and extracts crop name, variety, and
 * seed count to pre-fill /seeds' add-seed form (see scanSeedPacketAction) —
 * the user reviews/edits every field before it's ever submitted, so nothing
 * from this call is persisted directly. Mirrors growingAreaEstimator.ts's
 * exact shape (single vision call, own mock fallback).
 */
export async function scanSeedPacket(
  tenantId: string,
  input: SeedPacketScanInput,
): Promise<SeedPacketScanResult> {
  const resolved = await getModelForTenant(tenantId, "seed_packet_scanner");

  if (resolved) {
    const { object } = await generateObject({
      model: resolved.model,
      schema: SeedPacketScanOutputSchema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are reading a photo of a seed packet for a home gardener. Identify the crop, the specific variety/cultivar if shown, and how many seeds are in the packet.

The user shouldn't have to work any of this out themselves — if an exact seed count isn't printed, give your best-effort estimate (converting from a printed weight if that's what's shown, or a typical packet size for this crop/variety otherwise) rather than leaving it blank. Only leave seedCount/varietyName null if you genuinely cannot make any reasonable determination at all.

If the photo doesn't actually show a seed packet (e.g. it's a photo of something else entirely), set cropName to null and explain what you saw instead in the notes field — never invent a crop name or write an explanation into the cropName field itself.`,
            },
            { type: "file", mediaType: input.contentType, data: input.imageBuffer },
          ],
        },
      ],
    });
    return { output: object, provider: resolved.provider, model: resolved.modelId };
  }

  return { output: MOCK_OUTPUT, provider: "mock", model: "mock-seed-packet-scanner-v1" };
}
