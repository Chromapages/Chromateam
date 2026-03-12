'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchAgents, fetchAgentStatus, fetchAllHandoffs } from '@/lib/api';
import { AgentsMap, AgentStatus, Handoff } from '@/lib/types';
import { useWebSocket } from '@/lib/useWebSocket';
import PageHeader from '@/components/PageHeader';
import { RefreshCw, Wifi } from 'lucide-react';

// PIXEL-ART CONSTANTS
const C = {
  // Floor 1 (Main Office)
  floorA: '#9B7B3C', floorB: '#8A6C30', floorC: '#7D6128',
  // Floor 2 (Dev Floor - Tech/Cyber theme)
  floor2A: '#1A1A2E', floor2B: '#252538', floor2C: '#2D2D42',
  // Walls
  wallDark: '#1E1E2E', wallMid: '#2A2A3C', wallTop: '#333348',
  deskTop: '#7B5B33', deskFront: '#63482A', deskLeg: '#4A3520',
  // Dev floor desks (tech style)
  devDeskTop: '#2A2A3A', devDeskFront: '#1E1E2E', devDeskAccent: '#06B6D4',
  monFrame: '#1A1A2E', monScreen: '#0D1117', monStand: '#2A2A3A',
  monGlowBusy: '#EF4444', monGlowWork: '#F59E0B', monGlowAvail: '#22C55E',
  chairSeat: '#5C4033', chairBack: '#4A3428',
  shelfWood: '#5C3D1A', shelfBack: '#3A2810',
  potBrown: '#6B3A1F', leafGreen: '#3B7A2A', leafLight: '#5CA040',
  coolerBody: '#B8C4D0', coolerBlue: '#A0C8E8',
  clockFace: '#E8E0D0', clockFrame: '#4A3500',
};

const SPRITE: Record<string, { hair: string; shirt: string; skin: string }> = {
  chroma:   { hair: '#0EA5E9', shirt: '#E0F2FE', skin: '#F97316' }, // Sky blue helmet, ice blue jacket, orange visor
  bender:   { hair: '#06B6D4', shirt: '#CFFAFE', skin: '#FB923C' }, // Cyan helmet, cyan-white jacket, deep orange visor
  pixel:    { hair: '#8B5CF6', shirt: '#EDE9FE', skin: '#F472B6' }, // Violet helmet, lavender jacket, pink visor
  canvas:   { hair: '#EC4899', shirt: '#FCE7F3', skin: '#A855F7' }, // Hot pink helmet, light pink jacket, purple visor
  flux:     { hair: '#F97316', shirt: '#FFF7ED', skin: '#FBBF24' }, // Orange helmet, cream jacket, amber visor
  prism:    { hair: '#3B82F6', shirt: '#DBEAFE', skin: '#22D3EE' }, // Blue helmet, light blue jacket, cyan visor
  lumen:    { hair: '#EAB308', shirt: '#FEF9C3', skin: '#F59E0B' }, // Yellow helmet, pale yellow jacket, golden visor
  momentum: { hair: '#DC2626', shirt: '#FEE2E2', skin: '#EF4444' }, // Red helmet, light red jacket, bright red visor
  glyph:    { hair: '#6366F1', shirt: '#E0E7FF', skin: '#818CF8' }, // Indigo helmet, light indigo jacket, periwinkle visor
  chief:    { hair: '#22C55E', shirt: '#DCFCE7', skin: '#4ADE80' }, // Green helmet, light green jacket, bright green visor
  // Sub-agents
  'frontend-dev':  { hair: '#14B8A6', shirt: '#CCFBF1', skin: '#2DD4BF' }, // Teal helmet, light teal jacket
  'backend-dev':   { hair: '#F59E0B', shirt: '#FEF3C7', skin: '#FBBF24' }, // Amber helmet, light amber jacket
  'code-reviewer': { hair: '#8B5CF6', shirt: '#EDE9FE', skin: '#A78BFA' }, // Purple helmet, light purple jacket
  'qa-tester':     { hair: '#10B981', shirt: '#D1FAE5', skin: '#34D399' }, // Emerald helmet, light emerald jacket
  'mobile-dev':    { hair: '#F43F5E', shirt: '#FFE4E6', skin: '#FB7185' }, // Rose helmet, light rose jacket
  'market-researcher':  { hair: '#0EA5E9', shirt: '#E0F2FE', skin: '#38BDF8' }, // Sky blue
  'competitor-analyst': { hair: '#A855F7', shirt: '#F3E8FF', skin: '#C084FC' }, // Purple
};

function getSprite(agentId: string) { return SPRITE[agentId] ?? { hair: '#4A3728', shirt: '#6B7280', skin: '#F0C8A0' }; }
function statusColor(s: string) { return s === 'busy' ? C.monGlowBusy : s === 'working' ? C.monGlowWork : C.monGlowAvail; }

// Agent initials for chest display
const AGENT_INITIAL: Record<string, string> = {
  chroma: 'C', bender: 'B', pixel: 'P', canvas: 'X',
  flux: 'F', prism: 'R', lumen: 'L', momentum: 'M',
  glyph: 'G', chief: 'H',
  // Sub-agents
  'frontend-dev': 'F', 'backend-dev': 'B', 'code-reviewer': 'Q',
  'qa-tester': 'T', 'mobile-dev': 'M', 'market-researcher': 'R',
  'competitor-analyst': 'A',
};

