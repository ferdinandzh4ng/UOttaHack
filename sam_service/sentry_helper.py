"""
Sentry Helper Utilities for AI Agents
Provides context management and transaction tracking for agent operations
"""
import sentry_sdk
from functools import wraps
import time
from typing import Dict, Any, Optional


def capture_agent_transaction(agent_name: str, task_type: str):
    """
    Decorator to capture agent execution as a Sentry transaction
    
    Usage:
        @capture_agent_transaction('script_agent', 'lesson_script')
        async def generate_lesson_script(self, topic, length_minutes, provider='google', model=None):
            ...
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            provider = kwargs.get('provider', 'unknown')
            model = kwargs.get('model', 'default')
            
            # Start transaction
            with sentry_sdk.start_transaction(
                op="agent.execute",
                name=f"{agent_name}.{task_type}.{provider}"
            ) as transaction:
                # Add tags for filtering
                sentry_sdk.set_tag("agent_name", agent_name)
                sentry_sdk.set_tag("task_type", task_type)
                sentry_sdk.set_tag("provider", provider)
                sentry_sdk.set_tag("model", model)
                
                # Add breadcrumb
                sentry_sdk.add_breadcrumb(
                    category="agent",
                    message=f"Starting {agent_name} execution",
                    level="info",
                    data={
                        "task_type": task_type,
                        "provider": provider,
                        "model": model
                    }
                )
                
                try:
                    # Execute the actual function
                    result = await func(*args, **kwargs)
                    
                    # Mark as success
                    transaction.set_status("ok")
                    
                    return result
                    
                except Exception as e:
                    # Capture error with context
                    sentry_sdk.set_context("error_details", {
                        "agent": agent_name,
                        "task": task_type,
                        "provider": provider,
                        "model": model,
                        "error_type": type(e).__name__
                    })
                    
                    sentry_sdk.add_breadcrumb(
                        category="error",
                        message=f"{agent_name} failed: {str(e)}",
                        level="error"
                    )
                    
                    transaction.set_status("internal_error")
                    sentry_sdk.capture_exception(e)
                    
                    raise
        
        return wrapper
    return decorator


def capture_span(span_name: str, description: Optional[str] = None):
    """
    Decorator to capture a specific operation as a span within a transaction
    
    Usage:
        @capture_span("solace.publish", "Publishing message to mesh")
        async def publish_to_mesh(self, topic, message):
            ...
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            with sentry_sdk.start_span(op=span_name, description=description) as span:
                start_time = time.time()
                
                try:
                    result = await func(*args, **kwargs)
                    duration_ms = (time.time() - start_time) * 1000
                    
                    # Add timing measurement
                    span.set_data("duration_ms", duration_ms)
                    
                    return result
                    
                except Exception as e:
                    span.set_status("internal_error")
                    raise
        
        return wrapper
    return decorator


def add_agent_breadcrumb(message: str, category: str = "agent", level: str = "info", **data):
    """
    Add a breadcrumb to track agent execution flow
    
    Args:
        message: Breadcrumb message
        category: Category (agent, solace, api, etc.)
        level: Level (info, warning, error)
        **data: Additional context data
    """
    sentry_sdk.add_breadcrumb(
        category=category,
        message=message,
        level=level,
        data=data
    )


def set_agent_context(
    agent_name: str,
    task_type: str,
    provider: str,
    model: str,
    session_id: Optional[str] = None,
    group_number: Optional[int] = None,
    **extra_context
):
    """
    Set Sentry context for an agent operation
    
    Args:
        agent_name: Name of the agent
        task_type: Type of task being executed
        provider: AI provider (google, openai, anthropic)
        model: Model name
        session_id: Anonymized session ID (optional)
        group_number: Student group number (optional)
        **extra_context: Additional context fields
    """
    context = {
        "agent_name": agent_name,
        "task_type": task_type,
        "provider": provider,
        "model": model,
    }
    
    if session_id:
        # Use anonymized session ID only
        context["session_id"] = session_id
    
    if group_number:
        context["group_number"] = group_number
    
    context.update(extra_context)
    
    sentry_sdk.set_context("agent_execution", context)
    
    # Also set as tags for easy filtering
    sentry_sdk.set_tag("agent_name", agent_name)
    sentry_sdk.set_tag("provider", provider)
    sentry_sdk.set_tag("task_type", task_type)


def capture_agent_error(
    error: Exception,
    agent_name: str,
    task_type: str,
    provider: str,
    message: Optional[str] = None,
    **extra_context
):
    """
    Capture an agent error with full context
    
    Args:
        error: The exception to capture
        agent_name: Name of the agent
        task_type: Type of task that failed
        provider: AI provider being used
        message: Optional custom error message
        **extra_context: Additional context
    """
    # Set error context
    set_agent_context(agent_name, task_type, provider, extra_context.get('model', 'unknown'))
    
    sentry_sdk.set_context("error_details", {
        "error_type": type(error).__name__,
        "error_message": str(error),
        "custom_message": message,
        **extra_context
    })
    
    # Add error breadcrumb
    add_agent_breadcrumb(
        message=message or f"{agent_name} error: {str(error)}",
        category="error",
        level="error",
        agent=agent_name,
        task=task_type,
        provider=provider
    )
    
    # Capture exception
    sentry_sdk.capture_exception(error)


def measure_latency(operation_name: str):
    """
    Context manager to measure and record latency for an operation
    
    Usage:
        with measure_latency("api_call"):
            response = await make_api_call()
    """
    class LatencyMeasurer:
        def __init__(self, op_name):
            self.op_name = op_name
            self.start_time = None
        
        def __enter__(self):
            self.start_time = time.time()
            return self
        
        def __exit__(self, exc_type, exc_val, exc_tb):
            duration_ms = (time.time() - self.start_time) * 1000
            
            # Add as measurement
            sentry_sdk.set_measurement(self.op_name, duration_ms, "millisecond")
            
            # Add breadcrumb
            add_agent_breadcrumb(
                message=f"{self.op_name} completed",
                category="performance",
                level="info",
                duration_ms=duration_ms
            )
    
    return LatencyMeasurer(operation_name)


# Example usage in an agent:
"""
from sentry_helper import capture_agent_transaction, add_agent_breadcrumb, measure_latency

class ScriptAgent:
    @capture_agent_transaction('script_agent', 'lesson_script')
    async def generate_lesson_script(self, topic, length_minutes, provider='google', model=None):
        add_agent_breadcrumb(
            message=f"Generating script for topic: {topic}",
            category="agent",
            level="info",
            topic_length=len(topic),
            length_minutes=length_minutes
        )
        
        try:
            with measure_latency("backboard_api_call"):
                result = await self.call_backboard_api(topic, length_minutes, provider, model)
            
            return result
            
        except Exception as e:
            capture_agent_error(
                error=e,
                agent_name='script_agent',
                task_type='lesson_script',
                provider=provider,
                message="Failed to generate lesson script",
                model=model,
                topic_length=len(topic)
            )
            raise
"""
