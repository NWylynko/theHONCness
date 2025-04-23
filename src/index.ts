import { createFiberplane, createOpenAPISpec } from "@fiberplane/hono";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { html } from "hono/html";
import { users, messages } from "./db/schema";
import { ChatRoom } from "./durable-objects/ChatRoom";
import { WaitingRoom } from "./durable-objects/WaitingRoom";

type Bindings = {
  DATABASE_URL: string;
  CHAT_ROOM: DurableObjectNamespace;
  WAITING_ROOM: DurableObjectNamespace;
  WAITING_ROOM_KV: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

// Setup CORS
app.use("*", cors());

// Serve the main app page
app.get("/", (c) => {
  return c.html(
    `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>HONC Chat App</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f5f5f5;
          touch-action: manipulation; /* Prevent double-tap to zoom */
          height: 100%;
          width: 100%;
          overflow: hidden;
        }
        .container {
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
          position: relative;
        }
        .chat-app {
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          overflow: hidden;
          height: 100vh;
          max-height: 100vh;
          display: flex;
          flex-direction: column;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 100;
        }
        .chat-header {
          background-color: #4a5568;
          color: white;
          padding: 15px;
          font-size: 18px;
          display: flex;
          justify-content: space-between;
        }
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 15px;
          padding-bottom: 70px; /* Add padding to avoid messages being hidden behind keyboard */
          display: flex;
          flex-direction: column;
          background-color: #f9fafc;
        }
        .message {
          margin: 15px 5px;
          max-width: 80%;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .user-message {
          background-color: transparent;
          align-self: flex-end;
        }
        .other-message {
          background-color: transparent;
          align-self: flex-start;
        }
        .emoji-message {
          font-size: 64px;
          line-height: 1;
          padding: 0;
          margin: 0;
          text-align: center;
          transition: transform 0.1s ease;
        }
        .user-message .emoji-message {
          transform: scale(1.1);
        }
        .message-form {
          display: flex;
          flex-direction: column;
          padding: 10px;
          border-top: 1px solid #e2e8f0;
          background-color: white;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 101;
        }
        .emoji-keyboard {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
          background-color: #f9fafc;
          padding: 10px;
          border-radius: 5px 5px 0 0;
          border: 1px solid #e2e8f0;
          border-bottom: none;
        }
        .emoji-btn {
          font-size: 32px;
          background: none;
          border: none;
          cursor: pointer;
          border-radius: 8px;
          padding: 8px;
          transition: background-color 0.2s, transform 0.1s;
          height: 60px;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .emoji-btn:hover, .emoji-btn:active {
          background-color: #e2e8f0;
          transform: scale(1.1);
        }
        .status {
          font-size: 14px;
          padding: 5px 10px;
          border-radius: 999px;
        }
        .connected {
          background-color: #c6f6d5;
          color: #276749;
        }
        .disconnected {
          background-color: #fed7d7;
          color: #c53030;
        }
        .waiting-room {
          background-color: white;
          overflow: hidden;
          text-align: center;
          height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 200;
        }
        .waiting-info {
          margin: 15px 0;
          font-size: 16px;
          width: 100%;
        }
        .waiting-position {
          font-weight: bold;
          font-size: 28px;
          color: #3182ce;
          margin: 15px 0;
        }
        
        /* Media queries for responsive design */
        @media (max-width: 480px) {
          .container {
            padding: 0;
          }
          .waiting-room {
            border-radius: 0;
            box-shadow: none;
            padding: 15px;
          }
          .chat-app {
            border-radius: 0;
            box-shadow: none;
          }
          .emoji-keyboard {
            grid-template-columns: repeat(5, 1fr);
            gap: 5px;
            padding: 8px;
          }
          .emoji-btn {
            font-size: 24px;
            padding: 5px;
            height: 44px;
          }
          .message {
            max-width: 85%;
            margin: 12px 5px;
          }
          .emoji-message {
            font-size: 54px;
          }
          .chat-messages {
            padding-bottom: 80px;
          }
        }
        
        /* Make sure full screen works well in iOS */
        @media screen and (orientation: portrait) {
          html, body {
            height: 100%;
            overflow: hidden;
            position: fixed;
            width: 100%;
          }
        }
        
        /* Handle notches and home indicators on iPhone X and newer */
        @supports (padding: max(0px)) {
          .message-form {
            padding-bottom: max(10px, env(safe-area-inset-bottom));
          }
          .chat-messages {
            padding-bottom: max(70px, calc(70px + env(safe-area-inset-bottom)));
          }
        }
      </style>
      <style>
        /* Additional styles for the enhanced waiting room */
        .waiting-animation {
          display: flex;
          justify-content: center;
          margin: 20px 0;
        }
        
        .bubble {
          width: 20px;
          height: 20px;
          background-color: #3498db;
          border-radius: 50%;
          margin: 0 5px;
          animation: bounce 1.5s infinite ease-in-out;
        }
        
        .bubble-1 {
          animation-delay: 0s;
        }
        
        .bubble-2 {
          animation-delay: 0.3s;
        }
        
        .bubble-3 {
          animation-delay: 0.6s;
        }
        
        @keyframes bounce {
          0%, 100% {
            transform: translateY(0);
            background-color: #3498db;
          }
          50% {
            transform: translateY(-15px);
            background-color: #2980b9;
          }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .fun-fact-container {
          background-color: #f8f9fa;
          border-radius: 8px;
          padding: 15px;
          margin: 20px 0;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .fun-fact {
          font-style: italic;
          margin-bottom: 10px;
        }
        
        .fun-button {
          background-color: #28a745;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          cursor: pointer;
          transition: background-color 0.3s;
        }
        
        .fun-button:hover {
          background-color: #218838;
        }
        
        .waiting-game {
          margin-top: 25px;
          border-top: 1px solid #e9ecef;
          padding-top: 15px;
        }
        
        .click-game {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-top: 10px;
        }
        
        .game-target {
          padding: 12px 20px;
          background-color: #dc3545;
          color: white;
          border-radius: 4px;
          cursor: pointer;
          user-select: none;
          transition: transform 0.1s, background-color 0.2s;
          position: relative;
          margin-bottom: 10px;
        }
        
        .game-target:hover {
          background-color: #c82333;
        }
        
        .game-target:active {
          transform: scale(0.95);
        }
        
        .game-score {
          font-weight: bold;
          font-size: 18px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div id="waitingRoomTab" class="tab-content">
          <div class="waiting-room">
            <h2>Waiting Room</h2>
            <p>Looking for a chat partner... Please wait while we pair you with someone.</p>
            <div id="waitingStatus" class="waiting-info">
              <p>You are in the waiting room.</p>
              <div class="waiting-animation">
                <div class="bubble bubble-1"></div>
                <div class="bubble bubble-2"></div>
                <div class="bubble bubble-3"></div>
              </div>
              <div class="waiting-position">Position: <span id="positionNumber">1</span></div>
              <p id="waitingMessage">Please wait to be paired with someone...</p>
              
              <!-- Fun facts or jokes section -->
              <div class="fun-fact-container">
                <p id="funFact" class="fun-fact">Did you know? The first message sent over the internet was "LO" - it was supposed to be "LOGIN" but the system crashed!</p>
                <button id="newFactButton" class="fun-button">New Fact</button>
              </div>
              
              <!-- Simple game to pass the time -->
              <div class="waiting-game">
                <h3>While you wait, play a quick game!</h3>
                <div id="clickGame" class="click-game">
                  <div id="gameTarget" class="game-target">Click me!</div>
                  <div class="game-score">Score: <span id="gameScore">0</span></div>
                </div>
              </div>
            </div>
            <button id="joinWaitingRoomButton" class="join-button" style="display: none;">Join Waiting Room</button>
          </div>
        </div>
        
        <div id="chatApp" class="chat-app" style="display: none;">
          <div class="chat-header">
            <div id="roomName">HONC Chat App</div>
            <div id="connectionStatus" class="status disconnected">Disconnected</div>
          </div>
          
          <div id="chatMessages" class="chat-messages">
            <!-- Messages will be added here -->
          </div>
          
          <div class="message-form">
            <div class="emoji-keyboard">
              <button class="emoji-btn" data-emoji="😊">😊</button>
              <button class="emoji-btn" data-emoji="😂">😂</button>
              <button class="emoji-btn" data-emoji="😍">😍</button>
              <button class="emoji-btn" data-emoji="🥰">🥰</button>
              <button class="emoji-btn" data-emoji="😎">😎</button>
              <button class="emoji-btn" data-emoji="👍">👍</button>
              <button class="emoji-btn" data-emoji="❤️">❤️</button>
              <button class="emoji-btn" data-emoji="🔥">🔥</button>
              <button class="emoji-btn" data-emoji="🙌">🙌</button>
              <button class="emoji-btn" data-emoji="👏">👏</button>
              <button class="emoji-btn" data-emoji="🎉">🎉</button>
              <button class="emoji-btn" data-emoji="🤔">🤔</button>
              <button class="emoji-btn" data-emoji="😭">😭</button>
              <button class="emoji-btn" data-emoji="🥺">🥺</button>
              <button class="emoji-btn" data-emoji="😢">😢</button>
              <button class="emoji-btn" data-emoji="😡">😡</button>
              <button class="emoji-btn" data-emoji="👋">👋</button>
              <button class="emoji-btn" data-emoji="✨">✨</button>
              <button class="emoji-btn" data-emoji="💯">💯</button>
              <button class="emoji-btn" data-emoji="🙏">🙏</button>
            </div>
          </div>
        </div>
      </div>

      <script>
        // DOM elements
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');
        const waitingRoomTab = document.getElementById('waitingRoomTab');
        const chatApp = document.getElementById('chatApp');
        const roomName = document.getElementById('roomName');
        const connectionStatus = document.getElementById('connectionStatus');
        const chatMessages = document.getElementById('chatMessages');
        const joinWaitingRoomButton = document.getElementById('joinWaitingRoomButton');
        const waitingStatus = document.getElementById('waitingStatus');
        const positionNumber = document.getElementById('positionNumber');
        const waitingMessage = document.getElementById('waitingMessage');
        
        // State
        let currentRoom = null;
        let chatSocket = null;
        let waitingSocket = null;
        let userName = 'User-' + Math.floor(Math.random() * 1000);
        let userId = Math.floor(Math.random() * 10000).toString();
        let gameScore = 0;
        
        // Event Listeners
        joinWaitingRoomButton.addEventListener('click', joinWaitingRoom);
        
        // Fun facts array
        const funFacts = [
          "Did you know? The first message sent over the internet was 'LO' - it was supposed to be 'LOGIN' but the system crashed!",
          "In 1996, someone bought a pizza online for the first time ever.",
          "The average person spends about 6 years of their life on social media.",
          "Around 90% of the world's data has been created in just the last 2 years.",
          "There are approximately 4.5 billion people connected to the internet globally.",
          "The most expensive domain name ever sold was cars.com for $872 million.",
          "The first computer virus was created in 1983 and was called 'Elk Cloner'.",
          "The word 'robot' comes from the Czech word 'robota' meaning 'forced labor'.",
          "The first website went live on August 6, 1991. It was about the World Wide Web project itself.",
          "The first tweet ever was 'just setting up my twttr' by Jack Dorsey in 2006.",
          "The QWERTY keyboard layout was designed to slow typists down to prevent jamming of mechanical typewriters.",
          "In 2018, people watched over 50,000 years worth of content on YouTube every day.",
          "The internet uses about 10% of the world's electricity.",
          "The word 'spam' comes from a Monty Python sketch where the word 'spam' is repeated over and over.",
          "The first mobile phone call was made in 1973 by Martin Cooper, a Motorola researcher."
        ];
        
        // Jokes array
        const jokes = [
          "Why don't scientists trust atoms? Because they make up everything!",
          "Why did the JavaScript developer wear glasses? Because he didn't see sharp.",
          "How many programmers does it take to change a light bulb? None, that's a hardware problem.",
          "Why was the computer cold? It left its Windows open!",
          "Why did the programmer quit his job? Because he didn't get arrays.",
          "What do you call a computer that sings? A Dell.",
          "How do you organize a space party? You planet.",
          "Why don't programmers like nature? It has too many bugs.",
          "What's a computer's favorite snack? Microchips!",
          "Why did the developer go broke? He used up all his cache."
        ];
        
        // Set up game and fun facts
        document.getElementById('newFactButton').addEventListener('click', showRandomFact);
        document.getElementById('gameTarget').addEventListener('click', handleGameClick);
        
        function showRandomFact() {
          const funFact = document.getElementById('funFact');
          // Randomly decide between fact or joke
          if (Math.random() > 0.5) {
            const randomFact = funFacts[Math.floor(Math.random() * funFacts.length)];
            funFact.textContent = randomFact;
          } else {
            const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
            funFact.textContent = randomJoke;
          }
          
          // Animate the fact change
          funFact.style.animation = 'none';
          setTimeout(() => {
            funFact.style.animation = 'fadeIn 0.5s';
          }, 10);
        }
        
        function handleGameClick() {
          gameScore++;
          document.getElementById('gameScore').textContent = gameScore.toString();
          
          // Move the target to a random position
          const gameTarget = document.getElementById('gameTarget');
          const gameContainer = document.getElementById('clickGame');
          
          const maxX = gameContainer.offsetWidth - gameTarget.offsetWidth - 20;
          const maxY = 100; // Limit vertical movement
          
          const randomX = Math.max(0, Math.floor(Math.random() * maxX));
          const randomY = Math.max(0, Math.floor(Math.random() * maxY));
          
          // Use string concatenation instead of template literals to avoid TS errors
          gameTarget.style.transform = 'translate(' + randomX + 'px, ' + randomY + 'px)';
          
          // Change color randomly
          const colors = ['#dc3545', '#28a745', '#007bff', '#fd7e14', '#6610f2', '#6f42c1'];
          const randomColor = colors[Math.floor(Math.random() * colors.length)];
          gameTarget.style.backgroundColor = randomColor;
        }
        
        // Show a random fact every 20 seconds
        setInterval(showRandomFact, 20000);
        
        // Set up emoji keyboard
        document.querySelectorAll('.emoji-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const emoji = btn.getAttribute('data-emoji');
            if (emoji) {
              sendEmojiMessage(emoji);
            }
          });
        });
        
        // Join the waiting room
        function joinWaitingRoom() {
          // No longer need to show waitingStatus or disable the button as they're handled in HTML
          
          // Connect to WebSocket for waiting room
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = protocol + '//' + window.location.host + '/api/waiting-room/websocket';
          
          // Close existing connection if any
          if (waitingSocket) {
            waitingSocket.close();
          }
          
          waitingSocket = new WebSocket(wsUrl);
          
          waitingSocket.onopen = () => {
            console.log('Connected to waiting room');
            // Send join message
            waitingSocket.send(JSON.stringify({
              type: 'join',
              userId,
              userName
            }));
          };
          
          waitingSocket.onclose = () => {
            console.log('Disconnected from waiting room');
            
            // Try to reconnect after delay if still in waiting room and not paired yet
            if (chatApp.style.display === 'none') {
              setTimeout(joinWaitingRoom, 5000);
            }
          };
          
          waitingSocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            waitingMessage.textContent = 'Error connecting to waiting room. Attempting to reconnect...';
            
            // Try to reconnect after error
            setTimeout(joinWaitingRoom, 3000);
          };
          
          waitingSocket.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              
              if (data.type === 'waiting') {
                // Update position in queue
                positionNumber.textContent = data.position;
                if (data.message) {
                  waitingMessage.textContent = data.message;
                }
              } else if (data.type === 'paired') {
                // We've been paired with someone!
                // No need to hide/show elements that are already properly set up
                
                // Close waiting room connection
                if (waitingSocket) {
                  waitingSocket.close();
                  waitingSocket = null;
                }
                
                // Join the assigned chat room
                joinSpecificRoom(data.roomId, data.partnerName);
              }
            } catch (error) {
              console.error('Error handling waiting room message:', error);
            }
          };
        }
        
        // Join a specific room (used for pairing)
        function joinSpecificRoom(roomId, partnerName) {
          currentRoom = roomId;
          // Always keep the header as "HONC Chat App" regardless of partner
          roomName.textContent = "HONC Chat App";
          
          // Hide waiting room and show chat
          waitingRoomTab.style.display = 'none';
          chatApp.style.display = 'block';
          
          // Connect to WebSocket for the chat room
          connectWebSocket(roomId);
          
          // Ensure chat is scrolled to bottom when first shown
          setTimeout(scrollToBottom, 100);
        }
        
        // Connect to WebSocket for a specific room
        function connectWebSocket(room) {
          // Close existing connections
          if (chatSocket) {
            chatSocket.close();
          }
          
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = protocol + '//' + window.location.host + '/api/chat/room/' + room + '/websocket';
          
          chatSocket = new WebSocket(wsUrl);
          
          chatSocket.onopen = () => {
            console.log('Connected to chat WebSocket');
            connectionStatus.textContent = 'Connected';
            connectionStatus.className = 'status connected';
          };
          
          chatSocket.onclose = () => {
            console.log('Disconnected from chat WebSocket');
            connectionStatus.textContent = 'Disconnected';
            connectionStatus.className = 'status disconnected';
            
            // Try to reconnect after delay
            setTimeout(() => {
              if (currentRoom) {
                connectWebSocket(currentRoom);
              }
            }, 5000);
          };
          
          chatSocket.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              
              if (data.type === 'history') {
                // Clear existing messages
                chatMessages.innerHTML = '';
                
                // Add historical messages
                data.messages.forEach(msg => {
                  addMessageToChat(msg);
                });
                
                // Make sure we scroll to bottom after loading history
                scrollToBottom();
              } else if (data.type === 'message') {
                addMessageToChat(data.message);
              }
            } catch (error) {
              console.error('Error handling message:', error);
            }
          };
          
          chatSocket.onerror = (error) => {
            console.error('WebSocket error:', error);
          };
        }
        
        // Send an emoji message
        function sendEmojiMessage(emoji) {
          if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) return;
          
          const msgData = {
            type: 'message',
            userId: userId,
            userName: userName,
            message: emoji
          };
          
          chatSocket.send(JSON.stringify(msgData));
          
          // Also persist to DB
          fetch('/api/chat/room/' + currentRoom + '/message', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: userId,
              userName: userName,
              content: emoji
            })
          });
        }
        
        // Add a message to the chat display
        function addMessageToChat(msg) {
          const messageDiv = document.createElement('div');
          messageDiv.className = 'message ' + (msg.userId === userId ? 'user-message' : 'other-message');
          
          // Just display the emoji in large font
          const content = document.createElement('div');
          content.className = 'emoji-message';
          content.textContent = msg.message;
          
          messageDiv.appendChild(content);
          chatMessages.appendChild(messageDiv);
          
          // Scroll to bottom immediately
          scrollToBottom();
          
          // Also scroll after a short delay to handle any rendering issues
          setTimeout(scrollToBottom, 50);
        }
        
        // Dedicated function for scrolling to bottom
        function scrollToBottom() {
          // Apply smooth scrolling behavior
          chatMessages.style.scrollBehavior = 'smooth';
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        // Automatically join waiting room on page load
        document.addEventListener('DOMContentLoaded', () => {
          // Auto-join waiting room when page loads
          joinWaitingRoom();
          
          // Add resize handler to maintain scroll position
          window.addEventListener('resize', () => {
            // Only scroll if we're in chat mode
            if (chatApp.style.display !== 'none') {
              scrollToBottom();
            }
          });
        });
      </script>
    </body>
    </html>`
  );
});

// API endpoint
app.get("/api", (c) => {
  return c.text("Honc! 🪿");
});

app.get("/api/users", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const db = drizzle(sql);

  return c.json({
    users: await db.select().from(users),
  });
});

