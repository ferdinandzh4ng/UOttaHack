import solace from 'solclientjs';

class SolaceService {
  constructor() {
    this.session = null;
    this.isConnected = false;
    this.messageHandlers = new Map();
    this.pendingRequests = new Map(); // request_id -> {resolve, reject, timeout}
    this.initialized = false;
    
    // Solace connection configuration
    const solaceHost = process.env.SOLACE_HOST || process.env.SOLACE_URL || 'localhost';
    const solacePort = process.env.SOLACE_PORT || '8008';
    const useTLS = process.env.SOLACE_USE_TLS === 'true' || process.env.SOLACE_PORT === '55443';
    const protocol = useTLS ? 'wss' : 'ws';
    
    this.config = {
      url: `${protocol}://${solaceHost}:${solacePort}`,
      vpnName: process.env.SOLACE_VPN_NAME || 'default',
      userName: process.env.SOLACE_USERNAME || 'default',
      password: process.env.SOLACE_PASSWORD || 'default',
      clientName: process.env.SOLACE_CLIENT_NAME || `uottahack-node-${process.pid}`
    };
    
    console.log('🔌 Solace Service Configuration:');
    console.log(`   URL: ${this.config.url}`);
    console.log(`   VPN: ${this.config.vpnName}`);
    console.log(`   Username: ${this.config.userName}`);
    console.log(`   Client Name: ${this.config.clientName}`);
  }

  /**
   * Initialize Solace factory (call once)
   */
  initialize() {
    if (this.initialized) {
      return;
    }
    
    try {
      const factoryProps = new solace.SolclientFactoryProperties();
      factoryProps.profile = solace.SolclientFactoryProfiles.version10;
      solace.SolclientFactory.init(factoryProps);
      this.initialized = true;
      console.log('✅ Solace factory initialized');
    } catch (error) {
      console.error('❌ Error initializing Solace factory:', error);
      throw error;
    }
  }

