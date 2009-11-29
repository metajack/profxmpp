$(document).ready(function () {
    $('#log').append("<div>Attacher started!</div>");

    Attacher.connection = new Strophe.Connection(
        "http://bosh.metajack.im:5280/xmpp-httpbind");

    Attacher.connection.attach(
        Attacher.JID, Attacher.SID, Attacher.RID, null);

    $('#log').append("<div>Session attached!</div>");

    Attacher.connection.sendIQ(
        $iq({to: Strophe.getDomainFromJid(Attacher.JID),
             type: "get"})
            .c('query', {xmlns: 
                         'http://jabber.org/protocol/disco#info'}),
        function () {
            $('#log').append("<div>Response received " +
                             "from server!</div>");
        });
});