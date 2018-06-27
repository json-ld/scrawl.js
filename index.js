#!/usr/bin/env node

var _ = require('underscore');
var async = require('async');
var email = require('emailjs');
var fs = require('fs');
var path = require('path');
var program = require('commander');
const Mustache = require('mustache');
var scrawl = require('./www/scrawl');
var Twitter = require('twitter');
var wp = require('wordpress');

program
  .version('0.4.0')
  .option('-d, --directory <directory>', 'The directory to process.')
  .option('-m, --html', 'If set, write the minutes to an index.html file')
  .option('-w, --wordpress', 'If set, publish the minutes to the blog')
  .option('-e, --email', 'If set, publish the minutes to the mailing list')
  .option('-t, --twitter', 'If set, publish the minutes to Twitter')
  .option('-g, --google', 'If set, publish the minutes to G+')
  .option('-i, --index', 'Build meeting index')
  .option('-q, --quiet', 'Don\'t print status information to the console')
  .parse(process.argv);

if(!program.directory) {
  console.error('Error: You must specify a directory to process');
  program.outputHelp();
  process.exit(1);
}

// setup global variables
const dstDir = path.resolve(path.join(program.directory));
const logFile = path.resolve(dstDir, 'irc.log');
const audioFile = path.resolve(dstDir, 'audio.ogg');
const indexFile = path.resolve(dstDir, 'index.html');
const minutesDir = path.join(dstDir, '/..');

var htmlHeader = fs.readFileSync(
  __dirname + '/www/_partials/header.html', {encoding: 'utf8'});
var htmlFooter = fs.readFileSync(
  __dirname + '/www/_partials/footer.html', {encoding: 'utf8'});
var peopleJson = fs.readFileSync(
  __dirname + '/www/people.json', {encoding: 'utf8'});
var gLogData = '';
var haveAudio = false;
var gDate = path.basename(dstDir);
gDate = gDate.match(/([0-9]{4}-[0-9]{2}-[0-9]{2})/)[1];

// configure scrawl
scrawl.group = 'JSON-LD CG Telecon';
scrawl.people = JSON.parse(peopleJson);

const EMAIL_TO = 'JSON-LD CG <public-linked-json@w3.org>';
const EMAIL_FROM = 'gregg@greggkellogg.net';
// Mustache template -- vars: gDate
const EMAIL_SUBJECT = '[MINUTES] W3C JSON-LD CG Call - {{gDate}} 12pm ET';
// Mustache template -- vars: scribe, gDate, content
const EMAIL_BODY = `Thanks to {{scribe}} for scribing this week! The minutes
for this week's JSON-LD CG telecon are now available:

https://json-ld.github.io/minutes/{{gDate}}/

Full text of the discussion follows for W3C archival purposes.
Audio from the meeting is available as well (link provided below).

----------------------------------------------------------------
{{{content}}}`;

// Mustache template - vars: gDate, formattedItems, content
const GPLUS_BODY = `*JSON-LD CG Meeting Summary for {{gDate}}*

We discussed {{formattedItems}}.

{{{content}}}

Full transcript and audio logs are available here:

https://json-ld.github.io/minutes/{{gDate}}/

#w3c #json-ld`;

// Mustache template - vars: message, gDate
const TWITTER_BODY = `JSON-LD CG discusses {{message}}:
https://json-ld.github.io/minutes/{{gDate}}/ #w3c #json-ld`;

// Mustache template - vars: gDate
const WORDPRESS_TITLE = 'JSON-LD CG Meeting Minutes for {{gDate}}';
// Location of date-based minutes folders; MUST end in a forward slash
const MINUTES_BASE_URL = 'https://json-ld.github.io/minutes/'