// Letter patterns for 3x3 chest display (1 = letter pixel, 0 = empty)
const LETTER_3X3: Record<string, number[][]> = {
  'C': [[1,1,1], [1,0,0], [1,1,1]],
  'B': [[1,1,0], [1,1,1], [1,1,0]],
  'P': [[1,1,1], [1,1,0], [1,0,0]],
  'X': [[1,0,1], [0,1,0], [1,0,1]],
  'F': [[1,1,1], [1,1,0], [1,0,0]],
  'R': [[1,1,0], [1,0,1], [1,1,0]],
  'L': [[1,0,0], [1,0,0], [1,1,1]],
  'M': [[1,0,1], [1,1,1], [1,0,1]],
  'G': [[1,1,1], [1,0,1], [1,1,1]],
  'H': [[1,0,1], [1,1,1], [1,0,1]],
  'Q': [[1,1,1], [1,0,1], [0,0,1]], // Q for code-reviewer
  'T': [[1,1,1], [0,1,0], [0,1,0]], // T for qa-tester
  'A': [[0,1,0], [1,0,1], [1,1,1]], // A for competitor-analyst
};

const STATIONS = [
  { id: 0, x: 60, y: 80 }, { id: 1, x: 150, y: 80 }, { id: 2, x: 290, y: 80 }, { id: 3, x: 380, y: 80 },
  { id: 4, x: 60, y: 170 }, { id: 5, x: 150, y: 170 }, { id: 6, x: 290, y: 170 }, { id: 7, x: 380, y: 170 },
  { id: 8, x: 110, y: 250 }, { id: 9, x: 200, y: 250 },
];

// Dev Floor stations (Floor 2) - for Bender and sub-agents
const DEV_STATIONS = [
  { id: 0, x: 60, y: 80 }, { id: 1, x: 160, y: 80 }, { id: 2, x: 280, y: 80 }, { id: 3, x: 380, y: 80 },
  { id: 4, x: 60, y: 170 }, { id: 5, x: 160, y: 170 }, { id: 6, x: 280, y: 170 }, { id: 7, x: 380, y: 170 },
];

// Which agents belong on dev floor
const DEV_FLOOR_AGENTS = ['bender', 'frontend-dev', 'backend-dev', 'code-reviewer', 'qa-tester', 'mobile-dev'];

// Break room destinations
const BREAK_SPOTS = [
  { x: 340, y: 265, name: 'cooler' },
  { x: 350, y: 285, name: 'rug' },
  { x: 240, y: 150, name: 'plant' },
];

type AgentState = 'at_desk' | 'walking' | 'break';

interface AgentPosition {
  x: number;
  y: number;
  state: AgentState;
  targetX?: number;
  targetY?: number;
  facingLeft?: boolean;
  walkProgress?: number;
  breakUntil?: number;
  deskIndex?: number;
}

function PixelFloor(): JSX.Element {
  const tiles: JSX.Element[] = [];
  for (let r = 0; r < 20; r++) {
    for (let c = 0; c < 30; c++) {
      const col = (r + c) % 3 === 0 ? C.floorA : (r + c) % 3 === 1 ? C.floorB : C.floorC;
      tiles.push(<rect key={`t${r}-${c}`} x={c * 16} y={r * 16} width={16} height={16} fill={col} />);
    }
  }
  return <g>{tiles}</g>;
}

// Dev Floor - Tech/Cyber themed floor (Floor 2)
function DevPixelFloor(): JSX.Element {
  const tiles: JSX.Element[] = [];
  for (let r = 0; r < 20; r++) {
    for (let c = 0; c < 30; c++) {
      // Matrix/cyber pattern with subtle green glow
      const isGlow = (r + c) % 7 === 0;
      const col = isGlow ? '#22C55E40' : ((r + c) % 3 === 0 ? C.floor2A : (r + c) % 3 === 1 ? C.floor2B : C.floor2C);
      tiles.push(<rect key={`t${r}-${c}`} x={c * 16} y={r * 16} width={16} height={16} fill={col} />);
    }
  }
  return <g>{tiles}</g>;
}

function PixelWalls(): JSX.Element {
  return (
    <g>
      <rect x={0} y={0} width={480} height={24} fill={C.wallDark} />
      <rect x={0} y={0} width={480} height={4} fill={C.wallTop} />
      <rect x={0} y={20} width={480} height={4} fill={C.wallMid} />
      <rect x={0} y={308} width={480} height={12} fill={C.wallDark} />
      <rect x={0} y={0} width={12} height={320} fill={C.wallDark} />
      <rect x={0} y={0} width={4} height={320} fill={C.wallTop} />
      <rect x={468} y={0} width={12} height={320} fill={C.wallDark} />
      <rect x={476} y={0} width={4} height={320} fill={C.wallTop} />
    </g>
  );
}

function PixelBookshelf({ x }: { x: number }): JSX.Element {
  const books = ['#C1341A', '#1B4FD8', '#22C55E', '#F59E0B', '#A855F7', '#EC4899', '#6366F1', '#06B6D4'];
  return (
    <g>
      <rect x={x} y={4} width={60} height={20} fill={C.shelfBack} />
      <rect x={x} y={4} width={60} height={2} fill={C.shelfWood} />
      <rect x={x} y={13} width={60} height={2} fill={C.shelfWood} />
      <rect x={x} y={22} width={60} height={2} fill={C.shelfWood} />
      {books.slice(0,4).map((c,i) => <rect key={i} x={x+4+i*14} y={6} width={10} height={7} fill={c} rx={0.5} />)}
      {books.slice(4,8).map((c,i) => <rect key={i+4} x={x+4+i*14} y={15} width={10} height={7} fill={c} rx={0.5} />)}
    </g>
  );
}

function PixelPlant({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g>
      <rect x={x} y={y+8} width={10} height={8} fill={C.potBrown} rx={1} />
      <ellipse cx={x+5} cy={y+4} rx={6} ry={5} fill={C.leafGreen} />
      <ellipse cx={x+2} cy={y+2} rx={4} ry={4} fill={C.leafLight} />
      <ellipse cx={x+8} cy={y+3} rx={3} ry={3} fill={C.leafGreen} />
    </g>
  );
}

