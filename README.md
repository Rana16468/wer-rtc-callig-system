# Secure Chat Backend Server

A production-ready backend server for a secure chat application with end-to-end encryption, real-time messaging, and video calling capabilities.

## 🔐 Core Features

### End-to-End Encryption
- AES encryption for all messages using CryptoJS
- Unique encryption keys per session
- Messages encrypted before transmission

### Real-time Chat
- Socket.IO for instant messaging
- Message history and room management
- Online user presence tracking
- Typing indicators
- Message reactions

### Video Calling System
- WebRTC for peer-to-peer video/audio calls
- Call initiation, acceptance, and rejection
- Video/audio toggle controls
- Screen sharing capabilities

## 🏗️ Architecture

### Backend (Node.js + Express)
- Socket.IO server for real-time communication
- WebRTC signaling server
- User management and room handling
- Call state management
- MongoDB with Mongoose for data persistence

## 📦 Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Update the `.env` file with your configuration:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/securechat
JWT_SECRET=your_super_secret_jwt_key_here
CLIENT_URL=http://localhost:3000
```

5. Start the server:
```bash
# Development
npm run dev

# Production
npm start
```

## 🚀 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user
- `POST /api/auth/refresh` - Refresh JWT token

### Rooms
- `GET /api/rooms` - Get user's rooms
- `POST /api/rooms` - Create new room
- `GET /api/rooms/:roomId` - Get room details
- `POST /api/rooms/:roomId/join` - Join room
- `POST /api/rooms/:roomId/leave` - Leave room
- `GET /api/rooms/:roomId/messages` - Get room messages
- `PATCH /api/rooms/:roomId` - Update room settings

### Users
- `GET /api/users/:userId` - Get user profile
- `GET /api/users` - Search users
- `PATCH /api/users/profile` - Update user profile
- `POST /api/users/:userId/block` - Block user
- `DELETE /api/users/:userId/block` - Unblock user
- `GET /api/users/blocked/list` - Get blocked users

## 🔌 Socket.IO Events

### Connection Events
- `join_room` - Join a chat room
- `user_online` - User came online
- `user_offline` - User went offline

### Messaging Events
- `send_message` - Send a message
- `new_message` - Receive a message
- `add_reaction` - Add reaction to message
- `reaction_added` - Reaction added to message
- `typing_start` - User started typing
- `typing_stop` - User stopped typing

### Video Call Events
- `initiate_call` - Start a video call
- `incoming_call` - Receive call invitation
- `call_response` - Accept/reject call
- `call_accepted` - Call was accepted
- `call_rejected` - Call was rejected
- `end_call` - End the call
- `call_ended` - Call has ended

### WebRTC Signaling Events
- `webrtc_offer` - WebRTC offer
- `webrtc_answer` - WebRTC answer
- `webrtc_ice_candidate` - ICE candidate exchange

## 🗄️ Database Models

### User Model
- Authentication and profile information
- Online status and last seen
- Room memberships
- Blocked users list
- User settings

### Room Model
- Room information and settings
- Member management with roles
- Encryption keys per member
- Activity tracking

### Message Model
- Encrypted message content
- Message metadata
- Reactions and replies
- Read receipts
- Edit history

### Call Model
- Call session management
- Participant tracking
- Call duration and status
- Call type (audio/video)

## 🔒 Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting
- CORS protection
- Helmet.js security headers
- Input validation and sanitization
- End-to-end message encryption

## 🚀 Production Deployment

1. Set up MongoDB database
2. Configure environment variables
3. Set up SSL/TLS certificates
4. Configure reverse proxy (nginx)
5. Set up process manager (PM2)
6. Configure monitoring and logging

## 📝 Environment Variables

```env
PORT=5000                                    # Server port
NODE_ENV=production                          # Environment
MONGODB_URI=mongodb://localhost:27017/chat   # Database URL
JWT_SECRET=your_jwt_secret                   # JWT signing key
CLIENT_URL=https://your-frontend-url.com     # Frontend URL for CORS
```

## 🧪 Testing

```bash
npm test
```

## 📄 License

MIT License - see LICENSE file for details