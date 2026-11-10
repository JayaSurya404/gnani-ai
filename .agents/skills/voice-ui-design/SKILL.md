---
name: voice-ui-design
description: Designs and implements premium, production-grade VoiceNexus web and PWA interfaces. Use for dashboard layouts, lead and CRM screens, AI Agent Studio, call workspaces, responsive navigation, design tokens, interaction states, accessibility and visual QA.
---

# VoiceNexus UI Design Skill

## Design intent
Create a distinctive, polished B2B SaaS product for businesses using lead intelligence and multilingual voice AI. Use the LegalBridge reference only for useful workspace structure and component composition; do not copy its legal-domain visuals or the older VoiceNexus/LeadNexus styling.

Choose one intentional visual direction before implementation. Recommended direction: refined, high-contrast enterprise SaaS; warm-neutral or deep graphite surfaces; one restrained electric indigo/blue accent; clear typography; precise spacing; subtle depth; crisp data visualization. Avoid default purple-gradient-everywhere AI aesthetics, oversized empty hero cards, noisy glassmorphism, excessive glow, and decorative animations that reduce readability.

## Workflow
1. Inspect existing dependencies, routes, components, fonts and CSS tokens before adding anything.
2. Define a small design system: semantic colors, typography scale, spacing, radii, borders, shadows, focus rings and motion tokens.
3. Define app shell before individual pages: responsive sidebar, top bar, page container, breadcrumbs, workspace switcher, notification area and mobile navigation.
4. Build reusable primitives and domain components before duplicating layouts.
5. Build real page states: loading, empty, populated, error, permission denied, disabled integration and offline/network-required.
6. Use realistic but explicitly synthetic demo data. Never present fake activity as live analytics.
7. Validate desktop, tablet and mobile. Test keyboard navigation, visible focus, contrast, semantic headings, form labels and reduced-motion preference.
8. Capture screenshots at common viewport widths and inspect overflow, alignment, hierarchy, density and consistency before declaring completion.

## UX rules
- Prioritize task clarity: a business owner should understand what needs attention within seconds.
- Lead lists need search, filters, sorting, status, source, last activity and a useful detail view.
- Agent configuration should be a guided, understandable workflow, not a wall of settings.
- Call workspaces should make call status, language, transcript, playback, interruption and handoff state obvious.
- Use charts only when backed by query results or clearly labelled fixtures.
- Every button, menu item, tab and switch must work. Do not create decorative controls.
- Use skeletons for loading, concise errors with recovery actions, and empty states with a next step.
- Keep animations short and purposeful. Respect `prefers-reduced-motion`.

## Component conventions
- Prefer existing shadcn/ui and Radix components where installed.
- Use Lucide icons consistently; do not mix random icon sets.
- Use semantic HTML and controlled forms with schema validation.
- Keep server/client component boundaries deliberate in Next.js App Router.
- Avoid large monolithic page components; compose page sections from focused components.
