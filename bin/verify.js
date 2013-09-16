var spawn = require('child_process').spawn;
var tuple = require('tuple-stream');
var through = require('through');
var split = require('split');
var path = require('path');
var coffee = require('coffee-script');

var x256 = require('x256');

var COLORS = (function () {
    var c = {
        PASS: [0,255,0],
        FAIL: [255,0,0],
        INFO: [0,255,255]
    };
    return Object.keys(c).reduce(function (acc, key) {
        acc[key] = '\x1b[38;5;' + x256(c[key]) + 'm';
        return acc;
    }, {});
})();
COLORS.RESET = '\x1b[00m';

module.exports = function (acmd, bcmd, opts) {
    var a;
    if (!opts) opts = {};

    if (coffee.helpers.isCoffee(acmd)) {
        a = spawn(__dirname + '/../node_modules/coffee-script/bin/coffee', acmd);
    }
    else {
        a = spawn(process.execPath, acmd);
    }

    if (opts.run) {
        (opts.a || a.stdout).pipe(process.stdout);
        if (a.stderr) a.stderr.pipe(process.stderr);
        return opts.a || a.stdin;
    }

    var b = spawn(process.execPath, bcmd);
    var c = compare(opts.a || a.stdout, opts.b || b.stdout, opts);

    c.on('pass', function () { kill(); tr.emit('pass') });
    c.on('fail', function () { kill(); tr.emit('fail') });

    var tr = through();
    tr.pipe(opts.a || a.stdin);
    tr.pipe(opts.b || b.stdin);

    return tr;

    function kill () {
        if (a.kill) a.kill();
        if (b.kill) b.kill();
    }
};

function compare (actual, expected, opts) {
    var equal = true;
    var output = through(write, end).pause();

    output.queue(COLORS.RESET);

    if (!opts.long) {
        output.queue(wrap('ACTUAL', 30) + '     EXPECTED\n');
        output.queue(wrap('------', 30) + '     --------\n');
    }

    tuple(actual.pipe(split()), expected.pipe(split()))
        .pipe(output)
        .pipe(process.stdout)
    ;
    output.resume();
    return output;

    function write (pair) {
        var eq = pair[0] === pair[1];
        equal = equal && eq;

        if (opts.long) {
            this.queue('ACTUAL:   '
                + COLORS[eq ? 'PASS' : 'FAIL']
                + JSON.stringify(pair[0])
                + COLORS.RESET + '\n'
                + 'EXPECTED: '
                + JSON.stringify(pair[1])
                + '\n\n'
            );
        }
        else {
            this.queue(
                COLORS[eq ? 'PASS' : 'FAIL']
                + wrap(JSON.stringify(pair[0]), 30)
                + ' ' + (eq ? '   ' : '!==') + ' '
                + wrap(JSON.stringify(pair[1]), 30)
                + '\n'
            );
        }
    }

    function end () {
        output.queue(COLORS.RESET);
        this.queue(null);
        this.emit(equal ? 'pass' : 'fail');
    }
}

function wrap (s_, n) {
    var s = String(s_);
    return s + Array(Math.max(0, n + 1 - s.length)).join(' ');
}
