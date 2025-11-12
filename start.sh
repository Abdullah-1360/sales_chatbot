#!/bin/bash

# Node.js memory optimization for WebAssembly and HTTP clients
# Increases max old space size and optimizes garbage collection

NODE_OPTIONS="--max-old-space-size=512 --max-http-header-size=16384" node server.js
