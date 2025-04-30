// events.js
// This file creates a central event bus for application-wide events
const EventEmitter = require('events');

// Create a singleton event emitter for the application
const eventEmitter = new EventEmitter();

// Export the event emitter
module.exports = eventEmitter;