function PixelClock({ x }: { x: number }): JSX.Element {
  return (
    <g>
      <circle cx={x+8} cy={12} r={8} fill={C.clockFrame} />
      <circle cx={x+8} cy={12} r={6} fill={C.clockFace} />
      <line x1={x+8} y1={12} x2={x+8} y2={8} stroke="#1A1A1A" strokeWidth={1} />
      <line x1={x+8} y1={12} x2={x+11} y2={12} stroke="#1A1A1A" strokeWidth={0.7} />
    </g>
  );
}

function PixelCooler({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g>
      <rect x={x} y={y+10} width={14} height={16} fill={C.coolerBody} rx={1} />
      <rect x={x+3} y={y} width={8} height={12} fill={C.coolerBlue} rx={2} opacity={0.8} />
    </g>
  );
}

interface AgentSpriteProps {
  x: number; y: number; agentId: string;
  colors?: { hair: string; shirt: string; skin: string };
  isBusy?: boolean; statusColor?: string;
  isWalking?: boolean;
  facingLeft?: boolean;
  hasReaction?: boolean;
  reactionType?: string;
}

// Pokémon Gen 3 style pixel-grid sprite system
// 0=transparent, 1=outline, 2=helmet primary, 3=helmet highlight, 4=visor, 5=skin, 6=jacket, 7=jacket detail, 8=pants, 9=boots
const PX = 1.8; // pixel size in SVG units

