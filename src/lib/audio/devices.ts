// Browser-only audio device manager for PartyPilot.
// Handles enumeration, permission, mic capture and Web Audio routing
// for master + cue (pre-listen) buses on separate output sinks.
import { create } from "zustand";

export type DeviceInfo = { deviceId: string; label: string };

type DeviceState = {
  hasPermission: boolean;
  inputs: DeviceInfo[];
  outputs: DeviceInfo[];
  supportsSinkId: boolean;
  supportsSetSinkId: boolean;
  micLevel: number; // 0..1 RMS for live meter
  masterOutputId: string | null;
  cueOutputId: string | null;
  micDeviceId: string | null;
  micEnabled: boolean;
  micGain: number;
};

type DeviceActions = {
  refresh: () => Promise<void>;
  requestPermission: () => Promise<boolean>;
  setMasterOutput: (id: string | null) => Promise<void>;
  setCueOutput: (id: string | null) => Promise<void>;
  setMicDevice: (id: string | null) => Promise<void>;
  setMicEnabled: (on: boolean) => Promise<void>;
  setMicGain: (g: number) => void;
  testCue: () => Promise<void>; // play short tone on cue sink
  testMaster: () => Promise<void>;
  dispose: () => void;
};

let ctx: AudioContext | null = null;
let masterEl: HTMLAudioElement | null = null;
let cueEl: HTMLAudioElement | null = null;
let micStream: MediaStream | null = null;
let micSource: MediaStreamAudioSourceNode | null = null;
let micGainNode: GainNode | null = null;
let micAnalyser: AnalyserNode | null = null;
let micRaf: number | null = null;

function ensureCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return ctx;
}

async function setSinkSafe(el: HTMLAudioElement, sinkId: string | null) {
  const anyEl = el as any;
  if (typeof anyEl.setSinkId !== "function") return;
  try {
    await anyEl.setSinkId(sinkId ?? "");
  } catch (e) {
    console.warn("setSinkId failed", e);
  }
}

function startMicMeter() {
  if (!micAnalyser) return;
  const buf = new Float32Array(micAnalyser.fftSize);
  const loop = () => {
    if (!micAnalyser) return;
    micAnalyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    useDevices.setState({ micLevel: Math.min(1, rms * 2.5) });
    micRaf = requestAnimationFrame(loop);
  };
  micRaf = requestAnimationFrame(loop);
}

function stopMicMeter() {
  if (micRaf != null) cancelAnimationFrame(micRaf);
  micRaf = null;
  useDevices.setState({ micLevel: 0 });
}

async function openMic(deviceId: string | null, gain: number) {
  await closeMic();
  const c = ensureCtx();
  if (!c) return;
  const constraints: MediaStreamConstraints = {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    video: false,
  };
  try {
    micStream = await navigator.mediaDevices.getUserMedia(constraints);
    micSource = c.createMediaStreamSource(micStream);
    micGainNode = c.createGain();
    micGainNode.gain.value = gain;
    micAnalyser = c.createAnalyser();
    micAnalyser.fftSize = 1024;
    micSource.connect(micAnalyser);
    micSource.connect(micGainNode);
    micGainNode.connect(c.destination);
    startMicMeter();
  } catch (e) {
    console.warn("Mic open failed", e);
    useDevices.setState({ micEnabled: false });
  }
}

async function closeMic() {
  stopMicMeter();
  try { micGainNode?.disconnect(); } catch {}
  try { micSource?.disconnect(); } catch {}
  try { micAnalyser?.disconnect(); } catch {}
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = null; micSource = null; micGainNode = null; micAnalyser = null;
}

async function tone(el: HTMLAudioElement, freq: number) {
  const c = ensureCtx();
  if (!c) return;
  // generate 0.4s tone as a wav data URL for output element compatibility with setSinkId
  const sr = 44100;
  const dur = 0.4;
  const n = Math.floor(sr * dur);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.min(1, t * 20) * Math.min(1, (dur - t) * 20);
    buf[i] = Math.sin(2 * Math.PI * freq * t) * 0.25 * env;
  }
  const wav = floatToWav(buf, sr);
  const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
  el.src = url;
  el.volume = 1;
  try { await el.play(); } catch (e) { console.warn(e); }
  el.onended = () => URL.revokeObjectURL(url);
}

function floatToWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE"); writeStr(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeStr(36, "data"); view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return buffer;
}

function ensureSinkElements() {
  if (typeof window === "undefined") return;
  if (!masterEl) { masterEl = new Audio(); masterEl.preload = "auto"; }
  if (!cueEl) { cueEl = new Audio(); cueEl.preload = "auto"; }
}

export const useDevices = create<DeviceState & DeviceActions>((set, get) => ({
  hasPermission: false,
  inputs: [],
  outputs: [],
  supportsSinkId: typeof window !== "undefined" && "setSinkId" in HTMLMediaElement.prototype,
  supportsSetSinkId: typeof window !== "undefined" && "setSinkId" in HTMLMediaElement.prototype,
  micLevel: 0,
  masterOutputId: null,
  cueOutputId: null,
  micDeviceId: null,
  micEnabled: false,
  micGain: 0.8,

  async refresh() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    const list = await navigator.mediaDevices.enumerateDevices();
    const inputs = list.filter((d) => d.kind === "audioinput").map((d) => ({ deviceId: d.deviceId, label: d.label || "Mikrofon" }));
    const outputs = list.filter((d) => d.kind === "audiooutput").map((d) => ({ deviceId: d.deviceId, label: d.label || "Ausgang" }));
    const hasPermission = inputs.some((i) => i.label && !/^Mikrofon$/.test(i.label));
    set({ inputs, outputs, hasPermission });
  },

  async requestPermission() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      await get().refresh();
      return true;
    } catch (e) {
      console.warn("Permission denied", e);
      return false;
    }
  },

  async setMasterOutput(id) {
    ensureSinkElements();
    set({ masterOutputId: id });
    if (masterEl) await setSinkSafe(masterEl, id);
  },
  async setCueOutput(id) {
    ensureSinkElements();
    set({ cueOutputId: id });
    if (cueEl) await setSinkSafe(cueEl, id);
  },
  async setMicDevice(id) {
    set({ micDeviceId: id });
    if (get().micEnabled) await openMic(id, get().micGain);
  },
  async setMicEnabled(on) {
    set({ micEnabled: on });
    if (on) await openMic(get().micDeviceId, get().micGain);
    else await closeMic();
  },
  setMicGain(g) {
    set({ micGain: g });
    if (micGainNode) micGainNode.gain.value = g;
  },
  async testCue() {
    ensureSinkElements();
    if (cueEl && get().cueOutputId) await setSinkSafe(cueEl, get().cueOutputId);
    if (cueEl) await tone(cueEl, 880);
  },
  async testMaster() {
    ensureSinkElements();
    if (masterEl && get().masterOutputId) await setSinkSafe(masterEl, get().masterOutputId);
    if (masterEl) await tone(masterEl, 440);
  },
  dispose() {
    closeMic();
    try { masterEl?.pause(); } catch {}
    try { cueEl?.pause(); } catch {}
  },
}));

// Listen for device changes (hotplug)
if (typeof navigator !== "undefined" && navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener("devicechange", () => {
    useDevices.getState().refresh();
  });
}