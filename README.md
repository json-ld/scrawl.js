# Scrawl.js

Handy scribe tool for W3C group scribes.

## Installation

Clone the repo locally, and in this repositories working directory run the
following commands:

```sh
$ npm i
$ npm start
```

## Usage

Scrawl works on directories structured like:
```
2011-07-04/
  ./irc.log
  ./audio.ogg
```

* The directory name MUST be in ISO 8601 format.
* The log file MUST be named `irc.log`.
* The (optional) audio file MUST be named `audio.ogg`.

The output files will be added to the same directory for simpler hosting of
all the things.

Now, we need to setup the nicknames of all the people in the group.
So, copy `people.json.example` to `people.json` and fill in names, homepages,
and nicknames as needed.

Then...
```sh
$ npm start -- -d test/fixtures/2011-07-04/
```
(change the `test/fixture/2011-07-04/` to point to your directory)

If that went as planned, there will be an `index.html` file in that directory!

## License

BSD-3-clause
