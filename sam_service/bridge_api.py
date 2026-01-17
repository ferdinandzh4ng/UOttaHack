"""
Bridge API between Node.js backend and Python SAM service
Provides REST API endpoints for task execution using Solace Event Mesh
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
import asyncio
import uuid
import json
import threading
import time
import socket
from datetime import datetime
from typing import Dict, Any, Optional
try:
    import certifi
    CERTIFI_AVAILABLE = True
except ImportError:
    CERTIFI_AVAILABLE = False
    print("⚠️ certifi not installed. Install with: pip install certifi", flush=True)
try:
    from solace.messaging.messaging_service import MessagingService, ReconnectionListener, ReconnectionAttemptListener, ServiceInterruptionListener
    from solace.messaging.resources.topic import Topic
    from solace.messaging.errors.pubsubplus_client_error import PubSubPlusClientError
    from solace.messaging.publisher.direct_message_publisher import DirectMessagePublisher, PublishFailureListener
    from solace.messaging.receiver.message_receiver import MessageHandler, InboundMessage
    from solace.messaging.receiver.direct_message_receiver import DirectMessageReceiver
    from solace.messaging.config.retry_strategy import RetryStrategy
    # Try importing TLS - may be in different location depending on SDK version
    try:
        from solace.messaging.config.transport_security_strategy import TLS
    except ImportError:
        try:
            from solace.messaging.config.security_strategy import TLS
        except ImportError:
            # TLS may not be available in all versions - we'll handle this gracefully
            TLS = None
    SOLACE_AVAILABLE = True
except ImportError:
    SOLACE_AVAILABLE = False
    TLS = None
    print("⚠️ solace-pubsubplus not installed. Install with: pip install solace-pubsubplus", flush=True)

load_dotenv()

# Solace Mesh implementation using actual Solace PubSub+ messaging
class SolaceMesh:
    """Real Solace Event Mesh implementation with proper request-reply pattern"""
    def __init__(self):
        self.agents = {}
        self.messaging_service = None
        self.publisher = None
        self.receivers = {}  # topic -> receiver mapping
        self.message_handlers = {}  # topic -> handler mapping
        self.pending_requests = {}  # request_id -> Future mapping for request-reply
        self.is_connected = False
        self.connection_lock = threading.Lock()
        
        # Solace connection configuration
        self.solace_host = os.getenv("SOLACE_HOST") or os.getenv("SOLACE_URL")
        self.solace_vpn = os.getenv("SOLACE_VPN_NAME") or os.getenv("SOLACE_VPN") or "uottahacks"
        self.solace_username = os.getenv("SOLACE_USERNAME") or "default"
        self.solace_password = os.getenv("SOLACE_PASSWORD") or os.getenv("SOLACE_CLUSTER_PASSWORD")
        self.solace_port = int(os.getenv("SOLACE_PORT", "55443"))  # Default TLS port for Solace Cloud
        
        # Client name for identification
        self.client_name = f"sam-bridge-{os.getpid()}"
        
        print(f"🔌 Solace Configuration:")
        print(f"   Host: {self.solace_host}")
        print(f"   VPN: {self.solace_vpn}")
        print(f"   Username: {self.solace_username}")
        print(f"   Port: {self.solace_port}")
        print(f"   Client Name: {self.client_name}")
    
    def register_agent(self, agent):
        """Register an agent with the mesh"""
        self.agents[agent.name] = agent
        print(f"✅ Registered agent: {agent.name}")
    
    async def setup_agent_subscriptions(self):
        """Setup subscriptions for agent request topics (call after agents are registered)"""
        if not self.is_connected:
            return
        
        print("📥 Setting up agent subscriptions...", flush=True)
        agent_topics = [
            "ai/task/script/lesson/>",
            "ai/task/image/slide/>",
            "ai/task/speech/slide",
            "ai/task/quiz/prompt/>",
            "ai/task/quiz/questions/>"
        ]
        
        async def agent_message_handler(message_data):
            """Handle incoming agent requests"""
            agent_name = message_data.get("_metadata", {}).get("agent")
            request_id = message_data.get("_metadata", {}).get("request_id")
            
            if not agent_name or agent_name not in self.agents:
                print(f"⚠️ Unknown agent: {agent_name}", flush=True)
                return
            
            agent = self.agents[agent_name]
            print(f"📨 Received request for agent: {agent_name}, request_id: {request_id}", flush=True)
            
            # Process message and get reply topic
            reply_topic = None
            try:
                # Extract reply-to from message if available
                # For now, construct reply topic from request
                if request_id:
                    reply_topic = f"ai/reply/{self.client_name}/{request_id}"
                
                # Use agent's handle_message if available, otherwise route based on agent type
                result = None
                if hasattr(agent, 'handle_message'):
                    result = await agent.handle_message(message_data, None)
                else:
                    # Fallback: route based on agent name and message content
                    if agent_name == "script_agent":
                        from agents.script_agent import ScriptAgent
                        if isinstance(agent, ScriptAgent):
                            result = await agent.generate_lesson_script(
                                message_data.get("topic"),
                                message_data.get("length_minutes"),
                                provider=message_data.get("_metadata", {}).get("provider", "google"),
                                model=message_data.get("_metadata", {}).get("model")
                            )
                    elif agent_name == "image_agent":
                        from agents.image_agent import ImageAgent
                        if isinstance(agent, ImageAgent):
                            result = await agent.generate_slide_image(
                                message_data.get("slide_script"),
                                message_data.get("slide_number"),
                                message_data.get("topic"),
                                provider=message_data.get("_metadata", {}).get("provider", "google"),
                                model=message_data.get("_metadata", {}).get("model")
                            )
                            result = {"imageUrl": result}
                    elif agent_name == "speech_agent":
                        from agents.speech_agent import SpeechAgent
                        if isinstance(agent, SpeechAgent):
                            result = await agent.generate_speech(
                                message_data.get("text"),
                                message_data.get("voice_id")
                            )
                            result = {"speechUrl": result}
                    elif agent_name == "quiz_prompt_agent":
                        from agents.quiz_agent import QuizPromptAgent
                        if isinstance(agent, QuizPromptAgent):
                            result = await agent.generate_quiz_prompt(
                                message_data.get("topic"),
                                message_data.get("question_type"),
                                message_data.get("num_questions"),
                                provider=message_data.get("_metadata", {}).get("provider", "google"),
                                model=message_data.get("_metadata", {}).get("model")
                            )
                            result = {"prompt": result}
                    elif agent_name == "quiz_questions_agent":
                        from agents.quiz_agent import QuizQuestionsAgent
                        if isinstance(agent, QuizQuestionsAgent):
                            result = await agent.generate_quiz_questions(
                                message_data.get("quiz_prompt"),
                                message_data.get("topic"),
                                message_data.get("question_type"),
                                message_data.get("num_questions"),
                                provider=message_data.get("_metadata", {}).get("provider", "google"),
                                model=message_data.get("_metadata", {}).get("model")
                            )
                
                if result and reply_topic:
                    # Add metadata to result
                    if "_metadata" not in result:
                        result["_metadata"] = {}
                    result["_metadata"]["request_id"] = request_id
                    result["_metadata"]["timestamp"] = datetime.now().isoformat()
                    
                    # Publish reply
                    await self.publish(reply_topic, result)
                    print(f"📤 Published reply to {reply_topic}", flush=True)
            except Exception as e:
                print(f"❌ Error processing agent request: {e}", flush=True)
                import traceback
                print(traceback.format_exc(), flush=True)
                # Publish error reply if possible
                if reply_topic:
                    error_reply = {
                        "error": str(e),
                        "_metadata": {
                            "request_id": request_id,
                            "timestamp": datetime.now().isoformat()
                        }
                    }
                    await self.publish(reply_topic, error_reply)
        
        # Subscribe to all agent topics
        for topic in agent_topics:
            try:
                await self.subscribe(topic, agent_message_handler)
            except Exception as e:
                print(f"⚠️ Failed to subscribe to {topic}: {e}", flush=True)
    
    def _check_network_connectivity(self, host, port, timeout=5):
        """Check if we can reach the Solace broker"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            result = sock.connect_ex((host, port))
            sock.close()
            return result == 0
        except Exception as e:
            print(f"   Network check error: {e}", flush=True)
            return False
    
    async def start(self):
        """Start the Solace connection and initialize messaging"""
        if self.is_connected:
            return True
        
        if not SOLACE_AVAILABLE:
            print("⚠️ Solace library not available, using direct routing", flush=True)
            return False
        
        if not self.solace_host:
            print("⚠️ SOLACE_HOST not configured, using direct routing", flush=True)
            return False
        
        try:
            # Build transport properties with TLS/SSL scheme
            # For Solace Cloud, TLS is required on port 55443 (tcps:// protocol)
            # Increase timeout to allow for TLS handshake and authentication
            connect_timeout_ms = int(os.getenv("SOLACE_CONNECT_TIMEOUT_MS", "60000"))  # 60 seconds default
            
            # Check if we should disable certificate validation (for troubleshooting)
            validate_certs = os.getenv("SOLACE_VALIDATE_CERTS", "true").lower() == "true"
            
            # Extract host from URI if it contains protocol prefix
            # Handle: tcps://, tcp://, wss://, ws://, https://, http://
            host = self.solace_host.strip()
            
            # Remove any protocol prefix
            for protocol in ['tcps://', 'tcp://', 'wss://', 'ws://', 'https://', 'http://']:
                if host.startswith(protocol):
                    host = host[len(protocol):]
                    break
            
            # Remove port if included in URI (handle cases like host:443:55443)
            if ':' in host:
                # Split by colon and take only the hostname part
                host = host.split(':')[0]
            
            # Clean up any trailing slashes
            host = host.rstrip('/')
            
            # Build host URI (matching official Solace docs format)
            # Format: tcps://host:port for TLS connections, or tcp://host:port for non-TLS
            # Note: SDK requires 'solace.messaging.transport.host' as mandatory property
            # For TLS, we also include 'solace.messaging.transport.host.secured'
            if self.solace_port == 55443 or self.solace_port == 443:
                # TLS connection - include both host properties
                host_uri = f"tcps://{host}:{self.solace_port}"
                broker_props = {
                    'solace.messaging.transport.host': host_uri,  # Mandatory property
                    'solace.messaging.transport.host.secured': host_uri,  # TLS-specific property
                    'solace.messaging.service.vpn-name': self.solace_vpn,
                    'solace.messaging.authentication.scheme.basic.username': self.solace_username,
                    'solace.messaging.authentication.scheme.basic.password': self.solace_password,
                }
            else:
                # Non-TLS connection
                host_uri = f"tcp://{host}:{self.solace_port}"
                broker_props = {
                    'solace.messaging.transport.host': host_uri,
                    'solace.messaging.service.vpn-name': self.solace_vpn,
                    'solace.messaging.authentication.scheme.basic.username': self.solace_username,
                    'solace.messaging.authentication.scheme.basic.password': self.solace_password,
                }
            
            # Configure TLS transport security (matching official Solace docs format)
            trust_store_path = os.getenv("SOLACE_TRUST_STORE_PATH")
            use_trust_store = os.getenv("SOLACE_USE_TRUST_STORE", "false").lower() == "true"
            
            # Auto-detect certs directory if not specified
            sam_service_dir = os.path.dirname(os.path.abspath(__file__))
            certs_dir = os.path.join(sam_service_dir, "certs")
            
            # If no trust store path specified, use certifi's CA bundle (Mozilla's trusted certificates)
            if not trust_store_path and CERTIFI_AVAILABLE:
                try:
                    certifi_path = certifi.where()
                    if os.path.exists(certifi_path):
                        trust_store_path = certifi_path
                        print(f"   📜 Using certifi CA bundle: {trust_store_path}", flush=True)
                        # Enable trust store usage if certifi is available
                        if not use_trust_store:
                            use_trust_store = True
                            print(f"   ✅ Auto-enabled trust store using certifi", flush=True)
                except Exception as e:
                    print(f"   ⚠️ Could not get certifi path: {e}", flush=True)
            
            # If still no trust store path, try to find one in certs directory
            # Priority: G2 certificates (DigiCert Global Root G2) are preferred over older CA certificates
            if not trust_store_path and os.path.exists(certs_dir) and os.path.isdir(certs_dir):
                # Look for common certificate file names, prioritizing G2 certificates
                cert_files = [
                    # G2 certificates (preferred - newer, more secure)
                    "digicert-global-root-g2.pem",
                    "digicert-global-root-g2.crt",
                    "g2.pem",
                    "g2.crt",
                    "truststore-g2.pem",
                    "solace-g2.pem",
                    "solace-trust-store.pem",
                    # Generic truststore names
                    "truststore.pem",
                    "truststore.crt",
                    "ca-bundle.crt",
                    "ca-certificates.crt",
                    # Older CA certificates (fallback, but will be deprecated)
                    "digicert-global-root-ca.pem",
                    "digicert-global-root-ca.crt",
                    "ca.pem",
                    "ca.crt",
                    "solace-ca.crt",
                    "solace-truststore.pem"
                ]
                for cert_file in cert_files:
                    potential_path = os.path.join(certs_dir, cert_file)
                    if os.path.exists(potential_path) and os.path.isfile(potential_path):
                        trust_store_path = potential_path
                        if "g2" in cert_file.lower():
                            print(f"   ✅ Auto-detected G2 trust store (recommended): {trust_store_path}", flush=True)
                        else:
                            print(f"   🔍 Auto-detected trust store: {trust_store_path}", flush=True)
                            if "ca" in cert_file.lower() and "g2" not in cert_file.lower():
                                print(f"   ⚠️ Note: Using older CA certificate. Consider using G2 certificate for better compatibility.", flush=True)
                        break
                
                # If no specific file found, check if certs directory has any .pem or .crt files
                # Prioritize files with "g2" in the name
                if not trust_store_path:
                    try:
                        cert_files_in_dir = [f for f in os.listdir(certs_dir) 
                                           if f.endswith(('.pem', '.crt', '.cer'))]
                        if cert_files_in_dir:
                            # Prioritize G2 certificates
                            g2_files = [f for f in cert_files_in_dir if 'g2' in f.lower()]
                            if g2_files:
                                trust_store_path = os.path.join(certs_dir, g2_files[0])
                                print(f"   ✅ Auto-detected G2 trust store from certs directory: {trust_store_path}", flush=True)
                            else:
                                # Use the first certificate file found
                                trust_store_path = os.path.join(certs_dir, cert_files_in_dir[0])
                                print(f"   🔍 Auto-detected trust store from certs directory: {trust_store_path}", flush=True)
                                print(f"   ⚠️ Note: No G2 certificate found. Consider using DigiCert Global Root G2 for better compatibility.", flush=True)
                    except Exception as e:
                        print(f"   ⚠️ Could not list certs directory: {e}", flush=True)
            
            # Configure TLS transport security (matching official Solace docs format)
            # For Solace Cloud, we disable certificate validation by default
            transport_security = None
            if TLS is not None:
                # Build TLS configuration using official Solace docs format
                # For Solace Cloud, disable certificate validation (no trust store needed)
                if validate_certs and use_trust_store and trust_store_path:
                    # Resolve relative paths relative to sam_service directory
                    if not os.path.isabs(trust_store_path):
                        trust_store_path = os.path.join(sam_service_dir, trust_store_path)
                    
                    print(f"   🔍 Looking for trust store at: {trust_store_path}", flush=True)
                    
                    # Check if it's a directory or file
                    if os.path.exists(trust_store_path):
                        if os.path.isdir(trust_store_path):
                            # It's a directory - find first cert file
                            print(f"   📁 Trust store path is a directory, looking for certificate files...", flush=True)
                            try:
                                cert_files = [f for f in os.listdir(trust_store_path) 
                                            if f.endswith(('.pem', '.crt', '.cer'))]
                                if cert_files:
                                    trust_store_path = os.path.join(trust_store_path, cert_files[0])
                                    print(f"   📜 Found certificate file: {trust_store_path}", flush=True)
                                else:
                                    print(f"   ⚠️ No certificate files found in directory: {trust_store_path}", flush=True)
                                    trust_store_path = None
                            except Exception as e:
                                print(f"   ⚠️ Could not list directory: {e}", flush=True)
                                trust_store_path = None
                    
                    # Validate trust store file exists
                    if trust_store_path and os.path.exists(trust_store_path) and os.path.isfile(trust_store_path):
                        try:
                            # Validate it's a proper PEM certificate
                            with open(trust_store_path, 'r') as f:
                                content = f.read()
                                if 'BEGIN CERTIFICATE' in content or 'BEGIN TRUSTED CERTIFICATE' in content:
                                    # Use trust store for certificate validation (official Solace docs format)
                                    # Matching exact format from Solace documentation
                                    transport_security = TLS.create() \
                                        .with_certificate_validation(
                                            True, 
                                            validate_server_name=False,
                                            trust_store_file_path=trust_store_path
                                        )
                                    print(f"   ✅ Using trust store: {trust_store_path}", flush=True)
                                else:
                                    print(f"   ⚠️ Trust store file is not a valid PEM certificate", flush=True)
                                    print(f"   ⚠️ File content preview: {content[:100]}...", flush=True)
                                    # Don't set transport_security - let SDK handle TLS without trust store
                                    transport_security = None
                                    print("   ⚠️ Certificate validation DISABLED - invalid certificate format", flush=True)
                        except Exception as e:
                            print(f"   ⚠️ Trust store file exists but cannot be read: {e}", flush=True)
                            import traceback
                            print(traceback.format_exc(), flush=True)
                            # Don't set transport_security - let SDK handle TLS without trust store
                            transport_security = None
                            print("   ⚠️ Certificate validation DISABLED - cannot read trust store", flush=True)
                    elif trust_store_path:
                        print(f"   ⚠️ Trust store path exists but is not a file: {trust_store_path}", flush=True)
                        transport_security = None
                    else:
                        print(f"   ⚠️ Trust store path not found: {trust_store_path}", flush=True)
                        print(f"   ℹ️ Current working directory: {os.getcwd()}", flush=True)
                        print(f"   ℹ️ Sam service directory: {sam_service_dir}", flush=True)
                        if os.path.exists(certs_dir):
                            print(f"   ℹ️ Certs directory exists: {certs_dir}", flush=True)
                            try:
                                files_in_certs = os.listdir(certs_dir)
                                print(f"   ℹ️ Files in certs directory: {files_in_certs}", flush=True)
                            except:
                                pass
                        # Don't set transport_security - let SDK handle TLS without trust store
                        transport_security = None
                        print("   ⚠️ Certificate validation DISABLED - trust store not found", flush=True)
                else:
                    # No trust store - don't set transport_security strategy
                    # The SDK will handle TLS automatically when using tcps:// protocol
                    # Setting transport_security with validation=False still tries to load trust store
                    transport_security = None
                    print("   ⚠️ Certificate validation DISABLED (Solace Cloud default - no trust store)", flush=True)
                    print("   ℹ️ Using tcps:// protocol - SDK will handle TLS automatically", flush=True)
            else:
                # TLS not available - use property-based approach as fallback
                print("   ⚠️ TLS class not available, using property-based TLS configuration", flush=True)
                broker_props['solace.messaging.transport.tls.enabled'] = 'true'
                broker_props['solace.messaging.transport.tls.cert-validated'] = 'false'
                broker_props['solace.messaging.transport.tls.cert-validated-date'] = 'false'
            
            print(f"🔌 Attempting to connect to Solace...", flush=True)
            print(f"   Host: {self.solace_host}:{self.solace_port}", flush=True)
            print(f"   VPN: {self.solace_vpn}", flush=True)
            print(f"   Username: {self.solace_username}", flush=True)
            print(f"   Password: {'SET' if self.solace_password else 'NOT SET'}", flush=True)
            print(f"   TLS: Enabled (required for port {self.solace_port})", flush=True)
            print(f"   Timeout: {connect_timeout_ms}ms", flush=True)
            
            # Quick network connectivity check
            print("🔍 Checking network connectivity...", flush=True)
            if self._check_network_connectivity(self.solace_host, self.solace_port, timeout=5):
                print("   ✅ Network reachable", flush=True)
            else:
                print("   ⚠️ Network unreachable - connection may fail", flush=True)
                print(f"   → Verify host/port: {self.solace_host}:{self.solace_port}", flush=True)
                print(f"   → Check firewall allows outbound to port {self.solace_port}", flush=True)
            
            # Set up connection event tracking
            connection_established = threading.Event()
            connection_failed = threading.Event()
            error_details = [None]
            
            # Create connection event listeners
            class ConnectionAttemptListener(ReconnectionAttemptListener):
                def on_reconnecting(self, e):
                    print(f"🔄 Reconnecting: {e}", flush=True)
                
                def on_reconnection_attempt(self, e):
                    print(f"🔄 Reconnection attempt: {e}", flush=True)
            
            class ConnectionListener(ReconnectionListener):
                def on_reconnected(self, e):
                    print(f"✅ Solace connected/reconnected: {e}", flush=True)
                    connection_established.set()
            
            class ServiceInterruptionListenerImpl(ServiceInterruptionListener):
                def on_service_interrupted(self, e):
                    print(f"⚠️ Solace service interrupted: {e}", flush=True)
                    connection_failed.set()
                    error_details[0] = str(e)
            
            # Create messaging service with retry strategies (matching official Solace docs format)
            try:
                # Use official Solace docs retry strategy: 20 retries, 3 second intervals
                reconnection_retry = RetryStrategy.parametrized_retry(20, 3)
                
                # Build messaging service using official Solace docs format
                # Matching exact format from Solace documentation
                builder = MessagingService.builder() \
                    .from_properties(broker_props) \
                    .with_reconnection_retry_strategy(reconnection_retry)
                
                # Add transport security if TLS is available (official Solace docs format)
                if transport_security is not None:
                    builder = builder.with_transport_security_strategy(transport_security)
                
                messaging_service = builder.build()
            except PubSubPlusClientError as trust_error:
                # Handle trust store errors specifically
                error_msg = str(trust_error)
                if 'trust store' in error_msg.lower() or 'trust-store' in error_msg.lower() or 'TRUSTSTORE' in error_msg or 'FAILED_TO_LOAD_TRUST_STORE' in error_msg:
                    print(f"❌ Trust store error: {error_msg}", flush=True)
                    print("   → Retrying without TLS transport security strategy", flush=True)
                    # Retry without transport_security strategy - let SDK handle TLS automatically
                    try:
                        builder = MessagingService.builder() \
                            .from_properties(broker_props) \
                            .with_reconnection_retry_strategy(reconnection_retry)
                        # Don't add transport_security_strategy - SDK will handle TLS automatically
                        messaging_service = builder.build()
                        print("   ✅ Retry successful without TLS strategy", flush=True)
                    except Exception as retry_fail:
                        print(f"   ❌ Retry also failed: {retry_fail}", flush=True)
                        raise
                else:
                    raise
            except Exception as retry_error:
                # Fallback if retry strategy fails
                print(f"⚠️ Could not set retry strategy: {retry_error}, using default", flush=True)
                builder = MessagingService.builder() \
                    .from_properties(broker_props)
                if transport_security is not None:
                    builder = builder.with_transport_security_strategy(transport_security)
                messaging_service = builder.build()
            
            # Add event listeners
            messaging_service.add_reconnection_attempt_listener(ConnectionAttemptListener())
            messaging_service.add_reconnection_listener(ConnectionListener())
            messaging_service.add_service_interruption_listener(ServiceInterruptionListenerImpl())
            
            # Connect to the messaging service (matching official Solace docs format)
            print("📡 Connecting to Solace...", flush=True)
            try:
                # Use synchronous connect() as per official docs
                # Note: This blocks, so we run it in a thread for async compatibility
                def connect_sync():
                    messaging_service.connect()
                    return True
                
                # Run connection in a thread to avoid blocking
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                    connect_future = executor.submit(connect_sync)
                    try:
                        # Wait for connection with timeout
                        connect_future.result(timeout=60)
                        print("✅ Connection completed", flush=True)
                    except concurrent.futures.TimeoutError:
                        raise Exception("Connection timeout after 60 seconds")
                
                # Wait a bit for connection to fully establish and check status
                time.sleep(1)
                
                # Check if connection was established via event
                if connection_established.wait(timeout=5):
                    print("✅ Connection event received", flush=True)
                elif connection_failed.is_set():
                    raise Exception(f"Connection failed: {error_details[0]}")
                else:
                    print("⚠️ No connection event received, but connect() completed - assuming connected", flush=True)
                
            except PubSubPlusClientError as e:
                # Handle Solace-specific errors with better diagnostics
                error_info = str(e)
                print(f"❌ Solace connection error: {error_info}", flush=True)
                
                # Check for specific error types
                if 'TIMEOUT' in error_info or 'timeout' in error_info.lower():
                    print("⏱️ Connection timeout detected - possible causes:", flush=True)
                    print("   1. Authentication failure (wrong username/password/VPN)", flush=True)
                    print("   2. TLS handshake failure (certificate or TLS config issue)", flush=True)
                    print("   3. Network connectivity issue (though basic connectivity passed)", flush=True)
                    print("   4. Solace broker is down or unreachable", flush=True)
                    print("", flush=True)
                    print("   🔍 Troubleshooting steps:", flush=True)
                    print(f"   → Verify username in Solace dashboard (current: {self.solace_username})", flush=True)
                    print(f"   → Check VPN name matches exactly: {self.solace_vpn}", flush=True)
                    print(f"   → Verify password is the cluster password (not account password)", flush=True)
                    print(f"   → Try username 'default' if current username doesn't work", flush=True)
                    print(f"   → Check Solace Cloud dashboard for active connections", flush=True)
                elif 'AUTHENTICATION' in error_info or 'authentication' in error_info.lower():
                    print("🔐 Authentication error - check credentials:", flush=True)
                    print(f"   - VPN name: {self.solace_vpn}", flush=True)
                    print(f"   - Username: {self.solace_username}", flush=True)
                    print(f"   - Password: {'SET' if self.solace_password else 'NOT SET'}", flush=True)
                elif 'VPN' in error_info:
                    print("📋 VPN error - check VPN name matches Solace Cloud dashboard", flush=True)
                    print(f"   Current VPN: {self.solace_vpn}", flush=True)
                
                # Clean up the messaging service
                try:
                    if messaging_service:
                        messaging_service.disconnect()
                except:
                    pass
                raise
            except Exception as e:
                print(f"❌ Connection error: {e}", flush=True)
                import traceback
                print(traceback.format_exc(), flush=True)
                # Clean up the messaging service
                try:
                    if messaging_service:
                        messaging_service.disconnect()
                except:
                    pass
                raise
            
            print(f"✅ Connected to Solace: {self.solace_host}:{self.solace_port}", flush=True)
            
            # Create publisher
            print("📤 Starting publisher...", flush=True)
            publisher = messaging_service.create_direct_message_publisher_builder().build()
            start_future = publisher.start_async()
            
            try:
                if start_future.done():
                    start_future.result()
                else:
                    start_future.result(timeout=10)
                print("✅ Solace publisher started", flush=True)
            except Exception as e:
                print(f"❌ Publisher start failed: {e}", flush=True)
                raise
            
            self.messaging_service = messaging_service
            self.publisher = publisher
            self.is_connected = True
            
            print("🎉 Solace connection fully established!", flush=True)
            return True
        except Exception as e:
            import traceback
            print(f"❌ Failed to connect to Solace: {e}", flush=True)
            print(traceback.format_exc(), flush=True)
            print("⚠️ Falling back to direct routing", flush=True)
            self.is_connected = False
            return False
    
    async def publish(self, topic, message, reply_to_topic=None):
        """Publish message to Solace topic"""
        if not self.is_connected or not self.publisher:
            print(f"⚠️ Not connected to Solace, falling back to direct routing", flush=True)
            # Fallback to direct routing
            agent_name = message.get("_metadata", {}).get("agent")
            if agent_name and agent_name in self.agents:
                agent = self.agents[agent_name]
                if hasattr(agent, 'handle_message'):
                    return await agent.handle_message(message, topic)
            return None
        
        try:
            # Publish to Solace (returns Future, not coroutine)
            topic_obj = Topic.of(topic)
            message_builder = self.messaging_service.message_builder()\
                .with_application_message_id(str(uuid.uuid4()))\
                .with_property("application", "uottahack-sam")\
                .with_property("timestamp", datetime.now().isoformat())
            
            # Add reply-to topic if provided (for request-reply pattern)
            if reply_to_topic:
                reply_topic_obj = Topic.of(reply_to_topic)
                message_builder = message_builder.with_reply_to(reply_topic_obj)
            
            message_obj = message_builder.build(json.dumps(message))
            
            publish_future = self.publisher.publish_async(message_obj, topic_obj)
            publish_future.result(timeout=5)  # Wait for publish to complete
            print(f"📤 Published to Solace topic: {topic}", flush=True)
            if reply_to_topic:
                print(f"   Reply-to: {reply_to_topic}", flush=True)
            
            return True
        except Exception as e:
            print(f"❌ Error publishing to Solace: {e}", flush=True)
            import traceback
            print(traceback.format_exc(), flush=True)
            # Fallback to direct routing
            agent_name = message.get("_metadata", {}).get("agent")
            if agent_name and agent_name in self.agents:
                agent = self.agents[agent_name]
                if hasattr(agent, 'handle_message'):
                    return await agent.handle_message(message, topic)
            return None
    
    async def subscribe(self, topic, handler):
        """Subscribe to a Solace topic"""
        if not self.is_connected or not self.messaging_service:
            print(f"⚠️ Cannot subscribe to {topic}: not connected to Solace", flush=True)
            return
        
        try:
            # Store handler
            self.message_handlers[topic] = handler
            
            # Create message receiver with proper async handling
            class MessageHandlerImpl(MessageHandler):
                def __init__(self, mesh_instance, topic_name, handler_func):
                    self.mesh = mesh_instance
                    self.topic_name = topic_name
                    self.handler_func = handler_func
                
                def on_message(self, message: InboundMessage):
                    try:
                        payload = message.get_payload_as_string()
                        message_data = json.loads(payload)
                        
                        # Check if this is a reply message (request-reply pattern)
                        reply_to = message.get_reply_to()
                        if reply_to:
                            reply_topic = reply_to.get_name()
                            request_id = message_data.get("_metadata", {}).get("request_id")
                            if request_id and request_id in self.mesh.pending_requests:
                                future = self.mesh.pending_requests[request_id]
                                if not future.done():
                                    future.set_result(message_data)
                                return
                        
                        # Regular message - run handler in async context
                        # Use threading to run async handler since we're in a callback
                        def run_handler():
                            try:
                                loop = asyncio.new_event_loop()
                                asyncio.set_event_loop(loop)
                                loop.run_until_complete(self.handler_func(message_data))
                                loop.close()
                            except Exception as e:
                                print(f"❌ Error in async handler for {self.topic_name}: {e}", flush=True)
                        
                        handler_thread = threading.Thread(target=run_handler, daemon=True)
                        handler_thread.start()
                    except Exception as e:
                        print(f"❌ Error handling message from {self.topic_name}: {e}", flush=True)
                        import traceback
                        print(traceback.format_exc(), flush=True)
            
            receiver = self.messaging_service.create_direct_message_receiver_builder()\
                .with_subscriptions(Topic.of(topic))\
                .build(MessageHandlerImpl(self, topic, handler))
            
            start_future = receiver.start_async()
            start_future.result(timeout=10)  # Wait for receiver to start
            self.receivers[topic] = receiver
            print(f"✅ Subscribed to Solace topic: {topic}", flush=True)
        except Exception as e:
            print(f"❌ Error subscribing to {topic}: {e}", flush=True)
            import traceback
            print(traceback.format_exc(), flush=True)
    
    async def request(self, topic, message, timeout=120):
        """Request-reply pattern: publish request and wait for reply"""
        if not self.is_connected or not self.publisher:
            # Fallback to direct routing
            agent_name = message.get("_metadata", {}).get("agent")
            if agent_name and agent_name in self.agents:
                agent = self.agents[agent_name]
                if hasattr(agent, 'handle_message'):
                    return await agent.handle_message(message, topic)
            raise Exception("Not connected to Solace and no direct agent available")
        
        request_id = str(uuid.uuid4())
        reply_topic = f"ai/reply/{self.client_name}/{request_id}"
        
        # Add request_id to message metadata
        if "_metadata" not in message:
            message["_metadata"] = {}
        message["_metadata"]["request_id"] = request_id
        message["_metadata"]["timestamp"] = datetime.now().isoformat()
        
        # Create future for reply
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        
        future = loop.create_future()
        self.pending_requests[request_id] = future
        
        try:
            # Subscribe to reply topic first
            async def reply_handler(reply_message):
                """Handle reply message"""
                # Check if this is our reply
                reply_request_id = reply_message.get("_metadata", {}).get("request_id")
                if reply_request_id == request_id and request_id in self.pending_requests:
                    future_to_resolve = self.pending_requests[request_id]
                    if not future_to_resolve.done():
                        future_to_resolve.set_result(reply_message)
            
            await self.subscribe(reply_topic, reply_handler)
            
            # Publish request with reply-to
            await self.publish(topic, message, reply_topic)
            print(f"📤 Published request to {topic}, waiting for reply on {reply_topic}", flush=True)
            
            # Wait for reply with timeout
            try:
                reply = await asyncio.wait_for(future, timeout=timeout)
                return reply
            except asyncio.TimeoutError:
                raise Exception(f"Request timeout after {timeout} seconds")
            finally:
                # Clean up
                if request_id in self.pending_requests:
                    del self.pending_requests[request_id]
                # Unsubscribe from reply topic
                try:
                    if reply_topic in self.receivers:
                        receiver = self.receivers[reply_topic]
                        receiver.stop()
                        del self.receivers[reply_topic]
                        if reply_topic in self.message_handlers:
                            del self.message_handlers[reply_topic]
                except Exception as e:
                    print(f"⚠️ Error cleaning up reply subscription: {e}", flush=True)
        except Exception as e:
            # Clean up on error
            if request_id in self.pending_requests:
                del self.pending_requests[request_id]
            raise