/************************* Utility Functions *********************************/
function postToWordpress(username, password, content, callback) {
  var client = wp.createClient({
    username: username,
    password: password,
    url: ''
  });
  // Re-format the HTML for publication to a Wordpress blog
  var datetime = new Date(gDate);
  datetime.setHours(37);
  var wpSummary = content.post_content;
  wpSummary = wpSummary.substring(
    wpSummary.indexOf('<dl>'), wpSummary.indexOf('</dl>') + 5);
  wpSummary = wpSummary.replace(/href=\"#/g,
    'href="' + MINUTES_BASE_URL + gDate + '/#');
  wpSummary = wpSummary.replace(/href=\"audio/g,
    'href="' + MINUTES_BASE_URL + gDate + '/audio');
  wpSummary = wpSummary.replace(/<div><audio[\s\S]*\/audio><\/div>/g, '');
  wpSummary += '<p>Detailed minutes and recorded audio for this call are ' +
    '<a href="' + MINUTES_BASE_URL + gDate +
    '/">available in the archive</a>.</p>';

  // calculate the proper post date
  var gmtDate = datetime.toISOString();
  gmtDate = gmtDate.replace('T', ' ');
  gmtDate = gmtDate.replace(/\.[0-9]*Z/, '');

  content.post_content = wpSummary;
  content.post_date_gmt = gmtDate;
  content.terms_names = ['Meetings'];
  content.post_name = gDate + '-minutes';
  content.custom_fields = [{
    s2_meta_field: 'no'
  }];

  client.newPost(content, function(err, data) {
    if(err) {
      console.log(err);

      console.log('scrawl: You may have to add this information manually:');

      console.log('Title:\n' + content.post_title);
      console.log('Content:\n' + content.post_content);
      console.log('Slug:\n' + content.post_name);
    }
    else {
      console.log(data);
      // Do something.
    }
    callback();
  });
}

function sendEmail(username, password, hostname, content, callback) {
  var server  = email.server.connect({
    //user: username,
    //password: password,
    host: hostname,
    ssl: false
  });

  // send the message
  server.send({
    text:    content,
    from: EMAIL_FROM,
    //from:    username + '@' + hostname,
    to: EMAIL_TO,
    subject: Mustache.render(EMAIL_SUBJECT, {gDate})
  }, function(err, message) {
    if(err) {
      console.log('scrawl:', err);
      return callback();
    }

    if(!program.quiet) {
      console.log(`scrawl: Sent minutes email to ${EMAIL_TO}`);
    }
    callback();
  });
}
/*************************** Main Functionality ******************************/

