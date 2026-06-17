# Current State

Last reviewed: 2026-06-17.

This repo is a React Router 7 + Vite proof of concept for evaluating the
published `@chenglou/pretext` package in long chat transcripts. It is not a
production chat client.

Current evaluation surface:

- seeded long-chat sessions with varied transcript shapes
- baseline browser measurement versus Pretext-assisted measurement
- runtime counters around `prepare()` and `layout()`
- stress controls for width, density, line-length mix, and session size

Verification is intentionally small:

```bash
npm run build
```