AgentMesh = SolaceMesh

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

# Initialize SAM
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

# Start mesh in background
loop = None
try:
    loop = asyncio.get_running_loop()
except RuntimeError:
    # No running loop, create a new one
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

# Start mesh
async def start_mesh_with_logging():
    """Start mesh and log the result"""
    connected = await mesh.start()
    if connected:
        print("✅ Solace Event Mesh connected - using event-based routing", flush=True)
        # Setup agent subscriptions after connection is established
        await mesh.setup_agent_subscriptions()
    else:
        print("⚠️ Solace Event Mesh not available - using direct routing", flush=True)
        print("   All agents will be called directly (no event mesh)", flush=True)
    return connected

if not loop.is_running():
    loop.run_until_complete(start_mesh_with_logging())
else:
    asyncio.create_task(start_mesh_with_logging())

# Note: Request-reply pattern is handled by SolaceMesh.request() method
# No separate response handler needed

async def publish_and_wait_for_response(
    topic: str,
    message: Dict[str, Any],
    timeout: int = 120
) -> Dict[str, Any]:
    """
    Publish a message to a topic and wait for response via event mesh
    Uses request-reply pattern through Solace
    """
    # Use Solace request-reply pattern if connected
    if mesh.is_connected:
        try:
            result = await mesh.request(topic, message, timeout)
            return result
        except Exception as e:
            print(f"⚠️ Solace request failed: {e}, falling back to direct routing", flush=True)
    
    # Fallback: Route directly to agent
    agent_name = message.get("_metadata", {}).get("agent")
    if agent_name and agent_name in mesh.agents:
        agent = mesh.agents[agent_name]
        
        # Call agent directly based on topic
        if "script/lesson" in topic:
            result = await script_agent.generate_lesson_script(
                message.get("topic"),
                message.get("length_minutes"),
                provider=message.get("_metadata", {}).get("provider", "google"),
                model=message.get("_metadata", {}).get("model")
            )
            if "_metadata" not in result:
                result["_metadata"] = {}
            result["_metadata"].update(message.get("_metadata", {}))
            return result
        elif "image/slide" in topic:
            result = await image_agent.generate_slide_image(
                message.get("slide_script"),
                message.get("slide_number"),
                message.get("topic"),
                provider=message.get("_metadata", {}).get("provider", "google"),
                model=message.get("_metadata", {}).get("model")
            )
            return {"imageUrl": result, "_metadata": message.get("_metadata", {})}
        elif "speech/slide" in topic:
            result = await speech_agent.generate_speech(
                message.get("text"),
                message.get("voice_id")
            )
            return {"speechUrl": result, "_metadata": message.get("_metadata", {})}
        elif "quiz/prompt" in topic:
            result = await quiz_prompt_agent.generate_quiz_prompt(
                message.get("topic"),
                message.get("question_type"),
                message.get("num_questions"),
                provider=message.get("_metadata", {}).get("provider", "google"),
                model=message.get("_metadata", {}).get("model")
            )
            return {"prompt": result, "_metadata": message.get("_metadata", {})}
        elif "quiz/questions" in topic:
            result = await quiz_questions_agent.generate_quiz_questions(
                message.get("quiz_prompt"),
                message.get("topic"),
                message.get("question_type"),
                message.get("num_questions"),
                provider=message.get("_metadata", {}).get("provider", "google"),
                model=message.get("_metadata", {}).get("model")
            )
            if "_metadata" not in result:
                result["_metadata"] = {}
            result["_metadata"].update(message.get("_metadata", {}))
            return result
    
    raise ValueError(f"Could not route message to agent for topic: {topic}")


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "sam-bridge",
        "solace_connected": mesh.is_connected
    })

