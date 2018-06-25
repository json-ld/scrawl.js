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

Now, we need to setup the nicknames of all the people in the group.
So, copy `people.json.example` to `people.json` and fill in names, homepages,
and nicknames as needed.

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
    -w, --wordpress              If set, publish the minutes to the blog
    -e, --email                  If set, publish the minutes to the mailing list
    -t, --twitter                If set, publish the minutes to Twitter
    -g, --google                 If set, publish the minutes to G+
    -i, --index                  Build meeting index
    -q, --quiet                  Don't print status information to the console

```

The WordPress, Google, and Twitter related switches also require some custom
environment variables to be setup. For examples of those, see the
[publish.sh.example](publish.sh.example).

## Development

During development, you'll want to test with the working copy version of
scrawl. For that, simply use `node index.js -h` or `npm start -- -h`.

## License

BSD-3-clause
