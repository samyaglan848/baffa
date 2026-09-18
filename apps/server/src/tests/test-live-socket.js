const { io } = require('socket.io-client');

async function testSocketFlow() {
  const socket = io('http://localhost:4000', {
    transports: ['websocket'],
    auth: {
      userId: 'test_user_omda',
      username: 'عمدة',
      avatar: 'avatar-1',
    },
  });

  await new Promise((resolve) => socket.on('connect', resolve));
  console.log('Socket connected:', socket.id);

  let roomId = null;

  socket.on('server:room_sync', (data) => {
    console.log('\n--- ROOM_SYNC RECEIVED ---');
    console.log('Room ID:', data.room.id);
    console.log('Admin ID:', data.room.currentAdminId);
    console.log('Judge:', data.room.judge);
    console.log('Spectator:', data.room.spectator);
    console.log('Seats:', data.room.seats.map(s => ({
      seat: s.seat,
      occupied: s.occupied,
      isBot: s.isBot,
      playerId: s.playerId,
      username: s.username
    })));
    roomId = data.room.id;
  });

  socket.on('server:game_state_sync', (data) => {
    console.log('\n--- GAME_STATE_SYNC RECEIVED ---');
    console.log('Status:', data.gameState.status);
    console.log('MyRole:', data.gameState.myRole);
    console.log('MySeat:', data.gameState.mySeat);
    console.log('MyHand length:', data.gameState.myHand.length);
    console.log('Players:', data.gameState.players.map(p => ({
      seat: p.seat,
      username: p.username,
      isBot: p.isBot
    })));
    socket.disconnect();
    process.exit(0);
  });

  socket.on('server:room_error', (err) => {
    console.error('ROOM_ERROR:', err);
  });

  // 1. Create Room
  console.log('\n>>> Emitting client:create_room...');
  socket.emit('client:create_room', {
    name: 'Test Room',
    settings: { fillWithBots: true },
    user: { id: 'test_user_omda', username: 'عمدة', avatar: 'avatar-1' },
  });

  // Wait for room to be created
  await new Promise((r) => setTimeout(r, 600));

  // 2. Click Join as Judge
  console.log('\n>>> Emitting client:join_as_judge...');
  socket.emit('client:join_as_judge', {
    roomId,
    user: { id: 'test_user_omda', username: 'عمدة', avatar: 'avatar-1' },
  });

  await new Promise((r) => setTimeout(r, 600));

  // 3. Click Admin Start Match
  console.log('\n>>> Emitting client:admin_start_match...');
  socket.emit('client:admin_start_match', { roomId });

  await new Promise((r) => setTimeout(r, 2500));
  console.log('Finished waiting.');
  socket.disconnect();
  process.exit(0);
}

testSocketFlow().catch(console.error);