  /**
   * Initialize Solace connection
   */
  async connect() {
    if (this.isConnected) {
      return;
    }

    if (!this.initialized) {
      this.initialize();
    }

    return new Promise((resolve, reject) => {
      try {
        const sessionProperties = new solace.SessionProperties();
        sessionProperties.url = this.config.url;
        sessionProperties.vpnName = this.config.vpnName;
        sessionProperties.userName = this.config.userName;
        sessionProperties.password = this.config.password;
        sessionProperties.connectRetries = 3;
        sessionProperties.connectRetriesPerHost = 2;
        sessionProperties.reconnectRetries = 20;
        sessionProperties.reconnectRetryWaitInMsecs = 3000;

        this.session = solace.SolclientFactory.createSession(sessionProperties);

        // Set up event handlers
        this.session.on(solace.SessionEventCode.UP_NOTICE, () => {
          console.log('✅ Solace session connected');
          this.isConnected = true;
          resolve();
        });

        this.session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (error) => {
          console.error('❌ Solace connection failed:', error);
          this.isConnected = false;
          reject(error);
        });

        this.session.on(solace.SessionEventCode.DISCONNECTED, () => {
          console.log('⚠️ Solace session disconnected');
          this.isConnected = false;
        });

        this.session.on(solace.SessionEventCode.RECONNECTING_NOTICE, () => {
          console.log('🔄 Solace reconnecting...');
        });

        this.session.on(solace.SessionEventCode.RECONNECTED_NOTICE, () => {
          console.log('✅ Solace reconnected');
          this.isConnected = true;
        });

        this.session.on(solace.SessionEventCode.SUBSCRIPTION_ERROR, (error) => {
          console.error('❌ Solace subscription error:', error);
        });

        this.session.on(solace.SessionEventCode.SUBSCRIPTION_OK, () => {
          console.log('✅ Solace subscription successful');
        });

        // Handle incoming messages
        this.session.on(solace.SessionEventCode.MESSAGE, (message) => {
          this.handleMessage(message);
        });

        console.log(`🔌 Connecting to Solace: ${this.config.url}`);
        this.session.connect();
      } catch (error) {
        console.error('❌ Error initializing Solace:', error);
        reject(error);
      }
    });
  }
  
  /**
   * Handle incoming messages
   */
  handleMessage(message) {
    try {
      const topic = message.getDestination().getName();
      const payload = message.getBinaryAttachment();
      const messageData = JSON.parse(payload);
      
      // Check if this is a reply to a pending request
      const requestId = messageData._metadata?.request_id;
      if (requestId && this.pendingRequests.has(requestId)) {
        const { resolve, timeout } = this.pendingRequests.get(requestId);
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        resolve(messageData);
        return;
      }
      
      // Check for topic-based handlers
      for (const [subscribedTopic, handler] of this.messageHandlers.entries()) {
        if (topic === subscribedTopic || topic.startsWith(subscribedTopic)) {
          handler(messageData, message);
          return;
        }
      }
      
      console.log(`📨 Received message on topic ${topic} with no handler`);
    } catch (error) {
      console.error('❌ Error handling message:', error);
    }
  }

  /**
   * Disconnect from Solace
   */
  disconnect() {
    if (this.session) {
      this.session.disconnect();
      this.isConnected = false;
    }
  }

  /**
   * Publish a message to a topic
   */
  async publish(topic, message, replyTo = null) {
    if (!this.isConnected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      try {
        const messageObj = solace.SolclientFactory.createMessage();
        const topicDestination = solace.SolclientFactory.createTopicDestination(topic);
        messageObj.setDestination(topicDestination);
        messageObj.setBinaryAttachment(JSON.stringify(message));
        messageObj.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);
        
        if (replyTo) {
          const replyToDestination = solace.SolclientFactory.createTopicDestination(replyTo);
          messageObj.setReplyTo(replyToDestination);
        }

        this.session.send(messageObj);
        console.log(`📤 Published message to topic: ${topic}`);
        if (replyTo) {
          console.log(`   Reply-to: ${replyTo}`);
        }
        resolve();
      } catch (error) {
        console.error('❌ Error publishing message:', error);
        reject(error);
      }
    });
  }

  /**
   * Subscribe to a topic and handle messages
   */
  async subscribe(topic, handler) {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const topicDestination = solace.SolclientFactory.createTopicDestination(topic);
      
      // Store handler for this topic
      this.messageHandlers.set(topic, handler);

      // Subscribe to topic
      this.session.subscribe(topicDestination, true);
      console.log(`✅ Subscribed to topic: ${topic}`);
    } catch (error) {
      console.error('❌ Error subscribing to topic:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from a topic
   */
  async unsubscribe(topic) {
    if (!this.isConnected) {
      return;
    }

    try {
      const topicDestination = solace.SolclientFactory.createTopicDestination(topic);
      this.session.unsubscribe(topicDestination, true);
      this.messageHandlers.delete(topic);
      console.log(`Unsubscribed from topic: ${topic}`);
    } catch (error) {
      console.error('Error unsubscribing from topic:', error);
      throw error;
    }
  }

  /**
   * Request-reply pattern: publish request and wait for reply
   */
  async request(topic, message, timeout = 120000) {
    if (!this.isConnected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const replyTopic = `ai/reply/${this.config.clientName}/${requestId}`;
      
      // Add request_id to message metadata
      if (!message._metadata) {
        message._metadata = {};
      }
      message._metadata.request_id = requestId;
      message._metadata.timestamp = new Date().toISOString();

      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        this.unsubscribe(replyTopic).catch(console.error);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      // Store pending request
      this.pendingRequests.set(requestId, { resolve, reject, timeout: timeoutId });

      // Subscribe to reply topic
      this.subscribe(replyTopic, () => {
        // Handler is in handleMessage, this is just to ensure subscription
      }).then(() => {
        // Publish request with reply-to
        this.publish(topic, message, replyTopic).catch((error) => {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(requestId);
          this.unsubscribe(replyTopic).catch(console.error);
          reject(error);
        });
      }).catch((error) => {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(requestId);
        reject(error);
      });
    });
  }
}

export default new SolaceService();

