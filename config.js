require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3461,
  chromabase: {
    url: process.env.CHROMABASE_URL || 'http://127.0.0.1:3000',
    userId: process.env.CHROMABASE_USER_ID || 'fHDkOch2t7XEtGljr2DsHhBOYPU2'
  },
  discord: {
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1479731281695608835/ttjy8cVnHX6D9Yh5AJFJs_KWnloMJKuJwm4EL0jNMuzjcKVX3JIyOUR_gfFWLVO4OWeP',
    // Agent to Discord channel mapping
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
      chief: ''
    }
  },
  // Define valid agents and their capabilities
  agents: {
    chroma: { name: 'Chroma', role: 'Architect', reportsTo: 'eric' },
    bender: { name: 'Bender', role: 'Developer', reportsTo: 'chroma' },
    pixel: { name: 'Pixel', role: 'Marketing', reportsTo: 'chroma' },
    canvas: { name: 'Canvas', role: 'Design', reportsTo: 'pixel' },
    flux: { name: 'Flux', role: 'Video', reportsTo: 'pixel' },
    prism: { name: 'Prism', role: 'Research', reportsTo: 'chroma' },
    lumen: { name: 'Lumen', role: 'Support', reportsTo: 'chroma' },
    momentum: { name: 'Momentum', role: 'Markets', reportsTo: 'chroma' },
    glyph: { name: 'Glyph', role: 'GHL Wizard', reportsTo: 'chroma' },
    chief: { name: 'Chief', role: 'Operations', reportsTo: 'chroma' }
  }
};
