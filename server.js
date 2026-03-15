/**
 * Agent Handoff Manager - Full Feature Version
 * 
 * Features:
 * - Single agent requests
 * - Direct chat
 * - Templates
 * - Agent status
 * - Auto-assign
 * - Priority queue
 * - Time tracking
 * - SLA alerts
 * - Calendar scheduling
 * - Web dashboard
 * - Conditional chains
 * - Parallel handoffs
 * - Escalation
 * - Feedback loop
 * - Context aware
 * - Similar task recall
 * - Auto-complete
 */

require('dotenv').config();
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const crmRouter = require('./crm/index');

// File upload setup
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}_${base}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      '.pdf', '.md', '.txt', '.doc', '.docx',
      '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
      '.json', '.csv', '.html', '.css', '.js', '.ts', '.tsx'
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

const app = express();

// Storage (P0: Loaded from disk - see persistence layer below)
// const handoffs = new Map(); // Now loaded from data/handoffs.json
const agentContexts = new Map();
const templates = new Map();
const feedback = new Map();
const contextPackets = new Map(); // Explicit context packets for handoffs
const taskHistory = []; // For similar task recall

const DEFAULT_OUTPUT_DIR = process.env.OUTPUT_DIR || '/Volumes/MiDRIVE/Chroma-Team/output';
const MARKETING_OUTPUT_ROOT = path.join(DEFAULT_OUTPUT_DIR, 'marketing');
const BUILDS_OUTPUT_ROOT = path.join(DEFAULT_OUTPUT_DIR, 'builds');
const WORK_MODE_ARTIFACT = 'artifact';
const WORK_MODE_IN_PLACE = 'in_place';

const MARKETING_AGENT_IDS = new Set([
  'pixel',
  'canvas',
  'flux',
  'glyph',
  'prism',
  'seo-specialist',
  'ad-creator',
  'email-marketer',
  'content-writer',
  'social-manager',
  'competitor-analyst',
]);

const BUILD_AGENT_IDS = new Set([
  'bender',
  'frontend-dev',
  'backend-dev',
  'code-reviewer',
  'qa-tester',
  'mobile-dev',
]);

// ==================== PERSISTENCE LAYER ====================
const HANDOFFS_FILE = path.join(__dirname, 'data', 'handoffs.json');
const DELIVERABLES_FILE = path.join(__dirname, 'data', 'deliverables.json');

function ensureDataDir() {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadHandoffs() {
  ensureDataDir();
  if (fs.existsSync(HANDOFFS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(HANDOFFS_FILE, 'utf8'));
      console.log(`📂 Loaded ${data.length} handoffs from disk`);
      return new Map(data.map(h => [h.id, h]));
    } catch (e) {
      console.error('⚠️ Failed to load handoffs:', e.message);
    }
  }
  return new Map();
}

function saveHandoffs() {
  ensureDataDir();
  try {
    const data = Array.from(handoffs.values());
    fs.writeFileSync(HANDOFFS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('⚠️ Failed to save handoffs:', e.message);
  }
}

function loadDeliverables() {
  ensureDataDir();
  if (fs.existsSync(DELIVERABLES_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DELIVERABLES_FILE, 'utf8'));
      console.log(`📂 Loaded ${data.length} deliverables from disk`);
      return new Map(data.map(d => [d.id, d]));
    } catch (e) {
      console.error('⚠️ Failed to load deliverables:', e.message);
    }
  }
  return new Map();
}

function saveDeliverables() {
  ensureDataDir();
  try {
    const data = Array.from(deliverables.values());
    fs.writeFileSync(DELIVERABLES_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('⚠️ Failed to save deliverables:', e.message);
  }
}

// Initialize from disk
const handoffs = loadHandoffs();
const deliverables = loadDeliverables();

function normalizePathInput(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? path.resolve(trimmed) : null;
}

function deriveWorkdir(targetPath) {
  if (!targetPath) return null;

  try {
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
      return targetPath;
    }
  } catch (error) {
    console.warn(`⚠️ Unable to inspect target path ${targetPath}: ${error.message}`);
  }

  return path.dirname(targetPath);
}

function isMarketingAgent(agentId) {
  return MARKETING_AGENT_IDS.has(agentId);
}

function isBuildAgent(agentId) {
  return BUILD_AGENT_IDS.has(agentId);
}

function getOutputRootForAgent(agentId) {
  if (isMarketingAgent(agentId)) return MARKETING_OUTPUT_ROOT;
  if (isBuildAgent(agentId)) return BUILDS_OUTPUT_ROOT;
  return DEFAULT_OUTPUT_DIR;
}

function getArtifactOutputPath({ handoffId, pipelineId, agentId }) {
  const rootDir = getOutputRootForAgent(agentId);
  return pipelineId
    ? path.join(rootDir, 'pipelines', pipelineId)
    : path.join(rootDir, 'handoffs', handoffId);
}

function normalizeExecutionTarget(input = {}, fallback = {}) {
  const explicitTargetPath = normalizePathInput(input.targetPath);
  const explicitWorkdir = normalizePathInput(input.workdir);
  const requestedMode = input.workMode;
  const hasExplicitTarget = Boolean(explicitTargetPath || explicitWorkdir);

  let workMode = requestedMode;
  if (workMode !== WORK_MODE_ARTIFACT && workMode !== WORK_MODE_IN_PLACE) {
    workMode = hasExplicitTarget ? WORK_MODE_IN_PLACE : WORK_MODE_ARTIFACT;
  }

  const artifactPath = getArtifactOutputPath({
    handoffId: fallback.handoffId || input.id || 'adhoc',
    pipelineId: fallback.pipelineId || input.pipelineId || null,
    agentId: fallback.toAgent || input.toAgent || input.agentId || null,
  });

  if (workMode === WORK_MODE_IN_PLACE) {
    const targetPath = explicitTargetPath || explicitWorkdir;
    const workdir = explicitWorkdir || deriveWorkdir(explicitTargetPath) || artifactPath;
    return { workMode, targetPath, workdir, artifactPath };
  }

  return {
    workMode,
    targetPath: artifactPath,
    workdir: artifactPath,
    artifactPath,
  };
}

function validateExecutionTargetInput(input = {}) {
  const targetPath = normalizePathInput(input.targetPath);
  const workdir = normalizePathInput(input.workdir);
  const hasExplicitTarget = Boolean(targetPath || workdir);

  if (input.workMode && ![WORK_MODE_ARTIFACT, WORK_MODE_IN_PLACE].includes(input.workMode)) {
    return `workMode must be "${WORK_MODE_ARTIFACT}" or "${WORK_MODE_IN_PLACE}"`;
  }

  if (input.workMode === WORK_MODE_IN_PLACE && !hasExplicitTarget) {
    return 'targetPath or workdir is required when workMode is "in_place"';
  }

  if (!hasExplicitTarget) {
    return null;
  }

  if (workdir) {
    if (!fs.existsSync(workdir)) {
      return `workdir does not exist: ${workdir}`;
    }
    if (!fs.statSync(workdir).isDirectory()) {
      return `workdir must be a directory: ${workdir}`;
    }
  }

  const effectiveWorkdir = workdir || deriveWorkdir(targetPath);
  if (!effectiveWorkdir || !fs.existsSync(effectiveWorkdir)) {
    return `target path is not accessible from this server: ${targetPath || workdir}`;
  }
  if (!fs.statSync(effectiveWorkdir).isDirectory()) {
    return `resolved workdir must be a directory: ${effectiveWorkdir}`;
  }

  return null;
}

function ensureExecutionFilesystemTarget(executionTarget) {
  if (!executionTarget || executionTarget.workMode !== WORK_MODE_ARTIFACT) return;
  if (!fs.existsSync(executionTarget.workdir)) {
    fs.mkdirSync(executionTarget.workdir, { recursive: true });
  }
}

function getArtifactSearchPaths(handoff) {
  const executionTarget = handoff.executionTarget || normalizeExecutionTarget(handoff, handoff);
  const rootDir = getOutputRootForAgent(handoff.toAgent);
  const paths = [
    executionTarget.artifactPath,
    handoff.pipelineId ? path.join(rootDir, 'pipelines', handoff.pipelineId) : null,
    path.join(rootDir, 'handoffs', handoff.id),
    path.join(rootDir, 'agents', handoff.toAgent, handoff.id),
    path.join(process.cwd(), 'output', handoff.id),
    path.join('/Users/king-lewie/.openclaw/workspace', handoff.pipelineId || handoff.id)
  ].filter(Boolean);

  return [...new Set(paths)];
}

// ==================== MARKETING HUB STORES ====================
const brands = new Map();
const competitors = new Map();
const marketingRequests = new Map();
// const deliverables = new Map(); // Now loaded from data/deliverables.json
const marketingActivity = [];

// Agent mapping for marketing request types
const MARKETING_AGENTS = {
  'seo': 'seo-specialist',
  'ad-campaign': 'ad-creator',
  'email': 'email-marketer',
  'social': 'social-manager',
  'competitor': 'prism',
  'content': 'content-writer',
  'custom': 'pixel'
};

function extractCleanContent(agentResponse, requestType) {
  if (!agentResponse) return '';
  
  // Try to parse JSON responses
  try {
    const parsed = JSON.parse(agentResponse);
    
    // Handle nested OpenClaw result payloads
    if (parsed.result?.payloads && Array.isArray(parsed.result.payloads)) {
      const texts = parsed.result.payloads
        .filter(p => p.text)
        .map(p => p.text)
        .join('\n\n');
      if (texts) return texts;
    }

    // Handle common payload structures
    if (parsed.payloads && Array.isArray(parsed.payloads)) {
      const texts = parsed.payloads
        .filter(p => p.text)
        .map(p => p.text)
        .join('\n\n');
      if (texts) return texts;
    }
    
    // Handle direct text field
    if (parsed.text) return parsed.text;
    if (parsed.result?.text) return parsed.result.text;
    if (parsed.message) return parsed.message;
    if (parsed.result?.message) return parsed.result.message;
    
    // Handle error objects
    if (parsed.error) return `Error: ${parsed.error}`;
    
    // Return stringified for other structures
    return JSON.stringify(parsed, null, 2);
  } catch (e) {
    // Not JSON - clean up the text response
    let cleaned = agentResponse;
    
    // Remove common wrapper prefixes
    cleaned = cleaned.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
    
    // Truncate excessively long responses
    if (cleaned.length > 10000) {
      cleaned = cleaned.substring(0, 10000) + '\n\n[... truncated ...]';
    }
    
    return cleaned;
  }
}

