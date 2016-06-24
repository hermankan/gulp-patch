# gulp-patch
Create and apply a patch of new/changed/deleted files using Gulp

From time to time, developers find themselves looking for a way to apply a patch of changed files to their destination server, not the whole bunch of all existing files. Since you have come to this page, you probably know what that means. For instance, in case of a typical web application, you pass your source code through Babel/TypeScript/CoffeeScript, then create an output folder with all the assets that comprise the application and partially overlap your previous build. There are a lot of reasons for why you would not deploy them all at once on your target server. Traffic amount, user-uploaded files getting otherwise overwritten on that server, the need to see what exactly has changed and therefore what is to be restarted...

The plugin allows you to not only create a patch of changed files, which unlike some other plugins includes **new** and **deleted** files, but also apply it to your target server by creating, overwriting and deleting respective files.

The package includes the following sub-modules:

- on development/CI computer:

  * `patch` - compares Gulp's current file stream with destination folder and returns a stream of new/changed/deleted files;
  * `patch.write` - stores the new/changed files in a patch folder and also creates *patch.json* describing the difference;

- on target server:

  * `patch.read` - reads *patch.json* from a patch folder and restores the stream of the new/changed/deleted files;
  * `patch.apply` - creates, overwrites and deletes the files as per their patch status.


## Installation

```
$ npm install --save-dev gulp-patch
```

## Usage

```js
const gulp = require('gulp');
const patch = require('gulp-patch');
const del = require('del');

const PUBLISH_FOLDER = './publish';
const PREV_PUBLISH_FOLDER = './publish.prev';
const PATCH_FOLDER = './patch';

gulp.task('patch.create', ['publish'], function () {
	del.sync(PATCH_FOLDER);
	return gulp.src(path.join(PUBLISH_FOLDER, '**'), { stripBOM: false })
		.pipe(patch(PREV_PUBLISH_FOLDER))
		.pipe(patch.write(PATCH_FOLDER));
});

gulp.task('patch.apply', function () {
	return patch.read(PATCH_FOLDER, null, { stripBOM: false })
		.pipe(patch.apply());
});
```

## API

### patch(comparedFolder, options)

Compares Gulp's current file stream with `comparedFolder` and returns a stream of new/changed/deleted files.

#### comparedFolder

Type: `string`

The folder to compare with.

#### options

##### highWaterMark

Type: `integer`  
Default: `16384`

The maximum number of files to store in stream's internal buffer - see stream.Writable's [`highWaterMark`](https://nodejs.org/api/stream.html#stream_new_stream_writable_options) parameter. If the stream is consumed immediately, this defines the buffer size for deleted files.

### patch.write(patchFolder, options)

Consumes the current patch stream, stores new/changed files in `patchFolder` and also creates *patch.json* describing the difference.

#### patchFolder

Type: `string`

The folder to store patch files and *patch.json*.

#### options

##### passthrough

Type: `boolean`  
Default: `false`

Setting to `true` re-emits passed files, so they can be piped further.

### patch.read(patchFolder, destFolder, options)

Reads *patch.json* from `patchFolder` and restores the stream of patch files.

#### patchFolder

Type: `string`

The folder to read *patch.json* and new/changed files from.

#### destFolder

Type: `string` 
Default: `'.'` (current directory)

The folder to read deleted files from.

#### options

Options to pass to [Vinyl file stream](https://github.com/gulpjs/vinyl-fs#options) Do not pass `base` parameter, as it must always be `patchFolder`.

### patch.apply(destFolder, options)

Creates, overwrites and deletes files in `destFolder` as per their patch status.

#### destFolder

Type: `string` 
Default: `'.'` (current directory)

The folder where patch files are updated.

#### options

##### passthrough

Type: `boolean`  
Default: `false`

Setting to `true` re-emits passed files, so they can be piped further.


MIT © Herman Kan
