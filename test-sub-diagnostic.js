const { io } = require('socket.io-client');

async function testSub() {
  const socket = io('http://localhost:4000', {
    transports: ['websocket'],
    forceNew: true,
  });

  socket.on('connect', () => {
    console.log('[TEST] Connected to server with ID:', socket.id);

    // Create room as judge
    socket.emit('client:create_room', {
      user: { id: 'judge_test_1', username: 'الحكم فوزي', avatar: 'avatar-judge' },
      name: 'Sub Test Room',
      initialRole: 'JUDGE',
      settings: { fillWithBots: true, maxPlayers: 4, allowJudge: true },
    });
  });

  socket.on('server:room_sync', (data) => {
    console.log('[TEST] room_sync received. Room ID:', data.room.id, 'matchStatus:', data.room.matchStatus);
    console.log('[TEST] Seats:', data.room.seats.map(s => ({ seat: s.seat, name: s.username, isBot: s.isBot, botId: s.botId })));

    if (!socket.hasTriggeredSub) {
      socket.hasTriggeredSub = true;
      console.log('\n[TEST] Emitting client:judge_sub_seat to replace seat 1 with EL_SAMY...');
      socket.emit('client:judge_sub_seat', {
        roomId: data.room.id,
        action: 'KICK_TO_SPECTATOR',
        seat: 1,
        botId: 'EL_SAMY',
        user: { id: 'judge_test_1', username: 'الحكم فوزي' },
      });
    }
  });

  socket.on('server:game_state_sync', (data) => {
    console.log('[TEST] game_state_sync received! Players:');
    console.log(data.gameState.players.map(p => ({ seat: p.seat, name: p.username, isBot: p.isBot, botId: p.botId })));
  });

  socket.on('server:referee_decision_broadcast', (data) => {
    console.log('[TEST] referee_decision_broadcast received:', data.title, data.arabicMessage);
  });

  socket.on('server:room_error', (data) => {
    console.error('[TEST] room_error received:', data);
  });

  setTimeout(() => {
    console.log('[TEST] Done test');
    socket.disconnect();
    process.exit(0);
  }, 3500);
}

testSub();
