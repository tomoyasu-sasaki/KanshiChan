# Repository Guidelines

## Project Structure & Module Organization
Kanchichan is an Electron desktop app. `main.js` boots the main process, registers IPC, and loads YOLO assets in `models/`. Supporting code sits under `src/main/` for IPC and services and `src/renderer/` for monitoring, schedule, and settings UIs. Shared constants live in `src/constants/`; styles and assets in `src/styles/` and `assets/`; docs in `docs/`. Place CLI helpers such as `whisper-cli` in `bin/`.

## Build, Test, and Development Commands
- `npm install`: install Electron plus native deps (`canvas`, `onnxruntime-node`, etc.).
- `npm start`: launch the Electron shell; verifies IPC wiring, camera access, and YOLO startup. Add `NODE_ENV=development` for verbose renderer logging when triaging issues.
Future lint or test scripts should be added to `package.json` and mirror existing naming.

## Coding Style & Naming Conventions
Follow `docs/development-guidelines.md` for module boundaries, ES module usage in the renderer, CommonJS in the main process, two-space indentation, and single quotes. Reference `docs/comment-guidelines.md` before writing headers or inline notes - capture intent and constraints, not obvious flow. Use camelCase for variables (`isUserActive`, `scheduleEntries`) and snake_case for IPC channels. Align new CSS with the functional split (`monitor.css`, `schedule.css`, etc.).

## Design & Comment Standards
Consult `docs/DESIGN_SYSTEM.md` before tweaking renderer layouts to preserve spacing, color tokens, and typography. When adding explanatory comments, defer to `docs/comment-guidelines.md` so reviewers see "why" decisions and cross-file impacts.

## Testing Guidelines
Automated tests are not present yet; rely on manual validation after each change. Confirm `npm start` boots without console errors, the webcam stream paints overlays, threshold alerts fire, and VOICEVOX fallbacks degrade gracefully when the engine is offline. When adding tests, colocate specs next to the module (`src/renderer/monitor.spec.js`) and document manual regression steps in the PR until scripted coverage exists.

## Commit & Pull Request Guidelines
History mixes concise Japanese and English messages (`Add detection dashboard with persistent logging`, `feat: 音声入力機能の完成`). Keep summaries imperative, <=72 chars, and group changes logically. Reference issue IDs when available, and note hardware or model requirements in the body. Pull requests should include scope overview, verification steps, and screenshots or recordings for UI tweaks; call out docs or model updates explicitly.

## Security & Configuration Tips
Protect API keys and VOICEVOX endpoints with local environment variables - never commit credentials. Camera and microphone prompts appear on first launch; document any newly required permissions in the PR. Large model files (`models/*.onnx`, `*.gguf`) stay out of Git; share download instructions or automation scripts instead of binary diffs.
