// Contact object
function Contact() {
    this.name = "";
    this.resources = {};
    this.subscription = "none";
    this.ask = "";
    this.groups = [];
}

Contact.prototype = {
    // compute whether user is online from their
    // list of resources
    online: function () {
        var result = false;
        for (var k in this.resources) {
            result = true;
            break;
        }
        return result;
    }
};

// example roster plugin
Strophe.addConnectionPlugin('roster', {
    init: function (connection) {
        this.connection = connection;
        this.contacts = {};

        Strophe.addNamespace('ROSTER', 'jabber:iq:roster');
    },

    // called when connection status is changed
    statusChanged: function (status) {
        if (status === Strophe.Status.CONNECTED) {
            this.contacts = {};

            // set up handlers for updates
            this.connection.addHandler(this.rosterChanged.bind(this),
                                       Strophe.NS.ROSTER, "iq", "set");
            this.connection.addHandler(this.presenceChanged.bind(this),
                                       null, "presence");

            // build and send initial roster query
            var roster_iq = $iq({type: "get"})
                .c('query', {xmlns: Strophe.NS.ROSTER});

            var that = this;
            this.connection.sendIQ(roster_iq, function (iq) {
                $(iq).find("item").each(function () {
                    // build a new contact and add it to the roster
                    var contact = new Contact();
                    contact.name = $(this).attr('name') || "";
                    contact.subscription = $(this).attr('subscription') ||
                        "none";
                    contact.ask = $(this).attr('ask') || ""; 
                    $(this).find("group").each(function () {
                        contact.groups.push($(this).text());
                    });
                    that.contacts[$(this).attr('jid')] = contact;
                });

                // let user code know something happened
                $(document).trigger('roster_changed', that);
            });
        } else if (status === Strophe.Status.DISCONNECTED) {
            // set all users offline
            for (var contact in this.contacts) {
                this.contacts[contact].resources = {};
            }
            
            // notify user code
            $(document).trigger('roster_changed', this);
        }
    },

    // called when roster udpates are received
    rosterChanged: function (iq) {
        var item = $(iq).find('item');
        var jid = item.attr('jid');
        var subscription = item.attr('subscription') || "";
        
        if (subscription === "remove") {
            // removing contact from roster
            delete this.contacts[jid];
        } else if (subscription === "none") {
            // adding contact to roster
            var contact = new Contact();
            contact.name = item.attr('name') || "";
            item.find("group").each(function () {
                contact.groups.push(this.text());
            });
            this.contacts[jid] = contact;
        } else {
            // modifying contact on roster
            var contact = this.contacts[jid];
            contact.name = item.attr('name') || contact.name;
            contact.subscription = subscription || contact.subscription;
            contact.ask = item.attr('ask') || contact.ask;
            contact.groups = [];
            item.find("group").each(function () {
                contact.groups.push(this.text());
            });
        }
        
        // acknowledge receipt
        this.connection.send($iq({type: "result", id: $(iq).attr('id')}));
        
        // notify user code of roster changes
        $(document).trigger("roster_changed", this);
        
        return true;
    },

    // called when presence stanzas are received
    presenceChanged: function (presence) {
        var from = $(presence).attr("from");
        var jid = Strophe.getBareJidFromJid(from);
        var resource = Strophe.getResourceFromJid(from);
        var ptype = $(presence).attr("type") || "available";

        if (!this.contacts[jid] || ptype === "error") {
            // ignore presence updates from things not on the roster
            // as well as error presence
            return true;
        }
        
        if (ptype === "unavailable") {
            // remove resource, contact went offline
            delete this.contacts[jid].resources[resource];
        } else {
            // contact came online or changed status
            this.contacts[jid].resources[resource] = {
                show: $(presence).find("show").text() || "online",
                status: $(presence).find("status").text()
            };
        }
        
        // notify user code of roster changes
        $(document).trigger("roster_changed", this);

        return true;
    },

    // add a contact to the roster
    addContact: function (jid, name, groups) {
        var iq = $iq({type: "set"})
            .c("query", {xmlns: Strophe.NS.ROSTER})
            .c("item", {name: name || "", jid: jid});
        if (groups && groups.length > 0) {
            $.each(groups, function () {
                iq.c("group").t(this).up();
            });
        }
        this.connection.sendIQ(iq);
    },
    
    // delete a contact from the roster
    deleteContact: function (jid) {
        var iq = $iq({type: "set"})
            .c("query", {xmlns: Strophe.NS.ROSTER})
            .c("item", {jid: jid, subscription: "remove"});
        this.connection.sendIQ(iq);
    },


    // modify a roster contact
    modifyContact: function (jid, name, groups) {
        this.addContact(jid, name, groups);
    },

    // subscribe to a new contact's presence
    subscribe: function (jid, name, groups) {
        this.addContact(jid, name, groups);
        
        var presence = $pres({to: jid, "type": "subscribe"});
        this.connection.send(presence);
    },
    
    // unsubscribe from a contact's presence
    unsubscribe: function (jid) {
        var presence = $pres({to: jid, "type": "unsubscribe"});
        this.connection.send(presence);
        
        this.deleteContact(jid);
    }
});
