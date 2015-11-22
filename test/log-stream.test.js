/*
 * log-stream.test.js: Tests for instances of the winston Logger
 *
 * (C) 2010 Charlie Robbins
 * MIT LICENSE
 *
 */

'use strict';

var assume = require('assume'),
    path = require('path'),
    stream = require('stream'),
    util = require('util'),
    isStream = require('isstream'),
    stdMocks = require('std-mocks'),
    winston = require('../lib/winston'),
    LegacyTransport = require('./mocks/legacy-transport'),
    TransportStream = require('../lib/winston/transport-stream'),
    format = require('../lib/winston/formats/format');

describe('LogStream', function () {
  it('new LogStream()', function () {
    var logger = new winston.LogStream();
    assume(logger).is.an('object');
    assume(isStream(logger.format));
    assume(logger.level).equals('info');
    assume(logger.exitOnError).equals(true);
  });

  it('new LogStream({ parameters })', function () {
    var myFormat = format(function (info, opts) {
      return info;
    })();

    var logger = new winston.LogStream({
      format: myFormat,
      level: 'error',
      exitOnError: false,
      transports: []
    });

    assume(logger.format).equals(myFormat);
    assume(logger.level).equals('error');
    assume(logger.exitOnError).equals(false);
    assume(logger._readableState.pipesCount).equals(0);
  });

  it('.add(LegacyTransport)', function () {
    stdMocks.use();
    var logger = new winston.LogStream();
    var transport = new LegacyTransport();
    logger.add(transport);
    stdMocks.restore();
    var output = stdMocks.flush();

    assume(logger._readableState.pipesCount).equals(1);
    assume(logger._readableState.pipes.transport).is.an('object');
    assume(logger._readableState.pipes.transport).equals(transport);
    assume(output.stderr).deep.equals(['legacy-test is a Legacy winston transport. Consider upgrading\n']);
  });

  it('.add(LegacyTransport) multiple', function () {
    stdMocks.use();
    var logger = new winston.LogStream({
      transports: [
        new LegacyTransport(),
        new LegacyTransport(),
        new LegacyTransport()
      ]
    });

    stdMocks.restore();
    var output = stdMocks.flush();

    assume(logger._readableState.pipesCount).equals(3);
    var errorMsg = 'legacy-test is a Legacy winston transport. Consider upgrading\n';
    assume(output.stderr).deep.equals([errorMsg, errorMsg, errorMsg]);
  });

  it('.add({ invalid Transport })', function () {
    var logger = new winston.LogStream();
    assume(function () {
      logger.add(5);
    }).throws(/invalid transport/i);
  });

  it('.add(TransportStream)', function (done) {
    var logger = new winston.LogStream();
    var expected = { msg: 'foo', level: 'info' };
    var transport = new TransportStream({
      log: function (info) {
        assume(info.msg).equals('foo');
        assume(info.level).equals('info');
        assume(info.raw).equals(JSON.stringify({ msg: 'foo', level: 'info' }));
        done();
      }
    });

    logger.add(transport);
    logger.log(expected);
  });

  it('.configure()', function () {
    var logger = new winston.LogStream({
      transports: [new winston.transports.Console()]
    });

    assume(logger.transports.length).equals(1);
    assume(logger.transports[0].name).equals('console');

    logger.configure();

    assume(logger.transports.length).equals(0);
  });

  it('.configure({ transports })', function () {
    var logger = new winston.LogStream();

    assume(logger.transports.length).equals(0);

    logger.configure({
      transports: [new winston.transports.Console()]
    });

    assume(logger.transports.length).equals(1);
    assume(logger.transports[0].name).equals('console');
  });

  it('.configure({ transports, format })', function () {
    var logger = new winston.LogStream(),
        readable = logger._onReadableFormat,
        format = logger.format;

    assume(logger.transports.length).equals(0);

    logger.configure({
      transports: [new winston.transports.Console()],
      format: winston.format.json()
    });

    var listeners = logger.format.listeners('readable');

    assume(logger.transports.length).equals(1);
    assume(logger.transports[0].name).equals('console');
    assume(logger.format).not.equals(format);
    assume(listeners.length).equals(1);
    assume(listeners).not.includes(readable);
  });


  it('.remove() [transport not added]', function () {
    var transports = [
      new (winston.transports.Console)(),
      new (winston.transports.File)({ filename: path.join(__dirname, 'fixtures', 'logs', 'filelog.log' )})
    ];

    var logger = new (winston.LogStream)({ transports: transports })
      .remove(new winston.transports.Console());

    assume(logger.transports.length).equals(2);
    assume(logger.transports.map(function (wrap) {
      // Unwrap LegacyTransportStream instances
      return wrap.transport || wrap;
    })).deep.equals(transports);
  });

  it('.remove() [TransportStream]', function () {
    var transports = [
      new (winston.transports.Console)(),
      new (winston.transports.File)({ filename: path.join(__dirname, 'fixtures', 'logs', 'filelog.log' )})
    ];

    var logger = new (winston.LogStream)({ transports: transports });

    assume(logger.transports.length).equals(2);
    logger.remove(transports[0]);
    assume(logger.transports.length).equals(1);
    assume(logger.transports[0]).equals(transports[1]);
  });

  it('.remove() [LegacyTransportStream]', function () {
    var transports = [
      new (winston.transports.Console)(),
      new (LegacyTransport)()
    ];

    var logger = new (winston.LogStream)({ transports: transports });

    assume(logger.transports.length).equals(2);
    logger.remove(transports[1]);
    assume(logger.transports.length).equals(1);
    assume(logger.transports[0]).equals(transports[0]);
  });

  it('.clear() [no transports]', function () {
    var logger = new (winston.LogStream)();
    assume(logger.transports.length).equals(0);
    logger.clear();
    assume(logger.transports.length).equals(0);
  });

  it ('.clear() [transports]', function () {
    var logger = new (winston.LogStream)({
      transports: [new (winston.transports.Console)()]
    });

    assume(logger.transports.length).equals(1);
    logger.clear();
    assume(logger.transports.length).equals(0);
  });
});

