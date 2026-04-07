# pretext-chat-poc

Local proof of concept for evaluating the actual `@chenglou/pretext` package in a long chat interface built with React Router 7 + React + Vite.

## Run

This sandbox could not perform a normal `pnpm install` because the needed packages were only partially available in the cached store. To keep the repo local and runnable, the React/Vite stack was reconstructed from the readable pnpm store into `node_modules/`, and the actual `@chenglou/pretext` `0.0.4` package was fetched from the npm tarball and unpacked into `node_modules/@chenglou/pretext`.

```bash
node scripts/extract-store-packages.mjs
node node_modules/vite/dist/node/cli.js dev
```

Build verification:

```bash
node node_modules/vite/dist/node/cli.js build
```

## What The POC Includes

- Session list and route-driven session switching
- Three seeded sessions with different transcript patterns
- Hundreds of rows per session and over a thousand total messages
- Mixed content: short replies, long prose, pasted code-ish text, multilingual text, emoji, timestamps, sender roles
- Baseline versus assisted measurement mode toggle
- Instrumentation for visible rows, measurement counts, estimate error, scroll position, and anchor corrections
- Stress controls for width, density, line-length mix, and session size

## Evaluation Note

### Where the assisted measurement helps

- Before rows mount, width-aware text measurement gives a better first estimate than a rough character-count heuristic.
- During width changes, a cached `prepare/layout` path gives more stable total-height math and usually needs fewer anchor corrections.
- The benefit is most visible on long prose, multilingual text, and messages with many wraps.

### Where it does not help much

- Once real DOM measurements are available, both modes converge because the viewport switches to actual heights.
- Short single-line messages do not benefit much; native browser layout is already good enough there.
- If the whole transcript can stay mounted without virtualization pressure, the browser-native lane is simpler and more faithful.

### Caveats

- This repo now uses the actual published `@chenglou/pretext` package for the assisted lane.
- The runtime stats panel wraps `prepare()` and `layout()` with a thin local counter and prepared-handle cache so the UI can show call counts and cache hits. The measurement and line-breaking behavior still comes from Pretext itself.
- Font choice matters. The app uses a named font stack instead of `system-ui` because the package docs call out `system-ui` accuracy risk on macOS.

## Notes

This is an evaluation tool, not a production chat client.