// Chat API routes
app.get("/api/chat/rooms", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const db = drizzle(sql);

  // Get unique room IDs from messages
  const allMessages = await db.select().from(messages);
  const uniqueRooms = [...new Set(allMessages.map((msg) => msg.roomId))];

  return c.json({ rooms: uniqueRooms });
});

// Create or get access to a chat room Durable Object
app.get("/api/chat/room/:roomId/websocket", async (c) => {
  const roomId = c.req.param("roomId");

  // Convert the room ID to a Durable Object ID
  const id = c.env.CHAT_ROOM.idFromName(roomId);

  // Get the Durable Object stub
  const chatRoom = c.env.CHAT_ROOM.get(id);

  // Forward the request to the Durable Object
  const newUrl = new URL(c.req.url);
  newUrl.pathname = "/websocket";

  // Get the original request to preserve WebSocket upgrade headers
  const originalRequest = c.req.raw;

  return chatRoom.fetch(new Request(newUrl, originalRequest));
});

// Get chat history for a specific room
app.get("/api/chat/room/:roomId/messages", async (c) => {
  const roomId = c.req.param("roomId");

  // Get messages from database
  const sql = neon(c.env.DATABASE_URL);
  const db = drizzle(sql);

  const roomMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.roomId, roomId))
    .orderBy(messages.createdAt);

  return c.json({ messages: roomMessages });
});

