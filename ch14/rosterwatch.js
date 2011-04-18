RosterWatch = {
    connection: null
};

$(document).ready(function () {
    $('#login_dialog').dialog({
        autoOpen: true,
        draggable: false,
        model: true,
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

    $('#disconnect').click(function () {
        $('#disconnect').attr('disabled', 'disabled');
        RosterWatch.connection.disconnect();
    });
});

$(document).bind('connect', function (ev, data) {
    var conn = new Strophe.Connection(
        'http://bosh.metajack.im:5280/xmpp-httpbind');

    conn.connect(data.jid, data.password, function (status) {
        if (status === Strophe.Status.CONNECTED) {
            $(document).trigger('connected');
        } else if (status === Strophe.Status.DISCONNECTED) {
            $(document).trigger('disconnected');
        }
    });

    RosterWatch.connection = conn;
});

$(document).bind('connected', function () {
    $('#disconnect').removeAttr('disabled');

    RosterWatch.connection.send($pres());
});

$(document).bind('disconnected', function () {
    RosterWatch.connection = null;
    
    $('#roster').empty();
    $('#login_dialog').dialog('open');
});

$(document).bind('roster_changed', function (ev, roster) {
    $('#roster').empty();

    var empty = true;
    $.each(roster.contacts, function (jid) {
        empty = false;
        
        var status = "offline";
        if (this.online()) {
            var away = true;
            for (var k in this.resources) {
                if (this.resources[k].show === "online") {
                    away = false;
                }
            }
            status = away ? "away" : "online";
        }

        var html = [];
        html.push("<div class='contact " + status + "'>");

        html.push("<div class='name'>");
        html.push(this.name || jid);
        html.push("</div>");

        html.push("<div class='jid'>");
        html.push(jid);
        html.push("</div>");

        html.push("</div>");

        $('#roster').append(html.join(''));
    });

    if (empty) {
        $('#roster').append("<i>No contacts :(</i>");
    }
});