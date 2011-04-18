var Arthur = {
    connection: null,

    handle_message: function (message) {
        if ($(message).attr('from').match(/^update@identi.ca/)) {
            var delayed = $(message).find('delay').length > 0;
            var body = $(message).find('html > body').contents();

            var div = $("<div></div>");
            
            if (delayed) {
                div.addClass('delayed');
            }

            body.each(function () {
                if (document.importNode) {
                    $(document.importNode(this, true)).appendTo(div);
                } else {
                    // IE workaround
                    div.append(this.xml);
                }
            });

            div.prependTo('#stream');
        }

        return true;
    }
};

$(function () {
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

    $('#input').keyup(function () {
        var left = 140 - $(this).val().length;
        $('#counter .count').text('' + left);
    });

    $('#input').keypress(function (ev) {
        if (ev.which === 13) {
            ev.preventDefault();
            
            var text = $(this).val();
            $(this).val('');

            var msg = $msg({to: 'update@identi.ca', type: 'chat'})
                .c('body').t(text);
            Arthur.connection.send(msg);
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

    Arthur.connection = conn;
});

$(document).bind('connected', function () {
    Arthur.connection.addHandler(Arthur.handle_message,
                                 null, "message", "chat");
    Arthur.connection.send($pres());
});

$(document).bind('disconnected', function () {
    // nothing here yet
});