const { io } = require('socket.io-client');
const assert = require('assert');

async function testQuickPlayAsJudge() {
  console.log('--- Testing Quick Play as Judge (4 bots auto-play) ---');

  const socket = io('http://localhost:4000', {
    transports: ['websocket'],
  });

  const user = {
    id: 'judge_user_' + Math.random().toString(36).substring(2, 8),
    username: 'حكم_الساحة',
    avatar: 'avatar-2',
  };

  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 4000);
  });
  console.log('✓ Connected with socket id:', socket.id);

  let roomId = null;
  let receivedStates = [];

  socket.on('server:room_sync', (data) => {
    roomId = data.room.id;
    console.log(`[ROOM_SYNC] Room ${data.room.id} status=${data.room.matchStatus} judge=${data.room.judge?.username}`);
  });

  socket.on('server:game_state_sync', (data) => {
    const gs = data.gameState;
    receivedStates.push(gs);
    console.log(`[GAME_STATE_SYNC] Status=${gs.status} Round=${gs.roundNumber} TurnSeat=${gs.currentTurnSeat} Starter=${gs.starterSeat} ChainTiles=${gs.chain.tiles.length}`);
    console.log('   Players:', gs.players.map(p => `S${p.seat}:${p.username}(${p.hiddenTilesCount})`).join(' | '));
  });

  socket.on('server:room_error', (err) => {
    console.error('[ROOM_ERROR]', err);
  });

  // Step 1: Create Quick Match with initialRole = JUDGE
  console.log('\n--- 1. Creating Quick Play Room with initialRole: JUDGE ---');
  socket.emit('client:create_room', {
    name: 'Quick Match (Judge)',
    settings: {
      targetScore: 101,
      fillWithBots: true,
      maxPlayers: 4,
      allowJudge: true,
      allowSpectator: true,
      voiceEnabled: true,
      selectedBotId: 'EL_SAMY',
    },
    user,
    initialRole: 'JUDGE',
  });

  // Wait 6 seconds and observe the match
  console.log('\n--- 2. Waiting 6 seconds for bots to play automatically ---');
  await new Promise((r) => setTimeout(r, 6000));

  socket.disconnect();

  console.log(`\nTotal GAME_STATE_SYNC events received: ${receivedStates.length}`);
  assert(receivedStates.length >= 2, 'Should have received multiple game state syncs as bots play');

  const latestState = receivedStates[receivedStates.length - 1];
  console.log('Latest chain tiles count:', latestState.chain.tiles.length);
  assert(latestState.chain.tiles.length >= 1, 'Bots should have placed at least 1 tile on the chain!');
  
  // Verify opening tile is [6|6]
  const firstTilePlacement = latestState.chain.tiles.find(t => t.end === 'START' || t.order === 1);
  console.log('First tile played:', firstTilePlacement);
  assert(firstTilePlacement, 'First tile placement must exist');
  assert(firstTilePlacement.tile[0] === 6 && firstTilePlacement.tile[1] === 6, 'First tile of round 1 MUST be [6|6]');

  // Verify that at least one bot has less than 7 cards
  const anyBotPlayed = latestState.players.some(p => p.hiddenTilesCount < 7);
  assert(anyBotPlayed, 'At least one bot must have fewer than 7 tiles!');

  console.log('✓ All assertions passed! Quick Play as Judge starts instantly and bots play continuously.');
  process.exit(0);
}

testQuickPlayAsJudge().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