// Front-facing standing sprite (14w x 22h pixel grid)
const SPRITE_STAND: number[][] = [
  [0,0,0,0,0,1,1,1,1,0,0,0,0,0],
  [0,0,0,1,1,3,3,3,3,1,1,0,0,0],
  [0,0,1,3,2,2,2,2,2,2,3,1,0,0],
  [0,0,1,2,2,2,2,2,2,2,2,1,0,0],
  [0,1,2,2,2,2,2,2,2,2,2,2,1,0],
  [0,1,1,4,4,4,4,4,4,4,4,1,1,0],
  [0,0,1,4,4,4,4,4,4,4,4,1,0,0],
  [0,0,1,1,5,5,5,5,5,5,1,1,0,0],
  [0,0,0,0,1,5,5,5,5,1,0,0,0,0],
  [0,0,0,1,6,6,6,6,6,6,1,0,0,0],
  [0,0,1,6,6,7,6,6,7,6,6,1,0,0],
  [0,1,5,1,6,7,6,6,7,6,1,5,1,0],
  [0,1,5,1,6,6,6,6,6,6,1,5,1,0],
  [0,0,1,0,1,6,6,6,6,1,0,1,0,0],
  [0,0,0,0,1,8,8,8,8,1,0,0,0,0],
  [0,0,0,0,1,8,8,8,8,1,0,0,0,0],
  [0,0,0,0,1,8,1,1,8,1,0,0,0,0],
  [0,0,0,0,1,8,0,0,8,1,0,0,0,0],
  [0,0,0,1,9,9,0,0,9,9,1,0,0,0],
  [0,0,0,1,9,9,1,1,9,9,1,0,0,0],
  [0,0,0,1,1,1,0,0,1,1,1,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

// Walking frame A: left leg forward (14w x 22h)
const SPRITE_WALK_A: number[][] = [
  [0,0,0,0,0,1,1,1,1,0,0,0,0,0],
  [0,0,0,1,1,3,3,3,3,1,1,0,0,0],
  [0,0,1,3,2,2,2,2,2,2,3,1,0,0],
  [0,0,1,2,2,2,2,2,2,2,2,1,0,0],
  [0,1,2,2,2,2,2,2,2,2,2,2,1,0],
  [0,1,1,4,4,4,4,4,4,4,4,1,1,0],
  [0,0,1,4,4,4,4,4,4,4,4,1,0,0],
  [0,0,1,1,5,5,5,5,5,5,1,1,0,0],
  [0,0,0,0,1,5,5,5,5,1,0,0,0,0],
  [0,0,0,1,6,6,6,6,6,6,1,0,0,0],
  [0,1,5,1,6,7,6,6,7,6,1,0,0,0],
  [0,1,5,1,6,6,6,6,6,6,1,5,1,0],
  [0,0,1,0,1,6,6,6,6,1,1,5,1,0],
  [0,0,0,0,1,8,8,8,8,1,0,1,0,0],
  [0,0,0,1,8,8,1,0,1,8,1,0,0,0],
  [0,0,1,8,8,1,0,0,0,8,1,0,0,0],
  [0,0,1,9,9,1,0,0,0,1,8,1,0,0],
  [0,0,1,9,9,1,0,0,1,9,9,1,0,0],
  [0,0,1,1,1,1,0,0,1,9,9,1,0,0],
  [0,0,0,0,0,0,0,0,1,1,1,1,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

// Walking frame B: right leg forward (mirror of A)
const SPRITE_WALK_B: number[][] = [
  [0,0,0,0,0,1,1,1,1,0,0,0,0,0],
  [0,0,0,1,1,3,3,3,3,1,1,0,0,0],
  [0,0,1,3,2,2,2,2,2,2,3,1,0,0],
  [0,0,1,2,2,2,2,2,2,2,2,1,0,0],
  [0,1,2,2,2,2,2,2,2,2,2,2,1,0],
  [0,1,1,4,4,4,4,4,4,4,4,1,1,0],
  [0,0,1,4,4,4,4,4,4,4,4,1,0,0],
  [0,0,1,1,5,5,5,5,5,5,1,1,0,0],
  [0,0,0,0,1,5,5,5,5,1,0,0,0,0],
  [0,0,0,1,6,6,6,6,6,6,1,0,0,0],
  [0,0,0,1,6,7,6,6,7,6,1,5,1,0],
  [0,1,5,1,6,6,6,6,6,6,1,5,1,0],
  [0,1,5,1,6,6,6,6,6,1,0,1,0,0],
  [0,0,1,0,1,8,8,8,8,1,0,0,0,0],
  [0,0,0,1,8,1,0,1,8,8,1,0,0,0],
  [0,0,0,1,8,0,0,0,1,8,8,1,0,0],
  [0,0,1,8,1,0,0,0,1,9,9,1,0,0],
  [0,0,1,9,9,1,0,0,1,9,9,1,0,0],
  [0,0,1,9,9,1,0,0,1,1,1,1,0,0],
  [0,0,1,1,1,1,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

// Sitting at desk sprite (wider arms, no legs visible) 14w x 16h
const SPRITE_SIT: number[][] = [
  [0,0,0,0,0,1,1,1,1,0,0,0,0,0],
  [0,0,0,1,1,3,3,3,3,1,1,0,0,0],
  [0,0,1,3,2,2,2,2,2,2,3,1,0,0],
  [0,0,1,2,2,2,2,2,2,2,2,1,0,0],
  [0,1,2,2,2,2,2,2,2,2,2,2,1,0],
  [0,1,1,4,4,4,4,4,4,4,4,1,1,0],
  [0,0,1,4,4,4,4,4,4,4,4,1,0,0],
  [0,0,1,1,5,5,5,5,5,5,1,1,0,0],
  [0,0,0,0,1,5,5,5,5,1,0,0,0,0],
  [0,0,0,1,6,6,6,6,6,6,1,0,0,0],
  [0,0,1,6,6,7,6,6,7,6,6,1,0,0],
  [1,5,5,1,6,6,6,6,6,6,1,5,5,1],
  [1,5,1,0,1,6,6,6,6,1,0,1,5,1],
  [0,1,0,0,1,6,6,6,6,1,0,0,1,0],
  [0,0,0,0,1,1,1,1,1,1,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

function renderPixelSprite(
  sprite: number[][],
  ox: number,
  oy: number,
  palette: Record<number, string>,
  agentId: string,
): JSX.Element[] {
  const rects: JSX.Element[] = [];
  const initial = AGENT_INITIAL[agentId] ?? '?';
  const letterPattern = LETTER_3X3[initial];
  
  // Chest area for letter: rows 10-12, cols 5-7 (centered 3x3)
  const CHEST_ROWS = [10, 11, 12];
  const CHEST_COLS = [5, 6, 7];
  
  for (let row = 0; row < sprite.length; row++) {
    for (let col = 0; col < sprite[row].length; col++) {
      let val = sprite[row][col];
      
      // Check if this is a chest position that should show the letter
      const chestRowIdx = CHEST_ROWS.indexOf(row);
      const chestColIdx = CHEST_COLS.indexOf(col);
      
      if (chestRowIdx !== -1 && chestColIdx !== -1 && letterPattern) {
        const isLetterPixel = letterPattern[chestRowIdx]?.[chestColIdx] === 1;
        if (isLetterPixel && (val === 6 || val === 7)) {
          // Replace jacket pixels with dark outline for letter visibility
          val = 1; // Use outline black for letter
        }
      }
      
      if (val === 0) continue;
      const color = palette[val];
      if (!color) continue;
      rects.push(
        <rect
          key={`${row}-${col}`}
          x={ox + col * PX}
          y={oy + row * PX}
          width={PX}
          height={PX}
          fill={color}
        />
      );
    }
  }
  return rects;
}

function AgentSprite({ x, y, agentId, colors, isBusy, statusColor, isWalking, facingLeft }: AgentSpriteProps): JSX.Element {
  const spriteW = 14 * PX;
  
  // Get colors from agent or use defaults
  const agentColors = colors ?? getSprite(agentId);
  
  // Build color palette from agent colors
  // colors.hair = helmet primary, colors.shirt = jacket, colors.skin = visor
  const palette: Record<number, string> = {
    1: '#1A1A1A',     // outline black
    2: agentColors.hair,    // helmet primary color
    3: '#FFFFFF',      // helmet highlight (white)
    4: agentColors.skin,    // visor (orange by default)
    5: '#D4A574',      // skin tone
    6: agentColors.shirt,   // jacket body
    7: agentColors.hair,    // jacket detail/accent (same as helmet)
    8: '#2C3E50',      // pants
    9: agentColors.hair,    // boots (match helmet)
  };

  // Choose sprite frame
  const walkFrame = Math.floor(Date.now() / 250) % 2;
  const sprite = isWalking
    ? (walkFrame === 0 ? SPRITE_WALK_A : SPRITE_WALK_B)
    : (isBusy ? SPRITE_SIT : SPRITE_STAND);
  
  // Center sprite on x, align bottom to y offset
  const ox = x - spriteW / 2;
  const oy = isWalking ? y : (isBusy ? y + 10 : y + 4);
  
  const scaleX = facingLeft ? -1 : 1;
  const centerX = x;

  return (
    <g
      id={`agent-${agentId}`}
      transform={`translate(${centerX}, 0) scale(${scaleX}, 1) translate(${-centerX}, 0)`}
    >
      {renderPixelSprite(sprite, ox, oy, palette, agentId)}
    </g>
  );
}

// Workstation desk only (no agent - agent is rendered separately)
function WorkstationDesk({ x, y, isBusy, statusColor }: { x: number; y: number; isBusy: boolean; statusColor: string }): JSX.Element {
  return (
    <g>
      <rect x={x-16} y={y-4} width={36} height={16} fill={C.deskTop} rx={1} />
      <rect x={x-16} y={y+12} width={36} height={4} fill={C.deskFront} />
      <rect x={x-6} y={y-16} width={16} height={12} fill={C.monFrame} rx={1} />
      <rect x={x-4} y={y-14} width={12} height={8} fill={isBusy ? statusColor+"30" : C.monScreen} />
      {isBusy && (
        <>
          <rect x={x-2} y={y-12} width={6} height={1} fill={statusColor} opacity={0.7} />
          <rect x={x-2} y={y-10} width={8} height={1} fill={statusColor} opacity={0.5} />
        </>
      )}
      <rect x={x} y={y-4} width={4} height={4} fill={C.monStand} />
      <rect x={x-5} y={y+2} width={14} height={4} fill="#3A3A4A" rx={0.5} />
      <ellipse cx={x+2} cy={y+30} rx={8} ry={5} fill={C.chairSeat} />
      <rect x={x-4} y={y+24} width={12} height={6} fill={C.chairBack} rx={2} />
    </g>
  );
}

// Dev Floor workstation (tech/cyber style)
function DevWorkstationDesk({ x, y, isBusy, statusColor }: { x: number; y: number; isBusy: boolean; statusColor: string }): JSX.Element {
  return (
    <g>
      {/* Glowing desk edge */}
      <rect x={x-18} y={y-4} width={40} height={16} fill={C.devDeskTop} rx={1} />
      <rect x={x-18} y={y-4} width={40} height={2} fill={C.devDeskAccent} opacity={0.6} />
      <rect x={x-18} y={y+12} width={40} height={4} fill={C.devDeskFront} />
      {/* Monitor with cyan glow */}
      <rect x={x-8} y={y-18} width={20} height={14} fill={C.monFrame} rx={1} />
      <rect x={x-6} y={y-16} width={16} height={10} fill={isBusy ? statusColor+"40" : "#0a0a12"} />
      {isBusy && (
        <>
          <rect x={x-4} y={y-14} width={8} height={1} fill={statusColor} opacity={0.8} />
          <rect x={x-4} y={y-12} width={10} height={1} fill={statusColor} opacity={0.6} />
          <rect x={x-4} y={y-10} width={6} height={1} fill={statusColor} opacity={0.4} />
        </>
      )}
      {/* Neon stand */}
      <rect x={x-2} y={y-4} width={6} height={4} fill={C.devDeskAccent} opacity={0.5} />
      <rect x={x-6} y={y+2} width={14} height={4} fill="#1a1a2a" rx={0.5} />
      {/* Glowing keyboard */}
      <rect x={x-10} y={y+14} width={24} height={3} fill={C.devDeskAccent} opacity={0.3} rx={0.5} />
      {/* Ergonomic chair */}
      <ellipse cx={x+2} cy={y+30} rx={8} ry={5} fill="#1a1a2a" />
      <rect x={x-4} y={y+24} width={12} height={6} fill="#2a2a3a" rx={2} />
    </g>
  );
}

function SummaryBar({ total, busy, working, available }: { total: number; busy: number; working: number; available: number }) {
  return (
    <div className="flex items-center gap-6 mb-4">
      <div className="flex items-center gap-1.5 text-xs text-[#6B6B6B] dark:text-[#A8A49E]">
        <span className="font-bold font-mono text-sm text-[#1A1A1A] dark:text-[#FAFAF8]">{total}</span> Team
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        <span className="font-mono font-bold text-[#EF4444]">{busy}</span>
        <span className="text-[#6B6B6B] dark:text-[#A8A49E]">Busy</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="w-2 h-2 rounded-full bg-amber-500" />
        <span className="font-mono font-bold text-[#F59E0B]">{working}</span>
        <span className="text-[#6B6B6B] dark:text-[#A8A49E]">Working</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        <span className="font-mono font-bold text-[#22C55E]">{available}</span>
        <span className="text-[#6B6B6B] dark:text-[#A8A49E]">Available</span>
      </div>
    </div>
  );
}

function AgentRoster({ agents, statuses, handoffs }: { agents: [string, { name: string; role: string; parent?: string }][]; statuses: Record<string, AgentStatus>; handoffs: Handoff[] }) {
  // Parent agent hierarchy mapping
  const PARENT_OF: Record<string, string> = {
    'frontend-dev': 'Bender', 'backend-dev': 'Bender', 'code-reviewer': 'Bender',
    'qa-tester': 'Bender', 'mobile-dev': 'Bender',
    'market-researcher': 'Prism', 'competitor-analyst': 'Prism'
  };
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
      {agents.map(([id, agent]) => {
        const s = statuses[id];
        const statusLabel = s?.status ?? "available";
        const activeTask = handoffs.find(h => h.toAgent === id && (h.status === "in_progress" || h.status === "pending"));
        const dotColor = statusLabel === "busy" ? "bg-red-500" : statusLabel === "working" ? "bg-amber-500" : "bg-green-500";
        const textColor = statusLabel === "busy" ? "text-[#EF4444]" : statusLabel === "working" ? "text-[#F59E0B]" : "text-[#22C55E]";
        const spriteColors = getSprite(id);
        const parent = PARENT_OF[id];
        return (
          <div key={id} className="border border-[#E4E2DC] dark:border-[#3A3A3A] p-2.5 hover:border-[#1B4FD8]/50 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: spriteColors.shirt }} />
              <span className="text-xs font-bold text-[#1A1A1A] dark:text-[#FAFAF8] truncate">{agent.name}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor} flex-shrink-0 ml-auto`} />
            </div>
            <div className="flex items-center gap-1">
              <p className="text-[9px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">{agent.role}</p>
              {parent && (
                <span className="text-[8px] px-1 bg-[#EDE9FE] dark:bg-[#312E81] text-[#7C3AED] dark:text-[#A78BFA] rounded">
                  {parent}
                </span>
              )}
            </div>
            <p className={`text-[9px] font-mono ${textColor}`}>{statusLabel.toUpperCase()}</p>
            {activeTask && <p className="text-[9px] text-[#6B6B6B] dark:text-[#A8A49E] mt-1 line-clamp-1 leading-relaxed">{activeTask.task}</p>}
            {s && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[8px] text-[#A8A49E]">{s.completed} done</span>
                {s.pending.length > 0 && <span className="text-[8px] text-[#1B4FD8]">{s.pending.length} queued</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OfficePage() {
  const [agents, setAgents] = useState<AgentsMap>({});
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [agentPositions, setAgentPositions] = useState<Record<string, AgentPosition>>({});
  const [agentReactions, setAgentReactions] = useState<Record<string, { type: string; until: number }>>({});

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [agentsData, handoffsData] = await Promise.all([fetchAgents(), fetchAllHandoffs()]);
      setAgents(agentsData);
      setHandoffs(handoffsData);
      const statusEntries = await Promise.all(
        Object.keys(agentsData).map(async (id) => {
          try {
            const s = await fetchAgentStatus(id);
            return [id, s] as [string, AgentStatus];
          } catch {
            return [id, { agent: id, name: agentsData[id].name, role: agentsData[id].role, status: "available" as const, pending: [], completed: 0, avgCompletionTimeMinutes: 0 }] as [string, AgentStatus];
          }
        })
      );
      setStatuses(Object.fromEntries(statusEntries));
    } catch { } finally { setIsLoading(false); }
  }, []);

  // Initialize agent positions at their desks
  useEffect(() => {
    if (Object.keys(agents).length > 0 && Object.keys(agentPositions).length === 0) {
      const initialPositions: Record<string, AgentPosition> = {};
      
      // Floor 1 agents (non-dev agents)
      const floor1Agents = Object.keys(agents).filter(id => !DEV_FLOOR_AGENTS.includes(id)).slice(0, 10);
      floor1Agents.forEach((id, i) => {
        const desk = STATIONS[i];
        if (desk) {
          initialPositions[id] = {
            x: desk.x,
            y: desk.y,
            state: 'at_desk',
            deskIndex: i,
          };
        }
      });
      
      // Floor 2 agents (dev floor)
      const floor2Agents = Object.keys(agents).filter(id => DEV_FLOOR_AGENTS.includes(id));
      floor2Agents.forEach((id, i) => {
        const desk = DEV_STATIONS[i];
        if (desk) {
          initialPositions[id] = {
            x: desk.x,
            y: desk.y,
            state: 'at_desk',
            deskIndex: i,
          };
        }
      });
      
      setAgentPositions(initialPositions);
    }
  }, [agents, agentPositions]);

  // Movement animation loop (60fps)
  useEffect(() => {
    const animationFrame = setInterval(() => {
      setAgentPositions(prev => {
        const now = Date.now();
        const updated = { ...prev };
        
        Object.entries(updated).forEach(([id, pos]) => {
          const status = statuses[id];
          const isBusy = status?.status === 'busy' || status?.status === 'working';
          
          // If busy, return to desk
          if (isBusy && pos.state !== 'at_desk') {
            const desk = STATIONS[pos.deskIndex ?? 0];
            updated[id] = { ...pos, state: 'walking', targetX: desk.x, targetY: desk.y };
            return;
          }
          
          // Walking animation
          if (pos.state === 'walking' && pos.targetX !== undefined && pos.targetY !== undefined) {
            const dx = pos.targetX - pos.x;
            const dy = pos.targetY - pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < 2) {
              // Arrived at destination
              const atDesk = STATIONS.some(s => Math.abs(s.x - pos.targetX!) < 5 && Math.abs(s.y - pos.targetY!) < 5);
              updated[id] = {
                ...pos,
                x: pos.targetX,
                y: pos.targetY,
                state: atDesk ? 'at_desk' : 'break',
                targetX: undefined,
                targetY: undefined,
                breakUntil: atDesk ? undefined : now + 3000 + Math.random() * 5000,
              };
            } else {
              // Move toward target
              const speed = 1.5;
              const moveX = (dx / dist) * speed;
              const moveY = (dy / dist) * speed;
              updated[id] = {
                ...pos,
                x: pos.x + moveX,
                y: pos.y + moveY,
                facingLeft: dx < 0,
              };
            }
            return;
          }
          
          // Break room behavior
          if (pos.state === 'break' && pos.breakUntil && now > pos.breakUntil) {
            const desk = STATIONS[pos.deskIndex ?? 0];
            updated[id] = { ...pos, state: 'walking', targetX: desk.x, targetY: desk.y };
            return;
          }
          
          // Idle wandering (available agents only, random chance)
          if (!isBusy && pos.state === 'at_desk' && Math.random() < 0.002) {
            const spot = BREAK_SPOTS[Math.floor(Math.random() * BREAK_SPOTS.length)];
            updated[id] = { ...pos, state: 'walking', targetX: spot.x, targetY: spot.y };
          }
        });
        
        return updated;
      });
    }, 16); // ~60fps
    
    return () => clearInterval(animationFrame);
  }, [statuses]);

  useEffect(() => { loadAll(); const interval = setInterval(loadAll, 15000); return () => clearInterval(interval); }, [loadAll]);

  const handleWS = useCallback((msg: { type: string; handoff: Handoff; agentId?: string; mentionType?: string }) => {
    setHandoffs(prev => {
      const exists = prev.find(h => h.id === msg.handoff.id);
      if (msg.type === "created" && !exists) {
        // Trigger handoff walk animation
        const newHandoff = msg.handoff;
        setAgentPositions(positions => {
          const fromAgentPos = positions[newHandoff.fromAgent];
          const toAgentIdx = Object.keys(agents).indexOf(newHandoff.toAgent);
          if (fromAgentPos && toAgentIdx >= 0 && toAgentIdx < STATIONS.length) {
            const targetDesk = STATIONS[toAgentIdx];
            return {
              ...positions,
              [newHandoff.fromAgent]: {
                ...fromAgentPos,
                state: 'walking',
                targetX: targetDesk.x,
                targetY: targetDesk.y,
              },
            };
          }
          return positions;
        });
        return [msg.handoff, ...prev];
      }
      if (exists) return prev.map(h => h.id === msg.handoff.id ? msg.handoff : h);
      return prev;
    });
    
    // Handle agent mention events (Discord pings)
    if (msg.type === 'agent_mention' && msg.agentId) {
      const mentionedAgent = msg.agentId;
      setAgentReactions(prev => ({
        ...prev,
        [mentionedAgent]: {
          type: msg.mentionType || 'ping',
          until: Date.now() + 3000 // React for 3 seconds
        }
      }));
    }
  }, [agents]);

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3461";
  useWebSocket(wsUrl, handleWS);

  const agentEntries = Object.entries(agents);
  const statusValues = Object.values(statuses);
  const busyCount = statusValues.filter(s => s.status === "busy").length;
  const workingCount = statusValues.filter(s => s.status === "working").length;
  const availableCount = statusValues.filter(s => s.status === "available").length;

  const agentStations = agentEntries.slice(0, 10).map(([id, agent], i) => {
    const pos = STATIONS[i];
    const s = statuses[id];
    const isBusy = s?.status === "busy" || s?.status === "working";
    // Always show agents at their desks (isAtDesk = true)
    return { id, agent, pos, isBusy, isAtDesk: true, statusColor: statusColor(s?.status ?? "available") };
  });

  const hoveredInfo = hoveredAgent ? {
    agent: agents[hoveredAgent],
    status: statuses[hoveredAgent],
    task: handoffs.find(h => h.toAgent === hoveredAgent && (h.status === "in_progress" || h.status === "pending")),
  } : null;

  return (
    <div>
      <PageHeader title="Office" subtitle={`${agentEntries.length} agents · ${busyCount + workingCount} active`} />
      <SummaryBar total={agentEntries.length} busy={busyCount} working={workingCount} available={availableCount} />
      <div className="flex items-center gap-3 mb-4">
        <button onClick={loadAll} disabled={isLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider border border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E] hover:border-[#1A1A1A] dark:hover:border-[#FAFAF8] transition-colors disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} /> Refresh
        </button>
        <div className="flex items-center gap-1.5 text-[10px] text-[#A8A49E]"><Wifi className="h-3 w-3 text-[#22C55E]" /> Live</div>
      </div>

      {isLoading && agentEntries.length === 0 && <div className="w-full aspect-[3/2] max-w-[960px] bg-[#2C2C3A] animate-pulse" />}

      {agentEntries.length > 0 && (
        <div className="relative border-4 border-[#1E1E2E] bg-[#1E1E2E] max-w-[1400px] overflow-hidden" style={{ imageRendering: "pixelated" }}>
          {/* Floor 1: Main Office */}
          <div className="relative">
            <div className="absolute top-1 left-2 text-[10px] text-[#9B7B3C] font-bold tracking-wider">FLOOR 1 - OFFICE</div>
            <svg viewBox="0 0 480 320" className="w-full h-auto block" style={{ imageRendering: "pixelated" }} shapeRendering="crispEdges">
              <PixelFloor />
              <PixelWalls />
              <PixelBookshelf x={30} />
              <PixelBookshelf x={110} />
              <PixelClock x={200} />
              <PixelBookshelf x={300} />
              <PixelBookshelf x={390} />
              <PixelPlant x={18} y={32} />
              <PixelPlant x={455} y={32} />
              <PixelPlant x={18} y={280} />
              <PixelPlant x={455} y={280} />
              <PixelPlant x={235} y={145} />
              <PixelPlant x={18} y={155} />
              <PixelCooler x={340} y={252} />
              <rect x={310} y={260} width={80} height={40} fill="#3A5068" rx={2} opacity={0.4} />
              <rect x={315} y={265} width={70} height={30} fill="#3A5068" rx={1} opacity={0.3} />
              <rect x={338} y={272} width={24} height={16} fill={C.deskTop} rx={1} />
              {/* Render desks at fixed positions - Floor 1 */}
              {agentEntries.slice(0, 10).map(([id], i) => {
                const desk = STATIONS[i];
                if (!desk) return null;
                const s = statuses[id];
                const isBusy = s?.status === "busy" || s?.status === "working";
                // Skip dev floor agents
                if (DEV_FLOOR_AGENTS.includes(id)) return null;
                return (
                  <WorkstationDesk 
                    key={`desk-${id}`} 
                    x={desk.x} 
                    y={desk.y} 
                    isBusy={isBusy} 
                    statusColor={statusColor(s?.status ?? "available")} 
                  />
                );
              })}
              {/* Render agents at their current positions - Floor 1 */}
              {Object.entries(agentPositions).map(([id, pos]) => {
                // Skip dev floor agents
                if (DEV_FLOOR_AGENTS.includes(id)) return null;
                const s = statuses[id];
                const isWalking = pos.state === 'walking';
                const reaction = agentReactions[id];
                const hasReaction = reaction && reaction.until > Date.now();
                return (
                  <g key={`Agent-${id}`} onMouseEnter={() => setHoveredAgent(id)} onMouseLeave={() => setHoveredAgent(null)} style={{ cursor: "pointer" }}>
                    <AgentSprite 
                      x={pos.x} 
                      y={pos.y} 
                      agentId={id} 
                      isWalking={isWalking} 
                      facingLeft={pos.facingLeft}
                      hasReaction={hasReaction}
                      reactionType={reaction?.type}
                    />
                  </g>
                );
              })}
            </svg>
          </div>
          
          {/* Floor 2: Dev Floor */}
          <div className="relative border-t-4 border-[#0a0a12] mt-2">
            <div className="absolute top-1 left-2 text-[10px] text-[#06B6D4] font-bold tracking-wider flex items-center gap-1">
              <span>◈</span> FLOOR 2 - DEV LAB <span className="text-[#22C55E] text-[8px]">IDE</span>
            </div>
            <svg viewBox="0 0 480 320" className="w-full h-auto block" style={{ imageRendering: "pixelated" }} shapeRendering="crispEdges">
              <DevPixelFloor />
              <PixelWalls />
              {/* Dev floor decorations - terminal screens */}
              <rect x={30} y={10} width={50} height={30} fill="#0a0a12" rx={1} />
              <rect x={32} y={12} width={46} height={26} fill="#1a1a2e" />
              <rect x={34} y={14} width={20} height={2} fill="#22C55E" opacity={0.6} />
              <rect x={34} y={18} width={30} height={2} fill="#06B6D4" opacity={0.4} />
              <rect x={34} y={22} width={15} height={2} fill="#F59E0B" opacity={0.4} />
              <rect x={34} y={26} width={25} height={2} fill="#8B5CF6" opacity={0.4} />
              
              <rect x={400} y={10} width={50} height={30} fill="#0a0a12" rx={1} />
              <rect x={402} y={12} width={46} height={26} fill="#1a1a2e" />
              <rect x={404} y={14} width={20} height={2} fill="#22C55E" opacity={0.6} />
              <rect x={404} y={18} width={30} height={2} fill="#06B6D4" opacity={0.4} />
              
              {/* Code blocks decoration */}
              <rect x={180} y={8} width={120} height={25} fill="#0a0a12" rx={1} />
              <rect x={182} y={10} width={116} height={21} fill="#1a1a2e" />
              <rect x={185} y={13} width={40} height={2} fill="#8B5CF6" opacity={0.5} />
              <rect x={185} y={17} width={60} height={2} fill="#22C55E" opacity={0.4} />
              <rect x={185} y={21} width={50} height={2} fill="#06B6D4" opacity={0.4} />
              
              {/* Render dev floor desks */}
              {agentEntries.map(([id], i) => {
                if (!DEV_FLOOR_AGENTS.includes(id)) return null;
                const desk = DEV_STATIONS[DEV_FLOOR_AGENTS.indexOf(id)];
                if (!desk) return null;
                const s = statuses[id];
                const isBusy = s?.status === "busy" || s?.status === "working";
                return (
                  <DevWorkstationDesk 
                    key={`devdesk-${id}`} 
                    x={desk.x} 
                    y={desk.y} 
                    isBusy={isBusy} 
                    statusColor={statusColor(s?.status ?? "available")} 
                  />
                );
              })}
              {/* Render dev floor agents */}
              {Object.entries(agentPositions).map(([id, pos]) => {
                if (!DEV_FLOOR_AGENTS.includes(id)) return null;
                const s = statuses[id];
                const isWalking = pos.state === 'walking';
                const reaction = agentReactions[id];
                const hasReaction = reaction && reaction.until > Date.now();
                // Get dev floor position
                const devIdx = DEV_FLOOR_AGENTS.indexOf(id);
                const devDesk = DEV_STATIONS[devIdx];
                const x = pos.state === 'at_desk' ? devDesk?.x ?? pos.x : pos.x;
                const y = pos.state === 'at_desk' ? devDesk?.y ?? pos.y : pos.y;
                return (
                  <g key={`DevAgent-${id}`} onMouseEnter={() => setHoveredAgent(id)} onMouseLeave={() => setHoveredAgent(null)} style={{ cursor: "pointer" }}>
                    <AgentSprite 
                      x={x} 
                      y={y} 
                      agentId={id} 
                      isWalking={isWalking} 
                      facingLeft={pos.facingLeft}
                      hasReaction={hasReaction}
                      reactionType={reaction?.type}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {hoveredAgent && hoveredInfo?.agent && (
            <div className="absolute top-4 right-4 z-20 w-52 bg-[#1A1A1A]/95 backdrop-blur-sm text-white p-3 border border-[#3A3A3A] shadow-xl">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getSprite(hoveredAgent).shirt }} />
                <span className="text-sm font-bold">{hoveredInfo.agent.name}</span>
                <span className={`ml-auto text-[10px] font-mono ${hoveredInfo.status?.status === "busy" ? "text-[#EF4444]" : hoveredInfo.status?.status === "working" ? "text-[#F59E0B]" : "text-[#22C55E]"}`}>
                  {(hoveredInfo.status?.status ?? "available").toUpperCase()}
                </span>
              </div>
              <p className="text-[10px] uppercase tracking-wider text-[#A8A49E] mb-2">{hoveredInfo.agent.role}</p>
              {hoveredInfo.task && (
                <div className="mb-2">
                  <p className="text-[9px] uppercase tracking-wider text-[#6B6B6B] mb-0.5">Current Task</p>
                  <p className="text-xs leading-relaxed line-clamp-2">{hoveredInfo.task.task}</p>
                  <p className="text-[9px] text-[#6B6B6B] mt-0.5">from {hoveredInfo.task.fromAgent} · {hoveredInfo.task.priority}</p>
                </div>
              )}
              {hoveredInfo.status && (
                <div className="flex gap-3 pt-2 border-t border-[#3A3A3A]">
                  <span className="text-[9px] text-[#6B6B6B]">{hoveredInfo.status.completed} done</span>
                  {hoveredInfo.status.pending.length > 0 && <span className="text-[9px] text-[#6B6B6B]">{hoveredInfo.status.pending.length} queued</span>}
                  {hoveredInfo.status.avgCompletionTimeMinutes > 0 && <span className="text-[9px] text-[#6B6B6B]">~{Math.round(hoveredInfo.status.avgCompletionTimeMinutes)}m avg</span>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {agentEntries.length > 0 && <AgentRoster agents={agentEntries} statuses={statuses} handoffs={handoffs} />}
      <p className="mt-4 text-[10px] text-[#A8A49E] dark:text-[#6B6B6B] text-center">Auto-refreshes every 15s · WebSocket live · Hover agents for details</p>
    </div>
  );
}
