import * as React from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui-kit";

export function AudioRecorderButton({
  disabled,
  onRecorded,
}: {
  disabled?: boolean;
  onRecorded: (file: File) => void | Promise<void>;
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
        const mimeType = recorder.mimeType || "audio/webm";
        const extension = mimeType.includes("ogg")
          ? "ogg"
          : mimeType.includes("mp4")
            ? "m4a"
            : "webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecording(false);
        stopTracks();
        if (!blob.size) return toast.error("Não foi possível gravar o áudio.");
        void Promise.resolve(
          onRecorded(new File([blob], `audio-${Date.now()}.${extension}`, { type: mimeType })),
        ).catch((error) => toast.error((error as Error).message));
      };
      recorder.start();
      setRecording(true);
    } catch {
      stopTracks();
      toast.error("Não foi possível acessar o microfone.");
    }
  };

  return (
    <Button
      type="button"
      variant={recording ? "primary" : "outline"}
      size="icon"
      className="h-7 w-7"
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
    </Button>
  );
}
