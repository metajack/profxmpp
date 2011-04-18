var SketchCast = {
    // drawing state
    pen_down: false,
    old_pos: null,
    color: '000',
    line_width: 4,

    // xmpp state
    connection: null,
    service: null,
    node: null,

    NS_DATA_FORMS: "jabber:x:data",
    NS_PUBSUB: "http://jabber.org/protocol/pubsub",
    NS_PUBSUB_OWNER: "http://jabber.org/protocol/pubsub#owner",
    NS_PUBSUB_ERRORS: "http://jabber.org/protocol/pubsub#errors",
    NS_PUBSUB_NODE_CONFIG: "http://jabber.org/protocol/pubsub#node_config",

    // pubsub event handler
    on_event: function (msg) {
        if ($(msg).find('x').length > 0) {
            var color = $(msg).find('field[var="color"] value').text();
            var line_width = $(msg).find('field[var="line_width"] value').text();
            var from_pos = $(msg).find('field[var="from_pos"] value').text()
                .split(',');
            var to_pos = $(msg).find('field[var="to_pos"] value').text()
                .split(',');
            
            var action = {
                color: color,
                line_width: line_width,
                from: {x: parseFloat(from_pos[0]),
                       y: parseFloat(from_pos[1])},
                to: {x: parseFloat(to_pos[0]),
                     y: parseFloat(to_pos[1])}
            };
            
            SketchCast.render_action(action);
        } else if ($(msg).find('delete[node="' + SketchCast.node + '"]')
                   .length > 0) {
            SketchCast.show_error("SketchCast ended by presenter.");
        }

        return true;
    },

    on_old_items: function (iq) {
        $(iq).find('item').each(function () {
            SketchCast.on_event(this);
        });
    },

    // subscription callbacks
    subscribed: function (iq) {
        $(document).trigger("reception_started");
    },

    subscribe_error: function (iq) {
        SketchCast.show_error("Subscription failed with " + 
                              SketchCast.make_error_from_iq(iq));
    },

    // error handling helpers
    make_error_from_iq: function (iq) {
        var error = $(iq)
            .find('*[xmlns="' + Strophe.NS.STANZAS + '"]')
            .get(0).tagName;
        var pubsub_error = $(iq)
            .find('*[xmlns="' + SketchCast.NS_PUBSUB_ERRORS + '"]');
        if (pubsub_error.length > 0) {
            error = error + "/" + pubsub_error.get(0).tagName;
        }

        return error;
    },

    show_error: function (msg) {
        SketchCast.connection.disconnect();
        SketchCast.connection = null;
        SketchCast.service = null;
        SketchCast.node = null;

        $('#error_dialog p').text(msg);
        $('#error_dialog').dialog('open');
    },

    // node creation callbacks
    created: function (iq) {
        // find pubsub node
        var node = $(iq).find("create").attr('node');
        SketchCast.node = node;
        // configure the node
        var configiq = $iq({to: SketchCast.service,
                            type: "set"})
            .c('pubsub', {xmlns: SketchCast.NS_PUBSUB_OWNER})
            .c('configure', {node: node})
            .c('x', {xmlns: SketchCast.NS_DATA_FORMS,
                     type: "submit"})
            .c('field', {"var": "FORM_TYPE", type: "hidden"})
            .c('value').t(SketchCast.NS_PUBSUB_NODE_CONFIG)
            .up().up()
            .c('field', {"var": "pubsub#deliver_payloads"})
            .c('value').t("1")
            .up().up()
            .c('field', {"var": "pubsub#send_last_published_item"})
            .c('value').t("never")
            .up().up()
            .c('field', {"var": "pubsub#persist_items"})
            .c('value').t("true")
            .up().up()
            .c('field', {"var": "pubsub#max_items"})
            .c('value').t("20");
        SketchCast.connection.sendIQ(configiq,
                                     SketchCast.configured,
                                     SketchCast.configure_error);
    },

    create_error: function (iq) {
        SketchCast.show_error("SketchCast creation failed with " +
                              SketchCast.make_error_from_iq(iq));
    },

    configured: function (iq) {
        $(document).trigger("broadcast_started");
    },

    configure_error: function (iq) {
        SketchCast.show_error("SketchCast configuration failed with " +
                              SketchCast.make_error_from_iq(iq));
    },

    publish_action: function (action) {
        SketchCast.connection.sendIQ(
            $iq({to: SketchCast.service, type: "set"})
                .c('pubsub', {xmlns: SketchCast.NS_PUBSUB})
                .c('publish', {node: SketchCast.node})
                .c('item')
                .c('x', {xmlns: SketchCast.NS_DATA_FORMS,
                         type: "result"})
                .c('field', {"var": "color"})
                .c('value').t(action.color)
                .up().up()
                .c('field', {"var": "line_width"})
                .c('value').t('' + action.line_width)
                .up().up()
                .c('field', {"var": "from_pos"})
                .c('value').t('' + action.from.x + ',' + action.from.y)
                .up().up()
                .c('field', {"var": "to_pos"})
                .c('value').t('' + action.to.x + ',' + action.to.y));
    },

    render_action: function (action) {
        // render the line segment
        var ctx = $('#sketch').get(0).getContext('2d');
        ctx.strokeStyle = '#' + action.color;
        ctx.lineWidth = action.line_width;
        ctx.beginPath();
        ctx.moveTo(action.from.x, action.from.y);
        ctx.lineTo(action.to.x, action.to.y);
        ctx.stroke();
    },

    disconnect: function () {
        $('#erase').click();
        SketchCast.connection.disconnect();
        SketchCast.connection = null;
        SketchCast.service = null;
        SketchCast.node = null;
        $('#login_dialog').dialog('open');
    }
};

