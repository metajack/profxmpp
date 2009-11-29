var OpTrans = {
    log: null, // the request log
    queue: null, // the request queue
    state: null, // our state vector
    jid: null, // our jid
    jid_map: null, // maps jids to positions in state vectors
    buffer: null, // the text buffer being affected by operations
    update_func: null, // callback function

    init: function (jids, buffer, update_func) {
        this.log = [];
        this.queue = [];
        this.state = [];
        this.jid_map = {};
        this.buffer = buffer.split('');
        this.jid = jids[0];
        this.update_func = update_func;

        $.each(jids.sort(), function (i) {
            OpTrans.jid_map[this] = i;
            OpTrans.state.push(0);
        });
    },

    getState: function (jid) {
    },

    do_local: function (op, pos, chr) {
        // calculate p
        var l, maxp = [];
        for (l = 0; l < this.log.length; l++) {
            if (this.log[l][4] === pos) {
                if (this.compare_priority(maxp, this.log[l][3]) == 1) {
                    maxp = this.log[l][3];
                }
            }
        }

        var p = maxp.concat(this.jid_map[this.jid]);

        // append request to queue
        var req = [this.jid_map[this.jid],
                   this.state.concat(),
                   [op, pos, chr],
                   p];
        this.queue.push(req);

        this.execute();

        return req;
    },

    do_remote: function (jid, state, op, pos, chr, pri) {
        // append request
        var req = [this.jid_map[jid], state, [op, pos, chr], pri];
        this.queue.push(req);

        this.execute();
    },

    compare_state: function (s1, s2) {
        var i, smaller = false;
        for (i = 0; i < s1.length; i++) {
            if (s1[i] > s2[i]) {
                return 1;
            } else if (s1[i] < s2[i]) {
                smaller = true;
            }
        }

        if (smaller) {
            return -1;
        }

        return 0;
    },

    compare_priority: function (p1, p2) {
        if (p1.length > p2.length) {
            return -1;
        } else if (p1.length < p2.length) {
            return 1;
        } else {
            var i;
            for (i = 0; i < p1.length; i++) {
                if (p1[i] > p2[i]) {
                    return -1;
                } else if (p1[i] < p2[i]) {
                    return 1;
                }
            }
        }
        
        return 0;
    },

    execute: function () {
        var r, cmp, new_queue = [];
        for (r = 0; r < this.queue.length; r++) {
            var remstate = this.queue[r][1];
            var cmp = this.compare_state(remstate, this.state);
            if (cmp < 1) {
                var op = this.queue[r][2];
                var orig_pos = op[1];
                if (cmp < 0) {
                    var l = -1;
                    while (l = this.find_prev(remstate, l) >= 0) {
                        var k = this.log[l][0];
                        if (remstate[k] <= this.log[l][1][k]) {
                            op = this.transform_op(op,
                                                   this.log[l][2],
                                                   this.queue[r][3],
                                                   this.log[l][3]);
                        }
                    }
                }
                
                var remote = this.queue[r][0] !== this.jid_map[this.jid];

                this.perform_op.apply(this, [remote].concat(op, orig_pos));
                this.log.push(this.queue[r].concat(orig_pos));
                this.state[this.queue[r][0]] += 1;
            } else {
                new_queue.push(this.queue[r]);
            }
        }
        
        this.queue = new_queue;
    },

    perform_op: function (remote, op, pos, chr) {
        if (op === 'insert') {
            this.buffer.splice(pos, 0, [chr]);
        } else if (op === 'delete') {
            this.buffer.splice(pos, 1);
        }

        this.update_func(this.buffer.join(''), remote);
    },

    find_prev: function (state, last_idx) {
        if (last_idx < 0) {
            last_idx = this.log.length;
        }

        var k;
        for (k = last_idx; k >= 0; k--) {
            if (this.compare_state(this.log[k][1], state) < 1) {
                break;
            }
        }

        return k;
    },

    transform_op: function (op1, op2, pri1, pri2) {
        var idx1 = op1[1];
        var idx2 = op2[1];

        if (op1[0] === 'insert' && op2[0] === 'insert') {
            if (idx1 < idx2) {
                return op1;
            } else if (idx1 > idx2) {
                return [op1[0], idx1 + 1, op1[2]];
            } else {
                if (op1[2] === op2[2]) {
                    return null;
                } else {
                    var cmp = this.compare_priority(pri1, pri2);
                    if (cmp === -1) {
                        return [op1[0], idx1 + 1, op1[2]];
                    } else {
                        return op1;
                    }
                }
            }
        } else if (op1[0] === 'delete' && op2[0] === 'delete') {
            if (idx1 < idx2) {
                return op1;
            } else if (idx1 > idx2) {
                return [op1[0], idx1 - 1, op1[2]];
            } else {
                return null;
            }
        } else if (op1[0] === 'insert' && op2[0] === 'delete') {
            if (idx1 < idx2) {
                return op1;
            } else {
                return [op1[0], idx1 - 1, op1[2]];
            }
        } else if (op2[0] === 'delete' && op2[0] === 'insert') {
            if (idx1 < idx2) {
                return op1;
            } else {
                return [op1[0], idx1 + 1, op1[2]];
            }
        }
    }
};