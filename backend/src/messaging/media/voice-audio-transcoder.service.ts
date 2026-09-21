import { Injectable } from "@nestjs/common";
import { spawn } from "node:child_process";
import { MessagingErrorCode, MessagingProviderError } from "../messaging.contracts";

export type WhatsAppVoiceAudio = {
  buffer: Buffer;
  mimeType: "audio/mpeg";
  fileName: string;
};

@Injectable()
export class VoiceAudioTranscoderService {
  async transcode(input: Buffer, fileName: string, mimeType: string): Promise<WhatsAppVoiceAudio> {
    if (normalizeMimeType(mimeType) === "audio/mpeg" && /\.mp3$/i.test(fileName)) {
      return { buffer: input, mimeType: "audio/mpeg", fileName };
    }

    const output = await runFfmpeg(input);
    return {
      buffer: output,
      mimeType: "audio/mpeg",
      fileName: replaceExtension(fileName, "mp3"),
    };
  }
}

function runFfmpeg(input: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    const executable = process.env.TRIXUS_FFMPEG_PATH?.trim() || "ffmpeg";
    const processHandle = spawn(
      executable,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-codec:a",
        "libmp3lame",
        "-b:a",
        "64k",
        "-f",
        "mp3",
        "pipe:1",
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timeout = setTimeout(() => processHandle.kill(), 120_000);

    processHandle.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    processHandle.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    processHandle.on("error", (error) => {
      clearTimeout(timeout);
      reject(transcodeError(error.message));
    });
    processHandle.on("close", (code) => {
      clearTimeout(timeout);
      const output = Buffer.concat(stdout);
      if (code === 0 && output.length > 0) return resolve(output);
      const detail = Buffer.concat(stderr).toString("utf8").trim().slice(0, 300);
      reject(transcodeError(detail || `ffmpeg finalizou com código ${code ?? "desconhecido"}.`));
    });
    processHandle.stdin.on("error", () => undefined);
    processHandle.stdin.end(input);
  });
}

function transcodeError(detail: string) {
  return new MessagingProviderError(
    MessagingErrorCode.AUDIO_CODEC_NOT_SUPPORTED,
    `Não foi possível preparar o áudio para o WhatsApp. ${detail}`,
    false,
  );
}

function normalizeMimeType(value: string) {
  return value.split(";")[0].trim().toLowerCase();
}

function replaceExtension(fileName: string, extension: string) {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "") || "audio";
  return `${base}.${extension}`;
}
