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
}
initTemplates();

app.use(cors());
app.use(express.json());

// ==================== INTEGRATIONS ====================

async function sendDiscordNotification(handoff, type = 'new') {
  try {
    if (!config.discord.webhookUrl) return;
    
    const fromName = config.agents[handoff.fromAgent]?.name || handoff.fromAgent;
    const toName = config.agents[handoff.toAgent]?.name || handoff.toAgent;
    
    const colors = { new: 5814783, complete: 3066993, urgent: 15158332, escalation: 16776960 };
    
    const embed = {
      title: type === 'new' ? `🔄 New Handoff: ${toName}` : 
             type === 'complete' ? `✅ Handoff Complete: ${handoff.task?.substring(0,40)}...` :
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

// ==================== ENDPOINTS ====================

app.get('/', (req, res) => {
  res.json({
    name: 'Agent Handoff Manager',
    version: '2.0',
    endpoints: {
      health: '/health',
      dashboard: '/api/dashboard',
      agents: '/api/agents',
      status: '/api/agents/:id/status',
      templates: '/api/templates',
      handoff: 'POST /api/handoff',
      single: 'POST /api/task/:agentId',
      chat: 'POST /api/chat/:agentId',
      template: 'POST /api/template/:name/execute',
      parallel: 'POST /api/parallel',
      conditional: 'POST /api/conditional',
      escalate: 'POST /api/escalate/:handoffId',
      feedback: 'POST /api/feedback/:handoffId',
      complete: 'POST /api/handoff/:id/complete',
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
  for (const [name, template] of templates) {
    list.push({ name, steps: template.steps.length, ...template });
  }
  res.json({ templates: list });
});

app.post('/api/templates', (req, res) => {
  const { name, steps } = req.body;
  if (!name || !steps) return res.status(400).json({ error: 'name and steps required' });
  templates.set(name, { name, steps });
  res.json({ success: true, template: name });
});

app.post('/api/template/:name/execute', async (req, res) => {
  const { name } = req.params;
  const { task, context, priority } = req.body;
  const template = templates.get(name);
  
  if (!template) return res.status(404).json({ error: 'Template not found' });
  
  const results = [];
  for (const step of template.steps) {
    const resolvedTask = step.task.replace('{task}', task || '');
    const resolvedContext = step.context ? step.context.replace('{context}', context || '') : context;
    
    const result = await createHandoff(step.from, step.to, resolvedTask, resolvedContext, priority);
    results.push(result);
    // Small delay between steps
    await new Promise(r => setTimeout(r, 100));
  }
  
  res.json({ success: true, template: name, executed: results.length, results });
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
      ...options
    };
    
    handoffs.set(handoffId, handoff);
    
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
    
    console.log(`📦 Handoff: ${fromAgent} → ${toAgent}: ${task?.substring(0, 30)}...`);
    resolve({ handoffId, handoff });
  });
}

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
  const { task, context, priority } = req.body;
  
  if (!config.agents[agentId]) {
    return res.status(400).json({ error: `Unknown agent: ${agentId}` });
  }
  
  const result = await createHandoff('chroma', agentId, task, context, [], [], priority || 'medium');
  res.json({ success: true, ...result });
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
    const { agents: agentChain, task, context, priority } = req.body;

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
      const stepTask = stepNum === 1
        ? task
        : `[Step ${stepNum}/${totalSteps} — Pipeline: ${task?.substring(0, 40)}]`;
      const stepContext = context
        ? `${context}\n\nPipeline: ${pipelineId} | Step ${stepNum}/${totalSteps}`
        : `Pipeline: ${pipelineId} | Step ${stepNum}/${totalSteps}`;

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
  const handoff = handoffs.get(id);
  
  if (!handoff) return res.status(404).json({ error: 'Handoff not found' });
  
  handoff.status = 'completed';
  handoff.completedAt = new Date().toISOString();

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
  
  // Broadcast to WebSocket clients
  if (typeof global.broadcastHandoffUpdate === 'function') {
    global.broadcastHandoffUpdate('completed', handoff);
  }
  
  res.json({ success: true, handoff });
});

// ==================== DASHBOARD ====================

app.get('/api/dashboard', (req, res) => {
  const all = Array.from(handoffs.values());
  
  const pending = all.filter(h => h.status === 'pending');
  const completed = all.filter(h => h.status === 'completed');
  
  const byAgent = {};
  for (const agent of Object.keys(config.agents)) {
    const agentPending = pending.filter(h => h.toAgent === agent);
    const agentCompleted = completed.filter(h => h.toAgent === agent);
    
    // Check SLA
    const overdue = agentPending.filter(h => h.slaDeadline && new Date(h.slaDeadline) < new Date());
    
    byAgent[agent] = {
      name: config.agents[agent].name,
      pending: agentPending.length,
      completed: agentCompleted.length,
      overdue: overdue.length,
      status: agentPending.length > 3 ? 'busy' : agentPending.length > 0 ? 'working' : 'available'
    };
  }
  
  // Recent activity
  const recent = all
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10)
    .map(h => ({
      id: h.id,
      from: h.fromAgent,
      to: h.toAgent,
      task: h.task?.substring(0, 40),
      status: h.status,
      time: h.createdAt
    }));
  
  res.json({
    summary: {
      total: all.length,
      pending: pending.length,
      completed: completed.length,
      overdue: pending.filter(h => h.slaDeadline && new Date(h.slaDeadline) < new Date()).length
    },
    byAgent,
    recent,
    templates: Array.from(templates.keys())
  });
});

// ==================== PIPELINE DELIVERABLES ====================

// Default output directory for agent deliverables
const DEFAULT_OUTPUT_DIR = '/Volumes/MiDRIVE/Chroma-Team/output';

// Get files created by a pipeline or handoff
app.get('/api/handoff/:id/deliverables', (req, res) => {
  const { id } = req.params;
  const handoff = handoffs.get(id);
  
  if (!handoff) {
    return res.status(404).json({ error: 'Handoff not found' });
  }

  const outputPath = handoff.pipelineId 
    ? path.join(DEFAULT_OUTPUT_DIR, 'pipelines', handoff.pipelineId)
    : path.join(DEFAULT_OUTPUT_DIR, 'handoffs', id);

  // Check if directory exists
  if (!fs.existsSync(outputPath)) {
    return res.json({ files: [], path: outputPath });
  }

  try {
    // Recursively list all files in the directory
    const files = [];
    function walkDir(dir, baseDir = dir) {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        const relativePath = path.relative(baseDir, fullPath);
        
        if (stat.isDirectory()) {
          walkDir(fullPath, baseDir);
        } else {
          files.push({
            name: item,
            path: relativePath,
            fullPath,
            size: stat.size,
            modified: stat.mtime.toISOString(),
            ext: path.extname(item).toLowerCase(),
          });
        }
      }
    }
    
    walkDir(outputPath);
    
    res.json({ 
      files, 
      path: outputPath,
      count: files.length 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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
      
      // Trigger integrations
      indexToChromaBrain(handoff.pipelineId, pipelineOutput);
      syncToChromabase({ pipelineId: handoff.pipelineId, ...handoff }, pipelineHandoffs);
    }
  }
}

// Agent ID mapping - maps AHM agent IDs to OpenClaw agent IDs
const AGENT_ID_MAP = {
  'chroma': 'chroma',
  'bender': 'bender',
  'pixel': 'pixel',
  'prism': 'prism',
  'lumen': 'lumen',
  'canvas': 'canvas',
  'flux': 'flux',
  'momentum': 'momentum',
  'glyph': 'glyph',
  'chief': 'chief'
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

function invokeOpenClawAgent(agentId, task, context, handoff) {
  return new Promise((resolve, reject) => {
    const openClawAgentId = AGENT_ID_MAP[agentId];
    if (!openClawAgentId) {
      return reject(new Error(`Unknown agent: ${agentId}`));
    }

    // Build the task prompt with context and output instructions
    let fullTask = context 
      ? `${task}\n\nContext: ${context}`
      : task;
    
    // Add output directory instructions
    fullTask += getTaskSuffix(handoff);

    console.log(`🤖 Invoking OpenClaw agent: ${openClawAgentId}`);
    console.log(`   Task: ${fullTask.substring(0, 100)}...`);

    // Escape the task for shell
    const escapedTask = fullTask.replace(/"/g, '\\"');
    
    // Use OpenClaw CLI to invoke the agent
    // --json flag for machine-readable output
    // --timeout 300 for 5 minute timeout
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
        // If JSON parse fails, just return the stdout as message
        resolve({ message: stdout || 'Completed', raw: true });
      }
    });
  });
}

async function processHandoff(handoff) {
  if (processingHandoffs.has(handoff.id)) return;
  processingHandoffs.add(handoff.id);

  try {
    // Mark in_progress
    handoff.status = 'in_progress';
    handoff.startedAt = new Date().toISOString();
    console.log(`▶️  Processing: ${handoff.fromAgent} → ${handoff.toAgent}: ${handoff.task?.substring(0, 60)}`);

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
      await completeHandoff(handoff);
    } catch (agentErr) {
      console.error(`❌ Agent ${handoff.toAgent} failed:`, agentErr.message);
      handoff.status = 'failed';
      handoff.error = agentErr.message;
      // Don't complete the handoff if the agent failed
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

// Export broadcast function for use in other parts of the server
global.broadcastHandoffUpdate = broadcastHandoffUpdate;

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
      
      for (let i = 0; i < agents.length - 1; i++) {
        const from = agents[i];
        const to = agents[i + 1];
        const stepNum = i + 1;
        const totalSteps = agents.length - 1;
        
        const stepTask = stepNum === 1
          ? task
          : `[Step ${stepNum}/${totalSteps} — Pipeline: ${task?.substring(0, 40)}]`;
        
        const stepContext = context
          ? `${context}\n\nPipeline: ${pipelineId} | Step ${stepNum}/${totalSteps}`
          : `Pipeline: ${pipelineId} | Step ${stepNum}/${totalSteps}`;
        
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

// ==================== START ====================

server.listen(config.port, '0.0.0.0', () => {
  console.log(`🔄 Agent Handoff Manager v2.0 on port ${config.port}`);
  console.log(`   Dashboard: http://0.0.0.0:${config.port}/api/dashboard`);
  console.log(`   Templates: ${templates.size} loaded`);
  console.log(`   Discord: ${config.discord.webhookUrl ? 'Enabled' : 'Not configured'}`);
  console.log(`   WebSocket: ws://0.0.0.0:${config.port}`);
});
