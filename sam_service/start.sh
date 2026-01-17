#!/bin/bash
# Start script for SAM Bridge API
# Activates virtual environment and runs the bridge API

cd "$(dirname "$0")"

# Activate virtual environment
source .venv/bin/activate

# Run the bridge API
python bridge_api.py