async.waterfall([ function(callback) {
  // check to make sure the log file exists in the given directory
  //console.log("dstDir:", dstDir, "\nlogFile:", logFile);
  fs.exists(logFile, function(exists) {
    if(exists) {
      callback();
    } else {
      callback('Error: ' + logFile +
        ' does not exist, required for processing.');
    }
  });
}, function(callback) {
  fs.exists(audioFile, function(exists) {
    haveAudio = exists;
    callback();
  });
}, function(callback) {
  // read the IRC log file
  fs.readFile(logFile, 'utf8', callback);
}, function(data, callback) {
  gLogData = data;
  // generate the index.html file
  var minutes =
    htmlHeader +
    '<div><div><div class="container">' +
    '<div class="row"><div class="col-md-8 col-md-offset-2">' +
    scrawl.generateMinutes(gLogData, 'html', gDate, haveAudio) +
    '</div></div></div></div></div>' + htmlFooter;
  callback(null, minutes);
}, function(minutes, callback) {
  // write the index.html file to disk
  if(program.html) {
    if(!program.quiet) {
      console.log('scrawl: Writing minutes to', indexFile);
    }
    fs.writeFile(indexFile, minutes, {}, callback);
  } else {
    callback();
  }
}, function(callback) {
  // write the index.html file to disk
  if(program.index) {
    if(!program.quiet) {
      console.log('scrawl: Writing meeting summaries to',
                  `${minutesDir}/index.html`);
    }
    // uses constant minutesDir
    var logFiles = [];
    async.auto({
      readDirs: function(callback) {
        fs.readdir(minutesDir, callback);
      },
      findLogs: ['readDirs', function(callback, results) {
        async.each(results.readDirs, function(item, callback) {
          var ircLog = minutesDir + '/' + item + '/irc.log';
          fs.exists(ircLog, function(exists) {
            if(exists) {
              logFiles.push(ircLog);
            }
            callback();
          });
        }, function(err) {
          callback(err, logFiles);
        });
      }],
      buildSummaries: ['findLogs', function(callback, results) {
        var summaries = {};
        async.each(results.findLogs, function(item, callback) {
          fs.readFile(item, "utf8", function(err, data) {
            if(err) {
              return callback(err);
            }

            // generate summary items
            var summary = {
              topic: [],
              resolution: []
            };
            summary.topic = data.match(/topic: (.*)/ig);
            summary.resolution = data.match(/resolved: (.*)/ig);

            // strip extraneous information
            for(var i in summary.topic) {
              summary.topic[i] = summary.topic[i].replace(/topic: /ig, '');
            }
            for(var j in summary.resolution) {
              summary.resolution[j] =
                summary.resolution[j].replace(/resolved: /ig, '');
            }

            var date = item.match(/([0-9]{4}-[0-9]{2}-[0-9]{2}-?[^\/]*)/)[1];
            summaries[date] = summary;
            callback();
          });
        }, function(err) {
          callback(err, summaries);
        });
      }]
    }, function(err, results) {
      if(err) {
        return callback(err);
      }

      const summaryIntro = fs.readFileSync(
        __dirname + '/www/_partials/summary-intro.html', {encoding: 'utf8'});

      // write out summary file
      var summaryHtml = htmlHeader + '<div id="info">' + summaryIntro;

      var summaryKeys = Object.keys(results.buildSummaries).sort().reverse();
      for(var k in summaryKeys) {
        var key = summaryKeys[k];
        var summary = results.buildSummaries[key];
        summaryHtml += '<h3><a href="' + key + '/">Meeting for ' + key + '</a></h3>\n';
        if(summary.topic && summary.topic.length > 0) {
          summaryHtml += '<h4>Topics</h4><ol>\n';
          for(var t in summary.topic) {
            var tcounter = parseInt(t) + 1;
            summaryHtml +=
              '<li><a href="' + key + '/#topic-' + tcounter + '">' +
              summary.topic[t] + '</a></li>\n';
          }
          summaryHtml += '</ol>\n';
        }
        if(summary.resolution && summary.resolution.length > 0) {
          summaryHtml += '<h4>Resolutions</h4><ol>\n';
          for(var r in summary.resolution) {
            var rcounter = parseInt(r) + 1;
            summaryHtml +=
              '<li><a href="' + key + '/#resolution-' + rcounter + '">' +
              summary.resolution[r] + '</a></li>\n';
          }
          summaryHtml += '</ol>\n';
        }
      }
      summaryHtml += htmlFooter;

      fs.writeFileSync(path.join(minutesDir + '/index.html'), summaryHtml, 'utf-8');
      callback();
    });
  } else {
    callback();
  }
}, function(callback) {
  // send the email about the meeting
  if(program.email) {
    if(!program.quiet) {
      console.log('scrawl: Sending new minutes email.');
    }

    // generate the body of the email
    var content = scrawl.generateMinutes(gLogData, 'text', gDate, haveAudio);
    var scribe = content.match(/Scribe:\n\s(.*)\n/g)[0]
      .replace(/\n/g, '').replace('Scribe:  ', '');
    content = Mustache.render(EMAIL_BODY, {scribe, gDate, content});

    if(process.env.SCRAWL_EMAIL_USERNAME && process.env.SCRAWL_EMAIL_PASSWORD &&
      process.env.SCRAWL_EMAIL_SERVER) {
      sendEmail(
        process.env.SCRAWL_EMAIL_USERNAME, process.env.SCRAWL_EMAIL_PASSWORD,
        process.env.SCRAWL_EMAIL_SERVER, content, callback);
    } else {
      var prompt = require('prompt');
      prompt.start();
      prompt.get({
        properties: {
          server: {
            description: 'Enter your email server',
            pattern: /^.{4,}$/,
            message: 'The server name must be at least 4 characters.',
            'default': 'mail.digitalbazaar.com'
          },
          username: {
            description: 'Enter your email login name',
            pattern: /^.{1,}$/,
            message: 'The username must be at least 4 characters.',
            'default': 'msporny'
          },
          password: {
            description: 'Enter your email password',
            pattern: /^.{4,}$/,
            message: 'The password must be at least 4 characters.',
            hidden: true,
            'default': 'password'
          }
        }
      }, function(err, results) {
        sendEmail(results.username, results.password, results.server,
          content, callback);
      });
    }
  } else {
    callback();
  }
}, function(callback) {
  // format the G+ post for copy-paste
  if(program.google) {
    if(!program.quiet) {
      console.log('scrawl: Composing new G+ message.');
    }

    // generate the body of the email
    var content = scrawl.generateMinutes(gLogData, 'text', gDate, haveAudio);
    content = content.match(/Agenda(.|\n)*Organizer:/)[0].replace('Organizer:', '');
    var items = content.match(/Topics(.|\n)*(Action|Resolutions|.*)/)[0].match(/[0-9]{1,2}\. (.*)/g);
    var formattedItems = '';

    // create a brief description of what was discussed
    for(var i = 0; i < items.length; i++) {
       if(i > 0 && i < items.length - 1) {
         formattedItems += ', ';
       }
       else if(i == items.length - 1) {
         formattedItems += ', and ';
       }
       formattedItems += items[i].replace(/[0-9]{1,2}\. /, '').toLowerCase();
    }

    // format in a way that is readable on G+
    content = Mustache.render(GPLUS_BODY, {gDate, formattedItems, content});

    console.log('scrawl: You will need to paste this to your G+ stream:\n');
    console.log(content);
    callback();
  } else {
    callback();
  }
}, function(callback) {
  // publish the minutes to Twitter
  if(program.twitter) {
    if(!process.env.SCRAWL_TWITTER_CONSUMER_KEY ||
      !process.env.SCRAWL_TWITTER_SECRET ||
      !process.env.SCRAWL_TWITTER_TOKEN_KEY ||
      !process.env.SCRAWL_TWITTER_TOKEN_SECRET) {
      console.log('scrawl: You must set the following environment variables ' +
        'for twitter\nposting to work: SCRAWL_TWITTER_CONSUMER_KEY, ' +
        'SCRAWL_TWITTER_SECRET,\nSCRAWL_TWITTER_TOKEN_KEY, ' +
        'SCRAWL_TWITTER_TOKEN_SECRET.');
      return callback();
    }
    // create the twitter client
    var twitter = new Twitter({
      consumer_key: process.env.SCRAWL_TWITTER_CONSUMER_KEY,
      consumer_secret: process.env.SCRAWL_TWITTER_SECRET,
      access_token_key: process.env.SCRAWL_TWITTER_TOKEN_KEY,
      access_token_secret: process.env.SCRAWL_TWITTER_TOKEN_SECRET
    });

    // get the tweet text
    console.log('scrawl: Creating new tweet.');
    var prompt = require('prompt');
      prompt.start();
      prompt.get({
        properties: {
          message: {
            description: 'Enter the tweet contents (what was discussed)',
            pattern: /^.{4,100}$/,
            message: 'The message must be between 4-100 characters.'
          }
        }
      }, function(err, results) {
        // construct the tweet
        var tweet = Mustache.render(TWITTER_BODY,
                                    {message: results.message, gDate});

        // send the tweet
        twitter.updateStatus(tweet, function(data) {
          console.log('scrawl: Tweet sent:', data.text);
          callback();
        });
      });
  } else {
    callback();
  }
}, function(callback) {
  // publish the wordpress blog post
  if(program.wordpress) {
    if(!program.quiet) {
      console.log('scrawl: Creating new blog post.');
    }
    var content = {
      post_title: Mustache.render(WORDPRESS_TITLE, {gDate}),
      post_content: scrawl.generateMinutes(gLogData, 'html', gDate, haveAudio)
    };

    if(process.env.SCRAWL_WP_USERNAME && process.env.SCRAWL_WP_PASSWORD) {
      postToWordpress(
        process.env.SCRAWL_WP_USERNAME, process.env.SCRAWL_WP_PASSWORD,
        content, callback);
    } else {
      var prompt = require('prompt');
      prompt.start();
      prompt.get({
        properties: {
          username: {
            description: 'Enter the WordPress username',
            pattern: /^.{4,}$/,
            message: 'The username must be at least 4 characters.',
            'default': 'msporny'
          },
          password: {
            description: 'Enter the user\'s password',
            pattern: /^.{4,}$/,
            message: 'The password must be at least 4 characters.',
            hidden: true,
            'default': 'password'
          }
        }
      }, function(err, results) {
        postToWordpress(results.username, results.password, content, callback);
      });
    }
  } else {
    callback();
  }
}], function(err) {
  // check to ensure there were no errors
  if(err) {
    console.log('Error:', err);
  }
});
