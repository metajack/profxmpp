var Referee = {
    connection: null,

    games: {},
    waiting: [],
    presence: {},

    NS_TOETEM: "http://metajack.im/ns/toetem",
    NS_MUC: "http://jabber.org/protocol/muc",
    NS_MUC_USER: "http://jabber.org/protocol/muc#user",
    NS_MUC_OWNER: "http://jabber.org/protocol/muc#owner",

    MUC_SERVICE: 'conference.jabber.org',
    
    is_waiting: function (jid) {
        var bare_jid = Strophe.getBareJidFromJid(jid);

        var i;
        for (i = 0; i < Referee.waiting.length; i++) {
            var wjid = Strophe.getBareJidFromJid(Referee.waiting[i]);
            if (wjid === bare_jid) {
                return true;
            }
        }

        return false;
    },

    is_playing: function (jid) {
        var bare = Strophe.getBareJidFromJid(jid);

        var found = false;
        $.each(Referee.games, function () {
            if (Strophe.getBareJidFromJid(this.x_player) === jid ||
                Strophe.getBareJidFromJid(this.o_player) === jid) {
                found = true;
               return false;
            }
        });

        return found;
    },

    remove_waiting: function (jid) {
        var bare_jid = Strophe.getBareJidFromJid(jid);

        var i;
        for (i = 0; i < Referee.waiting.length; i++) {
            var wjid = Strophe.getBareJidFromJid(Referee.waiting[i]);
            if (wjid === bare_jid) {
                break;
            }
        }

        if (i < Referee.waiting.length) {
            Referee.waiting.splice(i, 1);

            Referee.broadcast(function (msg) {
                return msg.c('not-waiting', {xmlns: Referee.NS_TOETEM})
                    .c('player', {jid: jid});
            });

            $('#log').prepend("<p>Removed " + bare_jid + " from " +
                              "waiting list</p>");
        }
    },

    send_error: function (iq, etype, ename, app_error) {
        var error = $iq({to: $(iq).attr('from'),
                         id: $(iq).attr('id'),
                         type: 'error'})
            .cnode(iq.cloneNode(true)).up()
            .c('error', {type: etype})
            .c(ename, {xmlns: Strophe.NS.STANZAS}).up();

        if (app_error) {
            error.c(app_error, {xmlns: Referee.NS_TOETEM});
        }
        
        Referee.connection.send(error);
    },

    on_presence: function (pres) {
        var from = $(pres).attr('from');
        var bare_from = Strophe.getBareJidFromJid(from);
        var type = $(pres).attr('type');
        var bare_jid = Strophe.getBareJidFromJid(Referee.connection.jid);
        var domain = Strophe.getDomainFromJid(from);

        if (domain === Referee.MUC_SERVICE) {
            // handle room presence
            var room = Strophe.getNodeFromJid(from);
            var player = Strophe.getResourceFromJid(from);
            var game = Referee.games[room];

            // make sure it's a game and player we care about
            if (game && 
                (game.status === 'starting' || game.status === 'playing') &&
                (player === game.x_player || player === game.o_player)) {
                if (game.status === 'starting') {
                    if (type !== 'unavailable') {
                        // waiting for one less player; if both are
                        // now present, the game is started
                        game.waiting -= 1;
                        
                        $('#log').prepend("<p>Player " + bare_from +
                                          " arrived to game " + game.room +
                                          ".</p>");

                        if (game.waiting === 0) {
                            Referee.start_game(game);
                        }
                    } else {
                        // one of the players left before the game even
                        // started, so abort the game
                        Referee.end_game(game, 'aborted');
                    }
                } else {
                    // during play, forfeit a player if they leave the room
                    if (type === 'unavailable') {
                        if (player === game.x_player) {
                            game.winner = game.o_player;
                        } else {
                            game.winner = game.x_player;
                        }
                        
                        Referee.end_game(game, 'finished');
                    }
                }
            } else if (game && type !== 'unavailable') {
                // handle observers joining
                var msg = $msg({to: from, type: 'chat'});
                if (game.status === 'starting') {
                    msg.c('body').t('Waiting for players...').up()
                        .c('game-state', {xmlns: Referee.NS_TOETEM,
                                          'phase': game.status,
                                          'x-player': game.x_player,
                                          'o-player': game.o_player});
                } else if (game.status === 'playing') {
                    msg.c('body').t('Game in progress.').up()
                        .c('game-state', {xmlns: Referee.NS_TOETEM,
                                          'phase': game.status,
                                          'x-player': game.x_player,
                                          'o-player': game.o_player,
                                          'pos': game.board.toString()});
                } else {
                    msg.c('body').t('Game over.').up()
                        .c('game-state', {xmlns: Referee.NS_TOETEM,
                                          'phase': 'finished',
                                          'x-player': game.x_player,
                                          'o-player': game.o_player,
                                          'pos': game.board.toString()});
                    if (game.winner) {
                        msg.attr({winner: game.winner});
                    }
                }

                Referee.connection.send(msg);

                $('#log').prepend("<p>Sent state to observer " + bare_from +
                                  " in game " + game.room + ".</p>");
            }
        } else if ((!type || type === "unavailable") && 
                   bare_from !== bare_jid) {
            // handle directed presence from players
            if (type === "unavailable") {
                delete Referee.presence[bare_from];
                
                // remove from lists
                Referee.remove_waiting(from);

                $('#log').prepend("<p>Unregistered " + bare_from + ".</p>");
            } else if ($(pres).find('register').length > 0) {
                Referee.presence[bare_from] = from;

                $('#log').prepend("<p>Registered " + bare_from + ".</p>");
                
                Referee.send_waiting(from);
                Referee.send_games(from);
            }
        }
        
        return true;
    },

    broadcast: function (func) {
        $.each(Referee.presence, function () {
            var msg = func($msg({to: this}));
            Referee.connection.send(msg);
        });
    },

    send_waiting: function (jid) {
        var msg = $msg({to: jid})
            .c('waiting', {xmlns: Referee.NS_TOETEM});

        $.each(Referee.waiting, function () {
            msg.c('player', {jid: this}).up();
        });

        Referee.connection.send(msg);
    },
    
    on_iq: function (iq) {
        var id = $(iq).attr('id');
        var from = $(iq).attr('from');
        var type = $(iq).attr('type');
        
        // make sure we know the user's presence first
        if (!Referee.presence[Strophe.getBareJidFromJid(from)]) {
            Referee.send_error(iq, 'auth', 'forbidden');
        } else {
            var child = $(iq).find('*[xmlns="' + Referee.NS_TOETEM +
                                   '"]:first');
            if (child.length > 0) {
                if (type === 'get') {
                    Referee.send_error(iq, 'cancel', 'bad-request');
                    return true;
                } else if (type !== 'set') {
                    // ignore IQ-error and IQ-result
                    return true;
                }
                
                switch (child[0].tagName) {
                case 'waiting':
                    Referee.on_waiting(id, from, child);
                    break;
                    
                case 'stop-waiting':
                    Referee.on_stop_waiting(id, from, child);
                    break;
                    
                case 'start':
                    Referee.on_game_start(iq, id, from, child);
                    break;

                case 'resign':
                    Referee.on_resign(iq, id, from);
                    break;

                case 'move':
                    Referee.on_move(iq, id, from, child);
                    break;

                default:
                    Referee.send_error(iq, 'cancel', 'bad-request');
                }
            } else {
                Referee.send_error(iq, 'cancel', 'feature-not-implemented');
            }
        }

        return true;
    },

    on_waiting: function (id, from, elem) {
        // if they were already waiting, remove them so their resource
        // can be updated
        if (Referee.is_waiting(from)) {
            Referee.remove_waiting(from);
        }

        Referee.waiting.push(from);

        Referee.connection.send($iq({to: from, id: id, type: 'result'}));

        Referee.broadcast(function (msg) {
            return msg.c('waiting', {xmlns: Referee.NS_TOETEM})
                .c('player', {jid: from});
        });

        $('#log').prepend("<p>Added " +
                          Strophe.getBareJidFromJid(from) + " to " +
                          "waiting list.</p>");
    },

    on_stop_waiting: function (id, from, elem) {
        if (Referee.is_waiting(from)) {
            Referee.remove_waiting(from);
        }

        Referee.connection.send($iq({to: from, id: id, type: 'result'}));
    },

    send_games: function (jid) {
        var msg = $msg({to: jid})
            .c('games', {xmlns: Referee.NS_TOETEM});

        $.each(Referee.games, function (room) {
            msg.c('game', {'x-player': this.x_player,
                           'o-player': this.o_player,
                           'room': Referee.game_room(room)}).up();
        });

        Referee.connection.send(msg);
    },

    new_game: function () {
        return {
            room: null,
            board: new Referee.Board(),
            waiting: 2,
            status: 'starting',
            x_player: null,
            o_player: null,
            winner: null
        };
    },

    on_game_start: function (iq, id, from, elem) {
        var with_jid = elem.attr('with');
        var with_bare = Strophe.getBareJidFromJid(with_jid);

        // check that the players are available
        if (!Referee.is_waiting(with_jid)) {
            Referee.send_error(iq, 'modify', 'item-not-found');
            return;
        }

        if (Referee.is_playing(with_jid) ||
            Referee.is_playing(from)) {
            Referee.send_error(iq, 'cancel', 'not-allowed');
            return;
        }

        Referee.connection.send($iq({to: from, id: id, type: 'result'}));

        // remove players from waiting list
        Referee.remove_waiting(from);
        Referee.remove_waiting(with_jid);

        // create game room and invite players
        Referee.create_game(from, with_jid);
    },

    create_game: function (player1, player2) {
        // generate a random room name, and make sure it
        // doesn't already exist to our knowledge
        var room;
        do {
            room = "" + Math.floor(Math.random() * 1000000);
        } while (Referee.games[room]);

        var room_jid = room + "@" + Referee.MUC_SERVICE + "/Referee";
        Referee.connection.addHandler(function (presence) {
            var game;

            if ($(presence).find('status[code="201"]').length > 0) {
                // room was freshly created
                game = Referee.new_game();
                game.room = room;

                // create initial game state with randomized sides
                if (Math.random() < 0.5) {
                    game.x_player = player1;
                    game.o_player = player2;
                    Referee.games[room] = game;
                } else {
                    game.x_player = player2;
                    game.o_player = player1;
                    Referee.games[room] = game;
                }

                // invite players to start the game
                Referee.invite_players(game);

                // notify everyone about the game
                Referee.broadcast(function (msg) {
                    return msg.c('games', {xmlns: Referee.NS_TOETEM})
                        .c('game', {'x-player': game.x_player,
                                    'o-player': game.o_player,
                                    'room': Referee.game_room(room)});
                });

                $('#log').prepend("<p>Created game room " + room + ".</p>");
            } else {
                // room was already in use, we need to start over
                Referee.connection.send(
                    $pres({to: room_jid, type: 'unavailable'}));
                Referee.create_game(player1, player2);
            }

            return false;
        }, null, "presence", null, null, room_jid);
        
        Referee.connection.send(
            $pres({to: room_jid})
                .c("x", {xmlns: Referee.NS_MUC}));
    },
    
    invite_players: function (game) {
        // send room invites
        $.each([game.x_player, game.o_player], function () {
            Referee.connection.send(
                $msg({to: game.room + "@" + Referee.MUC_SERVICE})
                    .c('x', {xmlns: Referee.NS_MUC_USER})
                    .c('invite', {to: this}));
        });
    },

    game_room: function (room) {
        return room + "@" + Referee.MUC_SERVICE;
    },

    muc_msg: function (game) {
        return $msg({to: Referee.game_room(game.room), type: "groupchat"});
    },

    start_game: function (game) {
        game.status = 'playing';
        Referee.connection.send(
            Referee.muc_msg(game)
                .c('body').t('The match has started.').up()
                .c('game-started', {xmlns: Referee.NS_TOETEM,
                                    'x-player': game.x_player,
                                    'o-player': game.o_player}));

        $('#log').prepend("<p>Started game " + game.room + ".</p>");
    },

    end_game: function (game, status) {
        game.status = status;

        // let room know the result of the game
        var attrs = {xmlns: Referee.NS_TOETEM};
        if (game.winner) {
            attrs.winner = game.winner;
        }

        var msg = "";
        if (game.winner) { 
            msg += Strophe.getBareJidFromJid(game.winner) +
                " has won the match."
        } else if (status === 'finished') {
            msg += "The match was tied.";
        } else {
            msg += "The match was aborted.";
        }

        Referee.connection.send(
            Referee.muc_msg(game)
                .c('body').t(msg).up()
                .c('game-ended', attrs));

        // delete the game
        delete Referee.games[game.room];

        // leave the room
        Referee.connection.send(
            $pres({to: game.room + "@" + Referee.MUC_SERVICE + "/Referee",
                   type: "unavailable"}));

        // notify all the players
        Referee.broadcast(function (msg) {
            return msg.c('game-over', {xmlns: Referee.NS_TOETEM})
                .c('game', {'x-player': game.x_player,
                            'o-player': game.o_player,
                            'room': Referee.game_room(game.room)});
        });

        $('#log').prepend("<p>Finished game " + game.room + ".</p>");
    },

    find_game: function (player) {
        var game = null;
        $.each(Referee.games, function (r, g) {
            if (g.x_player === player || g.o_player === player) {
                game = g;
                return false;
            }
        });

        return game;
    },

    on_resign: function (iq, id, from) {
        var game = Referee.find_game(from);
        if (!game || game.status === 'finished' ||
            game.status === 'aborted' ||
            game.status === 'starting' ) {
            Referee.send_error(iq, 'cancel', 'bad-request');
        } else {
            if (from === game.x_player) {
                game.winner = game.o_player;
            } else {
                game.winner = game.x_player;
            }

            Referee.end_game(game, 'finished');

            Referee.connection.send($iq({to: from, id: id, type: 'result'}));

            $('#log').prepend("<p>" + Strophe.getBareJidFromJid(from) +
                              " resigned game " + game.room + ".</p>");
        }
    },

    on_move: function (iq, id, from, elem) {
        var game = Referee.find_game(from);
        var row = elem.attr('row');
        var col = elem.attr('col');

        if (!game) {
            Referee.send_error(iq, 'cancel', 'not-allowed');
        } else if (!row || !col) {
            Referee.send_error(iq, 'modify', 'bad-request');
        } else if (!game || game.status !== 'playing' ||
                   (game.board.currentSide() === 'x' &&
                    from === game.o_player) ||
                   (game.board.currentSide() === 'o' &&
                    from === game.x_player)) {
            Referee.send_error(iq, 'wait', 'unexpected-request');
        } else {
            var side = null;
            if (from === game.x_player) {
                side = 'x';
            } else {
                side = 'o';
            }

            try {
                game.board.move(side, col, row);
                
                Referee.connection.send(
                    $iq({to: from, id: id, type: 'result'}));

                Referee.connection.send(
                    Referee.muc_msg(game)
                        .c('body').t(
                            Strophe.getBareJidFromJid(from) +
                                ' has placed an ' + side + ' at ' +
                                col + row).up()
                        .c('move', {xmlns: Referee.NS_TOETEM,
                                    col: col,
                                    row: row}));

                $('#log').prepend("<p>" + Strophe.getBareJidFromJid(from) +
                                  " moved in game " + game.room + ".</p>");

                // check for end of game
                var winner = game.board.gameOver();
                if (winner) {
                    if (winner === 'x') {
                        game.winner = game.x_player;
                    } else if (winner === 'o') {
                        game.winner = game.o_player;
                    }

                    Referee.end_game(game, 'finished');
                }
            } catch (e) {
                Referee.send_error(iq, 'cancel', 'not-acceptable');
            }
        }
    }
};

$(document).ready(function () {
    $('#login_dialog').dialog({
        autoOpen: true,
        draggable: false,
        modal: true,
        title: 'Connect to XMPP',
        buttons: {
            "Connect": function () {
                $(document).trigger('connect', {
                    jid: $('#jid').val().toLowerCase(),
                    password: $('#password').val()
                });
                
                $('#password').val('');
                $(this).dialog('close');
            }
        }
    });
});

$(document).bind('connect', function (ev, data) {
    var conn = new Strophe.Connection(
        "http://bosh.metajack.im:5280/xmpp-httpbind");

    conn.connect(data.jid, data.password, function (status) {
        if (status === Strophe.Status.CONNECTED) {
            $(document).trigger('connected');
        } else if (status === Strophe.Status.DISCONNECTED) {
            $(document).trigger('disconnected');
        }
    });

    Referee.connection = conn;
});

$(document).bind('connected', function () {
    var conn = Referee.connection;

    $('#log').prepend("<p>Connected as " + conn.jid + "</p>");

    conn.addHandler(Referee.on_presence, null, "presence");
    conn.addHandler(Referee.on_iq, null, "iq");
    
    conn.send($pres());
});