function syncMarketingRequest(request) {
  if (!request || !request.handoffId) return request;
  const handoff = handoffs.get(request.handoffId);
  if (!handoff) return request;

  if (handoff.status && request.status !== handoff.status) {
    request.status = handoff.status;
    request.updatedAt = new Date().toISOString();
  }

  if (handoff.status === 'completed' && !request.deliverableId) {
    const cleanContent = extractCleanContent(handoff.agentResponse, request.type);
    
    // FALLBACK: If agent didn't write files, save their response to the output folder
    const execTarget = handoff.executionTarget || {};
    const outputPath = execTarget.artifactPath || execTarget.workdir;
    let filePath = null;
    
    if (outputPath && cleanContent) {
      try {
        if (!fs.existsSync(outputPath)) {
          fs.mkdirSync(outputPath, { recursive: true });
        }
        const fileName = `${request.type}-deliverable.md`;
        filePath = path.join(outputPath, fileName);
        fs.writeFileSync(filePath, cleanContent);
        console.log(`📝 Auto-saved deliverable to: ${filePath}`);
      } catch (e) {
        console.warn(`⚠️ Failed to save deliverable file: ${e.message}`);
      }
    }
    
    const deliverableId = `deliverable_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const deliverable = {
      id: deliverableId,
      requestId: request.id,
      name: `${request.type} deliverable`,
      type: request.type,
      url: filePath || '',
      content: cleanContent || handoff.task || '',
      notes: filePath ? `Auto-saved from handoff ${handoff.id}` : `Auto-created from handoff ${handoff.id}`,
      status: 'pending_review',
      createdAt: new Date().toISOString()
    };
    deliverables.set(deliverableId, deliverable);
    // P0: Persist state
    saveDeliverables();
    request.deliverableId = deliverableId;
    request.updatedAt = new Date().toISOString();
    addMarketingActivity('created', 'deliverable', deliverableId, { name: deliverable.name, requestId: request.id });
  }

  marketingRequests.set(request.id, request);
  return request;
}

// Seed default brands
brands.set('brand_1', {
  id: 'brand_1',
  name: 'UNT',
  logo: '',
  colors: { primary: '#3b82f6', secondary: '#1e40af' },
  fonts: { primary: 'Inter' },
  tone: 'Professional',
  audience: 'Tax professionals',
  styleGuideLinks: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
brands.set('brand_2', {
  id: 'brand_2',
  name: "Buddha's Hawaiian Bakery",
  logo: '',
  colors: { primary: '#f59e0b', secondary: '#d97706' },
  fonts: { primary: 'Poppins' },
  tone: 'Warm, inviting',
  audience: 'Local community',
  styleGuideLinks: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
brands.set('brand_3', {
  id: 'brand_3',
  name: 'Chromapages',
  logo: '',
  colors: { primary: '#8b5cf6', secondary: '#6366f1' },
  fonts: { primary: 'Inter' },
  tone: 'Modern, tech-forward',
  audience: 'Businesses needing web apps',
  styleGuideLinks: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

// ==================== END MARKETING HUB STORES ====================

// ==================== MEMORY LAYERS ====================
// 3-layer distilled memory system: inbox → working → project

const MEMORY_FILE = path.join(__dirname, 'data', 'memory.json');

// Load memory on startup
function loadMemory() {
  try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    
    if (fs.existsSync(MEMORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
      memoryLayers.inbox = data.inbox || [];
      memoryLayers.working = data.working || [];
      memoryLayers.project = data.project || [];
      console.log(`🧠 Loaded memory: ${memoryLayers.inbox.length} inbox, ${memoryLayers.working.length} working, ${memoryLayers.project.length} project`);
    }
  } catch (e) {
    console.log('🧠 No existing memory file, starting fresh');
  }
}

// Save memory to file
function saveMemory() {
  try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryLayers, null, 2));
  } catch (e) {
    console.error('❌ Failed to save memory:', e.message);
  }
}

const memoryLayers = {
  inbox: [],    // New incoming context/facts (transient)
  working: [],  // Active context being processed (session-bound)
  project: []   // Distilled persistent memory (long-term)
};

// Memory item schema
function createMemoryItem(type, content, source, tags = []) {
  return {
    id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type, // 'fact' | 'decision' | 'insight' | 'task' | 'learned'
    content,
    source, // agent or system
    tags,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    accessedAt: new Date().toISOString(),
    accessCount: 0
  };
}

// Auto-distill: move from inbox → working → project
function distillMemory() {
  const now = Date.now();
  
  // Move items from inbox to working after 5 minutes
  memoryLayers.inbox = memoryLayers.inbox.filter(item => {
    const age = now - new Date(item.createdAt).getTime();
    if (age > 5 * 60 * 1000 && item.type !== 'learned') {
      item.updatedAt = new Date().toISOString();
      memoryLayers.working.push(item);
      return false;
    }
    return true;
  });
  
  // Move items from working to project after 30 minutes (distilled)
  memoryLayers.working = memoryLayers.working.filter(item => {
    const age = now - new Date(item.createdAt).getTime();
    if (age > 30 * 60 * 1000) {
      item.updatedAt = new Date().toISOString();
      // Deduplicate before adding to project
      const exists = memoryLayers.project.some(p => p.content === item.content && p.type === item.type);
      if (!exists) {
        memoryLayers.project.push(item);
      }
      return false;
    }
    return true;
  });
  
  // Keep project memory bounded (last 100 items)
  if (memoryLayers.project.length > 100) {
    memoryLayers.project = memoryLayers.project.slice(-100);
  }
  
  saveMemory();
}

// Run distillation every minute
setInterval(distillMemory, 60000);

// Initialize memory on startup
loadMemory();

// ==================== END MEMORY LAYERS ====================

let startTime = Date.now();

// ==================== FEATURE 1: PERSISTENT SCHEDULING ====================
const scheduledJobs = new Map(); // In-memory cache
const SCHEDULE_FILE = path.join(__dirname, 'data', 'schedules.json');

// Load schedules from file on startup
function loadSchedules() {
  try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    if (fs.existsSync(SCHEDULE_FILE)) {
      const data = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
      data.forEach(job => {
        scheduledJobs.set(job.id, job);
        scheduleJob(job);
      });
      console.log(`📅 Loaded ${scheduledJobs.size} scheduled jobs`);
      
      // Initialize scheduledAt for cron jobs that don't have one
      scheduledJobs.forEach((job, id) => {
        if (job.cron && !job.scheduledAt) {
          const nextRun = getNextCronRun(job.cron);
          if (nextRun) {
            job.scheduledAt = nextRun;
            scheduleJob(job);
            console.log(`📅 Rescheduled ${job.name}: ${nextRun}`);
          }
        }
      });
    }
  } catch (e) {
    console.error('Failed to load schedules:', e.message);
  }
}

// Save schedules to file
function saveSchedules() {
  try {
    const data = Array.from(scheduledJobs.values());
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save schedules:', e.message);
  }
}

// Schedule a job
function scheduleJob(job) {
  const now = Date.now();
  const executeAt = new Date(job.scheduledAt).getTime();
  const delay = executeAt - now;

  if (delay > 0) {
    job.timeoutId = setTimeout(() => executeScheduledJob(job), delay);
    job.nextRun = executeAt;
  }
}

// Execute a scheduled job
async function executeScheduledJob(job) {
  console.log(`📅 Executing scheduled job: ${job.id} - ${job.task?.substring(0, 30)}...`);

  try {
    if (job.type === 'handoff') {
      await createHandoff(job.fromAgent, job.toAgent, job.task, job.context, [], [], job.priority);
    } else if (job.type === 'automation') {
      await executeAutomation(job);
    } else if (job.type === 'webhook') {
      await triggerWebhook(job);
    }

    // Update last run
    job.lastRun = Date.now();
    job.executions = (job.executions || 0) + 1;

    // If recurring, schedule next run
    if (job.recurring && job.cron) {
      const nextRun = getNextCronRun(job.cron);
      if (nextRun) {
        job.scheduledAt = nextRun;
        scheduleJob(job);
      }
    } else {
      // Remove non-recurring job after execution
      scheduledJobs.delete(job.id);
    }

    saveSchedules();
    sendDiscordNotification({ type: 'schedule', jobId: job.id, task: job.task }, 'schedule');
  } catch (e) {
    console.error(`Schedule error: ${e.message}`);
    job.lastError = e.message;
    saveSchedules();
  }
}

// ==================== FEATURE 2: CRON-STYLE RECURRING ====================
// Simple cron parser (supports: minute, hour, day, month, weekday)
// Formats: "* * * * *" (min, hour, day, month, weekday)
const cronFields = ['minute', 'hour', 'day', 'month', 'weekday'];

function parseCron(cronStr) {
  const parts = cronStr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  return parts;
}

function matchesCronPart(part, value, max) {
  if (part === '*') return true;
  if (part.includes(',')) {
    return part.split(',').map(p => parseInt(p)).includes(value);
  }
  if (part.includes('-')) {
    const [start, end] = part.split('-').map(p => parseInt(p));
    return value >= start && value <= end;
  }
  if (part.includes('/')) {
    const [, step] = part.split('/');
    return value % parseInt(step) === 0;
  }
  return parseInt(part) === value;
}

function getNextCronRun(cronStr) {
  const parts = parseCron(cronStr);
  if (!parts) return null;

  const now = new Date();
  let candidate = new Date(now);
  candidate.setSeconds(0);
  candidate.setMilliseconds(0);

  // Check next 365 days
  for (let i = 0; i < 365 * 24 * 60; i++) {
    candidate = new Date(candidate.getTime() + 60000); // Add 1 minute

    const m = candidate.getMinutes();
    const h = candidate.getHours();
    const d = candidate.getDate();
    const mo = candidate.getMonth() + 1;
    const wd = candidate.getDay();

    if (matchesCronPart(parts[0], m, 59) &&
      matchesCronPart(parts[1], h, 23) &&
      matchesCronPart(parts[2], d, 31) &&
      matchesCronPart(parts[3], mo, 12) &&
      matchesCronPart(parts[4], wd, 6)) {
      return candidate.toISOString();
    }
  }
  return null;
}

// ==================== FEATURE 3: WEBHOOKS ====================
const webhooks = new Map(); // Store webhook configs
const WEBHOOK_FILE = path.join(__dirname, 'data', 'webhooks.json');

function loadWebhooks() {
  try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    if (fs.existsSync(WEBHOOK_FILE)) {
      const data = JSON.parse(fs.readFileSync(WEBHOOK_FILE, 'utf8'));
      data.forEach(wh => webhooks.set(wh.id, wh));
      console.log(`🪝 Loaded ${webhooks.size} webhooks`);
    }
  } catch (e) {
    console.error('Failed to load webhooks:', e.message);
  }
}

function saveWebhooks() {
  try {
    fs.writeFileSync(WEBHOOK_FILE, JSON.stringify(Array.from(webhooks.values()), null, 2));
  } catch (e) {
    console.error('Failed to save webhooks:', e.message);
  }
}

async function triggerWebhook(job) {
  const wh = webhooks.get(job.webhookId);
  if (!wh) {
    console.error(`Webhook not found: ${job.webhookId}`);
    return;
  }

  const payload = {
    event: job.event || 'scheduled',
    data: job.data || {},
    timestamp: new Date().toISOString(),
    jobId: job.id
  };

  try {
    const response = await fetch(wh.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(wh.headers || {})
      },
      body: JSON.stringify(payload)
    });

    console.log(`🪝 Webhook ${wh.name} triggered: ${response.status}`);
    return { success: response.ok, status: response.status };
  } catch (e) {
    console.error(`Webhook error: ${e.message}`);
    return { success: false, error: e.message };
  }
}

// Trigger webhooks on events
function emitWebhookEvent(event, data) {
  webhooks.forEach(wh => {
    if (wh.events && wh.events.includes(event)) {
      triggerWebhook({
        webhookId: wh.id,
        event,
        data,
        task: `Webhook: ${wh.name}`,
        scheduledAt: new Date().toISOString()
      });
    }
  });
}

// ==================== FEATURE 4: GENERAL AUTOMATION ====================
const automations = new Map(); // Non-agent tasks
const AUTOMATION_FILE = path.join(__dirname, 'data', 'automations.json');

function loadAutomations() {
  try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    if (fs.existsSync(AUTOMATION_FILE)) {
      const data = JSON.parse(fs.readFileSync(AUTOMATION_FILE, 'utf8'));
      data.forEach(automation => automations.set(automation.id, automation));
      console.log(`⚙️ Loaded ${automations.size} automations`);
    }
  } catch (e) {
    console.error('Failed to load automations:', e.message);
  }
}

function saveAutomations() {
  try {
    fs.writeFileSync(AUTOMATION_FILE, JSON.stringify(Array.from(automations.values()), null, 2));
  } catch (e) {
    console.error('Failed to save automations:', e.message);
  }
}

async function executeAutomation(automation) {
  console.log(`⚙️ Executing automation: ${automation.name}`);

  const results = {
    automationId: automation.id,
    name: automation.name,
    executedAt: new Date().toISOString(),
    steps: []
  };

  for (const step of automation.steps) {
    try {
      let stepResult;

      switch (step.type) {
        case 'http':
        case 'request':
          // Make HTTP request
          const res = await fetch(step.url, {
            method: step.method || 'GET',
            headers: step.headers || {},
            body: step.body ? JSON.stringify(step.body) : undefined
          });
          stepResult = { status: res.status, ok: res.ok };
          break;

        case 'script':
          // Execute JavaScript (sandboxed)
          try {
            const fn = new Function('context', step.code);
            stepResult = { result: fn(automation.context || {}) };
          } catch (scriptErr) {
            stepResult = { error: scriptErr.message };
          }
          break;

        case 'delay':
          // Wait for X milliseconds
          await new Promise(r => setTimeout(r, step.ms || 1000));
          stepResult = { waited: step.ms || 1000 };
          break;

        case 'transform':
          // Transform data
          try {
            const fn = new Function('input', step.code);
            stepResult = { result: fn(step.input) };
          } catch (e) {
            stepResult = { error: e.message };
          }
          break;

        case 'log':
          console.log(`[Automation] ${step.message}`);
          stepResult = { logged: step.message };
          break;

        default:
          stepResult = { error: `Unknown step type: ${step.type}` };
      }

      results.steps.push({ step: step.name, ...stepResult });
    } catch (e) {
      results.steps.push({ step: step.name, error: e.message });
    }
  }

  console.log(`⚙️ Automation ${automation.name} completed: ${results.steps.length} steps`);
  return results;
}

// Load all persisted data on startup
loadSchedules();
loadWebhooks();
loadAutomations();

// Initialize default templates
function initTemplates() {
  templates.set('research-build', {
    name: 'Research → Build',
    steps: [
      { from: 'chroma', to: 'prism', task: '{task}', context: '{context}' },
      { from: 'prism', to: 'bender', task: 'Build: {task}', context: '{context}' }
    ]
  });

  templates.set('research-copy-build', {
    name: 'Research → Copy → Build',
    steps: [
      { from: 'chroma', to: 'prism', task: 'Research: {task}', context: '{context}' },
      { from: 'prism', to: 'pixel', task: 'Write copy for: {task}', context: '{context}' },
      { from: 'pixel', to: 'bender', task: 'Build: {task}', context: '{context}' }
    ]
  });

  templates.set('full-pipeline', {
    name: 'Full Pipeline: Prism → Pixel → Canvas → Bender',
    steps: [
      { from: 'chroma', to: 'prism', task: 'Research: {task}', context: '{context}' },
      { from: 'prism', to: 'pixel', task: 'Write copy for: {task}', context: '{context}' },
      { from: 'pixel', to: 'canvas', task: 'Create visuals for: {task}', context: '{context}' },
      { from: 'canvas', to: 'bender', task: 'Build: {task}', context: '{context}' }
    ]
  });

  templates.set('quick-build', {
    name: 'Quick Build: Bender only',
    steps: [
      { from: 'chroma', to: 'bender', task: '{task}', context: '{context}' }
    ]
  });

  templates.set('prototype-builder', {
    name: 'App Prototype Builder: Design → Build → Test → Demo → Post',
    steps: [
      { from: 'chroma', to: 'canvas', task: 'Design prototype UI for: {task}', context: '{context}' },
      { from: 'canvas', to: 'bender', task: 'Build prototype: {task}', context: '{context}' },
      { from: 'bender', to: 'bender', task: 'Test & verify prototype works: {task}', context: '{context}' },
      { from: 'bender', to: 'flux', task: 'Create demo/screenshots for: {task}', context: '{context}' },
      { from: 'flux', to: 'chroma', task: 'Post prototype to #app-prototype-builder: {task}', context: '{context}' }
    ]
  });

  // Critic templates
  templates.set('critic-review', {
    name: 'Critic Review: Challenge this idea',
    steps: [
      { from: 'chroma', to: 'critic', task: 'Review and challenge: {task}', context: '{context}' }
    ]
  });

  templates.set('code-critic', {
    name: 'Code Review with Critic',
    steps: [
      { from: 'bender', to: 'critic', task: 'Review this code/decision: {task}', context: '{context}' }
    ]
  });

  templates.set('stress-test', {
    name: 'Stress Test: Run idea through Critic',
    steps: [
      { from: 'chroma', to: 'critic', task: 'Stress test this plan: {task}', context: '{context}' },
      { from: 'critic', to: 'chroma', task: 'Critique complete: {task}', context: '{context}' }
    ]
  });
}
initTemplates();

// CORS - Allow all origins for production (Vercel deployments)
app.use(compression());
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// CRM (ChromaBase Firestore-backed)
app.use('/api/crm', crmRouter);

// Agent-CRM bridge: context for agents
app.get('/api/crm-context', async (req, res) => {
  try {
    const data = await crmRouter.getCrmContext();
    res.json({ status: 'success', data });
  } catch (e) {
    res.status(503).json({ status: 'error', message: e.message || 'CRM unavailable' });
  }
});

// ==================== RATE LIMITING ====================
// Simple in-memory rate limiter
const rateLimitMap = new Map();

function checkRateLimit(identifier) {
  const now = Date.now();
  const windowMs = config.rateLimit.windowMs;
  const maxRequests = config.rateLimit.maxRequests;

  if (!rateLimitMap.has(identifier)) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs });
    return true;
  }

  const record = rateLimitMap.get(identifier);

  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + windowMs;
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count++;
  return true;
}

// Rate limit middleware
app.use((req, res, next) => {
  const identifier = req.ip || req.connection.remoteAddress || 'unknown';
  if (!checkRateLimit(identifier)) {
    return res.status(429).json({ error: 'Too many requests', retryAfter: Math.ceil(config.rateLimit.windowMs / 1000) });
  }
  next();
});

// ==================== WEBHOOK CALLBACKS ====================

async function triggerWebhooks(eventType, data) {
  const webhooks = config.webhooks[`on${eventType}`] || [];

  for (const webhookUrl of webhooks) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: eventType, data, timestamp: new Date().toISOString() }),
        timeout: 5000
      });
      console.log(`✅ Webhook triggered: ${eventType}`);
    } catch (err) {
      console.log(`⚠️ Webhook failed for ${eventType}: ${err.message}`);
    }
  }
}

// ==================== RETRY LOGIC ====================

const retryAttempts = new Map(); // handoffId -> attempt count

async function retryHandoff(handoff) {
  const maxAttempts = config.retry.maxAttempts;
  const currentAttempt = retryAttempts.get(handoff.id) || 0;

  handoff.retryMeta = handoff.retryMeta || { attempts: 0, maxAttempts, history: [] };

  if (currentAttempt >= maxAttempts) {
    console.log(`❌ Handoff ${handoff.id} failed after ${maxAttempts} attempts`);
    handoff.status = 'failed';
    handoff.failedAt = new Date().toISOString();
    handoff.error = `Failed after ${maxAttempts} attempts`;
    handoff.failureReason = handoff.failureReason || 'retry_limit_exceeded';
    handoff.retryMeta.attempts = currentAttempt;
    triggerWebhooks('HandoffFailed', handoff);
    saveHandoffs();
    return;
  }

  retryAttempts.set(handoff.id, currentAttempt + 1);

  // Exponential backoff
  const backoffMs = config.retry.backoffMs * Math.pow(config.retry.backoffMultiplier, currentAttempt);
  handoff.retryMeta.attempts = currentAttempt + 1;
  handoff.retryMeta.lastScheduledAt = new Date().toISOString();
  handoff.retryMeta.history.push({
    attempt: currentAttempt + 1,
    scheduledAt: handoff.retryMeta.lastScheduledAt,
    backoffMs,
    error: handoff.error || null,
  });
  console.log(`⏳ Retrying ${handoff.id} in ${backoffMs}ms (attempt ${currentAttempt + 1}/${maxAttempts})`);
  saveHandoffs();

  setTimeout(async () => {
    handoff.status = 'pending';
    handoff.error = null;
    handoff.failureReason = null;
    processHandoff(handoff);
  }, backoffMs);
}

// ==================== DEPENDENCY CHAINS ====================

const handoffDependencies = new Map(); // handoffId -> { dependsOn: string[], dependsOnComplete: boolean }

function checkDependencies(handoff) {
  const deps = handoffDependencies.get(handoff.id);
  if (!deps || deps.dependsOn.length === 0) return true;

  // Check if all dependencies are completed
  for (const depId of deps.dependsOn) {
    const dep = handoffs.get(depId);
    if (!dep || dep.status !== 'completed') {
      return false;
    }
  }
  return true;
}

// ==================== SCHEDULED HANDOFFS ====================

const scheduledHandoffs = new Map(); // scheduleId -> { cron, handoff, nextRun }

function scheduleHandoff(scheduleId, cronExpression, handoffConfig) {
  scheduledHandoffs.set(scheduleId, {
    cron: cronExpression,
    handoff: handoffConfig,
    nextRun: parseCronNextRun(cronExpression)
  });
}

// Simple cron parser (basic support: hourly, daily, weekly)
function parseCronNextRun(cron) {
  const now = new Date();
  switch (cron) {
    case 'hourly':
      return new Date(now.getTime() + 3600000);
    case 'daily':
      return new Date(now.getTime() + 86400000);
    case 'weekly':
      return new Date(now.getTime() + 604800000);
    default:
      return null;
  }
}

// Check scheduled handoffs every minute
setInterval(() => {
  const now = new Date();
  for (const [id, sched] of scheduledHandoffs) {
    if (sched.nextRun && now >= sched.nextRun) {
      createHandoff(sched.handoff.fromAgent, sched.handoff.toAgent, sched.handoff.task, sched.handoff.context);
      sched.nextRun = parseCronNextRun(sched.cron);
    }
  }
}, 60000);

// ==================== STORAGE CLEANUP ====================

setInterval(() => {
  const maxAge = config.storage.maxHistoryAge * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAge;

  let cleaned = 0;
  for (const [id, handoff] of handoffs) {
    if (handoff.status === 'completed' && handoff.completedAt) {
      const completedTime = new Date(handoff.completedAt).getTime();
      if (completedTime < cutoff) {
        handoffs.delete(id);
        cleaned++;
      }
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 Cleanup: removed ${cleaned} old handoffs`);
  }
}, config.storage.cleanupIntervalMs);

// ==================== INTEGRATIONS ====================

async function sendDiscordNotification(handoff, type = 'new') {
  try {
    if (!config.discord.webhookUrl) return;

    const fromName = config.agents[handoff.fromAgent]?.name || handoff.fromAgent;
    const toName = config.agents[handoff.toAgent]?.name || handoff.toAgent;
    const isPrism = handoff.toAgent === 'prism';
    const isChief = handoff.toAgent === 'chief';
    const isCompetitorResearch = handoff.task?.toLowerCase().includes('competitor') || 
                                  handoff.task?.toLowerCase().includes('research') ||
                                  handoff.task?.toLowerCase().includes('scan');
    const isStandup = handoff.task?.toLowerCase().includes('standup');
    const isWeekly = handoff.task?.toLowerCase().includes('weekly') || handoff.task?.toLowerCase().includes('report');
    
    console.log(`[Discord] type=${type}, toAgent=${handoff.toAgent}, isChief=${isChief}, isStandup=${isStandup}, isWeekly=${isWeekly}, task=${handoff.task?.substring(0, 30)}`);

    // For Chief standup/weekly reports: post to #chief

    // For Prism competitor research: post to #competitor-intel
    if ((type === 'complete' || type === 'completed') && isPrism && isCompetitorResearch && config.discord.channels['competitor-intel']) {
      console.log('📊 Detected Prism competitor research, posting to Discord...');
      const channelId = config.discord.channels['competitor-intel'];
      const message = `## 📊 Competitive Intelligence Report\n\n**From:** ${fromName} → **To:** ${toName}\n\n${handoff.task || 'Research task completed'}\n\n---\n*Generated by Prism via AHM*`;
      
      // Post to #competitor-intel using channel webhook
      const channelWebhookUrl = `https://discord.com/api/webhooks/${channelId.replace('/', '/')}`;
      // Use the main webhook - Discord webhooks are channel-specific, so we'll post to main
      // and add channel mention in message
      await fetch(config.discord.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: message,
          username: 'Prism - Competitive Research'
        })
      });
      console.log('📊 Posted competitor research to Discord');
      return;
    }

    // For Chief standup/weekly reports: post to #chief
    console.log(`[Chief Check] type=${type}, isChief=${isChief}, isStandup=${isStandup}, isWeekly=${isWeekly}`);
    if ((type === 'complete' || type === 'completed') && isChief && (isStandup || isWeekly)) {
      console.log('📋 Detected Chief report, posting to Discord...');
      const message = isWeekly 
        ? `## 📊 Weekly Report\n\n${handoff.task || 'Report task completed'}\n\n---\n*Generated by Chief via AHM*`
        : `## 🦈 Daily Standup\n\n${handoff.task || 'Standup completed'}\n\n---\n*Generated by Chief via AHM*`;
      
      try {
        const response = await fetch(config.discord.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            content: message,
            username: isWeekly ? 'Chief - Weekly Report' : 'Chief - Daily Standup'
          })
        });
        console.log(`📋 Discord response: ${response.status}`);
        if (!response.ok) {
          const errorText = await response.text();
          console.log(`📋 Discord error: ${errorText}`);
        }
      } catch (err) {
        console.log(`📋 Discord fetch error: ${err.message}`);
      }
      console.log('📋 Posted report to Discord');
      return;
    }

    const colors = { new: 5814783, complete: 3066993, urgent: 15158332, escalation: 16776960 };

    const embed = {
      title: type === 'new' ? `🔄 New Handoff: ${toName}` :
        type === 'complete' ? `✅ Handoff Complete: ${handoff.task?.substring(0, 40)}...` :
          type === 'escalation' ? `⚠️ ESCALATION: ${toName}` :
            `💬 Message: ${toName}`,
      color: colors[type] || colors.new,
      fields: [
        { name: 'From', value: fromName, inline: true },
        { name: 'To', value: toName, inline: true },
        { name: 'Priority', value: handoff.priority || 'medium', inline: true }
      ],
      timestamp: new Date().toISOString()
    };

    if (handoff.task) {
      embed.fields.push({ name: 'Task', value: handoff.task.substring(0, 100) });
    }

    await fetch(config.discord.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Agent Handoff Manager', embeds: [embed] })
    });
  } catch (error) {
    console.log('Discord notification failed:', error.message);
  }
}

// Post to a specific Discord channel by ID
async function postToChannel(channelId, message, embed = null) {
  try {
    // For Discord, we need a channel-specific webhook
    // For now, use the main webhook with channel ID in the message
    if (!config.discord.webhookUrl) return;
    
    const payload = { content: message };
    if (embed) {
      payload.embeds = [embed];
    }
    
    await fetch(config.discord.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    console.log(`📢 Posted to channel: ${channelId}`);
  } catch (error) {
    console.log('Channel post failed:', error.message);
  }
}

// Post competitive research results to #competitor-intel
async function postCompetitorResults(handoff) {
  try {
    const channelId = config.discord.channels['competitor-intel'];
    if (!channelId) {
      console.log('No competitor-intel channel configured');
      return;
    }
    
    const toName = config.agents[handoff.toAgent]?.name || handoff.toAgent;
    
    const embed = {
      title: `📊 Competitive Research Complete`,
      color: 3066993,
      fields: [
        { name: 'Agent', value: toName, inline: true },
        { name: 'Category', value: handoff.context?.category || 'General', inline: true }
      ],
      timestamp: new Date().toISOString()
    };
    
    if (handoff.task) {
      embed.fields.push({ name: 'Research Focus', value: handoff.task.substring(0, 150) });
    }
    
    const message = `## 🔍 Competitive Intelligence Report\nResearch completed. View full results in AHM dashboard.`;
    
    await postToChannel(channelId, message, embed);
  } catch (error) {
    console.log('Competitor results post failed:', error.message);
  }
}

// ── PWA: Service Worker and Manifest headers ──────────────────────────────
// sw.js must be served with no-cache and the correct SW scope header
app.get('/sw.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

// manifest.json: short cache, correct MIME type
app.get('/manifest.json', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

// offline fallback page
app.get('/offline', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'offline.html'));
});

// Page routes — must be before express.static so /crm, /dashboard, etc. are matched first
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.get('/agents', (req, res) => {
  const f = path.join(__dirname, 'public', 'agents.html');
  if (fs.existsSync(f)) return res.sendFile(f);
  res.redirect('/dashboard');
});
app.get('/approvals', (req, res) => {
  const f = path.join(__dirname, 'public', 'approvals.html');
  if (fs.existsSync(f)) return res.sendFile(f);
  res.redirect('/dashboard');
});
app.get('/client', (req, res) => {
  const f = path.join(__dirname, 'public', 'client.html');
  if (fs.existsSync(f)) return res.sendFile(f);
  res.redirect('/dashboard');
});
app.get('/pipelines', (req, res) => {
  const f = path.join(__dirname, 'public', 'pipelines.html');
  if (fs.existsSync(f)) return res.sendFile(f);
  res.redirect('/dashboard');
});
app.get('/logs', (req, res) => {
  const f = path.join(__dirname, 'public', 'logs.html');
  if (fs.existsSync(f)) return res.sendFile(f);
  res.redirect('/dashboard');
});
app.get('/settings', (req, res) => {
  const f = path.join(__dirname, 'public', 'settings.html');
  if (fs.existsSync(f)) return res.sendFile(f);
  res.redirect('/dashboard');
});
app.get('/office', (req, res) => {
  const f = path.join(__dirname, 'public', 'office.html');
  if (fs.existsSync(f)) return res.sendFile(f);
  res.redirect('/dashboard');
});
app.get('/crm', (req, res) => {
  const f = path.join(__dirname, 'public', 'crm.html');
  if (fs.existsSync(f)) return res.sendFile(f);
  res.redirect('/dashboard');
});
app.get('/marketing', (req, res) => {
  const f = path.join(__dirname, 'public', 'marketing.html');
  if (fs.existsSync(f)) return res.sendFile(f);
  res.redirect('/dashboard');
});

app.get('/tasks', (req, res) => {
  const f = path.join(__dirname, 'public', 'tasks.html');
  if (fs.existsSync(f)) return res.sendFile(f);
  res.redirect('/dashboard');
});

// Serve static files from public directory
app.use(express.static('public', {
  setHeaders: (res, filePath) => {
    // SVG icons: allow cross-origin for PWA
    if (filePath.endsWith('.svg')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    // Screenshots: long cache
    if (filePath.includes('/screenshots/')) {
      res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 days
    }
  }
}));

// API Documentation page
app.get('/api/docs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'api.html'));
});

app.get('/', (req, res) => {
  res.json({
    name: 'Agent Handoff Manager',
    version: '2.1',
    endpoints: {
      health: '/health',
      dashboard: '/api/dashboard',
      dashboardVisual: '/dashboard',
      agents: '/api/agents',
      status: '/api/agents/:id/status',
      templates: '/api/templates',
      handoff: 'POST /api/handoff',
      single: 'POST /api/task/:agentId',
      // FIX #1: New sub-agent spawn endpoints
      spawnSubAgent: 'POST /api/task/:agentId?spawnSubAgent=frontend-dev',
      spawnDirect: 'POST /api/spawn/:parentAgent/:subAgent',
      chat: 'POST /api/chat/:agentId',
      template: 'POST /api/template/:name/execute',
      parallel: 'POST /api/parallel',
      pipeline: 'POST /api/pipeline',
      pipelineStatus: 'GET /api/pipeline/:id',
      conditional: 'POST /api/conditional',
      escalate: 'POST /api/escalate/:handoffId',
      feedback: 'POST /api/feedback/:handoffId',
      complete: 'POST /api/handoff/:id/complete',
      deliverables: 'GET /api/handoff/:id/deliverables',
      context: 'GET /api/context/:agentId',
      similar: 'GET /api/similar?task=...',
      autocomplete: 'GET /api/autocomplete?task=...',
      schedule: 'POST /api/schedule',
      history: 'GET /api/history'
    }
  });
});

