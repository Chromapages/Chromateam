# Agent Handoff Manager - Frontend Build Prompt

## Project Overview
Build a modern React/Next.js frontend for the Agent Handoff Manager API. The API runs on `http://127.0.0.1:3458` and manages task handoffs between AI agents (Chroma, Bender, Pixel, Canvas, Flux, Prism, Lumen, Momentum, Glyph, Chief).

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List all agents |
| POST | `/api/handoff` | Create handoff `{fromAgent, toAgent, task, context, decisions, nextSteps, priority}` |
| GET | `/api/context/:agentId` | Get pending context for an agent |
| GET | `/api/pending/:agentId` | Get pending handoffs for agent |
| POST | `/api/handoff/:id/complete` | Mark handoff complete |
| GET | `/api/handoffs` | List all handoffs |

## UI Requirements

### 1. Dashboard View
- Overview showing all agents and their pending handoff counts
- Visual hierarchy showing reporting relationships
- Quick stats: total handoffs today, completed, pending

### 2. Handoff Creation Form
- Dropdown selectors for `fromAgent` and `toAgent` (populated from `/api/agents`)
- Text fields for: task title, context (textarea), decisions (tags), nextSteps (tags), priority (low/medium/high)
- Submit creates POST to `/api/handoff`

### 3. Agent Context View
- Select an agent to see their pending handoffs
- Each handoff shows: fromAgent, task, context, decisions, nextSteps, priority, createdAt
- "Complete" button to mark done

### 4. Handoff Timeline
- View all handoffs in chronological order
- Visual flow showing Chroma → Prism → Canvas chains
- Status badges (pending/completed)

## Design
- Dark theme, modern SaaS aesthetic
- Use shadcn/ui or similar component library
- Smooth transitions between views
- Responsive mobile-friendly

## Tech Stack
- Next.js 14+ with App Router
- TypeScript
- Tailwind CSS
- Fetch or axios for API calls

## Location
- Build to: `/Volumes/MiDRIVE/Chroma-Team/output/agent-handoff-manager/frontend/`
- Run with: `cd frontend && npm run dev`

## Notes
- The API is already running on port 3458
- No auth required (development mode)
- Focus on usability — this is an internal tool for the Chromapages team
