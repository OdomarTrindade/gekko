// 
// The fetcher is responsible for fetching new 
// market data at the exchange on interval. It will emit
// the following events:
// 
// - `trades batch` - all new trades.
// - `trade` - the most recent trade after every fetch

var _ = require('lodash');
var moment = require('moment');
var utc = moment.utc;
var util = require(__dirname + '/../util');

var log = require(util.dirs().core + 'log');

var exchangeChecker = require(util.dirs().core + 'exchangeChecker');
var TradeBatcher = require(util.dirs().core + 'tradeBatcher');

var Fetcher = function(config) {

  var provider = config.exchange.toLowerCase();
  var DataProvider = require(util.dirs().gekko + 'exchanges/' + provider);

  var invalid = exchangeChecker.cantMonitor(config);
  if(invalid)
    util.die(invalid);

  _.bindAll(this);

  // Create a public dataProvider object which can retrieve live 
  // trade information from an exchange.
  this.watcher = new DataProvider(config);

  this.exchange = exchangeChecker.settings(config);

  this.batcher = new TradeBatcher(this.exchange.tid);

  this.pair = [
    config.asset,
    config.currency
  ].join('/');

  log.info('Starting to watch the market:',
    this.exchange.name,
    this.pair
  );

  // if the exchange returns an error
  // we will keep on retrying until next
  // scheduled fetch.
  this.tries = 0;
  this.limit = 20; // [TODO]

  this.batcher.on('new batch', this.relayTrades);
}

util.makeEventEmitter(Fetcher);

Fetcher.prototype._fetch = function(since) {
  if(++this.tries >= this.limit)
    return;

  this.watcher.getTrades(since, this.processTrades, false);
}

Fetcher.prototype.fetch = function(since) {
  this.tries = 0;
  log.debug('Requested', this.pair ,'trade data from', this.exchange.name, '...');
  this._fetch(since);
}

Fetcher.prototype.processTrades = function(err, trades) {
  if(err) {
    log.warn(this.exhange.name, 'returned an error while fetching trades:', err);
    log.debug('refetching...');
    setTimeout(this._fetch, +moment.duration('s', 1));
    return;
  }

  // Make sure we have trades to check
  if(_.isEmpty(trades)) {
    log.debug('Trade fetch came back empty, refetching...');
    setTimeout(this.fetch, +moment.duration('s', 1));
    return;
  }

  this.batcher.write(trades);
}

Fetcher.prototype.relayTrades = function(batch) {
  this.emit('trades batch', batch);
}

module.exports = Fetcher;