app.get('/health', (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  res.json({
    status: 'ok',
    uptime: `${uptime}s`,
    handoffs: handoffs.size,
    templates: templates.size
  });
});

// ==================== AGENTS ====================

app.get('/api/agents', (req, res) => {
  const agents = {};
  for (const [id, agent] of Object.entries(config.agents)) {
    const pending = Array.from(handoffs.values()).filter(h => h.toAgent === id && h.status === 'pending');
    const completed = Array.from(handoffs.values()).filter(h => h.toAgent === id && h.status === 'completed');
    agents[id] = {
      ...agent,
      status: pending.length > 3 ? 'busy' : pending.length > 0 ? 'working' : 'available',
      pendingCount: pending.length,
      workload: pending.length
    };
  }
  res.json({ agents });
});

app.get('/api/agents/:id/status', (req, res) => {
  const { id } = req.params;
  const agent = config.agents[id];
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const pending = Array.from(handoffs.values()).filter(h => h.toAgent === id && h.status === 'pending');
  const completed = Array.from(handoffs.values()).filter(h => h.toAgent === id && h.status === 'completed');

  // Calculate avg completion time
  const completedWithTime = completed.filter(h => h.completedAt && h.createdAt);
  const avgTime = completedWithTime.length > 0
    ? completedWithTime.reduce((sum, h) => sum + (new Date(h.completedAt) - new Date(h.createdAt)), 0) / completedWithTime.length / 1000 / 60
    : 0;

  res.json({
    agent: id,
    name: agent.name,
    role: agent.role,
    status: pending.length > 3 ? 'busy' : pending.length > 0 ? 'working' : 'available',
    pending: pending.map(h => ({ id: h.id, task: h.task, priority: h.priority })),
    completed: completed.length,
    avgCompletionTimeMinutes: Math.round(avgTime)
  });
});

// ==================== HEARTBEAT AWARENESS ====================
// Detect stale, blocked, overdue, idle, needs-context states

const HEALTH_THRESHOLDS = {
  staleMs: 5 * 60 * 1000,      // 5 minutes without update = stale
  blockedMs: 15 * 60 * 1000,  // 15 minutes in_progress = potentially blocked
  overdueMs: 30 * 60 * 1000,  // 30 minutes past SLA = overdue
  idleMs: 60 * 60 * 1000      // 60 minutes no activity = idle
};

function computeAgentHealth(agentId) {
  const agentHandoffs = Array.from(handoffs.values()).filter(h => h.toAgent === agentId);
  const now = Date.now();
  
  const states = {
    pending: agentHandoffs.filter(h => h.status === 'pending'),
    inProgress: agentHandoffs.filter(h => h.status === 'in_progress'),
    completed: agentHandoffs.filter(h => h.status === 'completed'),
    failed: agentHandoffs.filter(h => h.status === 'failed')
  };
  
  // Check for stale handoffs (no update in 5 min)
  const stale = states.inProgress.filter(h => {
    const lastUpdate = h.startedAt ? new Date(h.startedAt).getTime() : new Date(h.createdAt).getTime();
    return now - lastUpdate > HEALTH_THRESHOLDS.staleMs;
  });
  
  // Check for blocked handoffs (in progress > 15 min)
  const blocked = states.inProgress.filter(h => {
    const lastUpdate = h.startedAt ? new Date(h.startedAt).getTime() : new Date(h.createdAt).getTime();
    return now - lastUpdate > HEALTH_THRESHOLDS.blockedMs;
  });
  
  // Check for overdue (past SLA deadline)
  const overdue = agentHandoffs.filter(h => h.slaDeadline && new Date(h.slaDeadline).getTime() < now && h.status !== 'completed');
  
  // Check for idle (no activity in 1 hour)
  const lastActivity = agentHandoffs.reduce((latest, h) => {
    const dates = [h.createdAt, h.startedAt, h.completedAt, h.responseAt].filter(Boolean);
    const mostRecent = dates.sort((a, b) => new Date(b) - new Date(a))[0];
    return mostRecent && (!latest || new Date(mostRecent) > new Date(latest)) ? mostRecent : latest;
  }, null);
  
  const idle = lastActivity && (now - new Date(lastActivity).getTime() > HEALTH_THRESHOLDS.idleMs);
  
  // Check for needs-context (has pending but no context)
  const needsContext = states.pending.filter(h => !h.context || h.context.length < 10);
  
  // Overall health score (0-100)
  let healthScore = 100;
  healthScore -= stale.length * 10;
  healthScore -= blocked.length * 15;
  healthScore -= overdue.length * 20;
  if (idle) healthScore -= 15;
  healthScore = Math.max(0, healthScore);
  
  // Determine overall status
  let overallStatus = 'healthy';
  if (overdue.length > 0) overallStatus = 'critical';
  else if (blocked.length > 0) overallStatus = 'blocked';
  else if (stale.length > 0) overallStatus = 'stale';
  else if (idle) overallStatus = 'idle';
  
  return {
    agent: agentId,
    healthScore,
    status: overallStatus,
    timestamp: new Date().toISOString(),
    counts: {
      pending: states.pending.length,
      inProgress: states.inProgress.length,
      completed: states.completed.length,
      failed: states.failed.length
    },
    alerts: {
      stale: stale.map(h => ({ id: h.id, task: h.task?.substring(0, 50), startedAt: h.startedAt })),
      blocked: blocked.map(h => ({ id: h.id, task: h.task?.substring(0, 50), startedAt: h.startedAt })),
      overdue: overdue.map(h => ({ id: h.id, task: h.task?.substring(0, 50), slaDeadline: h.slaDeadline })),
      idle,
      needsContext: needsContext.map(h => ({ id: h.id, task: h.task?.substring(0, 50) }))
    },
    lastActivity
  };
}

app.get('/api/agents/:id/health', (req, res) => {
  const { id } = req.params;
  const agent = config.agents[id];
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  
  const health = computeAgentHealth(id);
  res.json(health);
});

app.get('/api/agents/health', (req, res) => {
  const allHealth = Object.keys(config.agents).map(agentId => ({
    agentId,
    ...computeAgentHealth(agentId)
  }));
  
  // Summary
  const summary = {
    totalAgents: allHealth.length,
    healthy: allHealth.filter(h => h.status === 'healthy').length,
    stale: allHealth.filter(h => h.status === 'stale').length,
    blocked: allHealth.filter(h => h.status === 'blocked').length,
    critical: allHealth.filter(h => h.status === 'critical').length,
    idle: allHealth.filter(h => h.status === 'idle').length,
    avgHealthScore: Math.round(allHealth.reduce((sum, h) => sum + h.healthScore, 0) / allHealth.length)
  };
  
  res.json({ agents: allHealth, summary });
});

// ==================== AGENT ACTIVITY & PIPELINE HEALTH ====================

// Get active handoffs (in_progress) - shows what's running right now
app.get('/api/agents/activity', (req, res) => {
  const { client } = req.query;
  let activeHandoffs = Array.from(handoffs.values())
    .filter(h => h.status === 'in_progress' || h.status === 'pending');
  
  if (client) {
    activeHandoffs = activeHandoffs.filter(h => h.client === client);
  }
  
  // Group by agent
  const byAgent = {};
  activeHandoffs.forEach(h => {
    if (!byAgent[h.toAgent]) {
      byAgent[h.toAgent] = [];
    }
    byAgent[h.toAgent].push({
      id: h.id,
      task: h.task,
      status: h.status,
      client: h.client,
      createdAt: h.createdAt,
      startedAt: h.startedAt
    });
  });
  
  res.json({ 
    activeCount: activeHandoffs.length,
    byAgent,
    handoffs: activeHandoffs.map(h => ({
      id: h.id,
      fromAgent: h.fromAgent,
      toAgent: h.toAgent,
      task: h.task,
      status: h.status,
      client: h.client,
      createdAt: h.createdAt,
      startedAt: h.startedAt
    }))
  });
});

// Pipeline health - counts by status, optionally by client
app.get('/api/health/pipeline', (req, res) => {
  const { client } = req.query;
  let allHandoffs = Array.from(handoffs.values());
  
  if (client) {
    allHandoffs = allHandoffs.filter(h => h.client === client);
  }
  
  // Count by status
  const byStatus = {
    pending: allHandoffs.filter(h => h.status === 'pending').length,
    in_progress: allHandoffs.filter(h => h.status === 'in_progress').length,
    completed: allHandoffs.filter(h => h.status === 'completed').length,
    failed: allHandoffs.filter(h => h.status === 'failed').length,
    blocked: allHandoffs.filter(h => h.status === 'blocked').length
  };
  
  // Count by client
  const byClient = {};
  allHandoffs.forEach(h => {
    const c = h.client || 'unassigned';
    if (!byClient[c]) {
      byClient[c] = { total: 0, pending: 0, in_progress: 0, completed: 0, failed: 0 };
    }
    byClient[c].total++;
    if (byStatus[h.status] !== undefined) {
      byClient[c][h.status]++;
    }
  });
  
  // Today's stats
  const today = new Date().toISOString().split('T')[0];
  const todayHandoffs = allHandoffs.filter(h => h.createdAt.startsWith(today));
  const todayCompleted = todayHandoffs.filter(h => h.status === 'completed').length;
  
  res.json({
    byStatus,
    byClient,
    today: {
      total: todayHandoffs.length,
      completed: todayCompleted,
      pending: todayHandoffs.filter(h => h.status === 'pending').length,
      failed: todayHandoffs.filter(h => h.status === 'failed').length
    }
  });
});

// Get clients list
app.get('/api/clients', (req, res) => {
  const allHandoffs = Array.from(handoffs.values());
  const allTasks = loadTasks().tasks;
  
  // Extract unique clients from handoffs and tasks
  const clientSet = new Set();
  allHandoffs.forEach(h => {
    if (h.client) clientSet.add(h.client);
  });
  allTasks.forEach(t => {
    if (t.client) clientSet.add(t.client);
  });
  
  const clients = Array.from(clientSet).sort().map(c => ({
    id: c,
    name: c.charAt(0).toUpperCase() + c.slice(1),
    // Get stats for each client
    handoffs: allHandoffs.filter(h => h.client === c).length,
    tasks: allTasks.filter(t => t.client === c).length,
    active: allHandoffs.filter(h => h.client === c && (h.status === 'in_progress' || h.status === 'pending')).length
  }));
  
  res.json({ clients });
});

// ==================== END HEARTBEAT AWARENESS ====================

// ==================== TEMPLATES ====================

app.get('/api/templates', (req, res) => {
  const list = [];
  for (const [key, template] of templates) {
    list.push({
      key,
      name: template.name,
      steps: template.steps,
      stepCount: template.steps.length
    });
  }
  res.json({ templates: list });
});

app.post('/api/templates', (req, res) => {
  const { name, steps } = req.body;
  if (!name || !steps) return res.status(400).json({ error: 'name and steps required' });
  templates.set(name, { name, steps });
  res.json({ success: true, template: name });
});

// Execute a template as a sequential pipeline (waits for each step to complete)
app.post('/api/template/:name/execute', async (req, res) => {
  const { name } = req.params;
  const { task, context, priority, runAsync = false, targetPath, workdir, workMode } = req.body;
  const template = templates.get(name);

  if (!template) return res.status(404).json({ error: 'Template not found' });

  const executionTargetError = validateExecutionTargetInput({ targetPath, workdir, workMode });
  if (executionTargetError) {
    return res.status(400).json({ error: executionTargetError });
  }

  const pipelineId = `pipeline_${Date.now()}`;
  const results = [];

  if (runAsync) {
    // Run async - create all handoffs and return immediately
    for (let i = 0; i < template.steps.length; i++) {
      const step = template.steps[i];
      const resolvedTask = step.task.replace('{task}', task || '');
      const resolvedContext = step.context ? step.context.replace('{context}', context || '') : context;

      const result = await createHandoff(step.from, step.to, resolvedTask, resolvedContext, [], [], priority, {
        pipelineId,
        pipelineStep: i + 1,
        pipelineTotalSteps: template.steps.length,
        targetPath,
        workdir,
        workMode,
      });
      results.push(result);
    }
    res.json({ success: true, template: name, pipelineId, executed: results.length, results });
  } else {
    // Run sequential - wait for each step to complete before starting next
    let currentContext = context || '';

    for (let i = 0; i < template.steps.length; i++) {
      const step = template.steps[i];
      const resolvedTask = step.task.replace('{task}', task || '');
      const resolvedContext = step.context
        ? step.context.replace('{context}', currentContext)
        : currentContext;

      // Create and wait for this handoff
      const result = await createHandoff(step.from, step.to, resolvedTask, resolvedContext, [], [], priority, {
        pipelineId,
        pipelineStep: i + 1,
        pipelineTotalSteps: template.steps.length,
        waitForComplete: true,
        targetPath,
        workdir,
        workMode,
      });
      results.push(result);

      // Wait for the agent to complete (poll for status)
      console.log(`⏳ Waiting for step ${i + 1}/${template.steps.length} to complete...`);
      while (true) {
        await new Promise(r => setTimeout(r, 2000));
        const h = handoffs.get(result.handoffId);
        if (!h || h.status === 'completed' || h.status === 'failed') {
          if (h?.agentResponse) {
            currentContext = `Previous step output:\n${h.agentResponse}\n\n---\n\nOriginal context: ${currentContext}`;
          }
          break;
        }
      }
    }

    res.json({ success: true, template: name, pipelineId, executed: results.length, results });
  }
});

// ==================== HANDOFF CORE ====================

