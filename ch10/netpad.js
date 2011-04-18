var NetPad = {
    connection: null,
    collaborator: null,
    NS_NETPAD: 'http://metajack.im/ns/netpad',
    master: null,
    
    on_disco_info: function (iq) {
        NetPad.connection.sendIQ(
            $iq({to: $(iq).attr('from'),
                 id: $(iq).attr('id'),
                 type: "result"})
                .c('query', {xmlns: Strophe.NS.DISCO_INFO})
                .c('identity', {category: 'client',
                                type: 'pc'}).up()
                .c('feature', {'var': NetPad.NS_NETPAD}));

        return true;
    },

    on_collaborate: function (presence) {
        var from = $(presence).attr('from');

        if (NetPad.collaborator) {
            // we already have a collaborator
            NetPad.connection.send(
                $pres({to: from, type: 'error'})
                    .c('error', {type: 'wait'})
                    .c('recipient-unavailable', {xmlns: Strophe.NS.STANZAS})
                    .up()
                    .c('already-collaborating', {xmlns: NetPad.NS_NETPAD}));
        } else {
            NetPad.collaborator = from;

            NetPad.start_collaboration(true);
        }

        return true;
    },

    start_collaboration: function () {
        $('#status')
            .text('Collaborating with ' + NetPad.collaborator + '.')
            .attr('class', 'collab');

        $('#input').removeAttr('disabled');

        var buffer = $('#pad').val();
        OpTrans.init([NetPad.connection.jid, NetPad.collaborator],
                     buffer,
                     NetPad.update_pad);

        if (NetPad.master) {
            // set up and send initial collaboration state
            var msg = $msg({to: NetPad.collaborator, type: 'chat'})
                .c('start', {xmlns: NetPad.NS_NETPAD});
            if (buffer) {
                msg.t(buffer);
            }

            NetPad.connection.send(msg);
        } else {
            $('#pad').removeAttr('disabled');
        }
    },

    on_message: function (message) {
        var from = $(message).attr('from');

        if (NetPad.collaborator === from) {
            var collab = $(message)
                .find('*[xmlns="' + NetPad.NS_NETPAD + '"]');
            if (collab.length > 0) {
                if (NetPad.master) {
                    NetPad.process_op(collab);
                } else {
                    var command = collab[0].tagName;
                    if (command === "start") {
                        $('#pad').val(collab.text());
                        NetPad.start_collaboration();
                    } else if (command === "stop") {
                        NetPad.stop_collaboration();
                    } else {
                        NetPad.process_op(collab);
                    }
                }
            } else {
                // add regular message to the chat
                var body = $(message).find('body').text();
                $('#chat').append("<div class='message'>" +
                                  "&lt;<span class='nick'>" +
                                  Strophe.getBareJidFromJid(from) +
                                  "</span>&gt; " +
                                  "<span class='message'>" +
                                  body +
                                  "</span>" +
                                  "</div>");
                NetPad.scroll_chat();
            }
        }

        return true;
    },

    stop_collaboration: function (notify) {
        $('#status')
            .text('Not collaborating.')
            .attr('class', 'no-collab');

        $('#input').attr('disabled', 'disabled');

        if (notify) {
            NetPad.connection.send(
                $msg({to: NetPad.collaborator, type: 'chat'})
                    .c('stop', {xmlns: NetPad.NS_NETPAD}));
        }
    },

    on_unavailable: function (presence) {
        var from = $(presence).attr('from');

        if (from === NetPad.collaborator) {
            NetPad.stop_collaboration();
        }

        return true;
    },

    scroll_chat: function () {
        var chat = $('#chat').get(0);
        chat.scrollTop = chat.scrollHeight;
    },

    update_pad: function (buffer, remote) {
        var old_pos = $('#pad')[0].selectionStart;
        var old_buffer = $('#pad').val();
        $('#pad').val(buffer);
        
        if (buffer.length > old_buffer.length && !remote) {
            old_pos += 1;
        }

        $('#pad')[0].selectionStart = old_pos;
        $('#pad')[0].selectionEnd = old_pos;
    },

    send_op: function (op, pos, chr) {
        var req = OpTrans.do_local(op, pos, chr);

        var op_attrs = {xmlns: NetPad.NS_NETPAD,
                        name: op,
                        pos: pos};
        if (chr) {
            op_attrs['char'] = chr;
        }

        var msg = $msg({to: NetPad.collaborator, type: 'chat'})
            .c('op', op_attrs)
            .c('state');

        var i;
        for (i = 0; i < req[1].length; i++) {
            msg.c('cell').t('' + req[1][i]).up();
        }

        msg.up().c('priority');
        for (i = 0; i < req[3].length; i++) {
            msg.c('cell').t('' + req[3][i]).up();
        }

        NetPad.connection.send(msg);
    },

    process_op: function (op) {
        var name = op.attr('name');
        var pos = parseInt(op.attr('pos'), 10);
        var chr = op.attr('char');
        var pri = [];
        var state = [];
        
        op.find('state > cell').each(function () {
            state.push(parseInt($(this).text(), 10));
        });

        op.find('priority > cell').each(function () {
            pri.push(parseInt($(this).text(), 10));
        });
        
        OpTrans.do_remote(NetPad.collaborator,
                          state,
                          name, pos, chr,
                          pri);
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
                    password: $('#password').val(),
                    collaborator: $('#collaborator').val().toLowerCase()
                });

                $('#password').val('');
                $(this).dialog('close');
            }
        }
    });

    $('#disconnect').click(function () {
        if (NetPad.collaborator) {
            NetPad.stop_collaboration(true);
        }

        $('#disconnect').attr('disabled', 'disabled');
        
        NetPad.connection.disconnect();
    });

    $('#input').keypress(function (ev) {
        if (ev.which === 13) {
            ev.preventDefault();

            var body = $(this).val();
            $('#chat').append("<div class='message'>" +
                              "&lt;<span class='nick self'>" +
                              Strophe.getBareJidFromJid(
                                  NetPad.connection.jid) +
                              "</span>&gt; " +
                              "<span class='message'>" +
                              body +
                              "</span>" +
                              "</div>");

            NetPad.connection.send(
                $msg({to: NetPad.collaborator, type: 'chat'})
                    .c('body').t(body));
            
            $(this).val('');
        }
    });

    $('#pad').keypress(function (ev) {
        if (NetPad.collaborator) {
            var idx = this.selectionStart;
            var handled = true;
            if (ev.which === 8) {
                this.selectionStart = idx - 1;
                this.selectionEnd = idx - 1;
                NetPad.send_op('delete', idx - 1);
            } else if (ev.which === 46) {
                NetPad.send_op('delete', idx);
            } else if ((ev.which >= 32 && ev.which <= 127) ||
                       ev.which >= 256) {
                NetPad.send_op('insert', idx, String.fromCharCode(ev.which));
            }
            
            ev.preventDefault();
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

    NetPad.connection = conn;
    NetPad.collaborator = data.collaborator || null;
});

$(document).bind('connected', function () {
    $('#disconnect').removeAttr('disabled');

    NetPad.connection.addHandler(NetPad.on_message, null, "message");

    if (NetPad.collaborator) {
        NetPad.master = false;

        $('#status')
            .text('Checking feature support for ' + NetPad.collaborator + '.')
            .attr('class', 'try-collab');
        
        // check for feature support
        NetPad.connection.sendIQ(
            $iq({to: NetPad.collaborator, type: 'get'})
                .c('query', {xmlns: Strophe.NS.DISCO_INFO}),
            function (iq) {
                var f = $(iq).find(
                    'feature[var="' + NetPad.NS_NETPAD + '"]');

                if (f.length > 0) {
                    $('#status')
                        .text('Establishing session with ' + 
                              NetPad.collaborator + '.')
                        .attr('class', 'try-collab');

                    NetPad.connection.send(
                        $pres({to: NetPad.collaborator})
                            .c('collaborate', {xmlns: NetPad.NS_NETPAD}));
                } else {
                    $('#status')
                        .text('Collaboration not supported with ' +
                              NetPad.collaborator + '.')
                        .attr('class', 'no-collab');

                    NetPad.connection.disconnect();
                }
            });
    } else {
        NetPad.master = true;

        $('#pad').removeAttr('disabled');

        // handle incoming discovery and collaboration requests
        NetPad.connection.addHandler(NetPad.on_disco_info,
                                     Strophe.NS.DISCO_INFO, "iq", "get");
        NetPad.connection.addHandler(NetPad.on_collaborate,
                                     NetPad.NS_NETPAD, "presence");
        NetPad.connection.addHandler(NetPad.on_unavailable,
                                     null, "presence");
    }
});

$(document).bind('disconnected', function () {
    NetPad.connection = null;

    $('#login_dialog').dialog('open');
});