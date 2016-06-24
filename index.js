'use strict';

const fs = require('fs');
const path = require('path');
const stream = require('stream');
const crypto = require('crypto');
const mkdirp = require('mkdirp');
const del = require('del');
const vfs = require('vinyl-fs');
const File = require('vinyl');
const through = require('through2');

let posixPath = function(path) {
	return path;
};

let localizedPath = posixPath;

if (path.sep === '\\') {
	posixPath = function(path) {
		return path.replace(/\\/g, '/');
	};

	localizedPath = function(path) {
		return path.replace(/\//g, '\\');
	};
}

function getOptions(options, defaultOptions) {
	return Object.assign(defaultOptions, options || {});
}

function getHash(content) {
	return new Promise(function(resolve, reject) {
		let tempStream;

		if (content instanceof stream.Stream)
			tempStream = content;
		else if (content instanceof Buffer) {
			tempStream = new stream.PassThrough();
			tempStream.end(content);
		}
		else {
			reject();
			return;
		}

		const hash = crypto.createHash('sha1')
			.setEncoding('hex')
			.on('finish', function() {
				resolve(this.read());
			})
			.on('error', reject);

		tempStream.pipe(hash);
	});
}

function patch(comparedFolder, options) {
	const existingFiles = {};
	const counter = createCounter();

	options = getOptions(options, {
		highWaterMark: 16384
	});

	function transform(file, encoding, callback) {
		if (file.stat.isDirectory())
			return callback();

		const comparedFilePath = path.join(comparedFolder, file.relative);
		const that = this;

		fs.stat(comparedFilePath, function(err, comparedStat) {
			if (!comparedStat)
				return callback(null, that.addPatchedFile(file, patch.NEW));

			existingFiles[comparedFilePath] = true;

			if (comparedStat.size !== file.stat.size)
				return callback(null, that.addPatchedFile(file, patch.CHANGED));

			Promise.all([
				getHash(fs.createReadStream(comparedFilePath)),
				getHash(file.contents)
			]).then(function(hashes) {
				callback(null, hashes[0] === hashes[1] ? null : that.addPatchedFile(file, patch.CHANGED));
			}).catch(callback);
		});
	}

	function flush(callback) {
		this.findDeletedFiles(comparedFolder);
		console.log('Patched files:', counter.toString());
		callback();
	}

	const plugin = through({ objectMode: true, highWaterMark: options.highWaterMark }, transform, flush);

	plugin.addPatchedFile = function(file, status) {
		patch.setFileStatus(file, status);
		++counter[status];
		return file;
	};

	plugin.findDeletedFiles = function(folder) {
		const files = fs.readdirSync(folder);

		for (let file of files) {
			const filePath = path.join(folder, file);

			if (fs.statSync(filePath).isDirectory())
				this.findDeletedFiles(filePath);

			else if (!(filePath in existingFiles))
				this.push(this.addPatchedFile(
					new File({
						base: comparedFolder,
						path: filePath
					}),
					patch.DELETED
				));
		}
	};

	return plugin;
}

patch.write = function(patchFolder, options) {
	del.sync(patchFolder);
	mkdirp.sync(patchFolder);

	options = getOptions(options, {
		passthrough: false
	});

	const patchFiles = {};

	function transform(file, encoding, callback) {
		const status = patch.getFileStatus(file);

		if (status !== patch.DELETED) {
			const filePath = path.join(patchFolder, file.relative);
			mkdirp.sync(path.dirname(filePath));
			file.pipe(fs.createWriteStream(filePath));
		}

		patchFiles[posixPath(file.relative)] = status;
		callback(null, options.passthrough ? file : null);
	}

	function flush(callback) {
		const filePath = path.join(patchFolder, patch.FILE_MAME);
		fs.writeFileSync(filePath, JSON.stringify(patchFiles, null, '\t'));
		console.log('Patch successfully created');
		callback();
	}

	return through.obj(transform, flush).on('finish', function () {
		this.emit('end');
	});
};

patch.read = function(patchFolder, destFolder, options) {
	const filePath = path.join(patchFolder, patch.FILE_MAME);
	const patchFiles = {};
	const vinylFiles = [];
	const counter = createCounter();

	destFolder = getDestinationFolder(destFolder);

	JSON.parse(fs.readFileSync(filePath), function(file, status) {
		patchFiles[localizedPath(file)] = status;
		return status;
	});

	options = getOptions(options, {
		base: patchFolder
	});

	for (const file in patchFiles) {
		const status = patchFiles[file];

		if (status === patch.NEW || status === patch.CHANGED)
			vinylFiles.push(path.join(patchFolder, file));
		else if (status === patch.DELETED)
			vinylFiles.push(path.join(destFolder, file));

		++counter[status];
	}

	console.log('Patched files:', counter.toString());

	return vfs.src(vinylFiles, options).pipe(through.obj(function(file, encoding, callback) {
		patch.setFileStatus(file, patchFiles[file.relative] || patch.DELETED);
		callback(null, file);
	}));
};

patch.apply = function(destFolder, options) {
	destFolder = getDestinationFolder(destFolder);

	options = getOptions(options, {
		passthrough: false
	});

	function transform(file, encoding, callback) {
		const status = patch.getFileStatus(file);

		if (status === patch.DELETED) {
			fs.stat(file.path, function(err, stat) {
				if (stat)
					fs.unlinkSync(file.path);
			});
		}
		else if (status === patch.NEW || status === patch.CHANGED) {
			const targetPath = path.join(destFolder, file.relative);

			if (status === patch.NEW)
				mkdirp.sync(path.dirname(targetPath));

			file.pipe(fs.createWriteStream(targetPath));
		}

		callback(null, options.passthrough ? file : null);
	}

	function flush(callback) {
		console.log('Patch successfully applied');
		callback();
	}

	return through.obj(transform, flush).on('finish', function () {
		this.emit('end');
	});
};

patch.NEW = 'new';
patch.CHANGED = 'changed';
patch.DELETED = 'deleted';

patch.FILE_MAME = 'patch.json';

patch.getFileStatus = function(file) {
	return file.patchStatus;
};

patch.setFileStatus = function(file, status) {
	file.patchStatus = status;
};

function createCounter() {
	const counter = {
		toString: function() {
			return counter[patch.CHANGED] + ' changed, ' + counter[patch.DELETED] + ' deleted, ' + counter[patch.NEW] + ' new';
		}
	};

	counter[patch.NEW] = 0;
	counter[patch.CHANGED] = 0;
	counter[patch.DELETED] = 0;

	return counter;
}

function getDestinationFolder(destFolder) {
	return destFolder || '.';
}

module.exports = patch;