function createHandoff(fromAgent, toAgent, task, context = '', decisions = [], nextSteps = [], priority = 'medium', options = {}) {
  return new Promise((resolve) => {
    const handoffId = `handoff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const executionTarget = normalizeExecutionTarget(options, {
      handoffId,
      pipelineId: options.pipelineId || null,
      toAgent,
    });
    const handoffOptions = { ...options };
    delete handoffOptions.targetPath;
    delete handoffOptions.workdir;
    delete handoffOptions.workMode;
    delete handoffOptions.executionTarget;

    // If contextPacketId provided, attach the context packet
    let contextPacket = null;
    if (handoffOptions.contextPacketId) {
      contextPacket = contextPackets.get(handoffOptions.contextPacketId);
    }

    const handoff = {
      id: handoffId,
      fromAgent,
      toAgent,
      task: task || '',
      context: context || '',
      decisions: decisions || [],
      nextSteps: nextSteps || [],
      contextPacketId: handoffOptions.contextPacketId || null,
      contextPacket: contextPacket ? {
        id: contextPacket.id,
        facts: contextPacket.facts,
        constraints: contextPacket.constraints,
        decisions: contextPacket.decisions,
        artifacts: contextPacket.artifacts,
        nextSteps: contextPacket.nextSteps
      } : null,
      priority: priority === 'urgent' ? 'urgent' : priority,
      status: 'pending',
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      slaDeadline: handoffOptions.slaMinutes ? new Date(Date.now() + handoffOptions.slaMinutes * 60000).toISOString() : null,
      escalationLevel: handoffOptions.escalationLevel || 0,
      dependsOn: handoffOptions.dependsOn || [], // Dependency chain support
      retryCount: 0,
      executionTarget,
      client: handoffOptions.client || null,  // Client association
      ...handoffOptions
    };

    handoffs.set(handoffId, handoff);
    // P0: Persist state
    saveHandoffs();

    // Register dependencies if any
    if (handoff.dependsOn && handoff.dependsOn.length > 0) {
      handoffDependencies.set(handoffId, {
        dependsOn: handoff.dependsOn,
        dependsOnComplete: false
      });
    }

    if (!agentContexts.has(toAgent)) {
      agentContexts.set(toAgent, []);
    }
    agentContexts.get(toAgent).push({ handoffId, type: 'handoff', ...handoff });

    // Broadcast to WebSocket clients
    if (typeof global.broadcastHandoffUpdate === 'function') {
      global.broadcastHandoffUpdate('created', handoff);
    }

    // Add to history for similar task recall
    taskHistory.push({ id: handoffId, task, toAgent, completedAt: null });
    if (taskHistory.length > 1000) taskHistory.shift();

    sendDiscordNotification(handoff, 'new');

    console.log(`📦 Handoff: ${fromAgent} → ${toAgent}: ${task?.substring(0, 30)}...${handoff.dependsOn?.length ? ` (depends on: ${handoff.dependsOn.join(', ')})` : ''}`);
    resolve({ handoffId, handoff });
  });
}

// API: Create handoff with dependencies
app.post('/api/handoff/with-dependencies', async (req, res) => {
  try {
    const { fromAgent, toAgent, task, context, dependsOn, targetPath, workdir, workMode } = req.body;

    if (!fromAgent || !toAgent || !task) {
      return res.status(400).json({ error: 'fromAgent, toAgent, and task required' });
    }

    const executionTargetError = validateExecutionTargetInput({ targetPath, workdir, workMode });
    if (executionTargetError) {
      return res.status(400).json({ error: executionTargetError });
    }

    // Validate dependencies exist
    if (dependsOn && Array.isArray(dependsOn)) {
      for (const depId of dependsOn) {
        if (!handoffs.has(depId)) {
          return res.status(400).json({ error: `Dependency ${depId} not found` });
        }
      }
    }

    const result = await createHandoff(fromAgent, toAgent, task, context, [], [], 'medium', {
      dependsOn,
      targetPath,
      workdir,
      workMode,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get pipeline status
app.get('/api/pipeline/:id', (req, res) => {
  const { id } = req.params;
  const pipelineHandoffs = Array.from(handoffs.values()).filter(h => h.pipelineId === id);

  if (pipelineHandoffs.length === 0) {
    return res.status(404).json({ error: 'Pipeline not found' });
  }

  const status = {
    pipelineId: id,
    totalSteps: pipelineHandoffs.length,
    completed: pipelineHandoffs.filter(h => h.status === 'completed').length,
    pending: pipelineHandoffs.filter(h => h.status === 'pending').length,
    inProgress: pipelineHandoffs.filter(h => h.status === 'in_progress').length,
    failed: pipelineHandoffs.filter(h => h.status === 'failed').length,
    steps: pipelineHandoffs.map(h => ({
      id: h.id,
      from: h.fromAgent,
      to: h.toAgent,
      task: h.task?.substring(0, 50),
      status: h.status,
      step: h.pipelineStep
    }))
  };

  res.json(status);
});

// API: Cancel pipeline
app.post('/api/pipeline/:id/cancel', (req, res) => {
  const { id } = req.params;
  const pipelineHandoffs = Array.from(handoffs.values()).filter(h => h.pipelineId === id && h.status === 'pending');

  let cancelled = 0;
  for (const h of pipelineHandoffs) {
    h.status = 'cancelled';
    cancelled++;
  }

  res.json({ success: true, cancelled });
});

// API: Metrics
app.get('/api/metrics', (req, res) => {
  const all = Array.from(handoffs.values());
  const now = Date.now();
  const hourAgo = now - 3600000;
  const dayAgo = now - 86400000;

  const lastHour = all.filter(h => new Date(h.createdAt).getTime() > hourAgo);
  const lastDay = all.filter(h => new Date(h.createdAt).getTime() > dayAgo);

  res.json({
    total: all.length,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    lastHour: lastHour.length,
    lastDay: lastDay.length,
    byStatus: {
      pending: all.filter(h => h.status === 'pending').length,
      inProgress: all.filter(h => h.status === 'in_progress').length,
      completed: all.filter(h => h.status === 'completed').length,
      failed: all.filter(h => h.status === 'failed').length,
      cancelled: all.filter(h => h.status === 'cancelled').length
    },
    byAgent: Object.fromEntries(
      Object.keys(config.agents).map(agent => [
        agent,
        all.filter(h => h.toAgent === agent).length
      ])
    ),
    avgCompletionTime: all.filter(h => h.completedAt && h.startedAt).reduce((sum, h) => {
      return sum + (new Date(h.completedAt) - new Date(h.startedAt));
    }, 0) / (all.filter(h => h.completedAt && h.startedAt).length || 1),
    config: {
      rateLimit: config.rateLimit,
      retry: config.retry,
      storage: config.storage,
      agentTimeouts: config.agentTimeouts,
      discord: { webhookUrl: config.discord?.webhookUrl ? '[configured]' : null }
    }
  });
});

// ==================== SYSTEM INFO ====================

app.get('/api/system', (req, res) => {
  const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
  const all = Array.from(handoffs.values());
  res.json({
    uptime: uptimeSec,
    version: '3.0.0',
    status: 'operational',
    handoffCount: all.length,
    scheduledJobCount: scheduledJobs.size,
    webhookCount: webhooks.size,
    automationCount: automations.size,
    config: {
      rateLimit: config.rateLimit,
      retry: config.retry,
      storage: config.storage,
      agentTimeouts: config.agentTimeouts,
      discord: { configured: !!(config.discord?.webhookUrl) }
    }
  });
});

// ==================== AGENT RELEASE ====================

app.post('/api/agent/:agentId/release', (req, res) => {
  const { agentId } = req.params;
  if (!config.agents[agentId]) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  // Cancel all in-progress handoffs for this agent
  let released = 0;
  for (const [id, h] of handoffs.entries()) {
    if (h.toAgent === agentId && h.status === 'in_progress') {
      h.status = 'cancelled';
      h.cancelledAt = new Date().toISOString();
      h.cancelReason = 'Manual release by operator';
      released++;
    }
  }
  res.json({ success: true, agent: agentId, released });
});

app.post('/api/handoff', async (req, res) => {
  try {
    const { fromAgent, toAgent, task, context, decisions, nextSteps, priority, slaMinutes, targetPath, workdir, workMode, pipelineId, pipelineStep, pipelineTotalSteps, client } = req.body;

    if (!fromAgent || !toAgent) {
      return res.status(400).json({ error: 'fromAgent and toAgent required' });
    }

    const executionTargetError = validateExecutionTargetInput({ targetPath, workdir, workMode });
    if (executionTargetError) {
      return res.status(400).json({ error: executionTargetError });
    }

    const result = await createHandoff(fromAgent, toAgent, task, context, decisions, nextSteps, priority, {
      slaMinutes,
      targetPath,
      workdir,
      workMode,
      pipelineId,
      pipelineStep,
      pipelineTotalSteps,
      client,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SINGLE AGENT REQUEST ====================

app.post('/api/task/:agentId', async (req, res) => {
  const { agentId } = req.params;
  const { task, context, priority, spawnSubAgent, targetPath, workdir, workMode } = req.body;

  if (!config.agents[agentId]) {
    return res.status(400).json({ error: `Unknown agent: ${agentId}` });
  }

  const executionTargetError = validateExecutionTargetInput({ targetPath, workdir, workMode });
  if (executionTargetError) {
    return res.status(400).json({ error: executionTargetError });
  }

  // FIX #1: Support spawning sub-agents (e.g., Bender spawning frontend-dev)
  if (spawnSubAgent && AGENT_PARENTS[spawnSubAgent]) {
    // Validate the parent can spawn this sub-agent
    if (AGENT_PARENTS[spawnSubAgent] !== agentId) {
      return res.status(400).json({
        error: `Agent ${agentId} cannot spawn ${spawnSubAgent}. Only ${AGENT_PARENTS[spawnSubAgent]} can.`
      });
    }

    // Create handoff to parent first, with instruction to spawn sub-agent
    const subAgentTask = `${task}\n\n🤖 SPAWN SUB-AGENT: Please spawn '${spawnSubAgent}' to handle this task.`;
    const result = await createHandoff('chroma', agentId, subAgentTask, context, [], [], priority || 'medium', {
      spawnSubAgent,
      targetPath,
      workdir,
      workMode,
    });
    res.json({ success: true, ...result, spawnedSubAgent: spawnSubAgent });
  } else {
    const result = await createHandoff('chroma', agentId, task, context, [], [], priority || 'medium', {
      targetPath,
      workdir,
      workMode,
    });
    res.json({ success: true, ...result });
  }
});

// FIX #1: New endpoint to spawn sub-agents directly via parent
app.post('/api/spawn/:parentAgent/:subAgent', async (req, res) => {
  const { parentAgent, subAgent } = req.params;
  const { task, context, priority } = req.body;

  // Validate parent exists
  if (!config.agents[parentAgent]) {
    return res.status(400).json({ error: `Unknown parent agent: ${parentAgent}` });
  }

  // Validate sub-agent exists and parent relationship
  if (!config.agents[subAgent]) {
    return res.status(400).json({ error: `Unknown sub-agent: ${subAgent}` });
  }

  if (AGENT_PARENTS[subAgent] !== parentAgent) {
    return res.status(400).json({
      error: `Cannot spawn ${subAgent} from ${parentAgent}. Only ${AGENT_PARENTS[subAgent] || 'none'} can spawn this sub-agent.`
    });
  }

  // Create handoff to parent with sub-agent spawn instruction
  const fullTask = `🤖 SUB-AGENT TASK: Spawn '${subAgent}' to execute:\n\n${task}`;

  const result = await createHandoff('chroma', parentAgent, fullTask, context, [], [], priority || 'medium', {
    spawnSubAgent: subAgent,
    subAgentTask: task,
    subAgentContext: context
  });

  res.json({
    success: true,
    ...result,
    parentAgent,
    subAgent,
    message: `Spawned ${subAgent} via ${parentAgent}`
  });
});

// ==================== PIPELINE MANAGEMENT ====================

// [REMOVED DUPLICATE] - Unified into single /api/pipeline endpoint at line 1363

// Add a sub-agent step to an existing pipeline
app.post('/api/pipeline/:pipelineId/step', async (req, res) => {
  try {
    const { pipelineId } = req.params;
    const { from, to, task, context, priority } = req.body;

    // Check if pipeline exists
    const pipelineHandoffs = Array.from(handoffs.values()).filter(h => h.pipelineId === pipelineId);
    if (pipelineHandoffs.length === 0) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }

    const nextStep = pipelineHandoffs.length + 1;

    const result = await createHandoff(
      from,
      to,
      task,
      context || '',
      [],
      [],
      priority || 'medium',
      {
        pipelineId,
        pipelineStep: nextStep,
        pipelineTotalSteps: nextStep
      }
    );

    // Update total steps for all in pipeline
    for (const h of handoffs.values()) {
      if (h.pipelineId === pipelineId) {
        h.pipelineTotalSteps = nextStep;
      }
    }

    res.json({
      success: true,
      ...result,
      pipelineId,
      step: nextStep
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// FIX #4: Spawn sub-agent and track in pipeline
app.post('/api/pipeline/:pipelineId/spawn', async (req, res) => {
  try {
    const { pipelineId } = req.params;
    const { parentAgent, subAgent, task, context, priority } = req.body;

    // Validate agents
    if (!config.agents[parentAgent]) {
      return res.status(400).json({ error: `Unknown parent agent: ${parentAgent}` });
    }
    if (!config.agents[subAgent]) {
      return res.status(400).json({ error: `Unknown sub-agent: ${subAgent}` });
    }

    // Get current pipeline step count
    const pipelineHandoffs = Array.from(handoffs.values()).filter(h => h.pipelineId === pipelineId);
    const nextStep = pipelineHandoffs.length + 1;

    // Create handoff to parent with sub-agent info
    const fullTask = `🤖 SUB-AGENT TASK: Spawn '${subAgent}' to execute:\n\n${task}`;

    const result = await createHandoff(
      'chroma', // AHM is the orchestrator
      parentAgent,
      fullTask,
      context || '',
      [],
      [],
      priority || 'medium',
      {
        pipelineId,
        pipelineStep: nextStep,
        pipelineTotalSteps: nextStep,
        spawnSubAgent: subAgent,
        subAgentTask: task,
        subAgentContext: context,
        isSubAgentSpawn: true // Mark as sub-agent spawn for tracking
      }
    );

    res.json({
      success: true,
      ...result,
      pipelineId,
      step: nextStep,
      parentAgent,
      subAgent,
      message: `Created pipeline step ${nextStep}: ${parentAgent} will spawn ${subAgent}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all pipelines
app.get('/api/pipelines', (req, res) => {
  const pipelines = {};

  for (const h of handoffs.values()) {
    if (h.pipelineId) {
      if (!pipelines[h.pipelineId]) {
        pipelines[h.pipelineId] = {
          id: h.pipelineId,
          steps: [],
          status: 'pending',
          createdAt: h.createdAt,
          totalSteps: 0,
          completedSteps: 0,
          inProgressSteps: 0,
          pendingSteps: 0,
          failedSteps: 0
        };
      }
      pipelines[h.pipelineId].steps.push({
        id: h.id,
        from: h.fromAgent,
        to: h.toAgent,
        task: h.task?.substring(0, 60),
        status: h.status,
        step: h.pipelineStep,
        createdAt: h.createdAt,
        startedAt: h.startedAt,
        completedAt: h.completedAt,
        spawnSubAgent: h.spawnSubAgent,
        agentResponse: h.agentResponse ? h.agentResponse.substring(0, 200) + '...' : null
      });
    }
  }

  // Calculate statuses
  for (const [id, p] of Object.entries(pipelines)) {
    p.completedSteps = p.steps.filter(s => s.status === 'completed').length;
    p.inProgressSteps = p.steps.filter(s => s.status === 'in_progress').length;
    p.pendingSteps = p.steps.filter(s => s.status === 'pending').length;
    p.failedSteps = p.steps.filter(s => s.status === 'failed').length;
    p.totalSteps = p.steps.length;

    if (p.failedSteps > 0) p.status = 'failed';
    else if (p.completedSteps === p.totalSteps && p.totalSteps > 0) p.status = 'completed';
    else if (p.inProgressSteps > 0) p.status = 'in_progress';
    else p.status = 'pending';
  }

  res.json({
    pipelines: Object.values(pipelines).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  });
});

// ==================== DIRECT CHAT ====================

app.post('/api/chat/:agentId', async (req, res) => {
  const { agentId } = req.params;
  const { message, from } = req.body;

  if (!config.agents[agentId]) {
    return res.status(400).json({ error: `Unknown agent: ${agentId}` });
  }

  // Create a special handoff type for chat
  const chatId = `chat_${Date.now()}`;
  const handoff = {
    id: chatId,
    fromAgent: from || 'chroma',
    toAgent: agentId,
    task: `💬 Message: ${message}`,
    context: '',
    type: 'chat',
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  handoffs.set(chatId, handoff);
  if (!agentContexts.has(agentId)) agentContexts.set(agentId, []);
  agentContexts.get(agentId).push({ handoffId: chatId, type: 'chat', ...handoff });

  sendDiscordNotification(handoff, 'chat');

  res.json({ success: true, chatId, message: `Sent to ${config.agents[agentId].name}` });
});

// ==================== AUTO-ASSIGN ====================

app.post('/api/auto-assign', async (req, res) => {
  const { task, context, priority } = req.body;

  // Simple AI-based routing
  const keywords = {
    bender: ['build', 'code', 'fix', 'bug', 'develop', 'website', 'app', 'deploy', 'api', 'frontend', 'backend'],
    pixel: ['copy', 'write', 'content', 'blog', 'email', '文案', '文字'],
    canvas: ['design', 'logo', 'image', 'visual', 'graphic', 'brand'],
    flux: ['video', 'motion', 'animation', 'remotion'],
    prism: ['research', 'find', 'analyze', 'competitor', 'market', 'data'],
    lumen: ['support', 'help', 'customer', 'faq', 'docs'],
    momentum: ['stock', 'trade', 'crypto', 'market', 'invest', '分析'],
    glyph: ['ghl', 'automation', 'workflow', 'email', 'sms', 'crm']
  };

  let bestAgent = 'bender'; // default
  let maxMatches = 0;
  const taskLower = task.toLowerCase();

  for (const [agent, words] of Object.entries(keywords)) {
    const matches = words.filter(w => taskLower.includes(w)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      bestAgent = agent;
    }
  }

  // Check workload
  const pending = Array.from(handoffs.values()).filter(h => h.toAgent === bestAgent && h.status === 'pending');
  if (pending.length > 3) {
    // Find least busy agent
    const workloads = {};
    for (const agent of Object.keys(config.agents)) {
      workloads[agent] = Array.from(handoffs.values()).filter(h => h.toAgent === agent && h.status === 'pending').length;
    }
    bestAgent = Object.entries(workloads).sort((a, b) => a[1] - b[1])[0][0];
  }

  const result = await createHandoff('chroma', bestAgent, task, context, [], [], priority || 'medium');
  res.json({
    success: true,
    assignedTo: bestAgent,
    agentName: config.agents[bestAgent].name,
    reason: maxMatches > 0 ? `Matched ${maxMatches} keywords` : 'Lowest workload',
    ...result
  });
});

// ==================== PIPELINE (SEQUENTIAL CHAIN) ====================

app.post('/api/pipeline', async (req, res) => {
  try {
    let { name, steps, agents: agentChain, task, context, priority, sequential = false, targetPath, workdir, workMode } = req.body;

    const executionTargetError = validateExecutionTargetInput({ targetPath, workdir, workMode });
    if (executionTargetError) {
      return res.status(400).json({ error: executionTargetError });
    }

    // FIX: support both payload formats (steps[] or agents[])
    if (steps && Array.isArray(steps)) {
      // Format from new user code (AHM internal representation)
      const pipelineId = `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const createdHandoffs = [];
      let stepResults = [];
      
      // Support three step formats:
      // 1. { from: "agent1", to: "agent2", task: "...", context: {...} }
      // 2. { agentId: "agent", task: "..." } (auto-chained with previous)
      // 3. { task: "..." } (runs on previous agent or defaults to chroma)
      
      let previousAgent = 'chroma';
      
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepExecutionTarget = {
          targetPath: step.targetPath || targetPath,
          workdir: step.workdir || workdir,
          workMode: step.workMode || workMode,
        };
        const stepExecutionTargetError = validateExecutionTargetInput(stepExecutionTarget);
        if (stepExecutionTargetError) {
          return res.status(400).json({ error: `Invalid execution target for step ${i + 1}: ${stepExecutionTargetError}` });
        }
        
        // Handle simple agentId format
        const from = step.from || previousAgent;
        const to = step.to || step.agentId || (steps[i + 1] ? steps[i + 1].agentId : null);
        
        // Validate we have required fields
        if (!to) {
          console.log(`⚠️ Step ${i + 1}: No destination agent, skipping handoff`);
          continue;
        }
        
        // Build context: include previous step output if sequential
        let stepContext = step.context || context || '';
        if (sequential && stepResults.length > 0) {
          const prevOutput = stepResults[stepResults.length - 1];
          stepContext = `Previous step output:\n${prevOutput}\n\n---\n\n${stepContext}`;
        }
        
        const result = await createHandoff(
          from,
          to,
          step.task || step.task || 'Complete this step',
          stepContext,
          step.decisions || [],
          step.nextSteps || [],
          step.priority || priority || 'medium',
          {
            pipelineId,
            pipelineStep: i + 1,
            pipelineTotalSteps: steps.length,
            waitForComplete: sequential,
            ...stepExecutionTarget,
          }
        );
        createdHandoffs.push(result.handoffId);
        
        // If sequential, wait for completion with gating (max 60 seconds)
        if (sequential) {
          console.log(`⏳ Pipeline ${pipelineId}: Waiting for step ${i + 1}/${steps.length} to complete...`);
          
          let waitTime = 0;
          const maxWait = 60000; // 60 seconds max
          
          // Wait for handoff to complete
          while (waitTime < maxWait) {
            await new Promise(r => setTimeout(r, 3000));
            waitTime += 3000;
            const h = handoffs.get(result.handoffId);
            if (!h || h.status === 'failed') {
              console.log(`❌ Step ${i + 1} failed`);
              break;
            }
            if (h.status === 'completed') {
              // GATE: Wait for deliverable/file before proceeding (max 30s)
              const execTarget = h.executionTarget || {};
              const outputPath = execTarget.artifactPath || execTarget.workdir;
              let hasDeliverable = false;
              
              if (outputPath && fs.existsSync(outputPath)) {
                const files = fs.readdirSync(outputPath);
                hasDeliverable = files.length > 0;
                console.log(`📁 Step ${i + 1} output folder: ${outputPath}, files: ${files.length}`);
              }
              
              // Also check for deliverable stub
              const hasDeliverableStub = Array.from(marketingRequests.values()).some(r => r.handoffId === h.id && r.deliverableId);
              
              if (hasDeliverable || hasDeliverableStub) {
                const output = h?.agentResponse || h?.result || '';
                if (output) stepResults.push(output);
                console.log(`✅ Step ${i + 1} complete with deliverable: ${output.substring(0, 100)}...`);
                break;
              } else {
                // FALLBACK: No files written - save agent response as file
                const agentResponse = h?.agentResponse || h?.result || '';
                if (agentResponse && outputPath) {
                  const saved = persistAgentResponseArtifact(outputPath, agentResponse, h.toAgent, `step-${i+1}-${h.toAgent}-output`);
                  if (saved) {
                    console.log(`📝 Step ${i + 1}: Auto-saved agent response as ${saved.fileName}`);
                    stepResults.push(saved.cleanContent);
                    break;
                  }
                }
              }
              
              if (waitTime >= 30000) {
                // After 30s, proceed anyway if status is completed
                console.log(`⏳ Step ${i + 1} completed but no deliverable after 30s, proceeding...`);
                const output = h?.agentResponse || h?.result || '';
                if (output) stepResults.push(output);
                break;
              } else {
                console.log(`⏳ Step ${i + 1} complete but no deliverable yet, waiting...`);
              }
            }
          }
          if (waitTime >= maxWait) {
            console.log(`⚠️ Pipeline ${pipelineId}: Max wait time reached for step ${i + 1}, proceeding anyway`);
          }
        }
        
        previousAgent = to;
      }
      
      return res.json({
        success: true,
        pipelineId,
        name: name || 'Unnamed Pipeline',
        totalSteps: createdHandoffs.length,
        handoffs: createdHandoffs,
        results: sequential ? stepResults : undefined
      });
    }

    // Format from original frontend (agents[])
    if (!Array.isArray(agentChain) || agentChain.length < 2) {
      return res.status(400).json({ error: 'agents must be an array of at least 2 agent IDs' });
    }

    const pipelineId = `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const results = [];

    for (let i = 0; i < agentChain.length - 1; i++) {
      const from = agentChain[i];
      const to = agentChain[i + 1];
      const stepNum = i + 1;
      const totalSteps = agentChain.length - 1;

      // Define role-based subtasks for each step
      const roleTasks = {
        'chroma': 'Analyze requirements, create plan, hand off to next agent',
        'prism': 'Research competitors, gather requirements, provide insights',
        'canvas': 'Design UI/mockups, create visual assets',
        'pixel': 'Write copy, create content, marketing strategy',
        'bender': 'Build the actual deliverable, write code',
        'lumen': 'Review, test, provide feedback',
        'flux': 'Create videos, motion graphics',
        'momentum': 'Analyze data, provide market insights',
        'glyph': 'Set up automation, workflows',
        'chief': 'Coordinate, ensure alignment'
      };

      const fromRole = roleTasks[from] || 'complete your task';
      const toRole = roleTasks[to] || 'next agent';
      const nextRole = agentChain[i + 2] ? roleTasks[agentChain[i + 2]] : 'finish';

      // Each step gets a FOCUSED subtask, not the full task
      let stepTask;
      if (stepNum === 1) {
        stepTask = `[Pipeline Step 1/${totalSteps}: ${from} → ${to}]
        
MAIN TASK: ${task}

YOUR JOB (${from}): ${fromRole}
- Do ONLY your part
- When done, hand off to ${to} (their job: ${toRole})
- DO NOT do the entire project yourself`;
      } else if (stepNum === totalSteps) {
        stepTask = `[Pipeline Step ${stepNum}/${totalSteps}: ${from} → ${to}]
        
ORIGINAL TASK: ${task.substring(0, 100)}...

YOUR JOB (${to}): ${roleTasks[to] || 'complete the build'}
- This is the FINAL step - execute and deliver
- DO NOT hand off further`;
      } else {
        stepTask = `[Pipeline Step ${stepNum}/${totalSteps}: ${from} → ${to}]
        
ORIGINAL TASK: ${task.substring(0, 80)}...

YOUR JOB (${to}): ${roleTasks[to] || 'continue the pipeline'}
- Focus ONLY on your contribution
- Hand off to ${agentChain[i + 2]} when done`;
      }

      const stepContext = context
        ? `${context}\n\nPipeline: ${pipelineId} | Step ${stepNum}/${totalSteps} | Chain: ${agentChain.join(' → ')}`
        : `Pipeline: ${pipelineId} | Step ${stepNum}/${totalSteps} | Chain: ${agentChain.join(' → ')}`;

      const result = await createHandoff(from, to, stepTask, stepContext, [], [], priority || 'medium', {
        pipelineId,
        pipelineStep: stepNum,
        pipelineTotalSteps: totalSteps,
        pipelineAgents: agentChain,
        targetPath,
        workdir,
        workMode,
      });
      results.push(result);
      await new Promise(r => setTimeout(r, 50));
    }

    console.log(`🔗 Pipeline ${pipelineId}: ${agentChain.join(' → ')} (${results.length} handoffs)`);
    res.json({ success: true, pipelineId, steps: results.length, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== PARALLEL HANDOFFS ====================

app.post('/api/parallel', async (req, res) => {
  const { fromAgent, toAgents, task, context, priority, targetPath, workdir, workMode } = req.body;

  if (!Array.isArray(toAgents) || toAgents.length === 0) {
    return res.status(400).json({ error: 'toAgents must be an array' });
  }

  const executionTargetError = validateExecutionTargetInput({ targetPath, workdir, workMode });
  if (executionTargetError) {
    return res.status(400).json({ error: executionTargetError });
  }

  const results = [];
  for (const toAgent of toAgents) {
    const result = await createHandoff(fromAgent, toAgent, task, context, [], [], priority, {
      targetPath,
      workdir,
      workMode,
    });
    results.push(result);
  }

  res.json({ success: true, executed: results.length, results });
});

// ==================== CONDITIONAL CHAIN ====================

app.post('/api/conditional', async (req, res) => {
  const { trigger, condition, ifTrue, ifFalse, context } = req.body;

  // Simple condition evaluation
  let result = false;
  if (condition.type === 'keyword') {
    result = condition.keywords.some(k => trigger.toLowerCase().includes(k.toLowerCase()));
  } else if (condition.type === 'always') {
    result = true;
  }

  const selectedAgent = result ? ifTrue : ifFalse;

  if (!selectedAgent) {
    return res.json({ condition: 'none', message: 'No action taken' });
  }

  const handoff = await createHandoff('chroma', selectedAgent, trigger, context);

  res.json({
    condition: result ? 'met' : 'not_met',
    selectedAgent,
    agentName: config.agents[selectedAgent]?.name,
    handoff
  });
});

// ==================== ESCALATION ====================

app.post('/api/escalate/:handoffId', async (req, res) => {
  const { handoffId } = req.params;
  const handoff = handoffs.get(handoffId);

  if (!handoff) {
    return res.status(404).json({ error: 'Handoff not found' });
  }

  handoff.escalationLevel += 1;
  handoff.priority = 'urgent';

  // Escalate to next in chain
  const escalationPath = {
    bender: 'chroma',
    prism: 'chroma',
    pixel: 'chroma',
    canvas: 'pixel',
    flux: 'pixel'
  };

  const escalateTo = escalationPath[handoff.toAgent] || 'chroma';

  const newHandoff = await createHandoff(
    handoff.toAgent,
    escalateTo,
    `⚠️ ESCALATED: ${handoff.task}`,
    `Original from: ${handoff.fromAgent}\n\n${handoff.context}`,
    ['Escalated due to timeout'],
    [],
    'urgent'
  );

  sendDiscordNotification({ ...handoff, toAgent: escalateTo }, 'escalation');

  res.json({
    success: true,
    escalated: true,
    from: handoff.toAgent,
    to: escalateTo,
    escalationLevel: handoff.escalationLevel,
    newHandoff
  });
});

// ==================== FEEDBACK ====================

app.post('/api/feedback/:handoffId', (req, res) => {
  const { handoffId } = req.params;
  const { rating, comments } = req.body;

  const handoff = handoffs.get(handoffId);
  if (!handoff) {
    return res.status(404).json({ error: 'Handoff not found' });
  }

  const feedbackId = `feedback_${Date.now()}`;
  feedback.set(feedbackId, {
    handoffId,
    rating: rating || 0,
    comments: comments || '',
    createdAt: new Date().toISOString()
  });

  // Add to agent's feedback history
  if (!agentContexts.has(handoff.toAgent)) {
    agentContexts.set(handoff.toAgent, []);
  }
  agentContexts.get(handoff.toAgent).push({
    type: 'feedback',
    rating,
    comments,
    handoffId,
    createdAt: new Date().toISOString()
  });

  res.json({ success: true, feedbackId, rating });
});

// ==================== SIMILAR TASK RECALL ====================

app.get('/api/similar', (req, res) => {
  const { task } = req.query;
  if (!task) return res.status(400).json({ error: 'task query required' });

  const taskLower = task.toLowerCase();
  const similar = taskHistory
    .filter(h => h.task && h.task.toLowerCase().includes(taskLower.split(' ')[0]))
    .slice(0, 5)
    .map(h => ({
      id: h.id,
      task: h.task,
      agent: h.toAgent,
      completed: h.completedAt ? true : false
    }));

  res.json({ query: task, similar });
});

// ==================== AUTO-COMPLETE ====================

app.get('/api/autocomplete', (req, res) => {
  const { task } = req.query;
  if (!task || task.length < 2) return res.json({ suggestions: [] });

  // Common task patterns
  const patterns = [
    'Build landing page for',
    'Research competitors for',
    'Write copy for',
    'Design logo for',
    'Create video for',
    'Fix bug in',
    'Deploy to',
    'Set up automation for'
  ];

  const suggestions = patterns
    .filter(p => p.toLowerCase().startsWith(task.toLowerCase()))
    .slice(0, 5);

  res.json({ input: task, suggestions });
});

// ==================== CONTEXT AWARE ====================

app.post('/api/context-aware', async (req, res) => {
  const { toAgent, task } = req.body;

  // Get recent tasks for this agent
  const recentTasks = taskHistory
    .filter(h => h.toAgent === toAgent && h.completedAt)
    .slice(-5);

  // Get pending tasks
  const pending = Array.from(handoffs.values())
    .filter(h => h.toAgent === toAgent && h.status === 'pending');

  // Generate context suggestion
  const contextSuggestion = recentTasks.length > 0
    ? `Recent similar tasks: ${recentTasks.map(t => t.task).join(', ')}`
    : '';

  res.json({
    agent: toAgent,
    pendingCount: pending.length,
    recentTasks: recentTasks.map(t => t.task),
    suggestedContext: contextSuggestion,
    priority: pending.length > 3 ? 'low' : pending.length > 0 ? 'medium' : 'high'
  });
});

// ==================== SCHEDULE ====================

app.post('/api/schedule', (req, res) => {
  const { fromAgent, toAgent, task, context, scheduledAt, priority } = req.body;

  if (!scheduledAt) return res.status(400).json({ error: 'scheduledAt required' });

  const scheduleId = `schedule_${Date.now()}`;
  const delay = new Date(scheduledAt).getTime() - Date.now();

  if (delay > 0) {
    setTimeout(async () => {
      await createHandoff(fromAgent, toAgent, task, context, [], [], priority);
      console.log(`📦 Scheduled handoff executed: ${task}`);
    }, delay);
  } else {
    return res.status(400).json({ error: 'scheduledAt must be in the future' });
  }

  res.json({
    success: true,
    scheduleId,
    scheduledFor: scheduledAt,
    task: task.substring(0, 50)
  });
});

// ==================== HISTORY ====================

app.get('/api/history', (req, res) => {
  const { agent, limit = 20 } = req.query;
  let history = Array.from(handoffs.values());

  if (agent) {
    history = history.filter(h => h.toAgent === agent || h.fromAgent === agent);
  }

  history = history
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, parseInt(limit))
    .map(h => ({
      id: h.id,
      from: h.fromAgent,
      to: h.toAgent,
      task: h.task?.substring(0, 50),
      status: h.status,
      priority: h.priority,
      createdAt: h.createdAt,
      completedAt: h.completedAt
    }));

  res.json({ history, total: history.length });
});

// ==================== HANDOFFS LIST ====================

app.get('/api/handoffs', (req, res) => {
  const { client, status, fromAgent, toAgent } = req.query;
  let allHandoffs = Array.from(handoffs.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  // Filter by client
  if (client) {
    allHandoffs = allHandoffs.filter(h => h.client === client);
  }
  // Filter by status
  if (status) {
    allHandoffs = allHandoffs.filter(h => h.status === status);
  }
  // Filter by fromAgent
  if (fromAgent) {
    allHandoffs = allHandoffs.filter(h => h.fromAgent === fromAgent);
  }
  // Filter by toAgent
  if (toAgent) {
    allHandoffs = allHandoffs.filter(h => h.toAgent === toAgent);
  }
  
  res.json({ handoffs: allHandoffs });
});

// ==================== STANDARD ENDPOINTS ====================

app.get('/api/context/:agentId', (req, res) => {
  const { agentId } = req.params;
  const contexts = agentContexts.get(agentId) || [];
  const pendingHandoffs = contexts.filter(c => c.status === 'pending');

  res.json({
    agent: agentId,
    pendingCount: pendingHandoffs.length,
    handoffs: pendingHandoffs
  });
});

// ==================== CONTEXT PACKETS API ====================
// Explicit context sharing - structured packets for handoffs

app.post('/api/context', (req, res) => {
  const { 
    facts = [], 
    constraints = [], 
    decisions = [], 
    artifacts = [], 
    nextSteps = [],
    parentId // Optional: inherit from existing context
  } = req.body;
  
  let history = [];
  
  // If parentId provided, inherit from parent context
  if (parentId) {
    const parent = contextPackets.get(parentId);
    if (parent) {
      history = [...parent.history, { 
        from: parentId, 
        at: new Date().toISOString(), 
        action: 'inherited' 
      }];
    }
  }
  
  const id = 'ctx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  const packet = {
    id,
    facts,
    constraints,
    decisions,
    artifacts,
    nextSteps,
    history,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  contextPackets.set(id, packet);
  console.log(`📦 Created context packet: ${id}`);
  
  res.json({ success: true, context: packet });
});

app.get('/api/contexts', (req, res) => {
  const all = Array.from(contextPackets.values()).map(c => ({
    id: c.id,
    facts: c.facts,
    constraints: c.constraints,
    decisions: c.decisions.length,
    artifacts: c.artifacts.length,
    nextSteps: c.nextSteps.length,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt
  }));
  res.json({ contexts: all, count: all.length });
});

app.get('/api/context/:id', (req, res) => {
  const { id } = req.params;
  const packet = contextPackets.get(id);
  if (!packet) return res.status(404).json({ error: 'Context not found' });
  res.json({ context: packet });
});

app.put('/api/context/:id', (req, res) => {
  const { id } = req.params;
  const packet = contextPackets.get(id);
  if (!packet) return res.status(404).json({ error: 'Context not found' });
  
  const { facts, constraints, decisions, artifacts, nextSteps } = req.body;
  
  if (facts) packet.facts = facts;
  if (constraints) packet.constraints = constraints;
  if (decisions) packet.decisions = [...packet.decisions, ...decisions];
  if (artifacts) packet.artifacts = [...packet.artifacts, ...artifacts];
  if (nextSteps) packet.nextSteps = [...packet.nextSteps, ...nextSteps];
  
  packet.updatedAt = new Date().toISOString();
  packet.history.push({ from: 'api', at: new Date().toISOString(), action: 'updated' });
  
  res.json({ success: true, context: packet });
});

app.delete('/api/context/:id', (req, res) => {
  const { id } = req.params;
  if (!contextPackets.has(id)) return res.status(404).json({ error: 'Context not found' });
  contextPackets.delete(id);
  res.json({ success: true });
});

// ==================== MEMORY LAYERS API ====================
// 3-layer distilled memory: inbox → working → project

app.post('/api/memory', (req, res) => {
  const { type, content, source, tags = [] } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  
  const item = createMemoryItem(type || 'fact', content, source || 'api', tags);
  
  // Add to inbox by default
  memoryLayers.inbox.push(item);
  saveMemory();
  
  res.json({ success: true, memory: item });
});

app.get('/api/memory', (req, res) => {
  const { layer, type, limit = 50 } = req.query;
  
  let memories;
  if (layer && memoryLayers[layer]) {
    memories = memoryLayers[layer];
  } else {
    // Return all layers
    memories = [
      ...memoryLayers.inbox,
      ...memoryLayers.working,
      ...memoryLayers.project
    ];
  }
  
  // Filter by type if provided
  if (type) {
    memories = memories.filter(m => m.type === type);
  }
  
  // Sort by createdAt desc and limit
  memories = memories
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, parseInt(limit));
  
  res.json({
    layers: {
      inbox: memoryLayers.inbox.length,
      working: memoryLayers.working.length,
      project: memoryLayers.project.length
    },
    memories
  });
});

app.get('/api/memory/:layer', (req, res) => {
  const { layer } = req.params;
  if (!memoryLayers[layer]) return res.status(400).json({ error: 'Invalid layer. Use: inbox, working, or project' });
  
  const memories = memoryLayers[layer]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json({ layer, memories });
});

app.put('/api/memory/:id', (req, res) => {
  const { id } = req.params;
  const { content, tags, targetLayer } = req.body;
  
  // Search all layers
  let item = [...memoryLayers.inbox, ...memoryLayers.working, ...memoryLayers.project]
    .find(m => m.id === id);
  
  if (!item) return res.status(404).json({ error: 'Memory not found' });
  
  // Update content/tags
  if (content) item.content = content;
  if (tags) item.tags = tags;
  item.updatedAt = new Date().toISOString();
  item.accessCount++;
  
  // Move to different layer if requested
  if (targetLayer && memoryLayers[targetLayer]) {
    // Remove from current layer
    memoryLayers.inbox = memoryLayers.inbox.filter(m => m.id !== id);
    memoryLayers.working = memoryLayers.working.filter(m => m.id !== id);
    memoryLayers.project = memoryLayers.project.filter(m => m.id !== id);
    // Add to target
    memoryLayers[targetLayer].push(item);
  }
  
  saveMemory();
  res.json({ success: true, memory: item });
});

app.delete('/api/memory/:id', (req, res) => {
  const { id } = req.params;
  
  const removedFrom = [];
  if (memoryLayers.inbox.some(m => m.id === id)) {
    memoryLayers.inbox = memoryLayers.inbox.filter(m => m.id !== id);
    removedFrom.push('inbox');
  }
  if (memoryLayers.working.some(m => m.id === id)) {
    memoryLayers.working = memoryLayers.working.filter(m => m.id !== id);
    removedFrom.push('working');
  }
  if (memoryLayers.project.some(m => m.id === id)) {
    memoryLayers.project = memoryLayers.project.filter(m => m.id !== id);
    removedFrom.push('project');
  }
  
  if (removedFrom.length === 0) return res.status(404).json({ error: 'Memory not found' });
  
  saveMemory();
  res.json({ success: true, removedFrom });
});

// Search memory across all layers
app.get('/api/memory/search', (req, res) => {
  const { q, type } = req.query;
  if (!q) return res.status(400).json({ error: 'Query (q) required' });
  
  const all = [...memoryLayers.inbox, ...memoryLayers.working, ...memoryLayers.project];
  let results = all.filter(m => 
    m.content.toLowerCase().includes(q.toLowerCase()) ||
    m.tags.some(t => t.toLowerCase().includes(q.toLowerCase()))
  );
  
  if (type) {
    results = results.filter(m => m.type === type);
  }
  
  res.json({ query: q, results: results.slice(0, 20) });
});

// ==================== END MEMORY LAYERS ====================

app.post('/api/handoff/:id/start', (req, res) => {
  const { id } = req.params;
  const handoff = handoffs.get(id);
  if (!handoff) return res.status(404).json({ error: 'Handoff not found' });
  if (handoff.status !== 'pending') return res.status(400).json({ error: `Handoff is already ${handoff.status}` });

  handoff.status = 'in_progress';
  handoff.startedAt = new Date().toISOString();
  // P0: Persist state
  saveHandoffs();
  console.log(`▶️  Started: ${handoff.fromAgent} → ${handoff.toAgent}: ${handoff.task?.substring(0, 50)}`);

  // Broadcast to WebSocket clients
  if (typeof global.broadcastHandoffUpdate === 'function') {
    global.broadcastHandoffUpdate('updated', handoff);
  }

  res.json({ success: true, handoff });
});

app.post('/api/handoff/:id/complete', (req, res) => {
  const { id } = req.params;
  const { response, autoAdvance } = req.body;
  const handoff = handoffs.get(id);

  if (!handoff) return res.status(404).json({ error: 'Handoff not found' });

  handoff.status = 'completed';
  handoff.completedAt = new Date().toISOString();

  // Store agent response for context passing
  if (response) {
    handoff.agentResponse = response;
  }

  // Update task history
  const historyItem = taskHistory.find(h => h.id === id);
  if (historyItem) historyItem.completedAt = handoff.completedAt;

  // Remove from agent context
  if (agentContexts.has(handoff.toAgent)) {
    const ctx = agentContexts.get(handoff.toAgent);
    const idx = ctx.findIndex(c => c.handoffId === id);
    if (idx !== -1) ctx.splice(idx, 1);
  }

  sendDiscordNotification(handoff, 'completed');
  if (typeof crmRouter.logHandoffActivity === 'function') {
    crmRouter.logHandoffActivity(handoff).catch(() => {});
  }
  console.log(`✅ Completed: ${handoff.fromAgent} → ${handoff.toAgent}: ${handoff.task?.substring(0, 50)}`);

  // Post competitive research results to #competitor-intel when Prism completes research
  if (handoff.toAgent === 'prism' && handoff.task && handoff.task.toLowerCase().includes('competit')) {
    postCompetitorResults(handoff);
  }

  // Broadcast to WebSocket clients
  if (typeof global.broadcastHandoffUpdate === 'function') {
    global.broadcastHandoffUpdate('completed', handoff);
  }

  // ================================================
  // FEATURE: AUTO-ADVANCE PIPELINE
  // When step N completes → automatically start step N+1
  // ================================================
  let nextStep = null;
  let contextPassed = null;

  if (handoff.pipelineId && autoAdvance !== false) {
    const currentStep = handoff.pipelineStep;
    const pipelineId = handoff.pipelineId;

    // Find next step in pipeline
    const nextHandoff = Array.from(handoffs.values()).find(h =>
      h.pipelineId === pipelineId && h.pipelineStep === currentStep + 1
    );

    if (nextHandoff) {
      // ================================================
      // FEATURE: CONTEXT PASSING
      // Output of step N → becomes context for step N+1
      // ================================================

      // Extract key info from completed step to pass as context
      const completedResponse = handoff.agentResponse || response || '';

      // Build context from previous step
      contextPassed = `
PREVIOUS STEP OUTPUT:
---------------------
From: ${handoff.fromAgent} → ${handoff.toAgent}
Task: ${handoff.task}
Result: ${completedResponse.substring(0, 2000)}
---------------------

ADDITIONAL CONTEXT:
${nextHandoff.context || ''}
      `.trim();

      // Update next step with context from previous
      nextHandoff.context = contextPassed;
      nextHandoff.status = 'in_progress';
      nextHandoff.startedAt = new Date().toISOString();

      // Update task to include previous context
      nextHandoff.task = `${nextHandoff.task}

[CONTINUED FROM PREVIOUS STEP]
The previous step completed with the above result. Use this information to complete your task.`;

      console.log(`🔄 Auto-advance: Step ${currentStep} → Step ${currentStep + 1} in pipeline ${pipelineId}`);
      console.log(`📤 Context passed: ${completedResponse.substring(0, 100)}...`);

      // Broadcast next step update
      if (typeof global.broadcastHandoffUpdate === 'function') {
        global.broadcastHandoffUpdate('started', nextHandoff);
      }

      nextStep = {
        handoffId: nextHandoff.id,
        step: nextHandoff.pipelineStep,
        to: nextHandoff.toAgent,
        contextLength: contextPassed.length
      };
    } else {
      console.log(`✅ Pipeline ${pipelineId} complete - no more steps`);
    }
  }

  res.json({
    success: true,
    handoff,
    nextStep,
    contextPassed: contextPassed ? true : false
  });
});

// Cancel a pending handoff
app.post('/api/handoff/:id/cancel', (req, res) => {
  const { id } = req.params;
  const handoff = handoffs.get(id);

  if (!handoff) return res.status(404).json({ error: 'Handoff not found' });

  // Only allow canceling pending handoffs
  if (handoff.status !== 'pending') {
    return res.status(400).json({ error: `Cannot cancel handoff with status: ${handoff.status}` });
  }

  // Mark as cancelled (remove from map)
  handoffs.delete(id);

  console.log(`🚫 Cancelled: ${handoff.fromAgent} → ${handoff.toAgent}: ${handoff.task?.substring(0, 50)}`);

  // Broadcast to WebSocket clients
  if (typeof global.broadcastHandoffUpdate === 'function') {
    global.broadcastHandoffUpdate('cancelled', { ...handoff, status: 'cancelled' });
  }

  res.json({ success: true, message: 'Handoff cancelled', handoffId: id });
});

// ==================== DASHBOARD ====================

// FIX #4: Enhanced dashboard with pipeline status
app.get('/api/dashboard', (req, res) => {
  const all = Array.from(handoffs.values());

  const pending = all.filter(h => h.status === 'pending');
  const completed = all.filter(h => h.status === 'completed');
  const inProgress = all.filter(h => h.status === 'in_progress');
  const failed = all.filter(h => h.status === 'failed');

  const byAgent = {};
  for (const agent of Object.keys(config.agents)) {
    const agentPending = pending.filter(h => h.toAgent === agent);
    const agentCompleted = completed.filter(h => h.toAgent === agent);
    const agentInProgress = inProgress.filter(h => h.toAgent === agent);

    // Check SLA
    const overdue = agentPending.filter(h => h.slaDeadline && new Date(h.slaDeadline) < new Date());

    byAgent[agent] = {
      name: config.agents[agent].name,
      role: config.agents[agent].role,
      pending: agentPending.length,
      inProgress: agentInProgress.length,
      completed: agentCompleted.length,
      overdue: overdue.length,
      status: agentInProgress.length > 0 ? 'working' : agentPending.length > 3 ? 'busy' : agentPending.length > 0 ? 'active' : 'available'
    };
  }

  // FIX #4: Group handoffs by pipeline
  const pipelines = {};
  const standalone = [];

  for (const h of all) {
    if (h.pipelineId) {
      if (!pipelines[h.pipelineId]) {
        pipelines[h.pipelineId] = {
          id: h.pipelineId,
          steps: [],
          status: 'pending',
          createdAt: h.createdAt,
          totalSteps: 0,
          completedSteps: 0,
          inProgressSteps: 0,
          failedSteps: 0
        };
      }
      pipelines[h.pipelineId].steps.push({
        id: h.id,
        from: h.fromAgent,
        to: h.toAgent,
        task: h.task?.substring(0, 40),
        status: h.status,
        step: h.pipelineStep,
        createdAt: h.createdAt,
        completedAt: h.completedAt,
        agentResponse: h.agentResponse ? h.agentResponse.substring(0, 100) + '...' : null
      });
      pipelines[h.pipelineId].totalSteps = Math.max(pipelines[h.pipelineId].totalSteps, h.pipelineStep || 0);
    } else {
      standalone.push(h);
    }
  }

  // Calculate pipeline statuses
  for (const [id, p] of Object.entries(pipelines)) {
    p.completedSteps = p.steps.filter(s => s.status === 'completed').length;
    p.inProgressSteps = p.steps.filter(s => s.status === 'in_progress').length;
    p.pendingSteps = p.steps.filter(s => s.status === 'pending').length;
    p.failedSteps = p.steps.filter(s => s.status === 'failed').length;

    if (p.failedSteps > 0) p.status = 'failed';
    else if (p.completedSteps === p.totalSteps && p.totalSteps > 0) p.status = 'completed';
    else if (p.inProgressSteps > 0) p.status = 'in_progress';
    else p.status = 'pending';
  }

  // Recent activity (standalone + latest pipeline steps)
  const recent = all
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 15)
    .map(h => ({
      id: h.id,
      from: h.fromAgent,
      to: h.toAgent,
      task: h.task?.substring(0, 40),
      status: h.status,
      pipelineId: h.pipelineId,
      pipelineStep: h.pipelineStep,
      time: h.createdAt
    }));

  res.json({
    summary: {
      total: all ? all.length : 0,
      pending: pending ? pending.length : 0,
      inProgress: inProgress ? inProgress.length : 0,
      completed: completed ? completed.length : 0,
      failed: failed ? failed.length : 0,
      overdue: pending ? pending.filter(h => h.slaDeadline && new Date(h.slaDeadline) < new Date()).length : 0,
      activePipelines: Object.values(pipelines || {}).filter(p => p.status === 'in_progress').length
    },
    byAgent,
    recent,
    templates: Array.from(templates.keys())
  });
});

// ==================== PIPELINE DELIVERABLES ====================

// FIX #2: Multiple possible output paths (check all of them)
const POSSIBLE_OUTPUT_PATHS = [
  DEFAULT_OUTPUT_DIR,  // Default
  path.join(DEFAULT_OUTPUT_DIR, 'handoffs'),  // Old path
  path.join(DEFAULT_OUTPUT_DIR, 'pipelines'),  // Pipeline path
  '/Users/king-lewie/.openclaw/workspace',  // Local workspace
  process.cwd()  // Current working directory
];

// Get files created by a pipeline or handoff
app.get('/api/handoff/:id/deliverables', (req, res) => {
  const { id } = req.params;
  const handoff = handoffs.get(id);

  if (!handoff) {
    return res.status(404).json({ error: 'Handoff not found' });
  }

  const executionTarget = handoff.executionTarget || normalizeExecutionTarget(handoff, handoff);
  if (executionTarget.workMode === WORK_MODE_IN_PLACE) {
    return res.json({
      files: [],
      searchedPaths: [],
      foundPath: executionTarget.targetPath,
      count: 0,
      handoffId: id,
      pipelineId: handoff.pipelineId,
      workMode: executionTarget.workMode,
      workdir: executionTarget.workdir,
      targetPath: executionTarget.targetPath,
      message: 'This handoff edits an existing target repo in place; no AHM artifact directory is expected.'
    });
  }

  // FIX #2: Check multiple possible paths
  const outputPaths = getArtifactSearchPaths(handoff);

  // Check all paths for files
  const allFiles = [];
  let foundPath = null;

  for (const outputPath of outputPaths) {
    if (fs.existsSync(outputPath)) {
      try {
        const files = [];
        function walkDir(dir) {
          const items = fs.readdirSync(dir);
          for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              walkDir(fullPath);
            } else {
              files.push({
                name: item,
                path: path.relative(outputPath, fullPath),
                fullPath,
                size: stat.size,
                modified: stat.mtime.toISOString(),
                ext: path.extname(item).toLowerCase(),
              });
            }
          }
        }
        walkDir(outputPath);
        if (files.length > 0) {
          allFiles.push(...files);
          foundPath = outputPath;
        }
      } catch (e) {
        console.log(`⚠️ Error scanning ${outputPath}: ${e.message}`);
      }
    }
  }

  res.json({
    files: allFiles,
    searchedPaths: outputPaths,
    foundPath,
    count: allFiles.length,
    handoffId: id,
    pipelineId: handoff.pipelineId,
    workMode: executionTarget.workMode,
    workdir: executionTarget.workdir,
    targetPath: executionTarget.targetPath
  });
});

// Serve pipeline output files
app.use('/output', express.static(DEFAULT_OUTPUT_DIR));

// ==================== FILE UPLOAD ====================

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// Upload files and attach to a handoff
app.post('/api/upload', upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const uploaded = req.files.map(f => ({
    id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    name: f.originalname,
    storedName: f.filename,
    size: f.size,
    type: f.mimetype,
    ext: path.extname(f.originalname).toLowerCase(),
    url: `/uploads/${f.filename}`,
    uploadedAt: new Date().toISOString()
  }));

  console.log(`📎 Uploaded ${uploaded.length} file(s): ${uploaded.map(f => f.name).join(', ')}`);
  res.json({ success: true, files: uploaded });
});

// Upload files as part of a handoff creation
app.post('/api/handoff-with-files', upload.array('files', 10), async (req, res) => {
  try {
    const { fromAgent, toAgent, task, context, priority, targetPath, workdir, workMode } = req.body;

    if (!fromAgent || !toAgent) {
      return res.status(400).json({ error: 'fromAgent and toAgent required' });
    }

    const executionTargetError = validateExecutionTargetInput({ targetPath, workdir, workMode });
    if (executionTargetError) {
      return res.status(400).json({ error: executionTargetError });
    }

    const files = (req.files || []).map(f => ({
      id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: f.originalname,
      storedName: f.filename,
      size: f.size,
      type: f.mimetype,
      url: `/uploads/${f.filename}`,
      uploadedAt: new Date().toISOString()
    }));

    const fileContext = files.length > 0
      ? `${context || ''}\n\n--- Attachments ---\n${files.map(f => `- ${f.name} (${f.type}): ${f.url}`).join('\n')}`
      : context || '';

    const result = await createHandoff(fromAgent, toAgent, task, fileContext, [], [], priority || 'medium', {
      files,
      targetPath,
      workdir,
      workMode,
    });
    res.json({ success: true, ...result, files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== AUTO-PROCESSOR ====================

const PROCESSOR_INTERVAL_MS = 30000; // 30 seconds
const MAX_CONCURRENT = 3; // Maximum parallel agent invocations
const processingHandoffs = new Set(); // prevent double-processing

// ==================== INTEGRATION CONFIG ====================
// Use production ChromaBrain URL
const CHROMABRAIN_URL = process.env.CHROMABRAIN_URL || 'https://brain.chromapages.com';
// Use production Chromabase URL (update for production deployment)
const CHROMABASE_URL = process.env.CHROMABASE_URL || 'http://localhost:3001';
// Google Drive folder for pipeline outputs
const DRIVE_OUTPUT_FOLDER = '1H1h5YoVSvo9O7e-1l0gUCMs47V1N3OO1'; // Chromapages folder

// ==================== GOOGLE DRIVE UPLOAD ====================
const { execSync } = require('child_process');

function uploadToGoogleDrive(localPath, targetFolderId, pipelineId) {
  console.log(`📤 Starting Drive upload for ${pipelineId}...`);

  try {
    // Create a folder for this pipeline in Drive
    const folderName = `pipeline_${pipelineId}`;

    // Check if folder exists, create if not
    try {
      execSync(`gog drive mkdir "${folderName}" --parent ${targetFolderId} -y`, { stdio: 'pipe' });
      console.log(`   Created folder: ${folderName}`);
    } catch (e) {
      console.log(`   Folder may already exist, continuing...`);
    }

    // Get the folder ID - use JSON output
    let folderList;
    try {
      const rawOutput = execSync(`gog drive ls --parent ${targetFolderId} -j --results-only`, { encoding: 'utf-8' });
      folderList = JSON.parse(rawOutput);
      if (!Array.isArray(folderList)) {
        // If it's not an array, try to find folders manually
        folderList = [];
      }
    } catch (e) {
      console.log(`   Could not get folder list, using parent ID`);
      folderList = [];
    }

    const targetFolder = folderList.find(f => f && f.name === folderName);

    let uploadFolderId = targetFolderId;
    if (targetFolder && targetFolder.id) {
      uploadFolderId = targetFolder.id;
    }

    // Upload files from the pipeline output folder
    const fs = require('fs');
    const path = require('path');

    if (!fs.existsSync(localPath)) {
      console.log(`⚠️ Local path not found: ${localPath}`);
      return null;
    }

    const files = fs.readdirSync(localPath);
    console.log(`   Found ${files.length} files to upload`);

    const uploadedFiles = [];

    for (const file of files) {
      const filePath = path.join(localPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        console.log(`   Skipping directory: ${file}`);
        continue;
      }

      // Skip large binary files
      if (stat.size > 10 * 1024 * 1024) {
        console.log(`   Skipping large file: ${file} (${stat.size} bytes)`);
        continue;
      }

      console.log(`   Uploading: ${file}...`);
      try {
        execSync(`gog drive upload "${filePath}" --parent ${uploadFolderId} -y`, { stdio: 'pipe' });
        uploadedFiles.push(file);
        console.log(`   ✅ Uploaded: ${file}`);
      } catch (uploadError) {
        console.log(`   ❌ Failed to upload ${file}: ${uploadError.message}`);
      }
    }

    // Get the folder URL
    const folderUrl = `https://drive.google.com/drive/folders/${uploadFolderId}`;
    console.log(`✅ Upload complete: ${uploadedFiles.length} files to ${folderUrl}`);

    return {
      folderId: uploadFolderId,
      folderUrl,
      files: uploadedFiles
    };
  } catch (error) {
    console.error(`⚠️ Google Drive upload error:`, error.message);
    return null;
  }
}

// Sync to ChromaBrain after pipeline completes
async function indexToChromaBrain(pipelineId, outputPath) {
  try {
    console.log(`🧠 Indexing pipeline ${pipelineId} to ChromaBrain...`);

    // Step 1: Upload files to Google Drive
    const driveResult = uploadToGoogleDrive(outputPath, DRIVE_OUTPUT_FOLDER, pipelineId);

    if (!driveResult) {
      console.log(`⚠️ Drive upload failed, skipping ChromaBrain indexing`);
      return;
    }

    // Step 2: Tell ChromaBrain to index from Drive
    const response = await fetch(`${CHROMABRAIN_URL}/api/index/drive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driveFolderId: driveResult.folderId,
        source: 'ahm-pipeline',
        pipelineId,
        files: driveResult.files
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ ChromaBrain indexing complete for ${pipelineId}:`, result);
    } else {
      console.warn(`⚠️ ChromaBrain indexing response: ${response.status}`);
    }
  } catch (error) {
    console.warn(`⚠️ ChromaBrain indexing error:`, error.message);
  }
}

// Sync to Chromabase (Firestore)
async function syncToChromabase(pipeline, handoffs) {
  try {
    console.log(`📊 Syncing pipeline ${pipeline.pipelineId} to Chromabase...`);

    const pipelineData = {
      id: pipeline.pipelineId,
      task: pipeline.task,
      agents: pipeline.pipelineAgents || [],
      status: 'completed',
      createdAt: pipeline.createdAt,
      completedAt: new Date().toISOString(),
      handoffs: handoffs.map(h => ({
        id: h.id,
        from: h.fromAgent,
        to: h.toAgent,
        task: h.task,
        status: h.status,
        completedAt: h.completedAt
      })),
      outputPath: `/output/pipelines/${pipeline.pipelineId}`
    };

    const response = await fetch(`${CHROMABASE_URL}/api/pipelines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pipelineData)
    });

    if (response.ok) {
      console.log(`✅ Chromabase sync complete for ${pipeline.pipelineId}`);
    } else {
      console.warn(`⚠️ Chromabase sync failed: ${response.status}`);
    }
  } catch (error) {
    console.warn(`⚠️ Chromabase sync error:`, error.message);
  }
}

// Helper to ensure deliverables are written to disk before completing
// FIX #3: Improved verification with better error handling - always shows agent response
async function ensureDeliverablesReady(handoff, maxRetries = 6) {
  const executionTarget = handoff.executionTarget || normalizeExecutionTarget(handoff, handoff);
  if (executionTarget.workMode === WORK_MODE_IN_PLACE) {
    const result = {
      verified: true,
      skipped: true,
      workMode: executionTarget.workMode,
      targetPath: executionTarget.targetPath,
      workdir: executionTarget.workdir,
    };
    handoff.verification = { checkedAt: new Date().toISOString(), ...result };
    return result;
  }

  const outputPaths = getArtifactSearchPaths(handoff);
  const responseText = handoff.agentResponse || '';
  const mentionedPaths = Array.from(responseText.matchAll(/`([^`]+)`/g)).map(m => m[1]).filter(Boolean);

  console.log(`🔍 Verifying deliverables for ${handoff.id}...`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    for (const outputPath of outputPaths) {
      if (fs.existsSync(outputPath)) {
        try {
          const files = [];
          function walkDir(dir) {
            const items = fs.readdirSync(dir);
            for (const item of items) {
              const fullPath = path.join(dir, item);
              const stat = fs.statSync(fullPath);
              if (stat.isDirectory()) {
                walkDir(fullPath);
              } else if (!item.startsWith('.')) {
                files.push({ name: item, size: stat.size, path: fullPath });
              }
            }
          }
          walkDir(outputPath);

          const referencedFiles = mentionedPaths.filter(p => fs.existsSync(p)).map(p => ({ name: path.basename(p), size: fs.statSync(p).size, path: p }));
          const combinedFiles = files.length > 0 ? files : referencedFiles;

          if (combinedFiles.length > 0) {
            console.log(`   ✅ Verified (attempt ${attempt}): Found ${combinedFiles.length} file(s)`);
            const result = { verified: true, path: outputPath, files: combinedFiles, attempt, checkedAt: new Date().toISOString() };
            handoff.verification = result;
            handoff.artifacts = combinedFiles.map(f => f.path || path.join(outputPath, f.name));
            return result;
          }
        } catch (e) {
          console.log(`   ⚠️ Error scanning ${outputPath}: ${e.message}`);
        }
      }
    }
    console.log(`   ⏳ Attempt ${attempt}/${maxRetries}: No files found yet, waiting...`);
    await new Promise(r => setTimeout(r, 3000));
  }

  // FIX #3: Don't fail - just warn and return what we have
  // FIX #4: Fallback - save agent response as file if no files found
  console.log(`   ⚠️ Verification timed out after ${maxRetries} attempts.`);
  console.log(`   📋 Agent response available: ${handoff.agentResponse ? 'YES' : 'NO'}`);

  if (handoff.agentResponse) {
    console.log(`   📝 Response preview: ${handoff.agentResponse.substring(0, 200)}...`);
    
    const outputPath = executionTarget.artifactPath || executionTarget.workdir;
    if (outputPath && fs.existsSync(outputPath)) {
      try {
        const saved = persistAgentResponseArtifact(outputPath, handoff.agentResponse, handoff.toAgent);
        if (saved) {
          console.log(`   📝 Fallback: Saved agent response as ${saved.fileName}`);
          const result = {
            verified: true,
            fallback: true,
            path: outputPath,
            files: [{ name: saved.fileName, size: saved.cleanContent.length, path: path.join(outputPath, saved.fileName) }],
            checkedAt: new Date().toISOString(),
          };
          handoff.verification = result;
          handoff.artifacts = [path.join(outputPath, saved.fileName)];
          return result;
        }
      } catch (e) {
        console.log(`   ⚠️ Fallback save failed: ${e.message}`);
      }
    }
  }

  const result = {
    verified: false,
    hasAgentResponse: !!handoff.agentResponse,
    agentResponse: handoff.agentResponse,
    checkedAt: new Date().toISOString(),
    message: 'Verification timed out but agent completed - returning response'
  };
  handoff.verification = result;
  return result;
}

async function completeHandoff(handoff) {
  handoff.status = 'completed';
  handoff.completedAt = new Date().toISOString();

  // Remove from agent context
  if (agentContexts.has(handoff.toAgent)) {
    const ctx = agentContexts.get(handoff.toAgent);
    const idx = ctx.findIndex(c => c.handoffId === handoff.id);
    if (idx !== -1) ctx.splice(idx, 1);
  }

  console.log(`✅ Completed: ${handoff.fromAgent} → ${handoff.toAgent}: ${handoff.task?.substring(0, 60)}`);
  sendDiscordNotification(handoff, 'completed');
  
  // P0: Persist state
  saveHandoffs();
  if (typeof crmRouter.logHandoffActivity === 'function') {
    crmRouter.logHandoffActivity(handoff).catch(() => {});
  }

  // Post competitive research results to #competitor-intel when Prism completes research
  if (handoff.toAgent === 'prism' && handoff.task && handoff.task.toLowerCase().includes('competit')) {
    postCompetitorResults(handoff);
  }

  // Trigger webhooks
  triggerWebhooks('HandoffComplete', handoff);

  // Broadcast to WebSocket clients
  if (typeof global.broadcastHandoffUpdate === 'function') {
    global.broadcastHandoffUpdate('completed', handoff);
  }

  // Check if pipeline is complete and trigger integrations
  console.log(`🔍 Checking pipeline integration for: ${handoff.pipelineId || 'none'}`);

  if (handoff.pipelineId) {
    const remaining = Array.from(handoffs.values()).filter(
      h => h.pipelineId === handoff.pipelineId && h.status === 'pending'
    );
    console.log(`🔍 Pipeline ${handoff.pipelineId}: ${remaining.length} remaining`);

    if (remaining.length === 0) {
      console.log(`🔄 Pipeline ${handoff.pipelineId} COMPLETE - triggering integrations!`);
      // Get all handoffs for this pipeline
      const pipelineHandoffs = Array.from(handoffs.values()).filter(
        h => h.pipelineId === handoff.pipelineId
      );

      const pipelineUsesInPlaceWork = pipelineHandoffs.some(
        h => (h.executionTarget || normalizeExecutionTarget(h, h)).workMode === WORK_MODE_IN_PLACE
      );

      if (pipelineUsesInPlaceWork) {
        console.log(`ℹ️ Pipeline ${handoff.pipelineId} used in-place work; skipping artifact upload/indexing integrations.`);
        return;
      }

      // Pipeline complete - trigger ChromaBrain and Chromabase sync
      const pipelineOutput = getArtifactOutputPath({ pipelineId: handoff.pipelineId, handoffId: handoff.id });

      console.log(`🔄 Pipeline ${handoff.pipelineId} complete, triggering integrations...`);

      // Give one last moment for any async file writes or syncs to settle
      await new Promise(r => setTimeout(r, 2000));

      // Trigger integrations
      indexToChromaBrain(handoff.pipelineId, pipelineOutput);
      syncToChromabase({ pipelineId: handoff.pipelineId, ...handoff }, pipelineHandoffs);
    }
  }
}

// Agent ID mapping - maps AHM agent IDs to OpenClaw agent IDs
const AGENT_ID_MAP = {
  'chroma': 'main',  // 'main' is the default OpenClaw agent
  'bender': 'bender',
  'pixel': 'pixel',
  'prism': 'prism',
  'lumen': 'lumen',
  'canvas': 'canvas',
  'flux': 'flux',
  'momentum': 'momentum',
  'glyph': 'glyph',
  'chief': 'chief',
  'critic': 'critic',
  // Sub-agents - FIX #1: Add sub-agent support
  'frontend-dev': 'frontend-dev',
  'backend-dev': 'backend-dev',
  'code-reviewer': 'code-reviewer',
  'qa-tester': 'qa-tester',
  'mobile-dev': 'mobile-dev',
  'market-researcher': 'market-researcher',
  'competitor-analyst': 'competitor-analyst',
  // Marketing sub-agents (Pixel's team)
  'content-writer': 'content-writer',
  'social-manager': 'social-manager',
  'seo-specialist': 'seo-specialist',
  'ad-creator': 'ad-creator',
  'email-marketer': 'email-marketer'
};

// Parent-child agent relationships for sub-agent spawning
const AGENT_PARENTS = {
  'frontend-dev': 'bender',
  'backend-dev': 'bender',
  'code-reviewer': 'bender',
  'qa-tester': 'bender',
  'mobile-dev': 'bender',
  'market-researcher': 'prism',
  'competitor-analyst': 'prism',
  // Marketing team - Pixel leads all
  'canvas': 'pixel',
  'flux': 'pixel',
  'content-writer': 'pixel',
  'social-manager': 'pixel',
  'seo-specialist': 'pixel',
  'ad-creator': 'pixel',
  'email-marketer': 'pixel'
};

// Use child_process to invoke OpenClaw CLI
const { exec } = require('child_process');

// Prompt suffix to instruct agents on where to save deliverables
function getTaskSuffix(handoff) {
  const executionTarget = handoff.executionTarget || normalizeExecutionTarget(handoff, handoff);

  if (executionTarget.workMode === WORK_MODE_IN_PLACE) {
    return `\n\n🛠️ WORK MODE: in_place\nTarget repo/app: ${executionTarget.targetPath}\nWorking directory: ${executionTarget.workdir}\nEdit the existing project in place instead of writing to AHM handoff/pipeline artifact folders.\nIf you change files, mention the modified paths in your response.`;
  }

  return `\n\n📁 WORK MODE: artifact\nSave any files, research, code, or deliverables to:\n${executionTarget.artifactPath}\n\nIf you create any files, note the file paths in your response so they can be retrieved.`;
}

function persistAgentResponseArtifact(outputPath, agentResponse, agentId, filePrefix = null) {
  if (!outputPath || !agentResponse) return null;
  if (!fs.existsSync(outputPath)) return null;

  const cleanContent = extractCleanContent(agentResponse, agentId);
  const safePrefix = filePrefix || `${agentId}-response`;
  const fileName = `${safePrefix}-${Date.now()}.txt`;
  fs.writeFileSync(path.join(outputPath, fileName), cleanContent);
  return { fileName, cleanContent };
}

// Agent endpoint - URL to call agents on local device
const LOCAL_AGENT_ENDPOINT = process.env.LOCAL_AGENT_ENDPOINT || 'http://localhost:3001/agent';

// Mode: 'local_http' (call local agents via HTTP) or 'openclaw' (use CLI)
const AGENT_MODE = process.env.AGENT_MODE || 'openclaw';

async function invokeOpenClawAgent(agentId, task, context, handoff) {
  const openClawAgentId = AGENT_ID_MAP[agentId];
  if (!openClawAgentId) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  const executionTarget = handoff.executionTarget || normalizeExecutionTarget(handoff, handoff);
  ensureExecutionFilesystemTarget(executionTarget);

  // Build the task prompt with context and output instructions
  let fullTask = context
    ? `${task}\n\nContext: ${context}`
    : task;

  // Add output directory instructions
  fullTask += getTaskSuffix(handoff);

  console.log(`🤖 Invoking agent: ${openClawAgentId}`);
  console.log(`   Mode: ${AGENT_MODE}`);
  console.log(`   Task: ${fullTask.substring(0, 100)}...`);

  // P0: Timeout enforcement - default 2 minutes
  const AGENT_TIMEOUT_MS = 120000; // 2 minutes
  const timeoutError = new Error(`Agent timed out after ${AGENT_TIMEOUT_MS/1000}s`);

  if (AGENT_MODE === 'local_http') {
    // Call local agents via HTTP API
    const agentPromise = (async () => {
      try {
        const response = await fetch(`${LOCAL_AGENT_ENDPOINT}/${openClawAgentId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task,
            context,
            agentId: openClawAgentId,
            handoffId: handoff.id,
            pipelineId: handoff.pipelineId,
            executionTarget,
          }),
          signal: AbortSignal.timeout(AGENT_TIMEOUT_MS)
        });

        if (!response.ok) {
          throw new Error(`Agent API error: ${response.status}`);
        }

        const result = await response.json();
        console.log(`✅ Agent ${openClawAgentId} responded via HTTP`);
        return result;
      } catch (error) {
        console.error(`❌ Agent HTTP call failed:`, error.message);
        throw error;
      }
    })();

    return Promise.race([agentPromise, new Promise((_, reject) => 
      setTimeout(() => reject(timeoutError), AGENT_TIMEOUT_MS)
    )]);
  } else {
    // Legacy: Use OpenClaw CLI (for backward compatibility)
    // P0: Wrap CLI call with timeout
    const cliPromise = new Promise((resolve, reject) => {
      // Escape the task for shell
      const escapedTask = fullTask.replace(/"/g, '\\"');

      const cmd = `openclaw agent --agent ${openClawAgentId} --message "${escapedTask}" --json --timeout 300`;

      const { spawn } = require('child_process');
      const child = spawn('bash', ['-c', cmd], {
        cwd: executionTarget.workdir,
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (err, value) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve(value);
      };

      const killTimer = setTimeout(() => {
        try { child.kill('SIGTERM'); } catch {}
        finish(new Error(`OpenClaw CLI timed out after ${AGENT_TIMEOUT_MS/1000}s`));
      }, AGENT_TIMEOUT_MS);

      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      child.on('error', (error) => {
        clearTimeout(killTimer);
        console.error(`❌ OpenClaw CLI error:`, error.message);
        finish(new Error(`OpenClaw CLI error: ${error.message}`));
      });

      child.on('close', (code) => {
        clearTimeout(killTimer);

        if (code !== 0 && stderr) {
          console.error(`❌ OpenClaw CLI error:`, stderr);
          return finish(new Error(`OpenClaw CLI error: ${stderr}`));
        }

        try {
          let result = {};
          try {
            result = stdout ? JSON.parse(stdout) : {};
          } catch {
            result = { raw: stdout };
          }

          const payloads = result.result?.payloads || result.payloads;
          const message = payloads?.[0]?.text
            || result.result?.message
            || result.message
            || result.response
            || result.output
            || result.text
            || (result.raw ? result.raw.substring(0, 1000) : 'Completed');

          finish(null, { message, payloads, raw: result.raw || stdout });
        } catch {
          finish(null, { message: stdout || 'Completed', raw: stdout, rawFallback: true });
        }
      });
    });

    return Promise.race([cliPromise, new Promise((_, reject) =>
      setTimeout(() => reject(timeoutError), AGENT_TIMEOUT_MS)
    )]);
  }
}

async function processHandoff(handoff) {
  if (processingHandoffs.has(handoff.id)) return;

  // Check dependencies first
  if (!checkDependencies(handoff)) {
    console.log(`⏳ Handoff ${handoff.id} waiting for dependencies`);
    return; // Will be rechecked on next processor run
  }

  processingHandoffs.add(handoff.id);

  try {
    // Mark in_progress
    handoff.status = 'in_progress';
    handoff.startedAt = new Date().toISOString();
    // P0: Persist state
    saveHandoffs();
    console.log(`▶️  Processing: ${handoff.fromAgent} → ${handoff.toAgent}: ${handoff.task?.substring(0, 60)}`);

    // Get timeout from config for this agent
    const agentTimeout = config.agentTimeouts[handoff.toAgent] || 300000;

    // P0: Hard timeout enforcement - 2 minutes max
    const HARD_TIMEOUT_MS = 120000;
    const timeoutError = new Error(`Agent timed out after ${HARD_TIMEOUT_MS/1000}s - forcing failure`);

    // Invoke the actual OpenClaw agent with timeout
    try {
      const result = await Promise.race([
        invokeOpenClawAgent(
          handoff.toAgent,
          handoff.task,
          handoff.context,
          handoff
        ),
        new Promise((_, reject) => 
          setTimeout(() => reject(timeoutError), HARD_TIMEOUT_MS)
        )
      ]);

      // Store the agent's response in the handoff record
      const responseText = result?.message || result?.payloads?.[0]?.text || (result ? JSON.stringify(result).substring(0,1000) : 'No response');
      handoff.agentResponse = responseText || 'Completed';
      handoff.responseAt = new Date().toISOString();

      console.log(`✅ Agent ${handoff.toAgent} completed: ${(responseText || '').substring(0, 60)}...`);

      // Verify files are synced before marking as complete
      const verification = await ensureDeliverablesReady(handoff);
      handoff.finalOutcome = verification?.fallback ? 'response_fallback_saved' : (verification?.verified ? 'artifact_verified' : 'response_only');
      saveHandoffs();

      await completeHandoff(handoff);
    } catch (agentErr) {
      console.error(`❌ Agent ${handoff.toAgent} failed:`, agentErr.message);
      handoff.error = agentErr.message;
      handoff.failureReason = agentErr.message?.includes('timed out') ? 'agent_timeout' : 'agent_execution_error';
      handoff.lastErrorAt = new Date().toISOString();
      saveHandoffs();

      // Trigger retry logic
      await retryHandoff(handoff);
    }

    // If this is part of a pipeline, log progress
    if (handoff.pipelineId) {
      const { pipelineStep, pipelineTotalSteps, pipelineId } = handoff;
      console.log(`🔗 Pipeline ${pipelineId}: step ${pipelineStep}/${pipelineTotalSteps} done`);

      const remaining = Array.from(handoffs.values()).filter(
        h => h.pipelineId === pipelineId && h.status === 'pending'
      );
      if (remaining.length === 0) {
        console.log(`🏁 Pipeline ${pipelineId} complete — all ${pipelineTotalSteps} steps done`);
        const pipelineHandoffs = Array.from(handoffs.values()).filter(h => h.pipelineId === pipelineId);
        triggerWebhooks('PipelineComplete', { pipelineId, handoffs: pipelineHandoffs });
      }
    }
  } catch (err) {
    handoff.status = 'failed';
    handoff.error = err.message;
    // P0: Persist state
    saveHandoffs();
    console.error(`❌ Failed to process handoff ${handoff.id}:`, err.message);
  } finally {
    processingHandoffs.delete(handoff.id);
  }
}

function runAutoProcessor() {
  // Check concurrency limit
  const activeCount = () => Array.from(handoffs.values()).filter(h => h.status === 'in_progress').length;
  if (activeCount() >= MAX_CONCURRENT) {
    console.log(`⏳ Max concurrent (${MAX_CONCURRENT}) reached, skipping...`);
    return;
  }

  const pending = Array.from(handoffs.values()).filter(
    h => h.status === 'pending' && !processingHandoffs.has(h.id)
  );

  if (pending.length === 0) return;

  console.log(`⚙️  Auto-processor: ${pending.length} pending handoff(s) found`);

  // Process pipeline steps in order — don't start step N+1 until step N is done
  const pipelineMap = new Map();
  const standalone = [];

  for (const h of pending) {
    if (h.pipelineId) {
      if (!pipelineMap.has(h.pipelineId)) pipelineMap.set(h.pipelineId, []);
      pipelineMap.get(h.pipelineId).push(h);
    } else {
      standalone.push(h);
    }
  }

  // For each pipeline, only process the lowest step that is still pending
  for (const [, steps] of pipelineMap) {
    steps.sort((a, b) => (a.pipelineStep || 0) - (b.pipelineStep || 0));

    // Check if any step in this pipeline is already in_progress
    const anyInProgress = Array.from(handoffs.values()).some(
      h => h.pipelineId === steps[0].pipelineId && h.status === 'in_progress'
    );
    if (anyInProgress) continue;

    // Process only the first pending step
    processHandoff(steps[0]);
  }

  // Process all standalone handoffs
  for (const h of standalone) {
    processHandoff(h);
  }
}

// Start the worker after a short boot delay
setTimeout(() => {
  console.log(`⚙️  Auto-processor started (every ${PROCESSOR_INTERVAL_MS / 1000}s)`);
  runAutoProcessor(); // run immediately on boot
  setInterval(runAutoProcessor, PROCESSOR_INTERVAL_MS);
}, 3000);

// ==================== WEBSOCKET ====================

const WebSocket = require('ws');
const http = require('http');

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Track connected clients
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`📡 WebSocket client connected (${clients.size} total)`);

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`📡 WebSocket client disconnected (${clients.size} remaining)`);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Broadcast function to notify all clients
function broadcastHandoffUpdate(type, handoff) {
  const message = JSON.stringify({
    type,
    handoff,
    timestamp: new Date().toISOString()
  });

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastAgentMention(agentId, mentionType, details = {}) {
  const message = JSON.stringify({
    type: 'agent_mention',
    agentId,
    mentionType, // 'ping', 'message', 'task', 'handoff'
    details,
    timestamp: new Date().toISOString()
  });

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Export broadcast functions for use in other parts of the server
global.broadcastHandoffUpdate = broadcastHandoffUpdate;
global.broadcastAgentMention = broadcastAgentMention;

// ==================== DISCORD COMMAND WEBHOOK ====================
// Accept commands from Discord to create pipelines
// Format: { command: "create", task: "...", agents: ["chroma", "bender"], context: "..." }

app.post('/api/discord/command', async (req, res) => {
  try {
    const { command, task, agents, context, priority } = req.body;

    if (command === 'create' || command === 'pipeline') {
      if (!task || !agents || !Array.isArray(agents) || agents.length < 2) {
        return res.status(400).json({
          error: 'Invalid command. Required: task (string), agents (array of 2+)'
        });
      }

      // Create the pipeline
      const pipelineId = `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const results = [];

      // Define role-based subtasks for each step
      const roleTasks = {
        'chroma': 'Analyze requirements, create plan, hand off to next agent',
        'prism': 'Research competitors, gather requirements, provide insights',
        'canvas': 'Design UI/mockups, create visual assets',
        'pixel': 'Write copy, create content, marketing strategy',
        'bender': 'Build the actual deliverable, write code',
        'lumen': 'Review, test, provide feedback',
        'flux': 'Create videos, motion graphics',
        'momentum': 'Analyze data, provide market insights',
        'glyph': 'Set up automation, workflows',
        'chief': 'Coordinate, ensure alignment'
      };

      for (let i = 0; i < agents.length - 1; i++) {
        const from = agents[i];
        const to = agents[i + 1];
        const stepNum = i + 1;
        const totalSteps = agents.length - 1;

        // Each step gets a FOCUSED subtask, not the full task
        let stepTask;
        if (stepNum === 1) {
          stepTask = `[Pipeline Step 1/${totalSteps}: ${from} → ${to}]
        
MAIN TASK: ${task}

YOUR JOB (${from}): ${roleTasks[from] || 'complete your task'}
- Do ONLY your part
- When done, hand off to ${to}
- DO NOT do the entire project yourself`;
        } else if (stepNum === totalSteps) {
          stepTask = `[Pipeline Step ${stepNum}/${totalSteps}: ${from} → ${to}]
        
ORIGINAL TASK: ${task.substring(0, 100)}...

YOUR JOB (${to}): ${roleTasks[to] || 'complete the build'}
- This is the FINAL step - execute and deliver
- DO NOT hand off further`;
        } else {
          stepTask = `[Pipeline Step ${stepNum}/${totalSteps}: ${from} → ${to}]
        
ORIGINAL TASK: ${task.substring(0, 80)}...

YOUR JOB (${to}): ${roleTasks[to] || 'continue the pipeline'}
- Focus ONLY on your contribution
- Hand off to ${agents[i + 2]} when done`;
        }

        const stepContext = context
          ? `${context}\n\nPipeline: ${pipelineId} | Step ${stepNum}/${totalSteps} | Chain: ${agents.join(' → ')}`
          : `Pipeline: ${pipelineId} | Step ${stepNum}/${totalSteps} | Chain: ${agents.join(' → ')}`;

        const result = await createHandoff(from, to, stepTask, stepContext, [], [], priority || 'medium', {
          pipelineId,
          pipelineStep: stepNum,
          pipelineTotalSteps: totalSteps,
          pipelineAgents: agents,
        });

        results.push(result);
      }

      console.log(`📝 Discord: Created pipeline ${pipelineId} with ${results.length} steps`);

      // Notify via Discord
      sendDiscordNotification({
        fromAgent: 'discord',
        toAgent: agents[0],
        task: `Pipeline created: ${task?.substring(0, 50)}...`,
        priority: priority || 'medium',
        pipelineId
      }, 'new');

      res.json({
        success: true,
        pipelineId,
        steps: results.length,
        message: `Pipeline created with ${results.length} steps`
      });
    }
    else if (command === 'status') {
      // Return current pipeline status - inline the dashboard logic
      const all = Array.from(handoffs.values());
      const pending = all.filter(h => h.status === 'pending');
      const completed = all.filter(h => h.status === 'completed');

      res.json({
        command: 'status',
        summary: {
          total: all.length,
          pending: pending.length,
          completed: completed.length
        }
      });
    }
    else if (command === 'list') {
      // List available agents
      res.json({
        command: 'list',
        agents: Object.keys(config.agents).map(id => ({
          id,
          name: config.agents[id].name,
          role: config.agents[id].role
        }))
      });
    }
    else {
      res.status(400).json({ error: 'Unknown command. Use: create, status, list' });
    }
  } catch (error) {
    console.error('Discord command error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint for Discord mentions - triggers sprite reaction on office page
app.post('/api/discord/mention', (req, res) => {
  const { agentId, mentionType, message, channelId, userId } = req.body;

  if (!agentId) {
    return res.status(400).json({ error: 'agentId required' });
  }

  // Broadcast to all connected WebSocket clients
  broadcastAgentMention(agentId, mentionType || 'ping', {
    message,
    channelId,
    userId,
    timestamp: new Date().toISOString()
  });

  res.json({ success: true, agentId, mentionType });
});

// ==================== NEW API ENDPOINTS ====================

// --- Persistent Scheduling API ---
app.post('/api/schedules', (req, res) => {
  const { type, task, fromAgent, toAgent, context, priority, scheduledAt, cron, name } = req.body;

  if (!scheduledAt && !cron) {
    return res.status(400).json({ error: 'scheduledAt or cron required' });
  }

  const id = `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const job = {
    id,
    name: name || task?.substring(0, 30),
    type: type || 'handoff', // handoff, automation, webhook
    task,
    fromAgent,
    toAgent,
    context: context || {},
    priority: priority || 'medium',
    scheduledAt: scheduledAt || getNextCronRun(cron),
    cron, // If present, job is recurring
    recurring: !!cron,
    createdAt: Date.now(),
    executions: 0
  };

  scheduledJobs.set(id, job);
  scheduleJob(job);
  saveSchedules();

  res.json({ success: true, scheduleId: id, scheduledFor: job.scheduledAt });
});

app.get('/api/schedules', (req, res) => {
  const all = Array.from(scheduledJobs.values()).map(j => ({
    ...j,
    timeoutId: undefined // Don't expose internal ID
  }));
  res.json(all);
});

app.delete('/api/schedules/:id', (req, res) => {
  const job = scheduledJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Schedule not found' });

  if (job.timeoutId) clearTimeout(job.timeoutId);
  scheduledJobs.delete(req.params.id);
  saveSchedules();

  res.json({ success: true });
});

// --- Cron Schedules API ---
app.post('/api/cron', (req, res) => {
  const { cron, task, name, type, ...opts } = req.body;

  if (!cron || !task) {
    return res.status(400).json({ error: 'cron expression and task required' });
  }

  const nextRun = getNextCronRun(cron);
  if (!nextRun) {
    return res.status(400).json({ error: 'Invalid cron expression' });
  }

  // Create schedule with cron
  req.body.scheduledAt = nextRun;
  req.body.name = name || `Cron: ${task.substring(0, 20)}`;

  // Redirect to schedules endpoint
  return res.json({ error: "Cron endpoint - use /api/schedules directly with cron field" });
});

// --- Webhooks API ---
app.post('/api/webhooks', (req, res) => {
  const { name, url, events, headers } = req.body;

  if (!name || !url) {
    return res.status(400).json({ error: 'name and url required' });
  }

  const id = `wh_${Date.now()}`;
  const webhook = { id, name, url, events: events || ['*'], headers: headers || {}, createdAt: Date.now() };

  webhooks.set(id, webhook);
  saveWebhooks();

  res.json({ success: true, webhookId: id });
});

app.get('/api/webhooks', (req, res) => {
  res.json(Array.from(webhooks.values()));
});

app.delete('/api/webhooks/:id', (req, res) => {
  if (!webhooks.has(req.params.id)) {
    return res.status(404).json({ error: 'Webhook not found' });
  }
  webhooks.delete(req.params.id);
  saveWebhooks();
  res.json({ success: true });
});

app.post('/api/webhooks/:id/test', async (req, res) => {
  const wh = webhooks.get(req.params.id);
  if (!wh) return res.status(404).json({ error: 'Webhook not found' });

  const result = await triggerWebhook({
    webhookId: wh.id,
    event: 'test',
    data: { test: true },
    task: `Test webhook: ${wh.name}`
  });

  res.json(result);
});

// --- General Automation API ---
app.post('/api/automations', (req, res) => {
  const { name, description, steps, context, trigger } = req.body;

  if (!name || !steps || !Array.isArray(steps)) {
    return res.status(400).json({ error: 'name and steps array required' });
  }

  const id = `auto_${Date.now()}`;
  const automation = { id, name, description, steps, context: context || {}, trigger, createdAt: Date.now() };

  automations.set(id, automation);
  saveAutomations();

  res.json({ success: true, automationId: id });
});

app.get('/api/automations', (req, res) => {
  res.json(Array.from(automations.values()));
});

app.get('/api/automations/:id', async (req, res) => {
  const automation = automations.get(req.params.id);
  if (!automation) return res.status(404).json({ error: 'Automation not found' });

  // Execute and return result
  const result = await executeAutomation(automation);
  res.json(result);
});

app.delete('/api/automations/:id', (req, res) => {
  if (!automations.has(req.params.id)) {
    return res.status(404).json({ error: 'Automation not found' });
  }
  automations.delete(req.params.id);
  saveAutomations();
  res.json({ success: true });
});

// Run automation on schedule
app.post('/api/automations/:id/schedule', (req, res) => {
  const automation = automations.get(req.params.id);
  if (!automation) return res.status(404).json({ error: 'Automation not found' });

  const { cron, scheduledAt } = req.body;

  // Create a scheduled job that runs this automation
  const scheduleReq = {
    body: {
      type: 'automation',
      name: `Auto: ${automation.name}`,
      task: `Run automation: ${automation.name}`,
      scheduledAt: scheduledAt || getNextCronRun(cron),
      cron,
      automationId: automation.id,
      context: automation.context
    }
  };

  return res.json({ error: "Schedule automation - use /api/schedules directly" });
});

// ==================== MARKETING HUB API ====================

// Helper to add activity entry
function addMarketingActivity(action, type, entityId, details = {}) {
  // Map action to status
  const statusMap = { created: 'in_progress', updated: 'in_progress', approved: 'completed', rejected: 'completed', deleted: 'failed', failed: 'failed' };
  const entry = {
    id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    action,
    type,
    entityId,
    details,
    // Frontend expects these fields:
    agent: details.agent || 'system',
    agentEmoji: details.agentEmoji || '🤖',
    taskType: type,
    brandId: details.brandId || entityId,
    status: statusMap[action] || 'pending',
    timestamp: new Date().toISOString()
  };
  marketingActivity.unshift(entry);
  // Keep last 50
  if (marketingActivity.length > 50) marketingActivity.pop();
  return entry;
}

// --- Brands API ---
app.get('/api/marketing/brands', (req, res) => {
  const brandList = Array.from(brands.values());
  res.json({ brands: brandList, count: brandList.length });
});

app.post('/api/marketing/brands', (req, res) => {
  const { name, logo, colors, fonts, tone, audience, styleGuideLinks } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  
  const id = `brand_${Date.now()}`;
  const brand = {
    id,
    name,
    logo: logo || '',
    colors: colors || { primary: '#3b82f6', secondary: '#1e40af' },
    fonts: fonts || { primary: 'Inter' },
    tone: tone || 'Professional',
    audience: audience || '',
    styleGuideLinks: styleGuideLinks || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  brands.set(id, brand);
  addMarketingActivity('created', 'brand', id, { name });
  res.json({ success: true, brand });
});

app.get('/api/marketing/brands/:id', (req, res) => {
  const brand = brands.get(req.params.id);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  res.json({ brand });
});

app.put('/api/marketing/brands/:id', (req, res) => {
  const brand = brands.get(req.params.id);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  
  const { name, logo, colors, fonts, tone, audience, styleGuideLinks } = req.body;
  if (name) brand.name = name;
  if (logo !== undefined) brand.logo = logo;
  if (colors) brand.colors = { ...brand.colors, ...colors };
  if (fonts) brand.fonts = { ...brand.fonts, ...fonts };
  if (tone) brand.tone = tone;
  if (audience) brand.audience = audience;
  if (styleGuideLinks) brand.styleGuideLinks = styleGuideLinks;
  brand.updatedAt = new Date().toISOString();
  
  brands.set(brand.id, brand);
  addMarketingActivity('updated', 'brand', brand.id, { name: brand.name });
  res.json({ success: true, brand });
});

app.delete('/api/marketing/brands/:id', (req, res) => {
  const brand = brands.get(req.params.id);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  
  brands.delete(req.params.id);
  addMarketingActivity('deleted', 'brand', req.params.id, { name: brand.name });
  res.json({ success: true });
});

// --- Competitors API ---
app.get('/api/marketing/competitors', (req, res) => {
  const { brandId } = req.query;
  let list = Array.from(competitors.values());
  if (brandId) {
    list = list.filter(c => c.brandId === brandId);
  }
  res.json({ competitors: list, count: list.length });
});

app.post('/api/marketing/competitors', (req, res) => {
  const { brandId, name, website, strengths, weaknesses, keywords, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  
  const id = `competitor_${Date.now()}`;
  const competitor = {
    id,
    brandId: brandId || null,
    name,
    website: website || '',
    strengths: strengths || [],
    weaknesses: weaknesses || [],
    keywords: keywords || [],
    notes: notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  competitors.set(id, competitor);
  addMarketingActivity('created', 'competitor', id, { name, brandId });
  res.json({ success: true, competitor });
});

// --- Marketing Requests API ---
app.get('/api/marketing/requests', (req, res) => {
  const { status } = req.query;
  let list = Array.from(marketingRequests.values()).map(syncMarketingRequest);
  if (status) {
    list = list.filter(r => r.status === status);
  }
  res.json({ requests: list, count: list.length });
});

app.post('/api/marketing/requests', async (req, res) => {
  const { brandId, type, notes, description, priority } = req.body;
  const title = notes || description || `Marketing request: ${type}`;
  if (!type) return res.status(400).json({ error: 'type required' });
  
  const agent = MARKETING_AGENTS[type] || 'pixel';
  const agentEmoji = { 'seo-specialist': '🔍', 'ad-creator': '📺', 'email-marketer': '📧', 'social-manager': '📱', 'competitor-analyst': '📊', 'content-writer': '✍️', 'pixel': '🎨' }[agent] || '🤖';
  const id = `request_${Date.now()}`;
  const request = {
    id,
    brandId: brandId || null,
    type,
    title,
    description: description || '',
    priority: priority || 'medium',
    status: 'pending',
    assignedAgent: agent,
    handoffId: null,
    deliverableId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const brand = brandId ? brands.get(brandId) : null;
  const taskText = `${title}\n\nRequest type: ${type}\nBrand: ${brand ? brand.name : 'General'}\nPriority: ${request.priority}${description ? `\n\nNotes: ${description}` : ''}\n\n📁 OUTPUT INSTRUCTIONS:\n1. Save your work to the handoff output folder when instructed\n2. Provide CLEAN, USABLE deliverables - not raw JSON dumps\n3. For research: save a markdown summary file with key findings\n4. For content: save the actual copy/content in a usable format\n5. Include a brief summary of what you produced\n\n⚠️ IMPORTANT: Don't just return JSON metadata. Produce actual usable content.`;
  const handoffResult = await createHandoff('chroma', agent, taskText, `Marketing Hub request ${id}`, [], [], request.priority, { brandId: request.brandId });

  request.handoffId = handoffResult.handoffId;
  request.status = 'in_progress';
  marketingRequests.set(id, request);
  
  addMarketingActivity('created', 'request', id, { 
    title, 
    type, 
    agent,
    agentEmoji,
    brandId: brandId || 'unknown',
    status: 'in_progress',
    handoffId: request.handoffId
  });
  
  res.json({ success: true, request, agent, handoffId: request.handoffId });
});

app.put('/api/marketing/requests/:id', (req, res) => {
  const request = marketingRequests.get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  
  const { status, priority, description } = req.body;
  if (status) request.status = status;
  if (priority) request.priority = priority;
  if (description) request.description = description;
  request.updatedAt = new Date().toISOString();
  
  marketingRequests.set(request.id, request);
  addMarketingActivity('updated', 'request', request.id, { status: request.status });
  res.json({ success: true, request });
});

app.post('/api/marketing/requests/:id/approve', (req, res) => {
  const request = marketingRequests.get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  
  request.status = 'approved';
  request.approvedAt = new Date().toISOString();
  request.updatedAt = new Date().toISOString();
  
  marketingRequests.set(request.id, request);
  addMarketingActivity('approved', 'request', request.id, { title: request.title });
  res.json({ success: true, request });
});

app.post('/api/marketing/requests/:id/reject', (req, res) => {
  const request = marketingRequests.get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  
  const { reason } = req.body;
  request.status = 'rejected';
  request.rejectReason = reason || '';
  request.updatedAt = new Date().toISOString();
  
  marketingRequests.set(request.id, request);
  addMarketingActivity('rejected', 'request', request.id, { title: request.title, reason });
  res.json({ success: true, request });
});

// --- Marketing Pipeline Templates ---
app.post('/api/marketing/pipelines/competitor-brief', async (req, res) => {
  const { brandId, notes } = req.body;
  const brand = brandId ? brands.get(brandId) : null;
  const brandName = brand ? brand.name : 'General';
  
  // Create Chief task for this pipeline
  const tasksFile = path.join(__dirname, 'data', 'tasks.json');
  let tasksData = { tasks: [], columns: [], priorities: [], owners: [] };
  try { if (fs.existsSync(tasksFile)) tasksData = JSON.parse(fs.readFileSync(tasksFile, 'utf8')); } catch (e) {}
  const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  const pipelineTask = {
    id: taskId,
    title: `Competitor Research → Design Brief: ${brandName}`,
    description: notes || 'Full pipeline: Prism research → Canvas design brief',
    owner: 'chroma',
    priority: 'high',
    column: 'in_progress',
    doneCriteria: 'Both steps complete with deliverables',
    criticChecklist: 'Prism delivers research; Canvas creates brief; files exist in output folder',
    criticReviewed: false,
    blockers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  tasksData.tasks.push(pipelineTask);
  fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2));
  
  const step1Task = `Research competitors for ${brandName}

${notes ? `Context: ${notes}` : ''}

📁 OUTPUT: Save research findings to the handoff folder as a markdown file.`;

  const step2Task = `Create a design brief based on competitor research

Previous research is in the context above.

📁 OUTPUT: Save design brief to the handoff folder as markdown. Include:
- Target audience
- Key messaging
- Visual direction
- Recommended formats`;

  const pipelineSteps = [
    { from: 'chroma', to: 'prism', task: step1Task, priority: 'high' },
    { from: 'prism', to: 'canvas', task: step2Task, priority: 'high' }
  ];

  // Execute pipeline
  try {
    const pipelineRes = await fetch(`http://localhost:${config.port}/api/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Competitor Brief: ${brandName}`,
        steps: pipelineSteps,
        sequential: true,
        priority: 'high',
        workMode: 'artifact'
      })
    });
    const pipelineResult = await pipelineRes.json();
    
    res.json({
      success: true,
      pipelineId: pipelineResult.pipelineId,
      taskId,
      status: 'started',
      steps: ['Prism (research)', 'Canvas (design brief)']
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Deliverables API ---
app.get('/api/marketing/deliverables', (req, res) => {
  const { requestId } = req.query;
  Array.from(marketingRequests.values()).forEach(syncMarketingRequest);
  let list = Array.from(deliverables.values());
  if (requestId) {
    list = list.filter(d => d.requestId === requestId);
  }
  res.json({ deliverables: list, count: list.length });
});

app.post('/api/marketing/deliverables', (req, res) => {
  const { requestId, name, type, url, content, notes } = req.body;
  if (!requestId || !name) return res.status(400).json({ error: 'requestId and name required' });
  
  const id = `deliverable_${Date.now()}`;
  const deliverable = {
    id,
    requestId,
    name,
    type: type || 'file',
    url: url || '',
    content: content || '',
    notes: notes || '',
    createdAt: new Date().toISOString()
  };
  
  deliverables.set(id, deliverable);
  // P0: Persist state
  saveDeliverables();
  addMarketingActivity('created', 'deliverable', id, { name, requestId });
  res.json({ success: true, deliverable });
});

// --- Activity API ---
app.get('/api/marketing/activity', (req, res) => {
  const { limit = 50 } = req.query;
  const activity = marketingActivity.slice(0, parseInt(limit));
  res.json({ activity, count: activity.length });
});

// ==================== TASK BOARD API ====================
const tasksFile = path.join(__dirname, 'data', 'tasks.json');

function loadTasks() {
  try {
    if (fs.existsSync(tasksFile)) {
      return JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading tasks:', e);
  }
  return { tasks: [], columns: [], priorities: [], owners: [] };
}

function saveTasks(data) {
  fs.writeFileSync(tasksFile, JSON.stringify(data, null, 2));
}

app.get('/api/tasks', (req, res) => {
  const { client, column, owner, priority } = req.query;
  const data = loadTasks();
  let tasks = data.tasks;
  
  // Filter by client
  if (client) {
    tasks = tasks.filter(t => t.client === client);
  }
  // Filter by column
  if (column) {
    tasks = tasks.filter(t => t.column === column);
  }
  // Filter by owner
  if (owner) {
    tasks = tasks.filter(t => t.owner === owner);
  }
  // Filter by priority
  if (priority) {
    tasks = tasks.filter(t => t.priority === priority);
  }
  
  res.json({ ...data, tasks });
});

app.post('/api/tasks', (req, res) => {
  const { title, description, owner, priority, column = 'backlog', doneCriteria = '', criticChecklist = '', criticReviewed = false, client = null } = req.body;
  const data = loadTasks();
  const task = {
    id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    title,
    description: description || '',
    owner: owner || 'unassigned',
    priority: priority || 'medium',
    column,
    doneCriteria: doneCriteria || '',
    criticChecklist: criticChecklist || '',
    criticReviewed: !!criticReviewed,
    client: client || null,  // Client association (unt, buddhas, chromapages, etc.)
    blockers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.tasks.push(task);
  saveTasks(data);
  res.json({ success: true, task });
});

app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, owner, priority, column, doneCriteria, criticChecklist, criticReviewed, blockers, client } = req.body;
  const data = loadTasks();
  const taskIndex = data.tasks.findIndex(t => t.id === id);
  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }
  const task = data.tasks[taskIndex];
  if (title !== undefined) task.title = title;
  if (description !== undefined) task.description = description;
  if (owner !== undefined) task.owner = owner;
  if (priority !== undefined) task.priority = priority;
  if (column !== undefined) task.column = column;
  if (doneCriteria !== undefined) task.doneCriteria = doneCriteria;
  if (criticChecklist !== undefined) task.criticChecklist = criticChecklist;
  if (criticReviewed !== undefined) task.criticReviewed = !!criticReviewed;
  if (blockers !== undefined) task.blockers = blockers;
  if (client !== undefined) task.client = client;
  task.updatedAt = new Date().toISOString();
  data.tasks[taskIndex] = task;
  saveTasks(data);
  res.json({ success: true, task });
});

app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const data = loadTasks();
  const taskIndex = data.tasks.findIndex(t => t.id === id);
  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }
  data.tasks.splice(taskIndex, 1);
  saveTasks(data);
  res.json({ success: true });
});

// Task column operations
app.put('/api/tasks/:id/move', (req, res) => {
  const { id } = req.params;
  const { column } = req.body;
  const data = loadTasks();
  const task = data.tasks.find(t => t.id === id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  task.column = column;
  task.updatedAt = new Date().toISOString();
  saveTasks(data);
  res.json({ success: true, task });
});

// Task blockers
app.post('/api/tasks/:id/blockers', (req, res) => {
  const { id } = req.params;
  const { description } = req.body;
  const data = loadTasks();
  const task = data.tasks.find(t => t.id === id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  const blocker = {
    id: 'blocker_' + Date.now(),
    description,
    createdAt: new Date().toISOString()
  };
  task.blockers = task.blockers || [];
  task.blockers.push(blocker);
  task.updatedAt = new Date().toISOString();
  if (task.column !== 'blocked') {
    task.column = 'blocked';
  }
  saveTasks(data);
  res.json({ success: true, blocker });
});

app.delete('/api/tasks/:id/blockers/:blockerId', (req, res) => {
  const { id, blockerId } = req.params;
  const data = loadTasks();
  const task = data.tasks.find(t => t.id === id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  task.blockers = (task.blockers || []).filter(b => b.id !== blockerId);
  task.updatedAt = new Date().toISOString();
  saveTasks(data);
  res.json({ success: true });
});

// ==================== APPROVAL QUEUE ====================
// Get all items pending review across tasks and marketing requests
app.get('/api/approvals', (req, res) => {
  const { client } = req.query;
  const approvals = [];
  
  // Get tasks with pending_review status
  let tasks = loadTasks().tasks.filter(t => t.column === 'pending_review');
  if (client) tasks = tasks.filter(t => t.client === client);
  tasks.forEach(t => {
    approvals.push({
      id: t.id,
      type: 'task',
      title: t.title,
      description: t.description,
      client: t.client,
      priority: t.priority,
      owner: t.owner,
      doneCriteria: t.doneCriteria,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt
    });
  });
  
  // Get marketing requests with pending_review status
  let mktRequests = Array.from(marketingRequests.values()).filter(r => r.status === 'pending_review');
  if (client) mktRequests = mktRequests.filter(r => r.client === client);
  mktRequests.forEach(r => {
    approvals.push({
      id: r.id,
      type: 'marketing_request',
      title: r.title,
      description: r.description,
      client: r.client,
      priority: r.priority,
      brand: r.brandId,
      type: r.type,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    });
  });
  
  // Sort by createdAt descending
  approvals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  res.json({ approvals });
});

// Approve/reject a task
app.post('/api/approvals/task/:id/approve', (req, res) => {
  const { id } = req.params;
  const data = loadTasks();
  const task = data.tasks.find(t => t.id === id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  
  task.column = 'done';
  task.updatedAt = new Date().toISOString();
  saveTasks(data);
  res.json({ success: true, task });
});

app.post('/api/approvals/task/:id/reject', (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const data = loadTasks();
  const task = data.tasks.find(t => t.id === id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  
  task.column = 'backlog';
  task.blockers = task.blockers || [];
  task.blockers.push({ id: 'rej_' + Date.now(), reason: reason || 'Rejected', createdAt: new Date().toISOString() });
  task.updatedAt = new Date().toISOString();
  saveTasks(data);
  res.json({ success: true, task });
});

// ==================== CLIENT COMMAND VIEW ====================
// Get full client details: tasks, handoffs, pipelines, cron
app.get('/api/clients/:clientId', (req, res) => {
  const { clientId } = req.params;
  
  // Get tasks for this client
  const allTasks = loadTasks().tasks.filter(t => t.client === clientId);
  
  // Get handoffs for this client
  const allHandoffs = Array.from(handoffs.values()).filter(h => h.client === clientId);
  
  // Get marketing requests for this client
  const mktRequests = Array.from(marketingRequests.values()).filter(r => r.client === clientId);
  
  // Get deliverables for this client
  const clientDeliverables = Array.from(deliverables.values()).filter(d => {
    const req = marketingRequests.get(d.requestId);
    return req && req.client === clientId;
  });
  
  // Get schedules for this client (filter by name containing clientId)
  const clientSchedules = Array.from(scheduledJobs.values()).filter(s => 
    s.name.toLowerCase().includes(clientId.toLowerCase())
  );
  
  // Stats
  const stats = {
    tasks: {
      total: allTasks.length,
      backlog: allTasks.filter(t => t.column === 'backlog').length,
      todo: allTasks.filter(t => t.column === 'todo').length,
      in_progress: allTasks.filter(t => t.column === 'in_progress').length,
      pending_review: allTasks.filter(t => t.column === 'pending_review').length,
      done: allTasks.filter(t => t.column === 'done').length,
      blocked: allTasks.filter(t => t.column === 'blocked').length
    },
    handoffs: {
      total: allHandoffs.length,
      pending: allHandoffs.filter(h => h.status === 'pending').length,
      in_progress: allHandoffs.filter(h => h.status === 'in_progress').length,
      completed: allHandoffs.filter(h => h.status === 'completed').length,
      failed: allHandoffs.filter(h => h.status === 'failed').length
    },
    deliverables: clientDeliverables.length,
    pendingApprovals: allTasks.filter(t => t.column === 'pending_review').length + mktRequests.filter(r => r.status === 'pending_review').length
  };
  
  res.json({
    client: clientId,
    stats,
    tasks: allTasks.slice(-20), // Last 20
    handoffs: allHandoffs.slice(-20), // Last 20
    marketingRequests: mktRequests.slice(-10),
    deliverables: clientDeliverables.slice(-10),
    schedules: clientSchedules
  });
});

// ==================== AGENT CONTROL PANEL ====================
// Get agent status (idle vs active)
app.get('/api/agents/status', (req, res) => {
  const activeHandoffs = Array.from(handoffs.values()).filter(h => 
    h.status === 'in_progress' || h.status === 'pending'
  );
  
  const agentStatus = {};
  Object.keys(config.agents).forEach(agentId => {
    const agentHandoffs = activeHandoffs.filter(h => h.toAgent === agentId);
    agentStatus[agentId] = {
      status: agentHandoffs.length > 0 ? 'active' : 'idle',
      activeCount: agentHandoffs.length,
      currentTasks: agentHandoffs.map(h => ({
        id: h.id,
        task: h.task,
        client: h.client,
        status: h.status,
        startedAt: h.startedAt
      }))
    };
  });
  
  const summary = {
    totalAgents: Object.keys(agentStatus).length,
    active: Object.values(agentStatus).filter(a => a.status === 'active').length,
    idle: Object.values(agentStatus).filter(a => a.status === 'idle').length
  };
  
  res.json({ agents: agentStatus, summary });
});

// Dispatch task to any agent directly
app.post('/api/dispatch', async (req, res) => {
  const { toAgent, task, context, priority, client, targetPath } = req.body;
  
  if (!toAgent || !task) {
    return res.status(400).json({ error: 'toAgent and task required' });
  }
  
  if (!config.agents[toAgent]) {
    return res.status(400).json({ error: `Unknown agent: ${toAgent}` });
  }
  
  try {
    const result = await createHandoff('chroma', toAgent, task, context || '', [], [], priority || 'medium', {
      client: client || null,
      targetPath: targetPath || null,
      workdir: targetPath || null,
      workMode: targetPath ? 'artifact' : 'memory'
    });
    
    res.json({ success: true, handoff: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== END TASK BOARD API ====================

// ==================== END MARKETING HUB API ====================

server.listen(config.port, '0.0.0.0', () => {
  console.log(`🔄 Agent Handoff Manager v2.0 on port ${config.port}`);
  console.log(`   Dashboard: http://0.0.0.0:${config.port}/api/dashboard`);
  console.log(`   Templates: ${templates.size} loaded`);
  console.log(`   Schedules: ${scheduledJobs.size} active`);
  console.log(`   Webhooks: ${webhooks.size} configured`);
  console.log(`   Automations: ${automations.size} defined`);
  console.log(`   Discord: ${config.discord.webhookUrl ? 'Enabled' : 'Not configured'}`);
  console.log(`   WebSocket: ws://0.0.0.0:${config.port}`);
});
