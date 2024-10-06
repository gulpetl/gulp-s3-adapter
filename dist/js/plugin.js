"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.src = src;
exports.request = requestFunc;
exports.dest = dest;
const through2 = require('through2');
const Vinyl = require("vinyl");
const PluginError = require("plugin-error");
const pkginfo = require('pkginfo')(module); // project package.json info into module.exports
const PLUGIN_NAME = module.exports.name;
const loglevel = require("loglevel");
const log = loglevel.getLogger(PLUGIN_NAME); // get a logger instance based on the project name
log.setLevel((process.env.DEBUG_LEVEL || 'warn'));
const request = require("request");
const path = require("path");
const from2 = require('from2');
const url_1 = require("url");
// import * as fs from 'fs';
const dropbox_1 = require("dropbox");
/* This is a gulp plugin. It is compliant with best practices for Gulp plugins (see
https://github.com/gulpjs/gulp/blob/master/docs/writing-a-plugin/guidelines.md#what-does-a-good-plugin-look-like ) */
function src(url, configObj) {
    let result;
    if (!configObj)
        configObj = {};
    try {
        let fileName = (0, url_1.parse)(url).pathname || "apiResult.dat";
        fileName = path.basename(fileName);
        // from2 returns a writable stream; we put the vinyl file into the stream. This is the core of gulp: Vinyl files
        // inside streams
        // result = from2.obj([vinylFile])
        result = from2.obj();
        //
        // Now we set the contents of our vinyl file. For now we're using streams; we'll add buffer support later
        // We want to set our content to the stream produced by the request module:
        //
        // this doesn't work; request doesn't produce a stream when called this way. It doesn't have a .stream() function either...
        // vinylFile.contents = request(url) as any 
        // this works: set contents to a passthrough stream, and pipe the result of the request file through that passthrough stream
        // vinylFile.contents = through2.obj() // passthrough stream 
        // request(url).pipe(vinylFile.contents as unknown as any)
        // this works: same idea as above, but a cleaner
        // make a copy of configObj specific to this file, adding url and leaving original unchanged
        // let optionsCopy = Object.assign({}, configObj, {"url":url})
        if (!configObj.buffer)
            // vinylFile.contents = request(optionsCopy).pipe(through2.obj());      
            throw new PluginError(PLUGIN_NAME, "Streaming not available");
        else {
            let dbx = new dropbox_1.Dropbox(configObj);
            // console.log("uploading...")
            // TODO: don't ignore subfolders
            dbx.filesDownload({ path: url })
                // .filesUpload({ path: path.posix.join(directory,file.basename), contents: file.contents as Buffer, mode:mode as any })
                .then((response) => {
                // console.log(response.result);
                let vinylFile = new Vinyl({
                    // base: response.name,   
                    cwd: '/', // just guessing here; not sure if this is the right approach. But it seams to work as intended...
                    path: response.result.path_lower,
                    contents: response.result.fileBinary
                });
                result.push(vinylFile);
                // cb(null, file)
                // console.log("worked!")
            })
                .catch((err) => {
                console.error("promise error: ", JSON.stringify(err));
                // cb(err)
                // throw(err)
                // node.error(err, msg);
                // result.emit(new PluginError(PLUGIN_NAME, err))
            });
        }
    }
    catch (err) {
        // emitting here causes some other error: TypeError: Cannot read property 'pipe' of undefined
        // result.emit(new PluginError(PLUGIN_NAME, err))
        // For now, bubble error up to calling function
        // throw new PluginError(PLUGIN_NAME, err)
    }
    return result;
}
function requestFunc(configObj) {
    if (!configObj)
        configObj = {};
    // override configObj defaults here, if needed
    // if (configObj.header === undefined) configObj.header = true
    // creating a stream through which each file will pass - a new instance will be created and invoked for each file 
    // see https://stackoverflow.com/a/52432089/5578474 for a note on the "this" param
    const strm = through2.obj(function (file, encoding, cb) {
        const self = this;
        let returnErr = null;
        let newFileName = "";
        // make a copy of configObj specific to this file, allowing gulp-data to override any shared settings and leaving original unchanged
        let config = Object.assign({}, configObj, file.data);
        if (file.basename) {
            let base = path.basename(file.basename, path.extname(file.basename));
            newFileName = base + '.response' + path.extname(file.basename);
        }
        let responseFile = new Vinyl({ path: newFileName });
        if (file.isNull() || returnErr) {
            // return empty file
            return cb(returnErr, file);
        }
        else if (file.isBuffer()) {
            // returnErr = new PluginError(PLUGIN_NAME, 'Buffer mode is not yet supported. Use gulp.src({buffer:false})...');
            config.body = file.contents;
            request.post(config, function (err, resp, body) {
                if (typeof body === "string") {
                    responseFile.contents = Buffer.from(body);
                }
                else
                    responseFile.contents = body;
                self.push(file);
                self.push(responseFile);
                return cb(returnErr);
            });
        }
        else if (file.isStream()) {
            let responseStream = through2.obj(); // passthrough stream 
            responseFile.contents = responseStream;
            file.contents
                .pipe(request(config))
                .on('response', function (response) {
                // testing
                log.debug(response.statusCode); // 200
                log.debug(response.headers['content-type']); // 'image/png'
                // log.debug(JSON.stringify(response.toJSON()))
            })
                .pipe(responseStream)
                .on('end', function () {
                // DON'T CALL THIS HERE. It MAY work, if the job is small enough. But it needs to be called after the stream is SET UP, not when the streaming is DONE.
                // Calling the callback here instead of below may result in data hanging in the stream--not sure of the technical term, but dest() creates no file, or the file is blank
                // cb(returnErr, file);
                // log.debug('calling callback')    
                log.debug(PLUGIN_NAME + ' is done');
            })
                .on('error', function (err) {
                log.error(err);
                self.emit('error', new PluginError(PLUGIN_NAME, err));
            });
            // In this order, both files are written correctly by dest();
            self.push(file);
            self.push(responseFile);
            // in THIS order newFile is still written correctly, and file
            // is written but is blank. If either line is commented 
            // out, the other line writes correctly
            // this.push(newFile)
            // this.push(file)
            // after our stream is set up (not necesarily finished) we call the callback
            log.debug('calling callback');
            cb(returnErr);
        }
    });
    return strm;
}
// export function dest(this: any, url:string, options: any) {
function dest(directory, configObj) {
    if (!configObj)
        configObj = {};
    // override configObj defaults here, if needed
    // if (configObj.header === undefined) configObj.header = true
    // creating a stream through which each file will pass - a new instance will be created and invoked for each file 
    // see https://stackoverflow.com/a/52432089/5578474 for a note on the "this" param
    const strm = through2.obj(function (file, encoding, cb) {
        const self = this;
        let returnErr = null;
        if (file.isNull()) {
            // return empty file
            return cb(returnErr, file);
        }
        else if (file.isBuffer()) {
            try {
                // load file location settings, setup dropbox client
                let dbx = new dropbox_1.Dropbox(configObj);
                let mode;
                // if (msg.payload?.result?.rev)
                //     mode = { ".tag": "update", "update": msg.payload?.result?.rev };
                // else
                mode = { ".tag": "overwrite" };
                // console.log("uploading...")
                // TODO: don't ignore subfolders
                dbx.filesUpload({ path: path.posix.join(directory, file.basename), contents: file.contents, mode: mode })
                    .then((response) => {
                    // return msg;
                    cb(null, file);
                    // console.log("worked!")
                })
                    .catch((err) => {
                    console.error(JSON.stringify(err));
                    cb(err);
                    // throw(err)
                    // node.error(err, msg);
                });
            }
            catch (err) {
                // console.log(err);
                cb(err);
            }
        }
        else if (file.isStream()) {
            returnErr = new PluginError(PLUGIN_NAME, "Streaming not available");
            // result.emit(returnErr)
            return cb(returnErr, file);
        }
    });
    return strm;
}
//# sourceMappingURL=plugin.js.map