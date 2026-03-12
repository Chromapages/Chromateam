#!/usr/bin/env node
/**
 * Local Agent HTTP Server
 * 
 * This server receives agent invocation requests from the VPS backend
 * and executes them locally on your Mac.
 * 
 * Run: node local-agent-server.js
 * Then expose via ngrok: ngrok http 3001
 */

const express = require('express');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.AGENT_PORT || 3001;
const OUTPUT_DIR = process.env.OUTPUT_DIR || '/Volumes/MiDRIVE/Chroma-Team/output';

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Log all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main agent endpoint - receives calls from VPS
app.post('/agent/:agentId', async (req, res) => {
  const { agentId } = req.params;
  const { task, context, handoffId, pipelineId, priority } = req.body;
  
  console.log(`\n🤖 === AGENT INVOCATION ===`);
  console.log(`   Agent: ${agentId}`);
  console.log(`   Handoff: ${handoffId || 'N/A'}`);
  console.log(`   Pipeline: ${pipelineId || 'N/A'}`);
  console.log(`   Task: ${task?.substring(0, 80)}...`);
  
  const startTime = Date.now();
  
  try {
    // Ensure output directory exists
    const outputPath = pipelineId 
      ? path.join(OUTPUT_DIR, 'pipelines', pipelineId)
      : path.join(OUTPUT_DIR, 'handoffs');
    
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }
    
    // Build full task with context
    let fullTask = context 
      ? `${task}\n\nContext: ${context}`
      : task;
    
    // Add output instructions
    fullTask += `\n\n📁 IMPORTANT: Save any deliverables to: ${outputPath}`;
    
    // Execute the agent
    const result = await executeAgent(agentId, fullTask, outputPath);
    
    const duration = Date.now() - startTime;
    console.log(`✅ Agent ${agentId} completed in ${duration}ms`);
    
    // Give external drive (MiDRIVE) a moment to flush buffers
    await new Promise(r => setTimeout(r, 1000));
    
    res.json({
      success: true,
      message: result,
      agentId,
      handoffId,
      pipelineId,
      duration,
      outputPath,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Agent ${agentId} failed after ${duration}ms:`, error.message);
    
    res.status(500).json({
      success: false,
      error: error.message,
      agentId,
      handoffId,
      pipelineId,
      duration,
      timestamp: new Date().toISOString()
    });
  }
});

// Execute agent based on ID
async function executeAgent(agentId, task, outputPath) {
  // Agent configuration map
  const agentConfig = {
    chroma: { name: 'Chroma', role: 'Frontend Specialist' },
    bender: { name: 'Bender', role: 'Backend/Database Specialist' },
    pixel: { name: 'Pixel', role: 'UI/UX Designer' },
    canvas: { name: 'Canvas', role: 'Design System Architect' },
    flux: { name: 'Flux', role: 'State Management Expert' },
    prism: { name: 'Prism', role: 'Performance Optimizer' },
    lumen: { name: 'Lumen', role: 'Accessibility Specialist' },
    momentum: { name: 'Momentum', role: 'Animation/Motion Expert' },
    glyph: { name: 'Glyph', role: 'Typography Specialist' },
    chief: { name: 'Chief', role: 'DevOps/Architecture Lead' }
  };
  
  const agent = agentConfig[agentId] || { name: agentId, role: 'General Agent' };
  
  console.log(`   Role: ${agent.role}`);
  
  return new Promise((resolve, reject) => {
    const escapedTask = task.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    
    const cmd = `/Users/king-lewie/.npm-global/bin/openclaw agent --agent ${agentId} --message "${escapedTask}" --json --timeout 300`;
    
    console.log(`   Executing: openclaw agent --agent ${agentId} ...`);
    
    exec(cmd, { timeout: 360000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`   ❌ OpenClaw error:`, error.message);
        return reject(new Error(`OpenClaw error: ${error.message}`));
      }
      
      if (stderr) {
        console.log(`   ⚠️ stderr:`, stderr.substring(0, 200));
      }

      try {
        const result = stdout ? JSON.parse(stdout) : { message: 'Completed' };
        console.log(`   ✅ Agent ${agentId} responded`);
        resolve(result.message || JSON.stringify(result));
      } catch (parseErr) {
        console.log(`   ✅ Agent ${agentId} responded (raw)`);
        resolve(stdout || 'Completed');
      }
    });
  });
}

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Local Agent Server running on port ${PORT}`);
  console.log(`   Endpoint: http://localhost:${PORT}/agent/:agentId`);
  console.log(`   Health:   http://localhost:${PORT}/health`);
  console.log(`   Output:   ${OUTPUT_DIR}`);
  console.log(`   Agent CLI: openclaw`);
  console.log(`\n✅ Ready to receive pipeline requests from backend.\n`);
});
