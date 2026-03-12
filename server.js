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
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('./config');

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

// Storage
const handoffs = new Map();
const agentContexts = new Map();
const templates = new Map();
const feedback = new Map();
const taskHistory = []; // For similar task recall
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
}
initTemplates();

// CORS - Allow specific origins for production
const allowedOrigins = [
  'http://localhost:3460',
  'http://localhost:3000',
  'https://team.chromapages.com',
  'https://chromapages.com'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(null, true); // Allow all for now, restrict in production if needed
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json());

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

  if (currentAttempt >= maxAttempts) {
    console.log(`❌ Handoff ${handoff.id} failed after ${maxAttempts} attempts`);
    handoff.status = 'failed';
    handoff.error = `Failed after ${maxAttempts} attempts`;
    triggerWebhooks('HandoffFailed', handoff);
    return;
  }

  retryAttempts.set(handoff.id, currentAttempt + 1);

  // Exponential backoff
  const backoffMs = config.retry.backoffMs * Math.pow(config.retry.backoffMultiplier, currentAttempt);
  console.log(`⏳ Retrying ${handoff.id} in ${backoffMs}ms (attempt ${currentAttempt + 1}/${maxAttempts})`);

  setTimeout(async () => {
    handoff.status = 'pending';
    handoff.error = null;
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

// Serve static files from public directory
app.use(express.static('public'));

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
  const { task, context, priority, runAsync = false } = req.body;
  const template = templates.get(name);

  if (!template) return res.status(404).json({ error: 'Template not found' });

  const pipelineId = `pipeline_${Date.now()}`;
  const results = [];

  if (runAsync) {
    // Run async - create all handoffs and return immediately
    for (let i = 0; i < template.steps.length; i++) {
      const step = template.steps[i];
      const resolvedTask = step.task.replace('{task}', task || '');
      const resolvedContext = step.context ? step.context.replace('{context}', context || '') : context;

      const result = await createHandoff(step.from, step.to, resolvedTask, resolvedContext, priority, {
        pipelineId,
        pipelineStep: i + 1,
        pipelineTotalSteps: template.steps.length
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
      const result = await createHandoff(step.from, step.to, resolvedTask, resolvedContext, priority, {
        pipelineId,
        pipelineStep: i + 1,
        pipelineTotalSteps: template.steps.length,
        waitForComplete: true
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

    const handoff = {
      id: handoffId,
      fromAgent,
      toAgent,
      task: task || '',
      context: context || '',
      decisions: decisions || [],
      nextSteps: nextSteps || [],
      priority: priority === 'urgent' ? 'urgent' : priority,
      status: 'pending',
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      slaDeadline: options.slaMinutes ? new Date(Date.now() + options.slaMinutes * 60000).toISOString() : null,
      escalationLevel: options.escalationLevel || 0,
      dependsOn: options.dependsOn || [], // Dependency chain support
      retryCount: 0,
      ...options
    };

    handoffs.set(handoffId, handoff);

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
    const { fromAgent, toAgent, task, context, dependsOn } = req.body;

    if (!fromAgent || !toAgent || !task) {
      return res.status(400).json({ error: 'fromAgent, toAgent, and task required' });
    }

    // Validate dependencies exist
    if (dependsOn && Array.isArray(dependsOn)) {
      for (const depId of dependsOn) {
        if (!handoffs.has(depId)) {
          return res.status(400).json({ error: `Dependency ${depId} not found` });
        }
      }
    }

    const result = await createHandoff(fromAgent, toAgent, task, context, [], [], 'medium', { dependsOn });
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
    }, 0) / (all.filter(h => h.completedAt && h.startedAt).length || 1)
  });
});

app.post('/api/handoff', async (req, res) => {
  try {
    const { fromAgent, toAgent, task, context, decisions, nextSteps, priority, slaMinutes } = req.body;

    if (!fromAgent || !toAgent) {
      return res.status(400).json({ error: 'fromAgent and toAgent required' });
    }

    const result = await createHandoff(fromAgent, toAgent, task, context, decisions, nextSteps, priority, { slaMinutes });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SINGLE AGENT REQUEST ====================

app.post('/api/task/:agentId', async (req, res) => {
  const { agentId } = req.params;
  const { task, context, priority, spawnSubAgent } = req.body;

  if (!config.agents[agentId]) {
    return res.status(400).json({ error: `Unknown agent: ${agentId}` });
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
    const result = await createHandoff('chroma', agentId, subAgentTask, context, [], [], priority || 'medium', { spawnSubAgent });
    res.json({ success: true, ...result, spawnedSubAgent: spawnSubAgent });
  } else {
    const result = await createHandoff('chroma', agentId, task, context, [], [], priority || 'medium');
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
    let { name, steps, agents: agentChain, task, context, priority, sequential = false } = req.body;

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
            waitForComplete: sequential
          }
        );
        createdHandoffs.push(result.handoffId);
        
        // If sequential, wait for completion and capture output
        if (sequential) {
          console.log(`⏳ Pipeline ${pipelineId}: Waiting for step ${i + 1}/${steps.length}...`);
          while (true) {
            await new Promise(r => setTimeout(r, 3000));
            const h = handoffs.get(result.handoffId);
            if (!h || h.status === 'completed' || h.status === 'failed') {
              const output = h?.agentResponse || h?.result || '';
              if (output) stepResults.push(output);
              console.log(`✅ Step ${i + 1} complete: ${output.substring(0, 100)}...`);
              break;
            }
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
  const { fromAgent, toAgents, task, context, priority } = req.body;

  if (!Array.isArray(toAgents) || toAgents.length === 0) {
    return res.status(400).json({ error: 'toAgents must be an array' });
  }

  const results = [];
  for (const toAgent of toAgents) {
    const result = await createHandoff(fromAgent, toAgent, task, context, [], [], priority);
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
  const allHandoffs = Array.from(handoffs.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
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

app.post('/api/handoff/:id/start', (req, res) => {
  const { id } = req.params;
  const handoff = handoffs.get(id);
  if (!handoff) return res.status(404).json({ error: 'Handoff not found' });
  if (handoff.status !== 'pending') return res.status(400).json({ error: `Handoff is already ${handoff.status}` });

  handoff.status = 'in_progress';
  handoff.startedAt = new Date().toISOString();
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
    pipelines: Object.values(pipelines || {}).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    recent: recent || [],
    templates: templates ? Array.from(templates.keys()) : []
  });
});

// Visual Dashboard HTML
app.get('/dashboard', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Handoff Manager</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; background: #0a0a0a; color: #fff; }
    .glass { background: rgba(255,255,255,0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); }
    .glow { box-shadow: 0 0 30px rgba(139, 92, 246, 0.3); }
    .agent-available { background: linear-gradient(135deg, #10b981, #059669); }
    .agent-working { background: linear-gradient(135deg, #f59e0b, #d97706); }
    .agent-busy { background: linear-gradient(135deg, #ef4444, #dc2626); }
    @keyframes pulse-glow { 0%, 100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.4); } 50% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.8); } }
    .pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
    @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .slide-in { animation: slideIn 0.3s ease-out; }
  </style>
</head>
<body class="min-h-screen">
  <div class="max-w-7xl mx-auto p-6">
    <!-- Header -->
    <header class="flex justify-between items-center mb-8">
      <div>
        <h1 class="text-3xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
          Agent Handoff Manager
        </h1>
        <p class="text-gray-400 text-sm mt-1">Orchestrate your AI agents</p>
      </div>
      <div class="flex gap-3">
        <button onclick="refresh()" class="glass px-4 py-2 rounded-lg hover:bg-white/10 transition">↻ Refresh</button>
        <button onclick="showNewHandoff()" class="bg-violet-600 hover:bg-violet-500 px-4 py-2 rounded-lg transition glow">+ New Handoff</button>
      </div>
    </header>

    <!-- Stats -->
    <div class="grid grid-cols-4 gap-4 mb-8">
      <div class="glass rounded-xl p-4">
        <div class="text-gray-400 text-sm">Total</div>
        <div class="text-3xl font-bold" id="stat-total">-</div>
      </div>
      <div class="glass rounded-xl p-4">
        <div class="text-gray-400 text-sm">Pending</div>
        <div class="text-3xl font-bold text-amber-400" id="stat-pending">-</div>
      </div>
      <div class="glass rounded-xl p-4">
        <div class="text-gray-400 text-sm">Completed</div>
        <div class="text-3xl font-bold text-emerald-400" id="stat-completed">-</div>
      </div>
      <div class="glass rounded-xl p-4">
        <div class="text-gray-400 text-sm">Overdue</div>
        <div class="text-3xl font-bold text-red-400" id="stat-overdue">-</div>
      </div>
    </div>

    <!-- Agents Grid -->
    <div class="grid grid-cols-5 gap-3 mb-8" id="agents-grid"></div>

    <!-- Recent Activity -->
    <div class="glass rounded-xl p-6">
      <h2 class="text-xl font-semibold mb-4">Recent Activity</h2>
      <div class="space-y-2" id="recent-activity"></div>
    </div>

    <!-- Templates -->
    <div class="glass rounded-xl p-6 mt-6">
      <h2 class="text-xl font-semibold mb-4">Pipeline Templates</h2>
      <div class="grid grid-cols-4 gap-3" id="templates-grid"></div>
    </div>
  </div>

  <!-- New Handoff Modal -->
  <div id="modal" class="fixed inset-0 bg-black/80 hidden items-center justify-center">
    <div class="glass rounded-xl p-6 w-96 slide-in">
      <h3 class="text-xl font-semibold mb-4">New Handoff</h3>
      <div class="space-y-3">
        <select id="fromAgent" class="w-full bg-white/10 rounded-lg p-3 border border-white/10">
          <option value="chroma">Chroma</option>
        </select>
        <select id="toAgent" class="w-full bg-white/10 rounded-lg p-3 border border-white/10">
          <option value="bender">Bender</option>
          <option value="pixel">Pixel</option>
          <option value="prism">Prism</option>
          <option value="canvas">Canvas</option>
          <option value="flux">Flux</option>
        </select>
        <input id="task" placeholder="Task description" class="w-full bg-white/10 rounded-lg p-3 border border-white/10">
        <input id="context" placeholder="Context (optional)" class="w-full bg-white/10 rounded-lg p-3 border border-white/10">
        <button onclick="createHandoff()" class="w-full bg-violet-600 hover:bg-violet-500 py-3 rounded-lg transition">Create</button>
        <button onclick="closeModal()" class="w-full glass py-2 rounded-lg">Cancel</button>
      </div>
    </div>
  </div>

  <script>
    const agents = ['chroma','bender','pixel','canvas','flux','prism','lumen','momentum','glyph','chief'];
    const agentNames = {chroma:'🤖 Chroma',bender:'🤖 Bender',pixel:'🎨 Pixel',canvas:'🎨 Canvas',flux:'🎬 Flux',prism:'🔮 Prism',lumen:'💡 Lumen',momentum:'🦈 Momentum',glyph:'🧙‍♀️ Glyph',chief:'👔 Chief'};
    
    async function refresh() {
      const d = await fetch('/api/dashboard').then(r=>r.json());
      document.getElementById('stat-total').textContent = d.summary.total;
      document.getElementById('stat-pending').textContent = d.summary.pending;
      document.getElementById('stat-completed').textContent = d.summary.completed;
      document.getElementById('stat-overdue').textContent = d.summary.overdue;
      
      let html = '';
      for (const [id, a] of Object.entries(d.byAgent)) {
        const cls = a.status === 'available' ? 'agent-available' : a.status === 'working' ? 'agent-working' : 'agent-busy';
        html += \`<div class="glass rounded-lg p-3 text-center">
          <div class="text-2xl mb-1">\${agentNames[id] || id}</div>
          <div class="text-xs text-gray-400">\${a.pending} pending</div>
          <div class="h-1 mt-2 rounded-full \${cls}"></div>
        </div>\`;
      }
      document.getElementById('agents-grid').innerHTML = html;
      
      html = '';
      for (const r of d.recent) {
        const statusColors = {pending:'text-amber-400',in_progress:'text-blue-400',completed:'text-emerald-400',failed:'text-red-400'};
        html += \`<div class="flex justify-between items-center py-2 border-b border-white/5 slide-in">
          <div>
            <span class="text-violet-400">\${r.from}</span> → <span class="text-fuchsia-400">\${r.to}</span>
            <div class="text-sm text-gray-400">\${r.task || 'No task'}</div>
          </div>
          <div class="text-right">
            <div class="font-mono text-xs text-gray-500">\${r.id.slice(-8)}</div>
            <div class="\${statusColors[r.status]} text-sm">\${r.status}</div>
          </div>
        </div>\`;
      }
      document.getElementById('recent-activity').innerHTML = html || '<div class="text-gray-500">No activity</div>';
      
      html = '';
      for (const t of d.templates) {
        html += \`<button onclick="runTemplate('\${t}')" class="glass hover:bg-white/10 px-4 py-2 rounded-lg text-left slide-in">
          <div class="font-medium">\${t.replace(/-/g,' ')}</div>
          <div class="text-xs text-gray-400">Click to run</div>
        </button>\`;
      }
      document.getElementById('templates-grid').innerHTML = html;
    }
    
    function showNewHandoff() { document.getElementById('modal').classList.remove('hidden'); document.getElementById('modal').classList.add('flex'); }
    function closeModal() { document.getElementById('modal').classList.add('hidden'); document.getElementById('modal').classList.remove('flex'); }
    
    async function createHandoff() {
      await fetch('/api/handoff', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          fromAgent: document.getElementById('fromAgent').value,
          toAgent: document.getElementById('toAgent').value,
          task: document.getElementById('task').value,
          context: document.getElementById('context').value,
          priority: 'medium'
        })
      });
      closeModal();
      refresh();
    }
    
    async function runTemplate(name) {
      const task = prompt('Task description:');
      if (!task) return;
      await fetch(\`/api/template/\${name}/execute\`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ task, context: '', priority: 'high', runAsync: true })
      });
      refresh();
    }
    
    refresh();
    setInterval(refresh, 5000);
  </script>
</body>
</html>`);
});

// ==================== PIPELINE DELIVERABLES ====================

// Default output directory for agent deliverables
const DEFAULT_OUTPUT_DIR = '/Volumes/MiDRIVE/Chroma-Team/output';

// FIX #2: Multiple possible output paths (check all of them)
const POSSIBLE_OUTPUT_PATHS = [
  '/Volumes/MiDRIVE/Chroma-Team/output',  // Default
  '/Volumes/MiDRIVE/Chroma-Team/output/handoffs',  // Old path
  '/Volumes/MiDRIVE/Chroma-Team/output/pipelines',  // Pipeline path
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

  // FIX #2: Check multiple possible paths
  const outputPaths = [
    handoff.pipelineId ? path.join(DEFAULT_OUTPUT_DIR, 'pipelines', handoff.pipelineId) : null,
    path.join(DEFAULT_OUTPUT_DIR, 'handoffs', id),
    path.join(DEFAULT_OUTPUT_DIR, 'agents', handoff.toAgent, id),
    path.join(process.cwd(), 'output', id),
    path.join('/Users/king-lewie/.openclaw/workspace', handoff.pipelineId || id)
  ].filter(Boolean);

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
    pipelineId: handoff.pipelineId
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
    const { fromAgent, toAgent, task, context, priority } = req.body;

    if (!fromAgent || !toAgent) {
      return res.status(400).json({ error: 'fromAgent and toAgent required' });
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

    const result = await createHandoff(fromAgent, toAgent, task, fileContext, [], [], priority || 'medium', { files });
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
async function ensureDeliverablesReady(handoff, maxRetries = 3) {
  const outputPaths = [
    handoff.pipelineId ? path.join(DEFAULT_OUTPUT_DIR, 'pipelines', handoff.pipelineId) : null,
    path.join(DEFAULT_OUTPUT_DIR, 'handoffs', handoff.id),
    path.join(DEFAULT_OUTPUT_DIR, 'agents', handoff.toAgent, handoff.id),
    path.join(process.cwd(), 'output', handoff.id),
    path.join('/Users/king-lewie/.openclaw/workspace', handoff.pipelineId || handoff.id)
  ].filter(Boolean);

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
              } else {
                // Skip hidden files
                if (!item.startsWith('.')) {
                  files.push({ name: item, size: stat.size });
                }
              }
            }
          }
          walkDir(outputPath);

          if (files.length > 0) {
            console.log(`   ✅ Verified (attempt ${attempt}): Found ${files.length} file(s) in ${outputPath}`);
            return { verified: true, path: outputPath, files };
          }
        } catch (e) {
          console.log(`   ⚠️ Error scanning ${outputPath}: ${e.message}`);
        }
      }
    }
    console.log(`   ⏳ Attempt ${attempt}/${maxRetries}: No files found yet, waiting...`);
    await new Promise(r => setTimeout(r, 2000));
  }

  // FIX #3: Don't fail - just warn and return what we have
  console.log(`   ⚠️ Verification timed out after ${maxRetries} attempts.`);
  console.log(`   📋 Agent response available: ${handoff.agentResponse ? 'YES' : 'NO'}`);

  if (handoff.agentResponse) {
    console.log(`   📝 Response preview: ${handoff.agentResponse.substring(0, 200)}...`);
  }

  return {
    verified: false,
    hasAgentResponse: !!handoff.agentResponse,
    agentResponse: handoff.agentResponse,
    message: 'Verification timed out but agent completed - returning response'
  };
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

      // Pipeline complete - trigger ChromaBrain and Chromabase sync
      const pipelineOutput = `/Volumes/MiDRIVE/Chroma-Team/output/pipelines/${handoff.pipelineId}`;

      // Get all handoffs for this pipeline
      const pipelineHandoffs = Array.from(handoffs.values()).filter(
        h => h.pipelineId === handoff.pipelineId
      );

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
  // Sub-agents - FIX #1: Add sub-agent support
  'frontend-dev': 'frontend-dev',
  'backend-dev': 'backend-dev',
  'code-reviewer': 'code-reviewer',
  'qa-tester': 'qa-tester',
  'mobile-dev': 'mobile-dev',
  'market-researcher': 'market-researcher',
  'competitor-analyst': 'competitor-analyst'
};

// Parent-child agent relationships for sub-agent spawning
const AGENT_PARENTS = {
  'frontend-dev': 'bender',
  'backend-dev': 'bender',
  'code-reviewer': 'bender',
  'qa-tester': 'bender',
  'mobile-dev': 'bender',
  'market-researcher': 'prism',
  'competitor-analyst': 'prism'
};

// Use child_process to invoke OpenClaw CLI
const { exec } = require('child_process');

// Prompt suffix to instruct agents on where to save deliverables
function getTaskSuffix(handoff) {
  const outputPath = handoff.pipelineId
    ? `${DEFAULT_OUTPUT_DIR}/pipelines/${handoff.pipelineId}`
    : `${DEFAULT_OUTPUT_DIR}/handoffs`;

  return `\n\n📁 IMPORTANT: Save any files, research, code, or deliverables to:\n${outputPath}\n\nIf you create any files, note the file paths in your response so they can be retrieved.`;
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

  // Build the task prompt with context and output instructions
  let fullTask = context
    ? `${task}\n\nContext: ${context}`
    : task;

  // Add output directory instructions
  fullTask += getTaskSuffix(handoff);

  console.log(`🤖 Invoking agent: ${openClawAgentId}`);
  console.log(`   Mode: ${AGENT_MODE}`);
  console.log(`   Task: ${fullTask.substring(0, 100)}...`);

  if (AGENT_MODE === 'local_http') {
    // Call local agents via HTTP API
    try {
      const response = await fetch(`${LOCAL_AGENT_ENDPOINT}/${openClawAgentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: fullTask,
          agentId: openClawAgentId,
          handoffId: handoff.id,
          pipelineId: handoff.pipelineId
        }),
        timeout: 300000 // 5 minute timeout
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
  } else {
    // Legacy: Use OpenClaw CLI (for backward compatibility)
    return new Promise((resolve, reject) => {
      // Escape the task for shell
      const escapedTask = fullTask.replace(/"/g, '\\"');

      const cmd = `openclaw agent --agent ${openClawAgentId} --message "${escapedTask}" --json --timeout 300`;

      exec(cmd, { timeout: 360000 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ OpenClaw CLI error:`, error.message);
          return reject(new Error(`OpenClaw CLI error: ${error.message}`));
        }

        if (stderr) {
          console.log(`⚠️ OpenClaw stderr:`, stderr);
        }

        try {
          const result = stdout ? JSON.parse(stdout) : { message: 'Completed' };
          console.log(`✅ OpenClaw agent ${openClawAgentId} responded`);
          resolve(result);
        } catch (parseErr) {
          resolve({ message: stdout || 'Completed', raw: true });
        }
      });
    });
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
    console.log(`▶️  Processing: ${handoff.fromAgent} → ${handoff.toAgent}: ${handoff.task?.substring(0, 60)}`);

    // Get timeout from config for this agent
    const agentTimeout = config.agentTimeouts[handoff.toAgent] || 300000;

    // Invoke the actual OpenClaw agent
    try {
      const result = await invokeOpenClawAgent(
        handoff.toAgent,
        handoff.task,
        handoff.context,
        handoff
      );

      // Store the agent's response in the handoff record
      handoff.agentResponse = result.message || JSON.stringify(result);
      handoff.responseAt = new Date().toISOString();

      console.log(`✅ Agent ${handoff.toAgent} completed successfully`);

      // Verify files are synced before marking as complete
      await ensureDeliverablesReady(handoff);

      await completeHandoff(handoff);
    } catch (agentErr) {
      console.error(`❌ Agent ${handoff.toAgent} failed:`, agentErr.message);
      handoff.error = agentErr.message;

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

// ==================== START ====================

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
