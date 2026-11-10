---
name: pwa-engineering
description: Implements and verifies the VoiceNexus installable Next.js PWA across desktop and mobile, including manifest, icons, service worker, safe caching, update flow, offline fallback and install UX. Use for PWA setup, mobile responsiveness, offline behavior or installability checks.
---

# VoiceNexus PWA Engineering Skill

## Goals
Deliver one responsive web application that can be installed on supported desktop and mobile browsers. A PWA is not a promise that telephone calls, authentication or model inference work offline.

## Implementation workflow
1. Inspect the current Next.js version, app router, existing manifest, icons, headers and service worker before changing them.
2. Define application name, short name, theme/background colours, start URL, display mode, orientation and icon sizes.
3. Generate valid 192x192 and 512x512 icons plus maskable icon assets where supported. Keep branding consistent.
4. Implement an update-aware service worker with a clear cache version and controlled activation.
5. Cache only safe static app shell assets and explicitly public resources. Do not cache authenticated API responses, private business data, lead records, transcripts, recordings, tokens or provider responses in a shared cache.
6. Provide an offline fallback that explains network-required functionality and offers retry.
7. Add an install affordance only when the browser exposes the relevant install capability; otherwise provide concise platform-specific instructions.
8. Test installability, manifest validation, service-worker scope, update behavior, offline navigation and mobile safe areas.

## Network and privacy behavior
- Authentication, live voice sessions, calls, AI inference, lead mutations and private analytics require network connectivity.
- Never store audio or transcript content in Cache Storage by default.
- Clear application-specific private caches on logout where applicable.
- Ensure stale app-shell versions cannot silently break API contracts.
- Avoid intercepting cross-origin API requests unless explicitly designed and tested.

## Quality gates
- Desktop Chromium and mobile viewport checks.
- Install prompt behavior where supported.
- Manifest icons and theme metadata.
- Offline fallback works without claiming data is available offline.
- Service worker update activates safely and does not strand users on an incompatible build.
