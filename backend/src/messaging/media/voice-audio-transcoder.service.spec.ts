import { expect, it } from "vitest";
import { VoiceAudioTranscoderService } from "./voice-audio-transcoder.service";

it("keeps a valid MP3 intact for Evolution's WhatsApp audio endpoint", async () => {
  const source = Buffer.from("ID3-complete-audio");
  const result = await new VoiceAudioTranscoderService().transcode(
    source,
    "recording.mp3",
    "audio/mpeg",
  );

  expect(result).toEqual({
    buffer: source,
    mimeType: "audio/mpeg",
    fileName: "recording.mp3",
  });
});
