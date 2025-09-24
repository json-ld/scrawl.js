# Scrawl.js

Handy scribe tool for W3C group scribes.

## Installation

Clone the repo locally, and in this repositories working directory run the
following commands:

```sh
$ npm i
$ npm start
```

## Setup

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

There are **two** important setup files:
 - `config.yaml` (see `config.yaml.example`)
 - `people.json` (see `people.json.example`)

Once those two files are configured to your contentment, see below.

## Command Line Usage

To install scrawl globally, run...
```sh
$ npm i -g
```

Then...
```sh
$ scrawl -m -d 2011-07-04/
```

To include a parent index of all minutes directories, run...
```sh
$ scrawl -i -m -d 2011-07-04/
```

The resulting directory will look like
```
2011-07-04/
  ./irc.log
  ./audio.ogg
  ./index.html
index.html
```

### Command Line Help Output

There are several more options available.

```sh

  Usage: index.js [options]

  Options:

    -h, --help                   output usage information
    -V, --version                output the version number
    -d, --directory <directory>  The directory to process.
    -m, --html                   If set, write the minutes to an index.html file
    -e, --email                  If set, publish the minutes to the mailing list
    -g, --google                 If set, publish the minutes to G+
    -i, --index                  Build meeting index
    -q, --quiet                  Don't print status information to the console

```

The Google related switch also requires some custom
environment variables to be setup. For examples of those, see the
[publish.sh.example](publish.sh.example).

## Web-based editor

You can edit logs in a small Web app. To do so, it's recommended to install the
`http-server` node package and use that (for now):

```sh
$ npm i -g http-server
$ http-server www/
```

Once that's done, you can visit `http://localhost:8080/` to paste IRC logs, see
the output, and copy/paste the HTML (etc) wherever you need it.

For this to work you'll need to put `people.json` in your `www/` folder.

## Wrapping bash scripts

If you're on a machine that has bash available, there are a couple useful tools
in the `scripts/` folder. To configure them, copy the `publishing.cfg.example`
to `publishing.cfg`, make your changes, and then run the scripts (which wrap
the node code).

## Development

During development, you'll want to test with the working copy version of
scrawl. For that, simply use `node index.js -h` or `npm start -- -h`.

## License

BSD-3-clause
