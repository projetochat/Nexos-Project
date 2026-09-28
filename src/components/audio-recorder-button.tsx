import * as React from "react";
import { Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui-kit";

export function AudioRecorderButton({
  disabled,
  showLabel = false,
  onRecorded,
  onRecordingChange,
}: {
  disabled?: boolean;
  showLabel?: boolean;
  onRecorded: (file: File) => void | Promise<void>;
  onRecordingChange?: (recording: boolean) => void;
}) {
  const [recording, setRecording] = React.useState(false);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  const stopTracks = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  React.useEffect(
    () => () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      stopTracks();
    },
    [stopTracks],
  );

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("A gravação de áudio não está disponível neste navegador.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const mimeType = (recorder.mimeType || "audio/webm").split(";")[0] || "audio/webm";
        const extension = mimeType.includes("ogg")
          ? "ogg"
          : mimeType.includes("mp4")
            ? "m4a"
            : "webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecording(false);
        onRecordingChange?.(false);
        stopTracks();
        if (!blob.size) return toast.error("Não foi possível gravar o áudio.");
        void Promise.resolve(
          onRecorded(new File([blob], `audio-${Date.now()}.${extension}`, { type: mimeType })),
        ).catch((error) => toast.error((error as Error).message));
      };
      recorder.start();
      setRecording(true);
      onRecordingChange?.(true);
    } catch {
      stopTracks();
      onRecordingChange?.(false);
      toast.error("Não foi possível acessar o microfone.");
    }
  };

  return (
    <Button
      type="button"
      variant={recording ? "primary" : "outline"}
      size={showLabel ? "sm" : "icon"}
      className={showLabel ? "h-8 justify-start text-xs" : "h-7 w-7"}
      disabled={disabled}
      onClick={() => void toggleRecording()}
      aria-label={recording ? "Parar gravação de áudio" : "Gravar áudio"}
      title={recording ? "Parar gravação" : "Gravar áudio"}
    >
      {recording ? (
        <Square className="h-3.5 w-3.5 fill-current" />
      ) : (
        <Mic className="h-3.5 w-3.5" />
      )}
      {showLabel && (recording ? "Parar gravação" : "Gravar Áudio")}
    </Button>
  );
}