describe('LogStream (multiple transports of the same type)', function () {
  var logger, transports;

  before(function () {
    transports = [
      new (winston.transports.File)({
        name: 'filelog-info.log',
        filename: path.join(__dirname, 'fixtures', 'logs', 'filelog-info.log'),
        level: 'info'
      }),
      new (winston.transports.File)({
        name: 'filelog-error.log',
        filename: path.join(__dirname, 'fixtures', 'logs', 'filelog-error.log'),
        level: 'error'
      })
    ];

    logger = new (winston.LogStream)({
      transports: transports
    });
  });

  it('should have both transports', function () {
    assume(logger.transports.length).equals(2);
    assume(logger.transports.map(function (wrap) {
      return wrap.transport || wrap;
    })).deep.equals(transports);
  });

  it('.remove() of one transport', function () {
    logger.remove(transports[0]);
    assume(logger.transports.length).equals(1);
    assume(logger.transports[0]).equals(transports[1]);
  });
});

describe('LogStream (levels)', function () {
  it('report unknown levels', function () {
    stdMocks.use();
    var logger = new winston.LogStream();
    var expected = { msg: 'foo', level: 'bar' };
    logger.log(expected);

    stdMocks.restore();
    var output = stdMocks.flush();

    assume(output.stderr).deep.equals(['Unknown logger level: bar\n']);
  });

  it('default levels', function (done) {
    var logger = new winston.LogStream();
    var expected = {msg: 'foo', level: 'info'};

    function logLevelTransport(level) {
      return new TransportStream({
        level: level,
        log: function (obj) {
          if (level === 'debug') {
            assume(obj).equals(undefined, 'Transport on level debug should never be called');
          }

          assume(obj.msg).equals('foo');
          assume(obj.level).equals('info');
          assume(obj.raw).equals(JSON.stringify({msg: 'foo', level: 'info'}));
          done();
        }
      });
    }

    assume(logger.info).is.a('function');
    assume(logger.debug).is.a('function');

    logger
      .add(logLevelTransport('info'))
      .add(logLevelTransport('debug'))
      .log(expected);
  });

  it('custom levels', function (done) {
    var logger = new winston.LogStream({
      levels: {
        missing: 0,
        bad:     1,
        test:    2
      }
    });

    var expected = { msg: 'foo', level: 'missing' };
    function logLevelTransport(level) {
      return new TransportStream({
        level: level,
        log: function (obj) {
          if (level === 'test') {
            assume(obj).equals(undefined, 'transport on level test should never be called');
          }

          assume(obj.msg).equals('foo');
          assume(obj.level).equals('missing');
          assume(obj.raw).equals(JSON.stringify({msg: 'foo', level: 'missing'}));
          done();
        }
      });
    }

    assume(logger.missing).is.a('function');
    assume(logger.bad).is.a('function');
    assume(logger.test).is.a('function');

    logger
      .add(logLevelTransport('test'))
      .add(logLevelTransport('missing'))
      .log(expected);
  });
});

describe('LogStream (profile, startTimer)', function (done) {
  it('profile(id, info)', function (done) {
    var writeable = new stream.Writable({
      objectMode: true,
      write: function (info) {
        assume(info).is.an('object'),
        assume(info.something).equals('ok');
        assume(info.level).equals('info');
        assume(info.durationMs).is.a('number');
        assume(info.message).equals('testing1');
        assume(info.raw).is.a('string');
        done();
      }
    });

    var logger = new winston.LogStream({
      transports: [new winston.transports.Stream({ stream: writeable })]
    });

    logger.profile('testing1');
    setTimeout(function () {
      logger.profile('testing1', {
        something: 'ok',
        level: 'info'
      })
    }, 100);
  });

  it('startTimer()', function (done) {
    var writeable = new stream.Writable({
      objectMode: true,
      write: function (info) {
        assume(info).is.an('object'),
        assume(info.something).equals('ok');
        assume(info.level).equals('info');
        assume(info.durationMs).is.a('number');
        assume(info.message).equals('testing1');
        assume(info.raw).is.a('string');
        done();
      }
    });

    var logger = new winston.LogStream({
      transports: [new winston.transports.Stream({ stream: writeable })]
    });

    var timer = logger.startTimer();
    setTimeout(function () {
      timer.done({
        message: 'testing1',
        something: 'ok',
        level: 'info'
      });
    }, 100);
  });
});
