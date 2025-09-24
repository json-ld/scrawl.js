/**
 * Scrawl is a tool that is useful for taking minutes via IRC and cleaning them
 * up for public consumption. It takes an IRC log as input and generates a
 * nice, stand-alone HTML page from the input.
 */
(function() {
  /* Standard regular expressions to use when matching lines */
  const commentRx = /^\[?(\S*|\w+ \S+)\]\s+<([^>]*)>\s+(.*)$/;
  const scribeRx = /^(scribe|scribenick):.*$/i;
  const meetingRx = /^meeting:\s(.*)$/i;
  const totalPresentRx = /^total present:\s(.*)$/i;
  const dateRx = /^date:\s(.*)$/i;
  const chairRx = /^chair:.*$/i;
  const audioRx = /^audio:\s?(.*)$/i;
  const proposalRx = /^(proposal|proposed):.*$/i;
  const presentRx = /^present[:+](.*)$/i;
  const resolutionRx = /^(resolution|resolved): ?(.*)$/i;
  const useCaseRx = /^(use case|usecase):\s?(.*)$/i;
  const topicRx = /^topic:\s*(.*)$/i;
  const actionRx = /^action:\s*(.*)$/i;
  const voipRx = /^voip.*$/i;
  const toVoipRx = /^voip.{0,4}:.*$/i;
  const rrsAgentRx = /^RRSAgent.*$/i;
  const queueRx = /^q[+-?]\s.*|^q[+-?].*|^ack\s+.*|^ack$/i;
  const voteRx = /^[+-][01]\s.*|[+-][01]$/i;
  const agendaRx = /^agenda:\s*((https?):.*)$/i;
  const urlRx = /((ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?)/;

  // Compatability code to make this work in both node.js and the browser
  const scrawl = {};
  let nodejs = false;
  if(typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    const Entities = require('html-entities').XmlEntities;
    var entities = new Entities();
    module.exports = scrawl;
    nodejs = true;
  } else {
    window.scrawl = scrawl;
  }

  /* The update counter and the timeout is used to delay the update of the
    HTML output by a few seconds so that reformatting the page doesn't
    overload the CPU. */
  scrawl.updateCounter = 1;
  scrawl.updateCounterTimeout = null;

  // TODO: make it clearer what's internal only and what's configurable
  // ...these happen to be configurable...
  scrawl.minutes_base_url = '';
  scrawl.chair = [];

  scrawl.wordwrap = function(str, width, brk, cut )
  {
    brk = brk || '\n';
    width = width || 65;
    cut = cut || false;

    if (!str) { return str; }

    const regex = '.{1,' + width + '}(\\s|$)' +
      (cut ? '|.{' +width+ '}|.+$' : '|\\S+?(\\s|$)');

    return str.match(new RegExp(regex, 'g')).join(brk);
  };

  scrawl.generateAliases = function()
  {
    const rval = {};

    for(const p in scrawl.people)
    {
      const person = scrawl.people[p];
      var names = p.split(' ');

      // append any aliases to the list of known names
      if('alias' in person)
      {
        names = names.concat(person.alias);
      }

      // Add the aliases and names if they don't already exist in the aliases
      for(const n in names)
      {
        const alias = names[n].toLowerCase();
        if(alias.length > 2 && !(alias in rval))
        {
          rval[alias] = p;
        }
      }
    }

    return rval;
  };

  scrawl.htmlencode = function(text)
  {
    let modified;

    if(nodejs) {
      modified = entities.encodeNonUTF(text);
    } else {
      modified = text.replace(/[\"&<>]/g, function (a) {
        return { '"': '&quot;', '&': '&amp;', '<': '&lt;', '>': '&gt;' }[a];
      });
    }
    modified = modified.replace(urlRx, '<a href="$1">$1</a>');

    return modified;
  };

  scrawl.topic = function(msg, id, textMode)
  {
    let rval = '';

    if(textMode === 'html')
    {
      rval = '<h1 id="topic-' + id + '" class="topic">Topic: ' +
       scrawl.htmlencode(msg) + '</h1>\n';
    }
    else
    {
      rval = '\nTopic: ' + msg + '\n\n';
    }

    return rval;
  };

  scrawl.action = function(msg, id, textMode)
  {
    let rval = '';

    if(textMode === 'html')
    {
      rval = '<div id="action-' + id + '" class="action">ACTION: ' +
       scrawl.htmlencode(msg) + '</div>\n';
    }
    else
    {
      rval = '\n\n' + scrawl.wordwrap('ACTION: ' + msg, 65, '\n  ') + '\n\n';
    }

    return rval;
  };

  scrawl.information = function(msg, textMode)
  {
    let rval = '';

    if(textMode === 'html')
    {
      rval = '<div class="information">' +
       scrawl.htmlencode(msg) + '</div>\n';
    }
    else
    {
      rval = scrawl.wordwrap(msg, 65, '\n  ') + '\n';
    }

    return rval;
  };

  scrawl.proposal = function(msg, textMode)
  {
    let rval = '';

    if(textMode === 'html')
    {
      rval = '<div class="proposal"><strong>PROPOSAL:</strong> ' +
       scrawl.htmlencode(msg) + '</div>\n';
    }
    else
    {
      rval =
        '\n' + scrawl.wordwrap('PROPOSAL: ' + msg, 65, '\n  ') + '\n\n';
    }

    return rval;
  };

  scrawl.resolution = function(msg, id, textMode)
  {
    let rval = '';

    if(textMode === 'html')
    {
      rval = '<div id="resolution-' + id + '" class="resolution">' +
        '<strong>RESOLUTION:</strong> ' +
        scrawl.htmlencode(msg) + '</div>\n';
    }
    else
    {
      rval =
        '\n' + scrawl.wordwrap('RESOLUTION: ' + msg, 65, '\n  ') + '\n\n';
    }

    return rval;
  };

  scrawl.usecase = function(msg, textMode)
  {
    let rval = '';

    if(textMode === 'html')
    {
      rval = '<div id="usecase-' + scrawl.counter + '" class="resolution">' +
        '<strong>USE CASE:</strong> ' +
        scrawl.htmlencode(msg) + '</div>\n';
    }
    else
    {
      rval =
        '\n' + scrawl.wordwrap('USE CASE: ' + msg, 65, '\n  ') + '\n\n';
    }

    return rval;
  };

  scrawl.scribe = function(msg, textMode, person, assist)
  {
    let rval = '';

    // capitalize the first letter of the message if it doesn't start with http
    if(!(/^(\s)*https?:\/\//.test(msg))) {
      msg = msg.replace(/(\s)?([a-zA-Z])/, function(firstLetter) {
        return firstLetter.toUpperCase();
      });
    }

    if(textMode === 'html')
    {
      scrawl.counter += 1;
      rval = '<div id="' + scrawl.counter + '" ';

      if(person !== undefined)
      {
        rval += 'class="comment"><span class="name">' +
          scrawl.htmlencode(person) + '</span>: ';
      }
      else
      {
        rval += 'class="information">';
      }

      rval += scrawl.htmlencode(msg);

      if(assist !== undefined)
      {
        rval += ' [scribe assist by ' + scrawl.htmlencode(assist) + ']';
      }

      rval += ' <a id="link-' + scrawl.counter +
        '" class="comment-link" href="#'+ scrawl.counter + '">✪</a></div>\n';
    }
    else
    {
      scribeline = '';
      if(person !== undefined)
      {
        scribeline = person + ': ';
      }
      scribeline += msg;
      if(assist !== undefined)
      {
        scribeline += ' [scribe assist by '+ assist + ']';
      }

      rval = scrawl.wordwrap(scribeline, 65, '\n  ') + '\n';
    }

    return rval;
  };

  scrawl.scribeContinuation = function(msg, textMode)
  {
    let rval = '';

    if(textMode === 'html')
    {
      rval = '<div class="comment-continuation">' +
       scrawl.htmlencode(msg) + '</div>\n';
    }
    else
    {
      rval = scrawl.wordwrap('  ' + msg, 65, '\n  ') + '\n';
    }

    return rval;
  };

  scrawl.present = function(context, person)
  {
    if(person !== undefined)
    {
      context.present[person] = true;
    }
  };

  scrawl.error = function(msg, textMode)
  {
    let rval = '';

    if(textMode === 'html')
    {
      rval = '<div class="error">Error: ' +
        scrawl.htmlencode(msg) + '</div>\n';
    }
    else
    {
      rval = scrawl.wordwrap('\nError: ' + msg, 65, '\n  ') + '\n';
    }

    return rval;
  };

  scrawl.setHtmlHeader = function(header) {
    scrawl.htmlHeader = header;
  };

  scrawl.setHtmlFooter = function(footer) {
    scrawl.htmlFooter = footer;
  };

  scrawl.processLine = function(context, aliases, line, textMode)
  {
     let rval = '';
     const match = commentRx.exec(line);

     if(match)
     {
       const nick = match[2].toLowerCase();
       const msg = match[3];

       // check for a scribe line
       if(msg.search(scribeRx) !== -1)
       {
         const scribe = msg.split(':')[1].replace(' ', '');
         scribe = scribe.toLowerCase();
         if(scribe in aliases)
         {
            if(!context.hasOwnProperty('scribe')) {
              context.scribe = [];
            }

            context.scribenick = scribe;
            context.scribe.push(aliases[scribe]);
            scrawl.present(context, aliases[scribe]);
            rval = scrawl.information(
              context.scribe[context.scribe.length-1] +
              ' is scribing.', textMode);
         }
       }
       else if(msg.search(chairRx) !== -1)
       {
         var chairs = msg.split(':')[1].split(',');

         context.chair = [];
         for(let i = 0; i < chairs.length; i++) {
           const chair = chairs[i].replace(' ', '').toLowerCase();
           if(chair in aliases)
           {
              context.chair.push(aliases[chair]);
              scrawl.present(context, aliases[chair]);
           }
         }
       }
       // check for meeting line
       else if(msg.search(meetingRx) !== -1)
       {
         const meeting = msg.match(meetingRx)[1];
         context.group = meeting;
       }
       // check for present line
       else if(msg.search(presentRx) !== -1)
       {
          const present = msg.match(presentRx)[1].toLowerCase();
          const people = present.split(',');

          // try to find the person by full name, last name, and then first name
          for(let i = 0; i < people.length; i++) {
            if (!people[i]) {
              scrawl.present(context, aliases[nick]);
            } else {
              const person = people[i].replace(/^\s/, '').replace(/\s$/, '');
              const lastName = person.split(' ')[1];
              const firstName = person.split(' ')[0];
              if(person in aliases) {
                scrawl.present(context, aliases[person]);
              } else if(lastName in aliases) {
                scrawl.present(context, aliases[lastName]);
              } else {
                console.log('Could not find alias for', person);
              }
            }
          }
       }
       // check for audio line
       else if(msg.search(audioRx) !== -1)
       {
         context.audio = false;
       }
       // check for date line
       else if(msg.search(dateRx) !== -1)
       {
         const date = msg.match(dateRx)[1];
         context.date = new Date(date);
       }
       // check for topic line
       else if(msg.search(topicRx) !== -1)
       {
         const topic = msg.match(topicRx)[1];
         context.topics = context.topics.concat(topic);
         rval = scrawl.topic(topic, context.topics.length, textMode);
       }
       // check for action line
       else if(msg.search(actionRx) !== -1)
       {
         const action = msg.match(actionRx)[1];
         context.actions = context.actions.concat(action);
         rval = scrawl.action(action, context.actions.length, textMode);
       }
       // check for Agenda line
       else if(msg.search(agendaRx) !== -1)
       {
         const agenda = msg.match(agendaRx)[1];
         context.agenda = agenda;
       }
       // check for proposal line
       else if(msg.search(proposalRx) !== -1)
       {
         const proposal = msg.split(':')[1];
         rval = scrawl.proposal(proposal, textMode);
       }
       // check for resolution line
       else if(msg.search(resolutionRx) !== -1)
       {
         const resolution = msg.match(resolutionRx)[2];
         context.resolutions = context.resolutions.concat(resolution);
         rval = scrawl.resolution(
           resolution, context.resolutions.length, textMode);
       }
       // check for use case line
       else if(msg.search(useCaseRx) !== -1)
       {
         const usecase = msg.match(useCaseRx)[2];
         rval = scrawl.usecase(usecase, textMode);
       }
       else if(msg.search(totalPresentRx) !== -1)
       {
         context.totalPresent = msg.match(totalPresentRx)[1];
       }
       else if(nick.search(voipRx) !== -1 || msg.search(toVoipRx) !== -1 ||
         nick.search(rrsAgentRx) !== -1 || msg.search(rrsAgentRx) !== -1 )
       {
         // the line is from or is addressed to a channel bot, ignore it
       }
       else if(msg.search(queueRx) !== -1)
       {
         // the line is queue management, ignore it
       }
       // the line is a +1/-1 vote
       else if(msg.search(voteRx) !== -1)
       {
         if(nick in aliases)
         {
           rval = scrawl.scribe(msg, textMode, aliases[nick]);
           scrawl.present(context, aliases[nick]);
         }
       }
       // the line is by the scribe
       else if(nick === context.scribenick)
       {
         if(msg.indexOf('…') === 0 || msg.indexOf('...') === 0)
         {
           // the line is a scribe continuation
           rval = scrawl.scribeContinuation(msg, textMode);
         }
         else if(msg.indexOf(':') !== -1)
         {
           const alias = msg.split(':', 1)[0].replace(' ', '').toLowerCase();

           if(alias in aliases)
           {
              // the line is a comment made by somebody else that was
              // scribed
              const cleanedMessage = msg.split(':').splice(1).join(':');

              scrawl.present(context, aliases[alias]);
              rval = scrawl.scribe(
                cleanedMessage, textMode, aliases[alias]);
           }
           else
           {
              // The scribe is noting something and there just happens
              // to be a colon in it
              rval = scrawl.scribe(msg, textMode);
           }
         }
         else
         {
           // The scribe is noting something
           rval = scrawl.scribe(msg, textMode);
         }
       }
       // the line is a comment by somebody else
       else if(nick !== context.scribenick)
       {
         if(msg.indexOf(':') !== -1)
         {
           const alias = msg.split(':', 1)[0].replace(' ', '').toLowerCase();

           if(alias in aliases)
           {
              // the line is a scribe assist
              const cleanedMessage = msg.split(':').splice(1).join(':');

              scrawl.present(context, aliases[alias]);
              rval = scrawl.scribe(cleanedMessage, textMode,
                aliases[alias], aliases[nick]);
           }
           else if(alias.indexOf('http') === 0)
           {
             rval = scrawl.scribe(msg, textMode, aliases[nick]);
           }
           else if(aliases.hasOwnProperty(nick))
           {
             scrawl.present(context, aliases[nick]);
             rval = scrawl.scribe(msg, textMode, aliases[nick]);
           }
           else
           {
             rval = scrawl.error(
               '(IRC nickname \'' + nick + '\' not recognized)' + line,
               textMode);
           }
         }
         else if (!(nick in aliases)) {
           rval = scrawl.error(
             '(IRC nickname \'' + nick + '\' not recognized)' + line,
             textMode);
         }
         else
         {
           // the line is a scribe line by somebody else
           scrawl.present(context, aliases[nick]);
           rval = scrawl.scribe(msg, textMode, aliases[nick]);
         }
       }
       else
       {
         rval = scrawl.error('(Strange line format)' + line, textMode);
       }
     }

     return rval;
  };

  scrawl.generateSummary = function(context, textMode)
  {
    let rval = '';
    let time = context.date || new Date();
    let month = '' + (time.getMonth() + 1)
    let day = '' + time.getDate()
    const group = context.group;
    const agenda = context.agenda;
    const audio = 'audio.ogg';
    const chair = context.chair;
    const scribe = context.scribe.filter(function(item, i, arr) { 
      return arr.indexOf(item) === i; 
    });
    const topics = context.topics;
    const resolutions = context.resolutions;
    const actions = context.actions;
    const present = [];

    // build the list of people present
    for(const name in context.present) {
      const person = scrawl.people[name]
      person['name'] = name;
      present.push(person)
    }

    // modify the time if it was specified
    if(context.date) {
      time = new Date(context.date)
      time.setHours(35);
    }

    // zero-pad the month and day if necessary
    if(month.length === 1)
    {
      month = '0' + month;
    }

    if(day.length === 1)
    {
      day = '0' + day;
    }

    // generate the summary text
    if(textMode === 'html')
    {
      rval += '<h1>' + group + '</h1>\n';
      rval += '<h2>Minutes for ' + time.getFullYear() + '-' +
         month + '-' + day +'</h2>\n';
      rval += '<div class="summary">\n<dl>\n';
      rval += '<dt>Agenda</dt><dd><a href="' +
         agenda + '">' + agenda + '</a></dd>\n';

      if(topics.length > 0)
      {
        rval += '<dt>Topics</dt><dd><ol>';
        for(i in topics)
        {
          const topicNumber = parseInt(i) + 1;
          rval += '<li><a href="#topic-' + topicNumber + '">' +
            topics[i] + '</a>';
        }
        rval += '</ol></dd>';
      }

      if(resolutions.length > 0)
      {
        rval += '<dt>Resolutions</dt><dd><ol>';
        for(i in resolutions)
        {
          const resolutionNumber = parseInt(i) + 1;
          rval += '<li><a href="#resolution-' + resolutionNumber + '">' +
            resolutions[i] + '</a>';
        }
        rval += '</ol></dd>';
      }

      if(actions.length > 0)
      {
        rval += '<dt>Action Items</dt><dd><ol>';
        for(i in actions)
        {
          const actionNumber = parseInt(i) + 1;
          rval += '<li><a href="#action-' + actionNumber + '">' +
            actions[i] + '</a>';
        }
        rval += '</ol></dd>';
      }

      // generate the list of people present
      let peoplePresent = ''
      for(let i = 0; i < present.length; i++) {
        const person = present[i];

        if(i > 0) {
          peoplePresent += ', ';
        }

        if ('homepage' in person) {
          peoplePresent += '<a href="' + person.homepage + '">'+
            person.name + '</a>';
        } else {
          peoplePresent += person.name;
        }
      }
      if(context.totalPresent) {
        peoplePresent += ', ' + context.totalPresent;
      }

      rval += '<dt>Organizer</dt><dd>' + chair.join(', ') + '</dd>\n';
      rval += '<dt>Scribe</dt><dd>' + scribe.join(', ') + '</dd>\n';
      rval += '<dt>Present</dt><dd>' + peoplePresent + '</dd>\n';

      if(context.audio) {
        rval += '<dt>Audio Log</dt><dd>' +
           '<div><a href="' + audio + '">' + audio + '</a></div>\n' +
           '<div><audio controls="controls" preload="none">\n' +
           '<source src="' + audio + '" type="audio/ogg" />' +
           'Warning: Your browser does not support the HTML5 audio element, ' +
           'please upgrade.</audio></div></dd>\n';
      }

      rval += '</dl>\n</div>\n';
    }
    else
    {
      // generate the list of people present
      let peoplePresent = ''
      for(let i = 0; i < present.length; i++) {
        var person = present[i];

        if(i > 0) {
          peoplePresent += ', ';
        }

        peoplePresent += person.name
      }
      if(context.totalPresent) {
        peoplePresent += ', ' + context.totalPresent;
      }

      rval += group;
      rval += ' Minutes for ' + time.getFullYear() + '-' +
         month + '-' + day + '\n\n';
      rval += 'Agenda:\n  ' + agenda + '\n';

      if(topics.length > 0)
      {
        rval += 'Topics:\n';
        for(i in topics)
        {
          const topicNumber = parseInt(i) + 1;
          rval += scrawl.wordwrap(
            '  ' + topicNumber + '. ' + topics[i], 65,
            '\n    ') + '\n';
        }
      }

      if(resolutions.length > 0)
      {
        rval += 'Resolutions:\n';
        for(i in resolutions)
        {
          const resolutionNumber = parseInt(i) + 1;
          rval += scrawl.wordwrap(
            '  ' + resolutionNumber + '. ' + resolutions[i], 65,
            '\n    ') + '\n';
        }
      }

      if(actions.length > 0)
      {
        rval += 'Action Items:\n';
        for(i in actions)
        {
          const actionNumber = parseInt(i) + 1;
          rval += scrawl.wordwrap(
            '  ' + actionNumber + '. ' + actions[i], 65,
            '\n    ') + '\n';
        }
      }

      rval += 'Organizer:\n  ' + chair.join(' and ') + '\n';
      rval += 'Scribe:\n  ' + scribe.join(' and ') + '\n';
      rval += 'Present:\n  ' +
        scrawl.wordwrap(peoplePresent, 65, '\n  ') + '\n';
      if(context.audio) {
        rval += 'Audio:\n  ' + scrawl.minutes_base_url +
          time.getFullYear() + '-' +
           month + '-' + day + '/audio.ogg\n\n';
      } else {
        rval += '\n';
      }
    }

    return rval;
  };

  scrawl.generateMinutes = function(ircLog, textMode, date, haveAudio)
  {
    let minutes = '';
    const ircLines = ircLog.split(/\r?\n/);
    const aliases = scrawl.generateAliases();
    scrawl.counter = 0;

    // TODO: expose this better?
    // TODO: return objects so we can link things
    var chair = Object.keys(scrawl.people).filter((key) => {
      return 'chair' in scrawl.people[key] && scrawl.people[key].chair;
    });

    // initialize the IRC log scanning context
    var context =
    {
      'group': scrawl.group,
      'chair': chair,
      'present': {},
      'scribe': [],
      'topics': [],
      'resolutions': [],
      'actions': [],
      'audio': haveAudio
    };

    if(date) {
      context.date = new Date(date);
      context.date.setHours(36);
    }

    // process each IRC log line
    for(var i = 0; i < ircLines.length; i++)
    {
      var line = ircLines[i];
      minutes += scrawl.processLine(context, aliases, line, textMode);
    }

    // generate the meeting summary
    const summary = scrawl.generateSummary(context, textMode);

    // fix spacing around proposals, actions, and resolutions
    minutes = minutes.replace(/\n\n\n/gm, '\n\n');

    // create the final log output
    return summary + minutes;
  }
})();
