import { Loader2, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type DictationButtonProps = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  label?: string;
};

type DictationStatus = "idle" | "recording" | "transcribing" | "error";

const STT_ENDPOINT =
  import.meta.env.VITE_STT_ENDPOINT || "http://127.0.0.1:9000/stt";

function supportedMimeType(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export default function DictationButton({
  onTranscript,
  disabled = false,
  label = "Dictate",
}: DictationButtonProps) {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  function releaseMicrophone() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    return () => {
      releaseMicrophone();
    };
  }, []);

  async function transcribeAudio(blob: Blob, mimeType: string) {
    setStatus("transcribing");
    setError("");

    try {
      const extension = mimeType.includes("mp4") ? "m4a" : "webm";
      const file = new File([blob], `pops-dictation.${extension}`, {
        type: mimeType || "audio/webm",
      });

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(STT_ENDPOINT, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(
          `Transcription service returned HTTP ${response.status}.`,
        );
      }

      const payload = await response.json();
      const text =
        typeof payload?.text === "string" ? payload.text.trim() : "";

      if (!text) {
        throw new Error("No spoken words were returned by transcription.");
      }

      onTranscript(text);
      setStatus("idle");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to transcribe microphone audio.",
      );
      setStatus("error");
    }
  }

  async function startRecording() {
    if (disabled || status === "recording" || status === "transcribing") {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone access is not available in this app window.");
      setStatus("error");
      return;
    }

    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      const mimeType = supportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const recordedMimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, {
          type: recordedMimeType,
        });

        chunksRef.current = [];
        recorderRef.current = null;
        releaseMicrophone();

        if (blob.size === 0) {
          setError("No microphone audio was captured. Please try again.");
          setStatus("error");
          return;
        }

        void transcribeAudio(blob, recordedMimeType);
      });

      recorder.start();
      setStatus("recording");
    } catch (err) {
      releaseMicrophone();

      setError(
        err instanceof Error
          ? err.message
          : "Microphone access was not available.",
      );
      setStatus("error");
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      setStatus("transcribing");
      recorderRef.current.stop();
    }
  }

  const isRecording = status === "recording";
  const isTranscribing = status === "transcribing";

  return (
    <div
      style={{
        alignItems: "center",
        display: "inline-flex",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      <button
        type="button"
        onClick={isRecording ? stopRecording : startRecording}
        disabled={disabled || isTranscribing}
        title={
          isRecording
            ? "Stop recording"
            : isTranscribing
              ? "Transcribing speech"
              : label
        }
        aria-label={
          isRecording
            ? "Stop dictation recording"
            : isTranscribing
              ? "Transcribing speech"
              : label
        }
        style={{
          alignItems: "center",
          background: isRecording
            ? "rgba(220, 77, 77, 0.2)"
            : "rgba(63, 108, 219, 0.18)",
          border: isRecording
            ? "1px solid rgba(255, 120, 120, 0.8)"
            : "1px solid rgba(126, 163, 255, 0.55)",
          borderRadius: 8,
          color: "inherit",
          cursor: disabled || isTranscribing ? "not-allowed" : "pointer",
          display: "inline-flex",
          fontWeight: 700,
          gap: 7,
          minHeight: 38,
          opacity: disabled ? 0.55 : 1,
          padding: "8px 11px",
        }}
      >
        {isTranscribing ? (
          <Loader2 size={16} />
        ) : isRecording ? (
          <Square size={14} fill="currentColor" />
        ) : (
          <Mic size={16} />
        )}

        {isTranscribing ? "Transcribing..." : isRecording ? "Stop" : label}
      </button>

      {error && (
        <span
          role="alert"
          style={{
            color: "#f2abab",
            fontSize: "0.8rem",
            maxWidth: 320,
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}