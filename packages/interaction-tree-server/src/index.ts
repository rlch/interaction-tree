#!/usr/bin/env node
/**
 * interaction-tree-server
 *
 * MCP server for Flutter interaction tree with optional AI agent mode.
 *
 * Usage:
 *   npx interaction-tree-server          # Agent mode (default)
 *   INTERACTION_TREE_MODE=raw npx interaction-tree-server  # Raw mode
 *
 * Environment variables:
 *   INTERACTION_TREE_MODE: 'agent' (default) or 'raw'
 *   ANTHROPIC_API_KEY: Required for agent mode
 */

import { startServer, type ServerMode } from './server.js';

const mode = (process.env.INTERACTION_TREE_MODE ?? 'agent') as ServerMode;

if (mode !== 'agent' && mode !== 'raw') {
  console.error(`Invalid mode: ${mode}. Must be 'agent' or 'raw'.`);
  process.exit(1);
}

startServer({ mode }).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
