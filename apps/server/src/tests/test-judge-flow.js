const io = require('C:/Users/AlHuda/Desktop/baffa/node_modules/socket.io-client');

const socket = io('http://localhost:4000', {
  transports: ['websocket'],
  auth: {
    userId: 'browser_user_1',
    username: 'احمد',
    avatar: 'avatar-1'
  }
});

socket.on('connect', () => {
  console.log('Connected to server with socket id:', socket.id);
  // Step 1: Create room as PLAYER/ADMIN
  socket.emit('client:create_room', {
    name: 'غرفة الدومينو للماتش',
    settings: { targetScore: 101, fillWithBots: true, allowJudge: true },
    user: { id: 'browser_user_1', username: 'احمد', avatar: 'avatar-1' },
    initialRole: 'ADMIN'
  });
});

let currentRoom = null;
let switchedToJudge = false;
let matchStarted = false;
let moveCount = 0;

socket.on('server:room_sync', (data) => {
  currentRoom = data.room;
  console.log(`[ROOM_SYNC] status=${currentRoom.matchStatus}, Judge=${currentRoom.judge?.username}, Seats: ${currentRoom.seats.map(s => `${s.seat}:${s.isBot ? 'Bot' : s.username}`).join(', ')}`);
  
  if (!switchedToJudge && currentRoom.matchStatus === 'LOBBY') {
    switchedToJudge = true;
    console.log('Step 2: Switching to Judge via client:join_as_judge...');
    setTimeout(() => {
      socket.emit('client:join_as_judge', {
        roomId: currentRoom.id,
        user: { id: 'browser_user_1', username: 'احمد', avatar: 'avatar-1' }
      });
    }, 400);
  } else if (switchedToJudge && !matchStarted && currentRoom.judge?.userId === 'browser_user_1') {
    matchStarted = true;
    console.log('Step 3: Starting match as Judge...');
    setTimeout(() => {
      socket.emit('client:admin_start_match', {
        roomId: currentRoom.id,
        user: { id: 'browser_user_1', username: 'احمد', avatar: 'avatar-1' }
      });
    }, 400);
  }
});

socket.on('server:game_state_sync', (data) => {
  moveCount++;
  console.log(`[STATE SYNC #${moveCount}] Chain: ${data.gameState.chain.tiles.length} tiles, Turn: Seat ${data.gameState.currentTurnSeat}, Starter: ${data.gameState.starterSeat}, Status: ${data.gameState.status}, MyRole: ${data.gameState.myRole}`);
  if (data.gameState.chain.tiles.length > 0) {
    const lastTile = data.gameState.chain.tiles[data.gameState.chain.tiles.length - 1];
    console.log(`  -> Tile placed: [${lastTile.tile[0]},${lastTile.tile[1]}] by Seat ${lastTile.playedBySeat} (${lastTile.end})`);
  }
});

socket.on('server:bot_message', (data) => {
  console.log(`[BOT CHAT] ${data.botId}: "${data.text}"`);
});

socket.on('server:room_error', (data) => {
  console.error('[ROOM_ERROR]', data);
});

setTimeout(() => {
  console.log(`[TEST FINISHED] Total moves: ${moveCount}`);
  socket.disconnect();
  process.exit(0);
}, 12000);
