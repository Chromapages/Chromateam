require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3461,
  
  // ChromaBase CRM integration
  chromabase: {
    url: process.env.CHROMABASE_URL || 'http://127.0.0.1:3000',
    userId: process.env.CHROMABASE_USER_ID || 'fHDkOch2t7XEtGljr2DsHhBOYPU2'
  },
  
  // Discord integration
  discord: {
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1479731281695608835/ttjy8cVnHX6D9Yh5AJFJs_KWnloMJKuJwm4EL0jNMuzjcKVX3JIyOUR_gfFWLVO4OWeP',
    channels: {
      chroma: '',
      bender: '',
      pixel: '',
      canvas: '',
      flux: '',
      prism: '',
      lumen: '',
      momentum: '',
      glyph: '',
      chief: '',
      'competitor-intel': '1476291959730733056',
      // Sub-agents
      'frontend-dev': '',
      'backend-dev': '',
      'code-reviewer': '',
      'qa-tester': '',
      'mobile-dev': '',
      'market-researcher': '',
      'competitor-analyst': ''
    }
  },
  
  // Retry configuration for failed handoffs
  retry: {
    maxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS) || 3,
    backoffMs: parseInt(process.env.RETRY_BACKOFF_MS) || 5000,
    backoffMultiplier: parseInt(process.env.RETRY_BACKOFF_MULTIPLIER) || 2
  },
  
  // Rate limiting - increased for better throughput
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 500
  },
  
  // Webhook callbacks for external systems
  webhooks: {
    onHandoffComplete: process.env.WEBHOOK_COMPLETE ? process.env.WEBHOOK_COMPLETE.split(',') : [],
    onHandoffFailed: process.env.WEBHOOK_FAILED ? process.env.WEBHOOK_FAILED.split(',') : [],
    onPipelineComplete: process.env.WEBHOOK_PIPELINE ? process.env.WEBHOOK_PIPELINE.split(',') : []
  },
  
  // Storage configuration
  storage: {
    type: process.env.STORAGE_TYPE || 'memory',
    cleanupIntervalMs: parseInt(process.env.CLEANUP_INTERVAL_MS) || 3600000,
    maxHistoryAge: parseInt(process.env.MAX_HISTORY_AGE) || 7
  },
  
  // Agent timeouts (in milliseconds)
  agentTimeouts: {
    chroma: 1800000,
    bender: 1800000,  // 30 min - extended
    pixel: 600000,
    canvas: 600000,
    flux: 600000,
    prism: 300000,
    lumen: 300000,
    momentum: 300000,
    glyph: 300000,
    chief: 300000,
    // Sub-agents
    'frontend-dev': 600000,
    'backend-dev': 600000,
    'code-reviewer': 300000,
    'qa-tester': 600000,
    'mobile-dev': 600000,
    'market-researcher': 300000,
    'competitor-analyst': 300000
  },
  
  // Define valid agents (including sub-agents)
  agents: {
    // Main Agents
    chroma: { name: 'Chroma', role: 'Architect', reportsTo: 'eric' },
    bender: { name: 'Bender', role: 'Developer Lead', reportsTo: 'chroma,eric' },
    pixel: { name: 'Pixel', role: 'Marketing Lead', reportsTo: 'chroma' },
    canvas: { name: 'Canvas', role: 'Design', reportsTo: 'pixel' },
    flux: { name: 'Flux', role: 'Video', reportsTo: 'pixel' },
    prism: { name: 'Prism', role: 'Research Lead', reportsTo: 'chroma,eric' },
    lumen: { name: 'Lumen', role: 'Support', reportsTo: 'chroma' },
    momentum: { name: 'Momentum', role: 'Markets', reportsTo: 'chroma' },
    glyph: { name: 'Glyph', role: 'GHL Wizard', reportsTo: 'chroma' },
    chief: { name: 'Chief', role: 'Operations', reportsTo: 'chroma' },
    
    // Bender's Sub-Agents
    'frontend-dev': { name: 'Frontend Dev', role: 'Frontend', reportsTo: 'bender', parent: 'bender' },
    'backend-dev': { name: 'Backend Dev', role: 'Backend', reportsTo: 'bender', parent: 'bender' },
    'code-reviewer': { name: 'Code Reviewer', role: 'QA', reportsTo: 'bender', parent: 'bender' },
    'qa-tester': { name: 'QA Tester', role: 'Testing', reportsTo: 'bender', parent: 'bender' },
    'mobile-dev': { name: 'Mobile Dev', role: 'Mobile', reportsTo: 'bender', parent: 'bender' },
    
    // Prism's Sub-Agents
    'market-researcher': { name: 'Market Researcher', role: 'Research', reportsTo: 'prism', parent: 'prism' },
    'competitor-analyst': { name: 'Competitor Analyst', role: 'Research', reportsTo: 'prism', parent: 'prism' }
  }
};
