# Audio Reactive Shader Lab

A browser-based app that renders animated shader graphics in WebGL and drives the visuals from live audio analysis.

## Features

- Full-screen animated fragment shader.
- Audio-reactive visuals using bass, mids, treble, and overall energy.
- Load local audio files and control playback.
- Optional microphone input mode for live reaction.
- Real-time controls for sensitivity and color shift.

## Run locally

Because browsers restrict some APIs on `file://` pages, run with a local server.

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> in a modern browser.

## Usage

1. Click **Music file** to load an audio track, then click **Play**.
2. Or click **Use microphone** and allow audio permission.
3. Tune **Sensitivity** and **Color shift** while the shader runs.

## Tech

- HTML/CSS for UI layout
- JavaScript + Web Audio API for FFT analysis
- WebGL fragment shader for GPU visuals
