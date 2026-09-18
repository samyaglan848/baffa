const { io } = require('socket.io-client');
const assert = require('assert');

async function testJudgeReconnection() {
  console.log('--- Testing Judge Reconnection and Active State Retrieval ---');

  const userId = 'judge_recon_' + Date.now();
  const user = {
    id: userId,
    username: 'حكم_معتمد',
    avatar: 'avatar-3',
  };

  // 1. First connection
  let socket1 = io('http://localhost:4000', {
    transports: ['websocket'],
  });

  await new Promise((resolve, reject) => {
    socket1.on('connect', resolve);
    socket1.on('connect_error', reject);
    setTimeout(() => reject(new Error('Connection 1 timeout')), 4000);
  });

  let roomId = null;
  let statesReceived1 = 0;

  socket1.on('server:room_sync', (data) => {
    roomId = data.room.id;
  });

  socket1.on('server:game_state_sync', (data) => {
    statesReceived1++;
  });

  // Create room as Judge
  socket1.emit('client:create_room', {
    name: 'Recon Match',
    settings: { fillWithBots: true, allowJudge: true },
    user,
    initialRole: 'JUDGE',
  });

  // Wait 3.5s for game to start and at least 1 move
  await new Promise((r) => setTimeout(r, 3500));
  assert(roomId, 'Room ID must be set');
  console.log(`✓ Match started in room ${roomId}, states on socket 1: ${statesReceived1}`);

  // 2. Disconnect socket 1 (simulate network drop or page reload)
  console.log('>>> Simulating network drop / page refresh (disconnecting socket 1)...');
  socket1.disconnect();

  // Test HTTP active-state retrieval while disconnected
  console.log('>>> Testing GET /api/matches/active-state while disconnected...');
  const httpRes = await fetch(`http://localhost:4000/api/matches/active-state/${roomId}?userId=${userId}&role=JUDGE`);
  const httpData = await httpRes.json();
  console.log(`HTTP State status: success=${httpData.success}, chainTiles=${httpData.gameState?.chain?.tiles?.length}, judge=${httpData.room?.judge?.username}`);
  assert(httpData.success, 'HTTP active-state must return success');
  assert(httpData.room?.judge, 'Judge session must remain preserved during active match!');

  // 3. Connect socket 2 with same user credentials (reconnection)
  console.log('>>> Reconnecting with socket 2...');
  let socket2 = io('http://localhost:4000', {
    transports: ['websocket'],
  });

  await new Promise((resolve, reject) => {
    socket2.on('connect', resolve);
    socket2.on('connect_error', reject);
    setTimeout(() => reject(new Error('Connection 2 timeout')), 4000);
  });

  let statesReceived2 = 0;

  socket2.on('server:room_sync', (data) => {
    console.log(`[SOCKET 2 ROOM_SYNC] Room=${data.room.id} Judge=${data.room.judge?.username} isConnected=${data.room.judge?.isConnected}`);
  });

  socket2.on('server:game_state_sync', (data) => {
    statesReceived2++;
    console.log(`[SOCKET 2 GAME_STATE_SYNC] Chain tiles=${data.gameState.chain.tiles.length} Role=${data.gameState.myRole}`);
  });

  // Emit join_as_judge with the new socket
  socket2.emit('client:join_as_judge', {
    roomId,
    user,
  });

  // Wait 4 seconds to observe more bot moves
  await new Promise((r) => setTimeout(r, 4000));

  socket2.disconnect();

  assert(statesReceived2 > 0, 'Socket 2 must receive live game state syncs!');
  console.log(`✓ Reconnection successful! Received ${statesReceived2} live updates on new socket.`);
  console.log('✓ All Judge reconnection and live active-state tests PASSED 100%!');
  process.exit(0);
}

testJudgeReconnection().catch((err) => {
  console.error('Reconnection test failed:', err);
  process.exit(1);
});
