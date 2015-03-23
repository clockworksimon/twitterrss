function DoWork() {
    if (BotData.Id == '') {
        T.get('account/verify_credentials', { skip_status: true },  function(err, data, response) {
            BotData.Id = data.id_str;
            BotData.Handle = new String('@' + data.screen_name);
            DoWork();
        });
    }
    else {
        var t_timeline_data = { user_id: BotData.Id };
        if (BotData.Since != '') {
            t_timeline_data.since_id = BotData.Since;
        }
        
        T.get('statuses/user_timeline', t_timeline_data,  function(err, data, response) {
            if (typeof data != 'undefined') {
                for (var i=0; i < data.length; i++) {
                    var d = data[i];
                    if (BotData.Since == '' || d.id > BotData.Since) {
                        BotData.Since = d.id_str;
                    }
                    if (d.retweeted == true) {
                        cacheStatusForRSS(d);
                    }
                }
                
                console.log('Checking Mentions Since: ' + BotData.Since);
                var mt_timeline_data = { };
                if (BotData.Since != '') {
                    mt_timeline_data.since_id = BotData.Since;
                }
                T.get('statuses/mentions_timeline', mt_timeline_data, function(err, data, response) {
                    if (typeof data != 'undefined') {
                        for (var i=0; i < data.length; i++) {
                            var d = data[i];
                            if (d.user.following == true) {
                                var mtxt = new String(d.text);
                                while(mtxt.indexOf(BotData.Handle) >= 0) {
                                    mtxt = mtxt.replace(BotData.Handle, '');
                                }
                                if (mtxt.toLowerCase().indexOf('coffee') >= 0) {
                                    T.post('statuses/retweet/:id', { id: d.id_str }, function (err, data, response) {
                                        if (typeof data != 'undefined') {
                                            if (data.id > BotData.Since) {
                                                console.log('Retweeted: ' + data.id_str);
                                                BotData.Since = data.id_str;
                                                cacheStatusForRSS(data);
                                            }
                                        }
                                    });
                                }
                            }
                        }
                    }
                });
            }
        });
    }
}

function SetMedia(data) {
    var tnMedia = null;
    var dt = null;
    if (typeof data.retweeted_status.entities.media != 'undefined') {
        dt = data.retweeted_status;
      } else if (typeof data.entities.media != 'undefined') {
        dt = data;
    }
    
    if (dt != null && dt.entities.media.length > 0) {
        var m = dt.entities.media[0];
        if (m.type = 'photo') {
            var mUrl = m.media_url;
            var iPos = m.media_url.lastIndexOf('.');
            var mType = '';
            if (iPos > 0) {
                iPos++;
                mType = m.media_url.substring(iPos, m.media_url.length);
                if (mType.toLowerCase().trim() == 'jpg') {
                    mType = 'jpeg';
                }
            }
            tnMedia = { url: mUrl, type: mType };
        }
    }
    return tnMedia;
}

function cacheStatusForRSS(data) {
    var tMedia = SetMedia(data);
    if (typeof data.retweeted_status.user.screen_name == 'undefined') {
        RSSData.push({
            id_str          : data.id_str,
            by_screen_name  : data.user.screen_name,
            created_at      : data.created_at,
            text            : data.text,
            photo           : tMedia
        });
      } else {
        RSSData.push({
            id_str          : data.retweeted_status.id_str,
            by_screen_name  : data.retweeted_status.user.screen_name,
            created_at      : data.retweeted_status.created_at,
            text            : data.retweeted_status.text,
            photo           : tMedia
        });
    }
}

function sortRssFeed(a,b) {
  if (a.id_str < b.id_str)
     return 1;
  if (a.id_str > b.id_str)
    return -1;
  return 0;
}

var Twit = require('twit');
var TwitConfig = {
    consumer_key        : process.env.CONSKEY,
    consumer_secret     : process.env.CONSSKRT,
    access_token        : process.env.ACCTOK,
    access_token_secret : process.env.ACCTOKSKRT
};
var T = new Twit(TwitConfig);

var BotData = {
    Id: '',
    Handle: '',
    Since: ''
};

var RSSData = [];

DoWork();
setInterval(DoWork, 60000);

//http://stackoverflow.com/questions/37684/how-to-replace-plain-urls-with-links
function linkify(inputText) {
    var replacedText, replacePattern1, replacePattern2, replacePattern3;

    //URLs starting with http://, https://, or ftp://
    replacePattern1 = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gim;
    replacedText = inputText.replace(replacePattern1, '<a href="$1" target="_blank">$1</a>');

    //URLs starting with "www." (without // before it, or it'd re-link the ones done above).
    replacePattern2 = /(^|[^\/])(www\.[\S]+(\b|$))/gim;
    replacedText = replacedText.replace(replacePattern2, '$1<a href="http://$2" target="_blank">$2</a>');

    //Change email addresses to mailto:: links.
    replacePattern3 = /(([a-zA-Z0-9\-\_\.])+@[a-zA-Z\_]+?(\.[a-zA-Z]{2,6})+)/gim;
    replacedText = replacedText.replace(replacePattern3, '<a href="mailto:$1">$1</a>');

    return replacedText;
}

