import { PersistenceService } from '../modules/persistence/persistence.service';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DominoGameEngine } from '@baffa/engine';
import { performance } from 'node:perf_hooks';

describe('BAFFA High-Concurrency & Load Performance Benchmark', () => {
  it('Simulates 50 concurrent rooms and measures latency, p95, throughput & memory', async () => {
    const NUM_ROOMS = 50;
    const engines: DominoGameEngine[] = [];
    const latencies: number[] = [];
    let totalActions = 0;
    let totalErrors = 0;

    const initialMemory = process.memoryUsage().heapUsed;
    const startTime = performance.now();

    // 1. Initialize 50 concurrent rooms
    for (let r = 0; r < NUM_ROOMS; r++) {
      const engine = new DominoGameEngine({
        matchId: `load-match-${r}`,
        roomId: `load-room-${r}`,
        targetScore: 101,
        players: [
          { seat: 0, playerId: `r${r}_p1`, username: `R${r} P1`, avatar: '1', isBot: false, isConnected: true, isReady: true },
          { seat: 1, playerId: `r${r}_p2`, username: `R${r} P2`, avatar: '2', isBot: false, isConnected: true, isReady: true },
          { seat: 2, playerId: `r${r}_p3`, username: `R${r} P3`, avatar: '3', isBot: false, isConnected: true, isReady: true },
          { seat: 3, playerId: `r${r}_p4`, username: `R${r} P4`, avatar: '4', isBot: false, isConnected: true, isReady: true },
        ],
      });
      engine.startMatch();
      engines.push(engine);
    }

    // 2. Simulate concurrent gameplay across all 50 rooms
    for (let round = 0; round < 25; round++) {
      for (let r = 0; r < NUM_ROOMS; r++) {
        const engine = engines[r];
        if (engine.getStatus() === 'ROUND_FINISHED') {
          engine.nextRound();
        }

        if (engine.getStatus() === 'PLAYING') {
          const seat = engine.getCurrentTurnSeat();
          const legalMoves = engine.getLegalMovesForSeat(seat);

          const t0 = performance.now();
          if (legalMoves.length > 0) {
            const move = legalMoves[0];
            const res = engine.playTile(seat, move.tile, move.validEnds[0]);
            if (!res.success) totalErrors++;
          } else {
            const res = engine.passTurn(seat);
            if (!res.success) totalErrors++;
          }
          const t1 = performance.now();

          latencies.push(t1 - t0);
          totalActions++;
        }
      }
    }

    const endTime = performance.now();
    const durationMs = endTime - startTime;
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryUsedMb = Math.round((finalMemory - initialMemory) / (1024 * 1024) * 100) / 100;

    // Calculate Latency Metrics
    latencies.sort((a, b) => a - b);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95Latency = latencies[Math.floor(latencies.length * 0.95)];
    const p99Latency = latencies[Math.floor(latencies.length * 0.99)];
    const throughputPerSec = Math.round((totalActions / (durationMs / 1000)) * 100) / 100;

    console.log(`\n======================================================`);
    console.log(`📊 BAFFA ACTUAL LOAD PERFORMANCE TEST RESULTS:`);
    console.log(`------------------------------------------------------`);
    console.log(`- Concurrent Rooms Simulated: ${NUM_ROOMS}`);
    console.log(`- Total Actions Executed:     ${totalActions}`);
    console.log(`- Errors / Dropouts:          ${totalErrors}`);
    console.log(`- Total Duration:             ${Math.round(durationMs)} ms`);
    console.log(`- Throughput:                 ${throughputPerSec} actions/sec`);
    console.log(`- Average Engine Latency:     ${avgLatency.toFixed(3)} ms`);
    console.log(`- p95 Latency:                ${p95Latency.toFixed(3)} ms`);
    console.log(`- p99 Latency:                ${p99Latency.toFixed(3)} ms`);
    console.log(`- Heap Delta:                 ${memoryUsedMb} MB`);
    console.log(`======================================================\n`);

    assert.strictEqual(totalErrors, 0);
    assert.ok(avgLatency < 5.0, 'Average latency should be below 5ms');
    assert.ok(p95Latency < 10.0, 'p95 latency should be below 10ms');
  });
});
