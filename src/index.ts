import 'dotenv/config';
import { createCampusOpsApp } from './server.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

const { app } = createCampusOpsApp();

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`  Campus Ops MCP Server is running!`);
  console.log(`  Port:             ${PORT}`);
  console.log(`  MCP Endpoint:     http://localhost:${PORT}/mcp`);
  console.log(`  Health Endpoint:  http://localhost:${PORT}/health`);
  console.log(`  Transport:        Streamable HTTP (spec 2025-11-25)`);
  console.log(`=======================================================`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down Campus Ops MCP Server...');
  server.close(() => {
    console.log('Server stopped cleanly.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nShutting down Campus Ops MCP Server...');
  server.close(() => {
    console.log('Server stopped cleanly.');
    process.exit(0);
  });
});
