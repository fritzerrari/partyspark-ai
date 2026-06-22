# audio-stems — HuggingFace Space (Gradio, CPU)
# Pulls a track from a signed URL, runs Demucs htdemucs separation,
# and PUTs the 4 stem WAVs back to the 4 Supabase signed upload URLs
# provided by the caller. Returns "ok" or an error string.
#
# Endpoint (Gradio queue API):
#   POST  /gradio_api/call/separate   body: {"data":[audio_url, upload_urls_json]}
#   GET   /gradio_api/call/separate/{event_id}   (SSE) → final result

import json
import os
import tempfile

import gradio as gr
import requests
import torch
import torchaudio
from demucs.apply import apply_model
from demucs.pretrained import get_model

MODEL_NAME = os.environ.get("DEMUCS_MODEL", "htdemucs")
print(f"Loading Demucs model: {MODEL_NAME} …")
MODEL = get_model(MODEL_NAME)
MODEL.cpu().eval()
print(f"Model loaded. Sources: {MODEL.sources}")


def _download(url: str, dst: str) -> None:
    with requests.get(url, stream=True, timeout=180) as r:
        r.raise_for_status()
        with open(dst, "wb") as f:
            for chunk in r.iter_content(1 << 15):
                if chunk:
                    f.write(chunk)


def _upload(path: str, url: str) -> None:
    with open(path, "rb") as f:
        body = f.read()
    # Supabase signed upload URLs accept PUT with the raw bytes.
    put = requests.put(
        url,
        data=body,
        headers={"content-type": "audio/wav", "x-upsert": "true"},
        timeout=600,
    )
    if put.status_code >= 300:
        raise RuntimeError(f"upload failed {put.status_code}: {put.text[:300]}")


def separate(audio_url: str, upload_urls_json: str) -> str:
    if not audio_url or not upload_urls_json:
        return "error: missing audio_url or upload_urls_json"
    try:
        upload_urls = json.loads(upload_urls_json)
    except Exception as exc:
        return f"error: invalid upload_urls_json ({exc})"

    needed = {"drums", "bass", "vocals", "other"}
    missing = needed - set(upload_urls.keys())
    if missing:
        return f"error: missing upload urls for {sorted(missing)}"

    with tempfile.TemporaryDirectory() as tmp:
        in_path = os.path.join(tmp, "input.audio")
        _download(audio_url, in_path)

        wav, sr = torchaudio.load(in_path)
        if wav.shape[0] == 1:
            wav = wav.repeat(2, 1)
        elif wav.shape[0] > 2:
            wav = wav[:2]
        wav = wav.unsqueeze(0)  # [batch, channels, samples]

        with torch.no_grad():
            sources = apply_model(
                MODEL,
                wav,
                device="cpu",
                split=True,
                overlap=0.20,
                progress=False,
                num_workers=1,
            )[0]

        for i, name in enumerate(MODEL.sources):
            out_path = os.path.join(tmp, f"{name}.wav")
            torchaudio.save(
                out_path,
                sources[i].cpu(),
                sr,
                encoding="PCM_S",
                bits_per_sample=16,
            )
            target = upload_urls.get(name)
            if target:
                _upload(out_path, target)

        return "ok"


demo = gr.Interface(
    fn=separate,
    inputs=[
        gr.Textbox(label="audio_url", info="Signed download URL of the original track"),
        gr.Textbox(
            label="upload_urls_json",
            info='JSON: {"drums":"…","bass":"…","vocals":"…","other":"…"}',
        ),
    ],
    outputs=gr.Textbox(label="status"),
    title="PartyPilot AI — Demucs Stems",
    description="Source separation (htdemucs). Used by the PartyPilot AI cockpit.",
    api_name="separate",
    allow_flagging="never",
)

demo.queue(max_size=4).launch()