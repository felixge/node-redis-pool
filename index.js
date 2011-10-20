var redis        = require('redis');
var url          = require('url');
var EventEmitter = require('events').EventEmitter;
var util         = require('util');

util.inherits(RedisPool, EventEmitter);

module.exports = new RedisPool();
module.exports.RedisPool = RedisPool;

function RedisPool() {
  EventEmitter.call(this);

  this.length       = 0;

  this._pool        = {};
  this._exclusive   = [];
  this._defaultHost = 'localhost';
  this._defaultPort = 6379;
}

RedisPool.prototype.parse = function(dsn) {
  var parsed = url.parse(dsn);
  if (parsed.protocol !== 'redis:') {
    throw new Error('RedisPool.UnknownProtocol: ' + parsed.protocol);
  }

  return {
    host       : parsed.hostname || this._defaultHost,
    port       : parsed.port || this._defaultPort,
    namespace  : (parsed.pathname)
      ? parsed.pathname.substr(1)
      : '',
  };
};

RedisPool.prototype.stringify = function(parsed) {
  return url.format({
    protocol : 'redis:',
    slashes  : true,
    hostname : parsed.host,
    port     : parsed.port,
    pathname : '/' + (parsed.namespace || ''),
  });
};

RedisPool.prototype.alloc = function(dsn, options) {
  var parsed = this.parse(dsn);
  this.emit('log', 'Alloc: ' + dsn + ' (' + JSON.stringify(options) + ')');

  return (options && options.exclusive)
    ? this._allocExclusive(parsed)
    : this._allocInPool(parsed);
};

RedisPool.prototype._createClient = function(parsedDsn) {
  return redis.createClient(parsedDsn.port, parsedDsn.host);
};

RedisPool.prototype._allocExclusive = function(parsedDsn) {
  var client = this._createClient(parsedDsn)
  this._exclusive.push(client);
  this.length++;

  return client;
};

RedisPool.prototype._allocInPool = function(parsedDsn) {
  var key = [parsedDsn.host, parsedDsn.port].join(':');
  var ref = this._pool[key];

  if (ref) {
    ref.count++;
    return ref.client;
  }

  this.length++;
  this._pool[key] = ref = {
    count  : 1,
    client : this._createClient(parsedDsn),
  };

  return ref.client;
};

RedisPool.prototype.free = function(client, cb) {
  if (this._freePoolClient(client)) return;
  if (this._freeExclusiveClient(client)) return;

  var err = new Error('RedisPool.FreeError: Cannot free unknown client.');
  err.client = client;
  throw err;
};

RedisPool.prototype._freePoolClient = function(client) {
  var matchingRef;
  for (var key in this._pool) {
    var ref = this._pool[key];
    if (ref.client === client) {
      matchingRef = ref;
      break;
    }
  }

  if (!matchingRef) return false;

  if (!--matchingRef.count) {
    delete this._pool[key];
    ref.client.quit();
    this.length--;
  }

  return true;
};

RedisPool.prototype._freeExclusiveClient = function(client) {
  var index = this._exclusive.indexOf(client);
  if (index === -1) return false;

  this._exclusive.slice(index, 1);
  client.quit();
  this.length--;

  return true;
};

RedisPool.prototype.inspect = function() {
  var exclusive = this._exclusive.map(this.stringify.bind(this));
  var pool = [];
  for (var key in this._pool) {
    var ref = this._pool[key];
    pool.push({dsn: this.stringify(ref.client), count: ref.count});
  }

  return '<' + this.constructor.name + ' ' + util.inspect({
    length    : this.length,
    pool      : pool,
    exclusive : exclusive,
  }) + '>';
};
