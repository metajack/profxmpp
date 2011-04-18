var Peek = {
    connection: null,

    show_traffic: function (body, type) {
        if (body.childNodes.length > 0) {
            var console = $('#console').get(0);
            var at_bottom = console.scrollTop >= console.scrollHeight - 
                console.clientHeight;;

            $.each(body.childNodes, function () {
                $('#console').append("<div class='" + type + "'>" + 
                                     Peek.pretty_xml(this) +
                                     "</div>");
            });

            if (at_bottom) {
                console.scrollTop = console.scrollHeight;
            }
        }
    },

    pretty_xml: function (xml, level) {
        var i, j;
        var result = [];
        if (!level) { 
            level = 0;
        }

        result.push("<div class='xml_level" + level + "'>");
        result.push("<span class='xml_punc'>&lt;</span>");
        result.push("<span class='xml_tag'>");
        result.push(xml.tagName);
        result.push("</span>");

        // attributes
        var attrs = xml.attributes;
        var attr_lead = []
        for (i = 0; i < xml.tagName.length + 1; i++) {
            attr_lead.push("&nbsp;");
        }
        attr_lead = attr_lead.join("");

        for (i = 0; i < attrs.length; i++) {
            result.push(" <span class='xml_aname'>");
            result.push(attrs[i].nodeName);
            result.push("</span><span class='xml_punc'>='</span>");
            result.push("<span class='xml_avalue'>");
            result.push(attrs[i].nodeValue);
            result.push("</span><span class='xml_punc'>'</span>");

            if (i !== attrs.length - 1) {
                result.push("</div><div class='xml_level" + level + "'>");
                result.push(attr_lead);
            }
        }

        if (xml.childNodes.length === 0) {
            result.push("<span class='xml_punc'>/&gt;</span></div>");
        } else {
            result.push("<span class='xml_punc'>&gt;</span></div>");

            // children
            $.each(xml.childNodes, function () {
                if (this.nodeType === 1) {
                    result.push(Peek.pretty_xml(this, level + 1));
                } else if (this.nodeType === 3) {
                    result.push("<div class='xml_text xml_level" + 
                                (level + 1) + "'>");
                    result.push(this.nodeValue);
                    result.push("</div>");
                }
            });
            
            result.push("<div class='xml xml_level" + level + "'>");
            result.push("<span class='xml_punc'>&lt;/</span>");
            result.push("<span class='xml_tag'>");
            result.push(xml.tagName);
            result.push("</span>");
            result.push("<span class='xml_punc'>&gt;</span></div>");
        }
        
        return result.join("");
    },

    text_to_xml: function (text) {
        var doc = null;
        if (window['DOMParser']) {
            var parser = new DOMParser();
            doc = parser.parseFromString(text, 'text/xml');
        } else if (window['ActiveXObject']) {
            var doc = new ActiveXObject("MSXML2.DOMDocument");
            doc.async = false;
            doc.loadXML(text);
        } else {
            throw {
                type: 'PeekError',
                message: 'No DOMParser object found.'
            };
        }

        var elem = doc.documentElement;
        if ($(elem).filter('parsererror').length > 0) {
            return null;
        }
        return elem;
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

    $('#disconnect_button').click(function () {
        Peek.connection.disconnect();
    });

    $('#send_button').click(function () {
        var input = $('#input').val();
        var error = false;
        if (input.length > 0) {
            if (input[0] === '<') {
                var xml = Peek.text_to_xml(input);
                if (xml) {
                    Peek.connection.send(Strophe.copyElement(xml));
                    $('#input').val('');
                } else {
                    error = true;
                }
            } else if (input[0] === '$') {
                try {
                    var builder = eval(input);
                    Peek.connection.send(builder);
                    $('#input').val('');
                } catch (e) {
                    console.log(e);
                    error = true;
                }
            } else {
                error = true;
            }
        }

        if (error) {
            $('#input').animate({backgroundColor: "#faa"});
        }
    });

    $('#input').keypress(function () {
        $(this).css({backgroundColor: '#fff'});
    });
});

$(document).bind('connect', function (ev, data) {
    var conn = new Strophe.Connection(
        "http://bosh.metajack.im:5280/xmpp-httpbind");

    conn.xmlInput = function (body) {
        Peek.show_traffic(body, 'incoming');
    };

    conn.xmlOutput = function (body) {
        Peek.show_traffic(body, 'outgoing');
    };

    conn.connect(data.jid, data.password, function (status) {
        if (status === Strophe.Status.CONNECTED) {
            $(document).trigger('connected');
        } else if (status === Strophe.Status.DISCONNECTED) {
            $(document).trigger('disconnected');
        }
    });

    Peek.connection = conn;
});

$(document).bind('connected', function () {
    $('.button').removeAttr('disabled');
    $('#input').removeClass('disabled').removeAttr('disabled');
});

$(document).bind('disconnected', function () {
    $('.button').attr('disabled', 'disabled');
    $('#input').addClass('disabled').attr('disabled', 'disabled');
});