$(document).ready(function () {
    $('#login_dialog').dialog({
        autoOpen: true,
        draggable: false,
        modal: true,
        title: 'Connect to a SketchCast',
        buttons: {
            "Connect": function () {
                $(document).trigger('connect', {
                    jid: $('#jid').val().toLowerCase(),
                    password: $('#password').val(),
                    service: $('#service').val().toLowerCase(),
                    node: $('#node').val()
                });
                
                $('#password').val('');
                $(this).dialog('close');
            }
        }
    });

    $('#error_dialog').dialog({
        autoOpen: false,
        draggable: false,
        modal: true,
        title: 'Whoops!  Something Bad Happened!',
        buttons: {
            "Ok": function () {
                $(this).dialog('close');
                $('#login_dialog').dialog('open');
            }
        }
    });

    $('#sketch').mousedown(function () {
        SketchCast.pen_down = true;
    });

    $('#sketch').mouseup(function () {
        SketchCast.pen_down = false;
    });

    $('#sketch').mousemove(function (ev) {
        // get the position of the drawing area, our offset
        var offset = $(this).offset();
        // calculate our position within the drawing area
        var pos = {x: ev.pageX - offset.left, 
                   y: ev.pageY - offset.top};

        if (SketchCast.pen_down) {
            if (!SketchCast.old_pos) {
                SketchCast.old_pos = pos;
                return;
            }

            if (!$('#sketch').hasClass('disabled') &&
                (Math.abs(pos.x - SketchCast.old_pos.x) > 2 ||
                 Math.abs(pos.y - SketchCast.old_pos.y) > 2)) {
                SketchCast.render_action({
                    color: SketchCast.color,
                    line_width: SketchCast.line_width,
                    from: {x: SketchCast.old_pos.x, 
                           y: SketchCast.old_pos.y},
                    to: {x: pos.x,
                         y: pos.y}});
                
                SketchCast.publish_action({
                    color: SketchCast.color,
                    line_width: SketchCast.line_width,
                    from: SketchCast.old_pos,
                    to: pos
                });

                SketchCast.old_pos = pos;
            }
        } else {
            SketchCast.old_pos = null;
        }
    });

    $('.color').click(function (ev) {
        SketchCast.color = $(this).attr('id').split('-')[1];
    });

    $('.linew').click(function (ev) {
        SketchCast.line_width = $(this).attr('id').split('-')[1];
    });

    $('#erase').click(function () {
        var ctx = $('#sketch').get(0).getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#fff';
        ctx.fillRect(0, 0, 600, 500);
    });
});

