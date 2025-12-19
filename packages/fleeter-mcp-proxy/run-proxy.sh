#!/bin/bash
# Wrapper script for running fleeter-mcp-proxy with bun
exec bun /Users/rjm/Coding/Personal/interaction_tree/packages/fleeter-mcp-proxy/src/bin/proxy.ts "$@"
