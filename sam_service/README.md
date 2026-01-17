# Solace Agent Mesh Service for UOttaHack

This Python service implements Solace Agent Mesh (SAM) to manage AI task routing for the UOttaHack learning platform.

## Setup

### Prerequisites

- Python 3.10.16+
- pip
- Solace Platform access (cloud or local)

### Installation

1. Create and activate a virtual environment:
```bash
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Install Solace Agent Mesh:
```bash
pip install solace-agent-mesh
```

4. Copy environment file:
```bash
cp .env.example .env
```

5. Configure your `.env` file with your API keys and Solace credentials.

## Running the Service

### Option 1: Using SAM CLI (Recommended)

1. Initialize SAM (if not already done):
```bash
sam init --gui
```

2. Run SAM:
```bash
sam run
```

### Option 2: Using Bridge API

Run the Flask bridge API that connects Node.js to SAM:
```bash
python bridge_api.py
```

The bridge API will run on port 5001 (configurable via `SAM_BRIDGE_PORT`).

## Agents

The service includes the following agents:

1. **Script Agent** - Generates lesson scripts divided into slides
2. **Image Agent** - Generates images for lesson slides
3. **Speech Agent** - Converts text to speech using ElevenLabs
4. **Quiz Prompt Agent** - Generates quiz prompts
5. **Quiz Questions Agent** - Generates quiz questions and answers

## API Endpoints

The bridge API provides the following endpoints:

- `POST /api/ai/task/script/lesson` - Generate lesson script
- `POST /api/ai/task/image/slide` - Generate slide image
- `POST /api/ai/task/speech/slide` - Generate speech
- `POST /api/ai/task/quiz/prompt` - Generate quiz prompt
- `POST /api/ai/task/quiz/questions` - Generate quiz questions
- `GET /api/ai/router/config` - Get routing configuration
- `GET /health` - Health check

## Configuration

Edit `config/sac_config.yaml` to configure agent behavior, model selection, and Solace topics.

## Required Accounts/Keys

You'll need to create accounts and obtain API keys for:

1. **Solace Platform** (Cloud or Enterprise)
   - Sign up at https://solace.com
   - Create a messaging service
   - Get connection details (host, port, VPN name, username, password)

2. **OpenAI** (for script and quiz generation)
   - Sign up at https://platform.openai.com
   - Create API key
   - Add to `OPENAI_API_KEY`

3. **Stability AI** (optional, for image generation)
   - Sign up at https://platform.stability.ai
   - Create API key
   - Add to `STABILITY_API_KEY`

4. **ElevenLabs** (for speech generation)
   - Sign up at https://elevenlabs.io
   - Create API key
   - Add to `ELEVENLABS_API_KEY`

5. **Lightning AI** (optional, alternative LLM provider)
   - Sign up at https://lightning.ai
   - Create API key and workspace ID
   - Add to `LIGHTNING_AI_API_KEY`