$(document).bind('connect', function (ev, data) {
    $('#status').html('Connecting...');
    
    var conn = new Strophe.Connection(
        'http://bosh.metajack.im:5280/xmpp-httpbind');

    conn.connect(data.jid, data.password, function (status) {
        if (status === Strophe.Status.CONNECTED) {
            $(document).trigger('connected');
        } else if (status === Strophe.Status.DISCONNECTED) {
            $(document).trigger('disconnected');
        }
    });

    SketchCast.connection = conn;
    SketchCast.service = data.service;
    SketchCast.node = data.node;
});

$(document).bind('connected', function () {
    $('#status').html("Connected.");
    
    // send negative presence send we’re not a chat client
    SketchCast.connection.send($pres().c("priority").t("-1"));

    if (SketchCast.node.length > 0) {
        // a node was specified, so we attempt to subscribe to it

        // first, set up a callback for the events
        SketchCast.connection.addHandler(
            SketchCast.on_event,
            null, "message", null, null, SketchCast.service);

        // now subscribe
        var subiq = $iq({to: SketchCast.service,
                         type: "set"})
            .c('pubsub', {xmlns: SketchCast.NS_PUBSUB})
            .c('subscribe', {node: SketchCast.node,
                             jid: SketchCast.connection.jid});
        SketchCast.connection.sendIQ(subiq,
                                     SketchCast.subscribed,
                                     SketchCast.subscribe_error);
    } else {
        // a node was not specified, so we start a new sketchcast
        var createiq = $iq({to: SketchCast.service,
                            type: "set"})
            .c('pubsub', {xmlns: SketchCast.NS_PUBSUB})
            .c('create');
        SketchCast.connection.sendIQ(createiq,
                                     SketchCast.created,
                                     SketchCast.create_error);
    }
});

$(document).bind('broadcast_started', function () {
    $('#status').html('Broadcasting at service: <i>' + 
                      SketchCast.service + '</i> node: <i>' +
                      SketchCast.node + "</i>");

    $('.button').removeClass('disabled');
    $('#sketch').removeClass('disabled');
    $('#erase').removeAttr('disabled');
    $('#disconnect').removeAttr('disabled');

    $('#disconnect').click(function () {
        $('.button').addClass('disabled');
        $('#sketch').addClass('disabled');
        $('#erase').attr('disabled', 'disabled');
        $('#disconnect').attr('disabled', 'disabled');

        SketchCast.connection.sendIQ(
            $iq({to: SketchCast.service,
                 type: "set"})
                .c('pubsub', {xmlns: SketchCast.NS_PUBSUB_OWNER})
                .c('delete', {node: SketchCast.node}));

        SketchCast.disconnect();
    });
});

$(document).bind('reception_started', function () {
    $('#status').html('Receiving SketchCast.');

    $('#disconnect').removeAttr('disabled');
    $('#disconnect').click(function () {
        $('#disconnect').attr('disabled', 'disabled');
        SketchCast.connection.sendIQ(
            $iq({to: SketchCast.service,
                 type: "set"})
                .c('pubsub', {xmlns: SketchCast.NS_PUBSUB_OWNER})
                .c('unsubscribe', {node: SketchCast.node,
                                   jid: SketchCast.connection.jid}));

        SketchCast.disconnect();
    });

    // get missed events
    SketchCast.connection.sendIQ(
        $iq({to: SketchCast.service, type: "get"})
            .c('pubsub', {xmlns: SketchCast.NS_PUBSUB})
            .c('items', {node: SketchCast.node}),
        SketchCast.on_old_items);
});