// Store a new message (for backup/persistence)
app.post("/api/chat/room/:roomId/message", async (c) => {
  const roomId = c.req.param("roomId");
  const { userId, userName, content } = await c.req.json();

  const sql = neon(c.env.DATABASE_URL);
  const db = drizzle(sql);

  await db.insert(messages).values({
    content,
    roomId,
    userId,
    userName,
  });

  return c.json({ success: true });
});

// Waiting Room API routes
app.get("/api/waiting-room/status", async (c) => {
  // Use the singleton WaitingRoom Durable Object
  const id = c.env.WAITING_ROOM.idFromName("default");
  const waitingRoom = c.env.WAITING_ROOM.get(id);

  // Forward the request to get status
  const newUrl = new URL(c.req.url);
  newUrl.pathname = "/status";

  return waitingRoom.fetch(new Request(newUrl, c.req));
});

app.get("/api/waiting-room/websocket", async (c) => {
  // Use the singleton WaitingRoom Durable Object
  const id = c.env.WAITING_ROOM.idFromName("default");
  const waitingRoom = c.env.WAITING_ROOM.get(id);

  // Forward the request to the Durable Object
  const newUrl = new URL(c.req.url);
  newUrl.pathname = "/websocket";

  // Get the original request to preserve WebSocket upgrade headers
  const originalRequest = c.req.raw;

  // Create a new request with all the original headers to maintain the WebSocket upgrade
  return waitingRoom.fetch(new Request(newUrl, originalRequest));
});

