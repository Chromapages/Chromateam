/**
 * Discord Pipeline Bot
 * 
 * Listens for commands in Discord and triggers pipelines in AHM
 * 
 * Commands:
 * - !pipeline <task> <agents> - Create a pipeline
 * - !status - Show pipeline status
 * - !help - Show help
 * 
 * Usage: node discord-bot.js
 */

require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

const AHM_URL = process.env.AHM_URL || 'http://localhost:3469';
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

client.on(Events.MessageCreate, async (message) => {
  console.log(`📬 Message in channel ${message.channelId}: ${message.content.substring(0, 50)}`);
  
  // Ignore bot messages
  if (message.author.bot) return;
  
  const content = message.content.trim();
  
  // Check for agent mentions and trigger reaction on office page
  const agentMentions = ['chroma', 'bender', 'pixel', 'canvas', 'flux', 'prism', 'lumen', 'momentum', 'glyph', 'chief'];
  const mentionedAgents = agentMentions.filter(agent => 
    content.includes(`@${agent}`) || content.includes(`<@${agent}>`)
  );
  
  if (mentionedAgents.length > 0) {
    const AHM_API = process.env.AHM_URL || 'http://localhost:3461';
    for (const agentId of mentionedAgents) {
      try {
        await fetch(`${AHM_API}/api/discord/mention`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId,
            mentionType: 'ping',
            message: content.substring(0, 200),
            channelId: message.channelId,
            userId: message.author.id
          })
        });
        console.log(`📢 Mentioned agent: ${agentId}`);
      } catch (err) {
        console.error(`Failed to notify mention for ${agentId}:`, err.message);
      }
    }
  }
  
  // Check if it's a command
  if (!content.startsWith('!')) return;
  
  const args = content.slice(1).split(/\s+/);
  const command = args.shift().toLowerCase();
  
  console.log(`📩 Command: ${command} from ${message.author.tag}`);
  
  try {
    switch (command) {
      case 'pipeline':
      case 'create':
        await handleCreatePipeline(message, args);
        break;
      
      case 'status':
        await handleStatus(message);
        break;
      
      case 'help':
        await handleHelp(message);
        break;
      
      default:
        await message.reply(`Unknown command: ${command}. Type !help for available commands.`);
    }
  } catch (error) {
    console.error('Error handling command:', error);
    await message.reply(`Error: ${error.message}`);
  }
});

async function handleCreatePipeline(message, args) {
  // Parse: !pipeline <task> [--agents chroma,bender]
  const taskEndIndex = args.findIndex(arg => arg.startsWith('--'));
  const task = taskEndIndex === -1 ? args.join(' ') : args.slice(0, taskEndIndex).join(' ');
  
  if (!task) {
    return message.reply('Usage: !pipeline <task> [--agents chroma,bender]');
  }
  
  // Parse agents
  let agents = ['chroma', 'bender']; // default
  const agentsArg = args.find(arg => arg.startsWith('--agents'));
  if (agentsArg) {
    agents = agentsArg.split('=')[1]?.split(',') || ['chroma', 'bender'];
  }
  
  await message.reply(`🚀 Creating pipeline...\nTask: ${task}\nAgents: ${agents.join(' → ')}`);
  
  const response = await fetch(`${AHM_URL}/api/discord/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      command: 'create',
      task,
      agents,
      context: `Triggered by Discord user: ${message.author.tag}`
    })
  });
  
  const result = await response.json();
  
  if (result.success) {
    await message.reply(`✅ Pipeline created!\nID: ${result.pipelineId}\nSteps: ${result.steps}`);
  } else {
    await message.reply(`❌ Error: ${result.error}`);
  }
}

async function handleStatus(message) {
  const response = await fetch(`${AHM_URL}/api/discord/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'status' })
  });
  
  const result = await response.json();
  
  await message.reply(`📊 Pipeline Status\nPending: ${result.summary?.pending || 0}\nCompleted: ${result.summary?.completed || 0}`);
}

async function handleHelp(message) {
  await message.reply(`
📖 **Pipeline Bot Commands**

\`!pipeline <task> [--agents=a,b]\` - Create a pipeline
\`!status\` - Show pipeline status
\`!help\` - Show this help

**Examples:**
\`!pipeline Build a landing page for my coffee shop\`
\`!pipeline Research competitors --agents=chroma,prism\`
  `.trim());
}

client.on('ready', () => {
  console.log(`🤖 Discord Bot logged in as ${client.user.tag}`);
});

if (!DISCORD_TOKEN) {
  console.error('ERROR: DISCORD_TOKEN not set in .env');
  process.exit(1);
}

client.on('ready', async () => {
  console.log(`🤖 Discord Bot logged in as ${client.user.tag}`);
  console.log(`📡 In ${client.guilds.cache.size} servers:`);
  client.guilds.cache.forEach(g => console.log(`   - ${g.name} (${g.id})`));
});

client.login(DISCORD_TOKEN);
