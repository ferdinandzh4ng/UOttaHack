"""
Bridge API between Node.js backend and Python SAM service
Provides REST API endpoints for task execution
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
import asyncio
import uuid
import json
from datetime import datetime
from typing import Dict, Any, Optional
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

load_dotenv()

# Initialize Sentry
SENTRY_DSN = os.getenv('SENTRY_DSN')
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[FlaskIntegration()],
        traces_sample_rate=0.25,  # 25% sampling for successful transactions
        environment=os.getenv('ENVIRONMENT', 'development'),
        before_send=lambda event, hint: event if event.get('level') in ['error', 'fatal'] else event,
    )
    print("✅ Sentry initialized in bridge_api.py", flush=True)
else:
    print("⚠️ SENTRY_DSN not set - Sentry monitoring disabled", flush=True)

load_dotenv()

# Simple direct routing for agents (no Solace)
class AgentMesh:
    """Direct routing for agents without Solace"""
    def __init__(self):
        self.agents = {}
    
    def register_agent(self, agent):
        """Register an agent with the mesh"""
        self.agents[agent.name] = agent
        print(f"✅ Registered agent: {agent.name}")

# Import agents
from agents.script_agent import ScriptAgent
from agents.image_agent import ImageAgent
from agents.speech_agent import SpeechAgent
from agents.quiz_agent import QuizPromptAgent, QuizQuestionsAgent
from agents.orchestrator_agent import OrchestratorAgent

load_dotenv()

app = Flask(__name__)
CORS(app)

# Helper function to run async functions in Flask
def run_async(coro):
    """Run an async coroutine in Flask's sync context
    Flask runs in multiple threads, so we always use a new thread with a new event loop
    We need to copy Flask's application and request contexts to the new thread
    """
    from flask import copy_current_request_context, has_request_context
    import concurrent.futures
    import threading
    
    # Copy Flask contexts if we're in a request context
    if has_request_context():
        # Create a wrapper that preserves Flask contexts
        @copy_current_request_context
        def run_in_thread_with_context():
            """Run the coroutine in a new event loop in a new thread with Flask contexts"""
            # Create a completely new event loop for this thread
            new_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(new_loop)
            try:
                return new_loop.run_until_complete(coro)
            finally:
                # Clean up the loop
                try:
                    # Cancel any remaining tasks
                    pending = asyncio.all_tasks(new_loop)
                    for task in pending:
                        task.cancel()
                    # Wait for tasks to complete cancellation
                    if pending:
                        new_loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
                except Exception:
                    pass
                finally:
                    new_loop.close()
        
        run_func = run_in_thread_with_context
    else:
        # No request context, just run normally
        def run_in_thread():
            """Run the coroutine in a new event loop in a new thread"""
            new_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(new_loop)
            try:
                return new_loop.run_until_complete(coro)
            finally:
                try:
                    pending = asyncio.all_tasks(new_loop)
                    for task in pending:
                        task.cancel()
                    if pending:
                        new_loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
                except Exception:
                    pass
                finally:
                    new_loop.close()
        
        run_func = run_in_thread
    
    try:
        # Always use a thread executor since Flask is multi-threaded
        # This ensures we don't conflict with Flask's thread-local event loops
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(run_func)
            return future.result(timeout=180)  # 3 minute timeout
    except concurrent.futures.TimeoutError:
        error_msg = "Async operation timed out after 180 seconds"
        print(error_msg)
        raise RuntimeError(error_msg)
    except Exception as e:
        import traceback
        error_msg = f"Error in run_async: {e}"
        error_trace = traceback.format_exc()
        print(error_msg)
        print(error_trace)
        raise RuntimeError(f"{error_msg}\n{error_trace}") from e

# Initialize SAM with direct routing (no Solace)
mesh = AgentMesh()

# Register agents
script_agent = ScriptAgent()
image_agent = ImageAgent()
speech_agent = SpeechAgent()
quiz_prompt_agent = QuizPromptAgent()
quiz_questions_agent = QuizQuestionsAgent()

mesh.register_agent(script_agent)
mesh.register_agent(image_agent)
mesh.register_agent(speech_agent)
mesh.register_agent(quiz_prompt_agent)
mesh.register_agent(quiz_questions_agent)

# Orchestrator agent
orchestrator_agent = OrchestratorAgent()
mesh.register_agent(orchestrator_agent)

print("✅ All agents registered - using direct routing (no Solace)", flush=True)

async def call_agent_directly(
    agent_name: str,
    message: Dict[str, Any],
    timeout: int = 120
) -> Dict[str, Any]:
    """
    Call an agent directly without Solace event mesh
    """
    if agent_name not in mesh.agents:
        raise ValueError(f"Unknown agent: {agent_name}")
    
    agent = mesh.agents[agent_name]
    provider = message.get("_metadata", {}).get("provider", "anthropic")
    model = message.get("_metadata", {}).get("model")
    
    # Call agent based on agent name
    if agent_name == "script_agent":
        result = await script_agent.generate_lesson_script(
            message.get("topic"),
            message.get("length_minutes"),
            provider=provider,
            model=model
        )
        if "_metadata" not in result:
            result["_metadata"] = {}
        result["_metadata"].update(message.get("_metadata", {}))
        return result
    elif agent_name == "image_agent":
        result = await image_agent.generate_slide_image(
            message.get("slide_script"),
            message.get("slide_number"),
            message.get("topic"),
            provider=provider,
            model=model
        )
        return {"imageUrl": result, "_metadata": message.get("_metadata", {})}
    elif agent_name == "speech_agent":
        result = await speech_agent.generate_speech(
            message.get("text"),
            message.get("voice_id")
        )
        return {"speechUrl": result, "_metadata": message.get("_metadata", {})}
    elif agent_name == "quiz_prompt_agent":
        result = await quiz_prompt_agent.generate_quiz_prompt(
            message.get("topic"),
            message.get("question_type"),
            message.get("num_questions"),
            provider=provider,
            model=model
        )
        return {"prompt": result, "_metadata": message.get("_metadata", {})}
    elif agent_name == "quiz_questions_agent":
        result = await quiz_questions_agent.generate_quiz_questions(
            message.get("quiz_prompt"),
            message.get("topic"),
            message.get("question_type"),
            message.get("num_questions"),
            provider=provider,
            model=model
        )
        if "_metadata" not in result:
            result["_metadata"] = {}
        result["_metadata"].update(message.get("_metadata", {}))
        return result
    
    raise ValueError(f"Unknown agent: {agent_name}")


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "sam-bridge",
        "routing": "direct"
    })


@app.route('/api/ai/task/script/lesson', methods=['POST'])
def generate_script():
    """Generate lesson script via direct agent call"""
    # Capture request data in the Flask request context
    data = request.json
    
    async def _generate():
        try:
            topic = data.get('topic')
            length_minutes = data.get('lengthMinutes')
            provider = data.get('provider', 'anthropic')
            model = data.get('model')
            group_number = data.get('groupNumber')  # For A/B testing tracking
            compare_models = data.get('compare', False)
            
            if not topic or not length_minutes:
                return jsonify({"error": "Missing required parameters"}), 400
        
            if compare_models:
                # Generate with all supported models for comparison
                results = {}
                tasks = []
                for model_config in script_agent.SUPPORTED_MODELS:
                    message = {
                        "topic": topic,
                        "length_minutes": length_minutes,
                        "group_number": group_number,
                        "_metadata": {
                            "provider": model_config['provider'],
                            "model": model_config['model'],
                            "agent": "script_agent"
                        }
                    }
                    tasks.append(call_agent_directly("script_agent", message))
                
                # Wait for all responses
                responses = await asyncio.gather(*tasks, return_exceptions=True)
                for i, response in enumerate(responses):
                    model_name = script_agent.SUPPORTED_MODELS[i]['name']
                    if isinstance(response, Exception):
                        results[model_name] = {"error": str(response)}
                    else:
                        results[model_name] = response
                
                return jsonify({"success": True, "data": results, "comparison": True})
            else:
                # Determine model name
                model_name = model or next(
                    (m['model'] for m in script_agent.SUPPORTED_MODELS if m['provider'] == provider),
                    'anthropic/claude-3-5-sonnet-20241022'
                )
                
                message = {
                    "topic": topic,
                    "length_minutes": length_minutes,
                    "group_number": group_number,
                    "_metadata": {
                        "provider": provider,
                        "model": model_name,
                        "agent": "script_agent"
                    }
                }
                
                # Call agent directly
                result = await call_agent_directly("script_agent", message)
                print(f"✅ Script generation successful!")
                print(f"   Topic: {topic}")
                print(f"   Length: {length_minutes} minutes")
                print(f"   Model: {model_name}")
                print(f"   Slides: {len(result.get('slides', []))}")
                return jsonify({"success": True, "data": result})
        except Exception as e:
            import traceback
            error_msg = str(e)
            error_trace = traceback.format_exc()
            print(f"❌ Error in generate_script: {error_msg}")
            print(error_trace)
            return jsonify({"success": False, "error": error_msg, "traceback": error_trace}), 500
    
    try:
        return run_async(_generate())
    except Exception as e:
        import traceback
        error_msg = str(e)
        error_trace = traceback.format_exc()
        print(f"Error in run_async wrapper for generate_script: {error_msg}")
        print(error_trace)
        return jsonify({"success": False, "error": error_msg}), 500


@app.route('/api/ai/task/image/slide', methods=['POST'])
def generate_image():
    """Generate slide image via direct agent call"""
    # Capture request data in the Flask request context
    data = request.json
    
    async def _generate():
        try:
            slide_script = data.get('slideScript')
            slide_number = data.get('slideNumber')
            topic = data.get('topic')
            provider = data.get('provider', 'openai')
            model = data.get('model')
            group_number = data.get('groupNumber')
            compare_models = data.get('compare', False)
            
            if not slide_script or not slide_number or not topic:
                return jsonify({"error": "Missing required parameters"}), 400
            
            if compare_models:
                results = {}
                tasks = []
                for model_config in image_agent.SUPPORTED_MODELS:
                    message = {
                        "slide_script": slide_script,
                        "slide_number": slide_number,
                        "topic": topic,
                        "group_number": group_number,
                        "_metadata": {
                            "provider": model_config['provider'],
                            "model": model_config['model'],
                            "agent": "image_agent"
                        }
                    }
                    tasks.append(call_agent_directly("image_agent", message))
                
                responses = await asyncio.gather(*tasks, return_exceptions=True)
                for i, response in enumerate(responses):
                    model_name = image_agent.SUPPORTED_MODELS[i]['name']
                    if isinstance(response, Exception):
                        results[model_name] = {"error": str(response)}
                    else:
                        results[model_name] = response
                
                return jsonify({"success": True, "data": results, "comparison": True})
            else:
                model_name = model or next(
                    (m['model'] for m in image_agent.SUPPORTED_MODELS if m['provider'] == provider),
                    'openai/gpt-5-image'
                )
                
                message = {
                    "slide_script": slide_script,
                    "slide_number": slide_number,
                    "topic": topic,
                    "group_number": group_number,
                    "_metadata": {
                        "provider": provider,
                        "model": model_name,
                        "agent": "image_agent"
                    }
                }
                
                result = await call_agent_directly("image_agent", message)
                print(f"✅ Image generation successful for slide {slide_number} (topic: {topic})")
                print(f"   Model: {model_name}")
                if isinstance(result, str) and result.startswith("data:image"):
                    print(f"   Image URL: {result[:50]}... (base64 data)")
                return jsonify({"success": True, "data": result})
        except Exception as e:
            import traceback
            error_msg = str(e)
            error_trace = traceback.format_exc()
            print(f"❌ Error in generate_image: {error_msg}")
            print(error_trace)
            return jsonify({"success": False, "error": error_msg, "traceback": error_trace}), 500
    
    try:
        return run_async(_generate())
    except Exception as e:
        import traceback
        error_msg = str(e)
        error_trace = traceback.format_exc()
        print(f"❌ Error in run_async wrapper for generate_image: {error_msg}")
        print(error_trace)
        return jsonify({"success": False, "error": error_msg}), 500


@app.route('/api/ai/task/speech/slide', methods=['POST'])
def generate_speech():
    """Generate speech from text via direct agent call"""
    # Capture request data in the Flask request context
    data = request.json
    
    async def _generate():
        try:
            text = data.get('text')
            voice_id = data.get('voiceId')
            group_number = data.get('groupNumber')
            
            if not text:
                return jsonify({"error": "Missing required parameters"}), 400
            
            message = {
                "text": text,
                "voice_id": voice_id,
                "group_number": group_number,
                "_metadata": {
                    "provider": "elevenlabs",
                    "agent": "speech_agent"
                }
            }
            
            result = await call_agent_directly("speech_agent", message)
            return jsonify({"success": True, "data": result})
        except Exception as e:
            import traceback
            error_msg = str(e)
            error_trace = traceback.format_exc()
            print(f"Error in generate_script: {error_msg}")
            print(error_trace)
            return jsonify({"success": False, "error": error_msg, "traceback": error_trace}), 500
    
    try:
        return run_async(_generate())
    except Exception as e:
        import traceback
        error_msg = str(e)
        error_trace = traceback.format_exc()
        print(f"Error in run_async wrapper for generate_script: {error_msg}")
        print(error_trace)
        return jsonify({"success": False, "error": error_msg}), 500


@app.route('/api/ai/task/quiz/prompt', methods=['POST'])
def generate_quiz_prompt():
    """Generate quiz prompt via direct agent call"""
    # Capture request data in the Flask request context
    data = request.json
    
    async def _generate():
        try:
            topic = data.get('topic')
            question_type = data.get('questionType')
            num_questions = data.get('numQuestions')
            provider = data.get('provider', 'anthropic')
            model = data.get('model')
            group_number = data.get('groupNumber')
            compare_models = data.get('compare', False)
            
            if not topic or not question_type or not num_questions:
                return jsonify({"error": "Missing required parameters"}), 400
            
            if compare_models:
                results = {}
                tasks = []
                for model_config in quiz_prompt_agent.SUPPORTED_MODELS:
                    message = {
                        "topic": topic,
                        "question_type": question_type,
                        "num_questions": num_questions,
                        "group_number": group_number,
                        "_metadata": {
                            "provider": model_config['provider'],
                            "model": model_config['model'],
                            "agent": "quiz_prompt_agent"
                        }
                    }
                    tasks.append(call_agent_directly("quiz_prompt_agent", message))
                
                responses = await asyncio.gather(*tasks, return_exceptions=True)
                for i, response in enumerate(responses):
                    model_name = quiz_prompt_agent.SUPPORTED_MODELS[i]['name']
                    if isinstance(response, Exception):
                        results[model_name] = {"error": str(response)}
                    else:
                        results[model_name] = response
                
                return jsonify({"success": True, "data": results, "comparison": True})
            else:
                model_name = model or next(
                    (m['model'] for m in quiz_prompt_agent.SUPPORTED_MODELS if m['provider'] == provider),
                    'anthropic/claude-3-5-sonnet-20241022'
                )
                
                message = {
                    "topic": topic,
                    "question_type": question_type,
                    "num_questions": num_questions,
                    "group_number": group_number,
                    "_metadata": {
                        "provider": provider,
                        "model": model_name,
                        "agent": "quiz_prompt_agent"
                    }
                }
                
                result = await call_agent_directly("quiz_prompt_agent", message)
                return jsonify({"success": True, "data": result})
        except Exception as e:
            import traceback
            error_msg = str(e)
            error_trace = traceback.format_exc()
            print(f"Error in generate_script: {error_msg}")
            print(error_trace)
            return jsonify({"success": False, "error": error_msg, "traceback": error_trace}), 500
    
    try:
        return run_async(_generate())
    except Exception as e:
        import traceback
        error_msg = str(e)
        error_trace = traceback.format_exc()
        print(f"Error in run_async wrapper for generate_script: {error_msg}")
        print(error_trace)
        return jsonify({"success": False, "error": error_msg}), 500


@app.route('/api/ai/task/quiz/questions', methods=['POST'])
def generate_quiz_questions():
    """Generate quiz questions via direct agent call"""
    # Capture request data in the Flask request context
    data = request.json
    
    async def _generate():
        try:
            quiz_prompt = data.get('quizPrompt')
            topic = data.get('topic')
            question_type = data.get('questionType')
            num_questions = data.get('numQuestions')
            provider = data.get('provider', 'anthropic')
            model = data.get('model')
            group_number = data.get('groupNumber')
            compare_models = data.get('compare', False)
            
            if not quiz_prompt or not topic or not question_type or not num_questions:
                return jsonify({"error": "Missing required parameters"}), 400
            
            if compare_models:
                results = {}
                tasks = []
                for model_config in quiz_questions_agent.SUPPORTED_MODELS:
                    message = {
                        "quiz_prompt": quiz_prompt,
                        "topic": topic,
                        "question_type": question_type,
                        "num_questions": num_questions,
                        "group_number": group_number,
                        "_metadata": {
                            "provider": model_config['provider'],
                            "model": model_config['model'],
                            "agent": "quiz_questions_agent"
                        }
                    }
                    tasks.append(call_agent_directly("quiz_questions_agent", message))
                
                responses = await asyncio.gather(*tasks, return_exceptions=True)
                for i, response in enumerate(responses):
                    model_name = quiz_questions_agent.SUPPORTED_MODELS[i]['name']
                    if isinstance(response, Exception):
                        results[model_name] = {"error": str(response)}
                    else:
                        results[model_name] = response
                
                return jsonify({"success": True, "data": results, "comparison": True})
            else:
                model_name = model or next(
                    (m['model'] for m in quiz_questions_agent.SUPPORTED_MODELS if m['provider'] == provider),
                    'anthropic/claude-3-5-sonnet-20241022'
                )
                
                message = {
                    "quiz_prompt": quiz_prompt,
                    "topic": topic,
                    "question_type": question_type,
                    "num_questions": num_questions,
                    "group_number": group_number,
                    "_metadata": {
                        "provider": provider,
                        "model": model_name,
                        "agent": "quiz_questions_agent"
                    }
                }
                
                result = await call_agent_directly("quiz_questions_agent", message)
                return jsonify({"success": True, "data": result})
        except Exception as e:
            import traceback
            error_msg = str(e)
            error_trace = traceback.format_exc()
            print(f"Error in generate_script: {error_msg}")
            print(error_trace)
            return jsonify({"success": False, "error": error_msg, "traceback": error_trace}), 500
    
    try:
        return run_async(_generate())
    except Exception as e:
        import traceback
        error_msg = str(e)
        error_trace = traceback.format_exc()
        print(f"Error in run_async wrapper for generate_script: {error_msg}")
        print(error_trace)
        return jsonify({"success": False, "error": error_msg}), 500


@app.route('/api/ai/router/config', methods=['GET'])
def get_routing_config():
    """Get routing configuration with all available models"""
    return jsonify({
        "routingConfig": {
            "script.lesson": {
                "models": script_agent.SUPPORTED_MODELS,
                "default": os.getenv("SCRIPT_GEN_PROVIDER", "anthropic")
            },
            "image.slide": {
                "models": image_agent.SUPPORTED_MODELS,
                "default": os.getenv("IMAGE_GEN_PROVIDER", "openai")
            },
            "speech.slide": {
                "models": [{"provider": "elevenlabs", "model": "eleven_monolingual_v1", "name": "ElevenLabs"}],
                "default": "elevenlabs"
            },
            "quiz.prompt": {
                "models": quiz_prompt_agent.SUPPORTED_MODELS,
                "default": os.getenv("QUIZ_GEN_PROVIDER", "anthropic")
            },
            "quiz.questions": {
                "models": quiz_questions_agent.SUPPORTED_MODELS,
                "default": os.getenv("QUIZ_GEN_PROVIDER", "anthropic")
            },
            "orchestrator": {
                "models": orchestrator_agent.SUPPORTED_MODELS,
                "default": os.getenv("ORCHESTRATOR_PROVIDER", "anthropic")
            }
        }
    })


@app.route('/api/ai/models', methods=['GET'])
def get_available_models():
    """Get all available models for each task type"""
    return jsonify({
        "script.lesson": script_agent.SUPPORTED_MODELS,
        "image.slide": image_agent.SUPPORTED_MODELS,
        "quiz.prompt": quiz_prompt_agent.SUPPORTED_MODELS,
        "quiz.questions": quiz_questions_agent.SUPPORTED_MODELS,
        "orchestrator": orchestrator_agent.SUPPORTED_MODELS
    })


@app.route('/api/ai/task/orchestrate', methods=['POST'])
def orchestrate_task():
    """Orchestrate a task using the orchestrator agent"""
    # Capture request data in the Flask request context
    data = request.json
    
    async def _generate():
        try:
            task_type = data.get('taskType')
            params = data.get('params', {})
            provider = data.get('provider', 'google')
            model = data.get('model')
            compare_models = data.get('compare', False)
            
            if not task_type:
                return jsonify({"error": "Missing task type"}), 400
            
            if compare_models:
                results = {}
                for model_config in orchestrator_agent.SUPPORTED_MODELS:
                    try:
                        result = await orchestrator_agent.route_task(
                            task_type, params,
                            provider=model_config['provider'],
                            model=model_config['model']
                        )
                        results[model_config['name']] = result
                    except Exception as e:
                        results[model_config['name']] = {"error": str(e)}
                return jsonify({"success": True, "data": results, "comparison": True})
            else:
                result = await orchestrator_agent.route_task(task_type, params, provider=provider, model=model)
                return jsonify({"success": True, "data": result})
        except Exception as e:
            import traceback
            error_msg = str(e)
            error_trace = traceback.format_exc()
            print(f"Error in generate_script: {error_msg}")
            print(error_trace)
            return jsonify({"success": False, "error": error_msg, "traceback": error_trace}), 500
    
    try:
        return run_async(_generate())
    except Exception as e:
        import traceback
        error_msg = str(e)
        error_trace = traceback.format_exc()
        print(f"Error in run_async wrapper for generate_script: {error_msg}")
        print(error_trace)
        return jsonify({"success": False, "error": error_msg}), 500


if __name__ == '__main__':
    port = int(os.getenv('SAM_BRIDGE_PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True)