// Get recent pairings from KV
app.get("/api/waiting-room/recent-pairs", async (c) => {
  const limitParam = c.req.query("limit");
  const limit = limitParam ? parseInt(limitParam) : 10;

  // List all keys with the pair: prefix
  const keys = await c.env.WAITING_ROOM_KV.list({ prefix: "pair:" });

  // Get the most recent pairs
  const pairs: {
    roomId: string;
    user1: { id: string; name: string };
    user2: { id: string; name: string };
    pairedAt: number;
  }[] = [];

  for (const key of keys.keys.slice(0, limit)) {
    const pair = await c.env.WAITING_ROOM_KV.get(key.name, "json");
    if (pair) {
      pairs.push({
        roomId: key.name.replace("pair:", ""),
        ...(pair as {
          user1: { id: string; name: string };
          user2: { id: string; name: string };
          pairedAt: number;
        }),
      });
    }
  }

  // Sort by pairedAt descending
  pairs.sort((a, b) => b.pairedAt - a.pairedAt);

  return c.json({ pairs });
});

/**
 * Serve a simplified api specification for your API
 * As of writing, this is just the list of routes and their methods.
 */
app.get("/openapi.json", (c) => {
  return c.json(
    createOpenAPISpec(app, {
      info: {
        title: "Honc D1 App",
        version: "1.0.0",
      },
    })
  );
});

/**
 * Mount the Fiberplane api explorer to be able to make requests against your API.
 *
 * Visit the explorer at `/fp`
 */
app.use(
  "/fp/*",
  createFiberplane({
    app,
    openapi: { url: "/openapi.json" },
  })
);

export default app;

// Export the ChatRoom class as a named export for Durable Objects
export { ChatRoom, WaitingRoom };
