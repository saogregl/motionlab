#!/usr/bin/env node

// Mock engine for development — simulates the native engine lifecycle.
// Parses --port and --session-token from argv, prints status lines on stdout.

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const tokenIdx = args.indexOf('--session-token');
const port = portIdx !== -1 ? args[portIdx + 1] : '0';
const _token = tokenIdx !== -1 ? args[tokenIdx + 1] : 'none';

process.stdout.write(`[ENGINE] status=initializing port=${port}\n`);

setTimeout(() => {
  process.stdout.write(`[ENGINE] status=ready port=${port}\n`);
}, 500);

const shutdown = () => {
  process.stdout.write('[ENGINE] status=shutting_down\n');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Stay alive
process.stdin.resume();
