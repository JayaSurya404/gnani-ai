# Install this pack in the new VoiceNexus repository

1. Extract the ZIP contents into the root of your new repository. It should create:
   - `AGENTS.md`
   - `.agents/skills/.../SKILL.md`
2. Open/reload the repository in Antigravity. Skills are discovered from `<workspace-root>/.agents/skills/`; root `AGENTS.md` is an always-on project rule file.
3. In Antigravity's Customizations/Skills view, confirm the eight VoiceNexus skills are visible.
4. Install the official third-party skills listed in the project setup instructions (frontend design, Next.js, React and Supabase).
5. Never add API keys to this pack or commit `.env` values.

The included skills guide the coding agent. They are not runtime business agents inside the VoiceNexus product. Runtime AI agents must be implemented in the application and wired to real providers and persisted workflows.
