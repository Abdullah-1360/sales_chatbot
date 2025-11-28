const io = require('socket.io-client');

console.log('🔌 Connecting to WebSocket...');

const socket = io('http://localhost:3001', {
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  console.log('✅ Connected to WebSocket');
  console.log('   Socket ID:', socket.id);
  console.log('');
  console.log('👂 Listening for new_lead events...');
  console.log('   (Create a lead to test)');
  console.log('');
});

socket.on('new_lead', (data) => {
  console.log('');
  console.log('🔔 NEW LEAD EVENT RECEIVED!');
  console.log('📦 Raw data:', JSON.stringify(data, null, 2));
  console.log('');
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
});

socket.on('disconnect', (reason) => {
  console.log('⚠️  Disconnected:', reason);
});

console.log('');
console.log('Press Ctrl+C to exit');
console.log('');