function preferredRecordingMimeType() {
  const candidates = [
    "audio/ogg;codecs=opus",
    "audio/webm;codecs=opus",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
  ];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function audioExtension(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  return "webm";
}

function formatRecordingDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function RecorderWaveform({ active }: { active: boolean }) {
  const bars = [4, 8, 14, 9, 18, 11, 22, 15, 8, 19, 12, 24, 15, 9, 18, 12, 21, 8];
  return (
    <span className="hidden min-w-0 flex-1 items-center gap-0.5 sm:flex" aria-hidden="true">
      {bars.map((height, index) => (
        <span
          key={index}
          className={`w-1 shrink-0 rounded-full bg-muted-foreground/40 ${active ? "animate-pulse" : ""}`}
          style={{ height: `${height}px`, animationDelay: `${index * 35}ms` }}
        />
      ))}
    </span>
  );
}

export function AudioAttachmentRecorder({
  disabled,
  onRecorded,
  onRecordingChange,
}: {
  disabled?: boolean;
  onRecorded: (file: File) => void | Promise<void>;
  onRecordingChange?: (recording: boolean) => void;
}) {
  const [recording, setRecording] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [seconds, setSeconds] = React.useState(0);
  const recorderRef = React.useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    chunks: Blob[];
    startedAt: number;
    pausedAt: number | null;
  } | null>(null);
  const discardRef = React.useRef(false);

  React.useEffect(() => {
    if (!recording || paused) return;
    const timer = window.setInterval(() => {
      const startedAt = recorderRef.current?.startedAt;
      if (startedAt) setSeconds(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)));
    }, 250);
    return () => window.clearInterval(timer);
  }, [paused, recording]);

  React.useEffect(
    () => () => {
      const active = recorderRef.current;
      discardRef.current = true;
      if (active?.recorder.state !== "inactive") active?.recorder.stop();
      active?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("A gravação de áudio não está disponível neste navegador.");
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const activeStream = stream;
      const mimeType = preferredRecordingMimeType();
      const recorder = new MediaRecorder(activeStream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      discardRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        activeStream.getTracks().forEach((track) => track.stop());
        const startedAt = recorderRef.current?.startedAt ?? Date.now();
        const duration = Date.now() - startedAt;
        recorderRef.current = null;
        setRecording(false);
        setPaused(false);
        setSeconds(0);
        onRecordingChange?.(false);
        if (discardRef.current) {
          discardRef.current = false;
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size || duration < 500) {
          toast.error("O áudio ficou curto demais. Grave novamente por pelo menos 1 segundo.");
          return;
        }
        const type = blob.type || "audio/webm";
        void Promise.resolve(
          onRecorded(new File([blob], `audio-${Date.now()}.${audioExtension(type)}`, { type })),
        ).catch((error) => toast.error((error as Error).message));
      };
      recorder.onerror = () => {
        discardRef.current = true;
        activeStream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        setRecording(false);
        setPaused(false);
        setSeconds(0);
        onRecordingChange?.(false);
        toast.error("A gravação foi interrompida pelo navegador. Tente novamente.");
      };
      recorder.start(1_000);
      recorderRef.current = {
        recorder,
        stream: activeStream,
        chunks,
        startedAt: Date.now(),
        pausedAt: null,
      };
      setSeconds(0);
      setPaused(false);
      setRecording(true);
      onRecordingChange?.(true);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      const name = error instanceof DOMException ? error.name : "";
      toast.error(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Acesso ao microfone bloqueado. Libere o microfone nas permissões deste site e tente novamente."
          : name === "NotFoundError"
            ? "Nenhum microfone foi encontrado neste aparelho."
            : name === "NotReadableError"
              ? "O microfone está sendo usado por outro aplicativo. Feche-o e tente novamente."
              : "Não foi possível acessar o microfone. Verifique a permissão do navegador.",
      );
    }
  };

  const stopRecording = () => {
    const active = recorderRef.current;
    if (!active || active.recorder.state === "inactive") return;
    if (active.pausedAt) {
      active.startedAt += Date.now() - active.pausedAt;
      active.pausedAt = null;
    }
    try {
      active.recorder.requestData();
    } catch {
      // Alguns navegadores liberam o último trecho apenas ao encerrar.
    }
    active.recorder.stop();
  };

  const togglePause = () => {
    const active = recorderRef.current;
    if (!active) return;
    if (active.recorder.state === "recording") {
      active.recorder.pause();
      active.pausedAt = Date.now();
      setPaused(true);
    } else if (active.recorder.state === "paused") {
      if (active.pausedAt) {
        active.startedAt += Date.now() - active.pausedAt;
        active.pausedAt = null;
      }
      active.recorder.resume();
      setPaused(false);
    }
  };

  const discardRecording = () => {
    discardRef.current = true;
    stopRecording();
  };

  if (!recording) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 justify-start text-xs italic"
        disabled={disabled}
        onClick={() => void startRecording()}
        aria-label="Gravar áudio"
        title="Gravar áudio"
      >
        <Mic className="h-3.5 w-3.5" /> Gravar Áudio
      </Button>
    );
  }

  return (
    <div
      className="flex min-h-9 min-w-0 flex-1 items-center gap-0.5 rounded-xl border border-destructive/30 bg-destructive/5 px-0.5 py-1 sm:min-h-12 sm:gap-1.5 sm:px-1.5"
      aria-live="polite"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-destructive sm:h-8 sm:w-8"
        onClick={discardRecording}
        aria-label="Apagar Gravação"
        title="Apagar Gravação"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <span className="relative hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive sm:flex">
        {!paused && (
          <span className="absolute h-2 w-2 animate-ping rounded-full bg-destructive opacity-60" />
        )}
        <Mic className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 sm:min-w-20 sm:shrink-0 sm:flex-none">
        <p className="truncate whitespace-nowrap text-[10px] font-medium sm:text-[11px]">
          {paused ? "Áudio pausado" : "Gravando áudio"}
        </p>
        <p className="font-mono text-[10px] text-muted-foreground sm:text-[11px]">
          {formatRecordingDuration(seconds)}
        </p>
      </div>
      <RecorderWaveform active={!paused} />
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="h-7 w-7 shrink-0 rounded-full sm:h-8 sm:w-8"
        onClick={togglePause}
        aria-label={paused ? "Continuar gravação" : "Pausar gravação"}
        title={paused ? "Continuar Gravação" : "Pausar Gravação"}
      >
        {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="icon"
        className="h-7 w-7 shrink-0 rounded-full sm:h-8 sm:w-8"
        onClick={stopRecording}
        aria-label="Encerrar gravação"
        title="Encerrar gravação"
      >
        <Square className="h-3.5 w-3.5 fill-current" />
      </Button>
    </div>
  );
}
