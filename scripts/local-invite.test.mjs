// Start the app first. This only creates a disposable room on the local server.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import WebSocket from 'ws';

test('a Wi-Fi trade is confirmed only after the recipient acknowledges local storage', { timeout: 5000 }, async () => {
  const sockets = [];
  const client = async (name) => {
    const ws = new WebSocket('ws://127.0.0.1:3000/ws');
    sockets.push(ws);
    const history = [];
    ws.on('message', raw => history.push(JSON.parse(raw.toString())));
    await once(ws,'open');
    return {
      history,
      peer:{ peerId:'fixture-'+name,name,level:5,classType:'DK',x:0,z:0 },
      send: payload => ws.send(JSON.stringify(payload)),
      wait: async (type, check = () => true) => {
        const deadline = Date.now()+1500;
        while (Date.now() < deadline) {
          const hit = history.find(event => event.type === type && check(event));
          if (hit) return hit;
          await new Promise(resolve => setTimeout(resolve,15));
        }
        throw Error('Missing message '+type);
      },
    };
  };
  try {
    const owner = await client('Host'), guest = await client('Guest');
    owner.send({type:'room:create',peer:owner.peer,eventType:'free_trade',transport:'wifi'});
    const { room } = await owner.wait('room:state');
    guest.send({type:'room:join',peer:guest.peer,code:room.code,transport:'wifi'});
    await guest.wait('room:state', event => event.room.peers.length === 2);
    const offer = {type:'trade:send_item',targetPeerId:guest.peer.peerId,item:{id:'fixture-item',name:'Espada de prueba',enhanceLevel:1}};
    owner.send(offer);
    const accepted = await guest.wait('trade:received');
    owner.send({type:'trade:saved',tradeId:accepted.tradeId});
    await new Promise(resolve => setTimeout(resolve,90));
    assert(!owner.history.some(event => event.type === 'trade:confirmed'));
    // Retrying an offer must preserve its trade ID so Dexie can deduplicate it.
    owner.send(offer);
    await guest.wait('trade:received', event =>
      event.tradeId === accepted.tradeId && guest.history.filter(e => e.type === 'trade:received').length === 2);
    guest.send({type:'trade:saved',tradeId:accepted.tradeId});
    const confirmation = await owner.wait('trade:confirmed');
    assert.equal(confirmation.tradeId,accepted.tradeId);
    owner.send({type:'room:end'});
    await guest.wait('room:ended');
  } finally {
    for (const socket of sockets) socket.close();
  }
});