@app.route('/api/solace/test', methods=['POST'])
def test_solace_connection():
    """Test Solace connection and messaging"""
    async def _test():
        try:
            if not mesh.is_connected:
                # Try to connect
                connected = await mesh.start()
                if not connected:
                    return jsonify({
                        "success": False,
                        "error": "Failed to connect to Solace",
                        "details": "Check your SOLACE_* environment variables"
                    }), 500
            
            # Test publish
            test_topic = "ai/test/connection"
            test_message = {
                "test": True,
                "timestamp": datetime.now().isoformat(),
                "_metadata": {
                    "agent": "test",
                    "request_id": str(uuid.uuid4())
                }
            }
            
            try:
                await mesh.publish(test_topic, test_message)
                return jsonify({
                    "success": True,
                    "message": "Solace connection test successful",
                    "details": {
                        "connected": mesh.is_connected,
                        "host": mesh.solace_host,
                        "port": mesh.solace_port,
                        "vpn": mesh.solace_vpn,
                        "client_name": mesh.client_name
                    }
                })
            except Exception as e:
                return jsonify({
                    "success": False,
                    "error": "Failed to publish test message",
                    "details": str(e)
                }), 500
        except Exception as e:
            import traceback
            return jsonify({
                "success": False,
                "error": str(e),
                "traceback": traceback.format_exc()
            }), 500
    
    try:
        return run_async(_test())
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/api/ai/task/script/lesson', methods=['POST'])
def generate_script():
    """Generate lesson script via event mesh"""
    # Capture request data in the Flask request context
    data = request.json
    
    async def _generate():
        try:
            topic = data.get('topic')
            length_minutes = data.get('lengthMinutes')
            provider = data.get('provider', 'google')
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
                    # Create model-specific topic
                    model_topic = f"ai/task/script/lesson/{model_config['provider']}/{model_config['model'].replace('/', '-')}"
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
                    tasks.append(publish_and_wait_for_response(model_topic, message))
                
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
                    'google/gemini-2.5-flash-lite'
                )
                
                # Create model-specific topic for routing
                solacetopic = f"ai/task/script/lesson/{provider}/{model_name.replace('/', '-')}"
                
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
                
                # Publish to event mesh and wait for response
                result = await publish_and_wait_for_response(solacetopic, message)
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
    """Generate slide image via event mesh"""
    # Capture request data in the Flask request context
    data = request.json
    
    async def _generate():
        try:
            slide_script = data.get('slideScript')
            slide_number = data.get('slideNumber')
            topic = data.get('topic')
            provider = data.get('provider', 'google')
            model = data.get('model')
            group_number = data.get('groupNumber')
            compare_models = data.get('compare', False)
            
            if not slide_script or not slide_number or not topic:
                return jsonify({"error": "Missing required parameters"}), 400
            
            if compare_models:
                results = {}
                tasks = []
                for model_config in image_agent.SUPPORTED_MODELS:
                    model_topic = f"ai/task/image/slide/{model_config['provider']}/{model_config['model'].replace('/', '-')}"
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
                    tasks.append(publish_and_wait_for_response(model_topic, message))
                
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
                
                solacetopic = f"ai/task/image/slide/{provider}/{model_name.replace('/', '-')}"
                
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
                
                result = await publish_and_wait_for_response(solacetopic, message)
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
    """Generate speech from text via event mesh"""
    # Capture request data in the Flask request context
    data = request.json
    
    async def _generate():
        try:
            text = data.get('text')
            voice_id = data.get('voiceId')
            group_number = data.get('groupNumber')
            
            if not text:
                return jsonify({"error": "Missing required parameters"}), 400
            
            solacetopic = "ai/task/speech/slide"
            
            message = {
                "text": text,
                "voice_id": voice_id,
                "group_number": group_number,
                "_metadata": {
                    "provider": "elevenlabs",
                    "agent": "speech_agent"
                }
            }
            
            result = await publish_and_wait_for_response(solacetopic, message)
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
    """Generate quiz prompt via event mesh"""
    # Capture request data in the Flask request context
    data = request.json
    
    async def _generate():
        try:
            topic = data.get('topic')
            question_type = data.get('questionType')
            num_questions = data.get('numQuestions')
            provider = data.get('provider', 'google')
            model = data.get('model')
            group_number = data.get('groupNumber')
            compare_models = data.get('compare', False)
            
            if not topic or not question_type or not num_questions:
                return jsonify({"error": "Missing required parameters"}), 400
            
            if compare_models:
                results = {}
                tasks = []
                for model_config in quiz_prompt_agent.SUPPORTED_MODELS:
                    model_topic = f"ai/task/quiz/prompt/{model_config['provider']}/{model_config['model'].replace('/', '-')}"
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
                    tasks.append(publish_and_wait_for_response(model_topic, message))
                
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
                    'google/gemini-pro'
                )
                
                solacetopic = f"ai/task/quiz/prompt/{provider}/{model_name.replace('/', '-')}"
                
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
                
                result = await publish_and_wait_for_response(solacetopic, message)
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
    """Generate quiz questions via event mesh"""
    # Capture request data in the Flask request context
    data = request.json
    
    async def _generate():
        try:
            quiz_prompt = data.get('quizPrompt')
            topic = data.get('topic')
            question_type = data.get('questionType')
            num_questions = data.get('numQuestions')
            provider = data.get('provider', 'google')
            model = data.get('model')
            group_number = data.get('groupNumber')
            compare_models = data.get('compare', False)
            
            if not quiz_prompt or not topic or not question_type or not num_questions:
                return jsonify({"error": "Missing required parameters"}), 400
            
            if compare_models:
                results = {}
                tasks = []
                for model_config in quiz_questions_agent.SUPPORTED_MODELS:
                    model_topic = f"ai/task/quiz/questions/{model_config['provider']}/{model_config['model'].replace('/', '-')}"
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
                    tasks.append(publish_and_wait_for_response(model_topic, message))
                
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
                    'google/gemini-pro'
                )
                
                solacetopic = f"ai/task/quiz/questions/{provider}/{model_name.replace('/', '-')}"
                
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
                
                result = await publish_and_wait_for_response(solacetopic, message)
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
                "default": os.getenv("SCRIPT_GEN_PROVIDER", "google")
            },
            "image.slide": {
                "models": image_agent.SUPPORTED_MODELS,
                "default": os.getenv("IMAGE_GEN_PROVIDER", "google")
            },
            "speech.slide": {
                "models": [{"provider": "elevenlabs", "model": "eleven_monolingual_v1", "name": "ElevenLabs"}],
                "default": "elevenlabs"
            },
            "quiz.prompt": {
                "models": quiz_prompt_agent.SUPPORTED_MODELS,
                "default": os.getenv("QUIZ_GEN_PROVIDER", "google")
            },
            "quiz.questions": {
                "models": quiz_questions_agent.SUPPORTED_MODELS,
                "default": os.getenv("QUIZ_GEN_PROVIDER", "google")
            },
            "orchestrator": {
                "models": orchestrator_agent.SUPPORTED_MODELS,
                "default": os.getenv("ORCHESTRATOR_PROVIDER", "google")
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

