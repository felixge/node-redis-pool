var RedisPool = require('./index');
var singleton = RedisPool.singleton;
var assert    = require('assert');
var noop      = function() {};
var net       = require('net');

// That's right, I do this
net.createConnection = function() {
  return new net.Stream();
};

(function testParse() {
  (function testAll() {
    var parsed = singleton.parse('redis://example.org:30/foo');
    assert.equal(parsed.host, 'example.org');
    assert.equal(parsed.port, 30);
    assert.equal(parsed.namespace, 'foo');
  })();

  (function testDefaultPort() {
    var parsed = singleton.parse('redis://localhost/');
    assert.equal(parsed.port, 6379);
  })();

  (function testDefaultHost() {
    var parsed = singleton.parse('redis://');
    assert.equal(parsed.host, 'localhost');
  })();

  (function testNoNamespace() {
    var parsed = singleton.parse('redis://foo');
    assert.equal(parsed.namespace, '');
  })();

  (function testUnknownProtocol() {
    assert.throws(function() {
      singleton.parse('http://foo/');
    }, /RedisPool.UnknownProtocol:/);
  })();
})();

(function testStringify() {
  (function testAll() {
    var dsn = singleton.stringify({host: 'example.org', port: 70, namespace: 'foo'});
    assert.equal(dsn, 'redis://example.org:70/foo');
  })();
})();

(function testAlloc() {
  (function testReturnsRedis() {
    var pool = new RedisPool();
    var client = pool.alloc('redis://localhost/');
    assert.equal(client.host, 'localhost');
  })();

  (function testAllocationPool() {
    var pool = new RedisPool();
    assert.equal(pool.length, 0);

    var a = pool.alloc('redis://localhost/');
    assert.equal(pool.length, 1);

    var b = pool.alloc('redis://localhost/');
    assert.equal(pool.length, 1);

    assert.strictEqual(a, b);

    var c = pool.alloc('redis://localhost:9003/');
    assert.equal(pool.length, 2);

    assert.notStrictEqual(a, c);
  })();

  (function testExclusive() {
    var pool = new RedisPool();
    assert.equal(pool.length, 0);

    var a = pool.alloc('redis://localhost/', {exclusive: true});
    assert.equal(pool.length, 1);

    var b = pool.alloc('redis://localhost/', {exclusive: true});
    assert.equal(pool.length, 2);

    assert.notStrictEqual(a, b);
  })();
})();

(function testFree() {
  (function testFreeNonExistingClient() {
    var pool = new RedisPool();

    assert.throws(function() {
      pool.free({});
    }, /FreeError/);
  })();

  (function testFreePoolClient() {
    var pool = new RedisPool();
    var a    = pool.alloc('redis://localhost:9003/')
    var b    = pool.alloc('redis://localhost:9003/')

    var quits = 0;
    a.quit = function() {
      quits++;
    };

    pool.free(a);
    assert.equal(pool.length, 1);
    assert.equal(quits, 0);

    pool.free(b);
    assert.equal(pool.length, 0);
    assert.equal(quits, 1);
  })();

  (function testFreeExclusiveClient() {
    var pool = new RedisPool();
    var a    = pool.alloc('redis://localhost:9003/', {exclusive: true})
    var b    = pool.alloc('redis://localhost:9003/', {exclusive: true})

    assert.equal(pool.length, 2);

    var quits = 0;
    a.quit = function() {
      quits++;
    };

    pool.free(a);
    assert.equal(pool.length, 1);
    assert.equal(quits, 1);
  })();
})();