var running_port = process.env.PORT || 1337;
var http = require('http');
var url = require("url");
http.createServer(function (req, res) {
    var sOut = '';
    
    if (RSSData != null || RSSData.length > 0) {
        RSSData.sort(sortRssFeed);
        
        var outputType = 'html';
        var oUrl = url.parse(req.url, true);
        var urlSelf = 'http://' + req.headers.host;
        
        if (typeof oUrl['query']['feed'] != 'undefined' && oUrl['query']['feed'] != null) {
            if (oUrl['query']['feed'].toLowerCase() == 'json') {
                outputType = 'json';
              } else if (oUrl['query']['feed'].toLowerCase() == 'rss') {
                outputType = 'rss';
            }
        }
        
        if (outputType == 'rss') {
            res.writeHead(200, {'Content-Type': 'application/rss+xml'});
            for (var i=0; i < RSSData.length; i++) {
                var r = RSSData[i];
                sOut += '    <item>\n'
                sOut += '        <title>@' + r.by_screen_name + ' on ' + r.created_at + '</title>\n';
                sOut += '        <link>https://twitter.com/' + r.by_screen_name + '/status/' + r.id_str + '</link>\n';
                sOut += '        <description>' + r.text + '</description>\n';
                sOut += '        <guid>https://twitter.com/' + r.by_screen_name + '/status/' + r.id_str + '</guid>\n';
                if (typeof r.photo != 'undefined' && r.photo != null) {
                    sOut += '        <enclosure url="' + r.photo.url + '" type="image/' + r.photo.type + '" length="123" />\n'
                }
                sOut += '    </item>\n';
            }
            
            if (sOut != '') {
                var sHead = '<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n';
                sHead += '    <title>Twitter RSS Feed for ' + BotData.Handle + '</title>\n    <link>https://twitter.com/' + BotData.Handle.replace('@', '') + '</link>\n';
                sHead += '    <description>Coffee tweets from select awesome people.</description>\n';
                sHead += '    <atom:link href="https://desolate-inlet-3463.herokuapp.com/" rel="self" type="application/rss+xml" />\n';
                sOut = sHead + sOut + '  </channel>\n</rss>\n';
            }
          } else if (outputType == 'json') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            for (var i=0; i < RSSData.length; i++) {
                sOut += JSON.stringify(RSSData[i]);
            }
          } else if (outputType == 'html') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            sOut += '<html>\n<head>\n    <title>@CoffeeRSS Bot</title>\n    <meta name="viewport" content="user-scalable=yes, width=device-width" />\n    <link href="http://fonts.googleapis.com/css?family=Montserrat" rel="stylesheet" type="text/css" />\n';
            sOut += '    <style type="text/css">\n';
            sOut += "      body { font-family: 'Montserrat', sans-serif; }\n";
            sOut += '      a { color: #9D9D9D; text-decoration: none; }\n      a:visited { color: #9D9D9D; text-decoration: none; }\n      a:hover { color: #993C00; text-decoration: underline; }\n';
            sOut += '      div#cbody { width: 400px; margin-left: auto; margin-right: auto; }\n';
            sOut += '      div.thead { padding: 6px; background-color: #CECECE; border: 1px #BDBDBD solid; }\n';
            sOut += '      div.tbody { padding: 6px; background-color: #DEDEDE; border-left: 1px #BDBDBD solid; border-right: 1px #BDBDBD solid; }\n';
            sOut += '      div.tbody img { padding-top: 8px; }\n';
            sOut += '      div.tfoot { padding: 6px; background-color: #CECECE; border: 1px #BDBDBD solid; font-size: 80%; }\n';
            sOut += '      @media screen and (min-width: 10px) and (max-width: 450px) {\n        body { margin: 0; padding: 0; }\n        div#cbody { width: 90%; margin-left: auto; margin-right: auto; }\n        }\n';
            sOut += '    </style>\n';
            sOut += '</head>\n';
            sOut += '<body>\n<h1>@CoffeeRSS Bot</h1>\n';
            sOut += '<ul>\n  <li><a href="https://twitter.com/CoffeeRSS">@CoffeeRSS on Twitter</a> -> Ask the bot to follow you. If it does, you can then @ mention it with \'coffee\' in the tweet to contribute to the feed.</li>\n';
            sOut += '  <li><a href="' + urlSelf + '/?feed=rss">Subscribe to the RSS</a> (via <a href="' + urlSelf + '/?feed=rss">' + urlSelf + '/?feed=rss</a>)<br /></li>\n';
            sOut += '  <li><a href="' + urlSelf + '/?feed=json">Consume the feed as json</a> (via <a href="' + urlSelf + '/?feed=json">' + urlSelf + '/?feed=json</a>)<br /></li>\n';
            sOut += '  <li><a href="https://github.com/clockworksimon/twitterrss">Github source</a> (<a href="https://github.com/clockworksimon/twitterrss">https://github.com/clockworksimon/twitterrss</a>)</li>\n</ul>\n';
            sOut += '<h2>Human-readable RSS</h2>\n<div id="cbody">\n';
            for (var i=0; i < RSSData.length; i++) {
                var r = RSSData[i];
                var rtxt = r.text.replace('â€œ','');
                rtxt = rtxt.replace('â€','');
                rtxt = linkify(rtxt);
                sOut += '<div class="thead">@' + r.by_screen_name + '</div>\n';
                sOut += '<div class="tbody">' + rtxt;
                if (r.photo != null) {
                    sOut += '<img src="' + r.photo.url + '" border="0" width="100%" />';
                }
                sOut += '</div>\n';
                sOut += '<div class="tfoot">' + r.created_at + ' &middot; <a href="https://twitter.com/' + r.by_screen_name + '/status/' + r.id_str + '">source</a></div><br />\n';
            }
            sOut += '</div>\n</body>\n</html>\n';
        }
    }
    
    if (sOut == '') {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        sOut = 'Hello World\n';
    }
    res.end(sOut);
}).listen(running_port);
console.log('Server running on port: ' + running_port);
