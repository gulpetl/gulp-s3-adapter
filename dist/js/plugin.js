"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.src = src;
exports.dest = dest;
const through2 = require('through2');
const Vinyl = require("vinyl");
const PluginError = require("plugin-error");
const pkginfo = require('pkginfo')(module); // project package.json info into module.exports
const PLUGIN_NAME = module.exports.name;
const loglevel = require("loglevel");
const log = loglevel.getLogger(PLUGIN_NAME); // get a logger instance based on the project name
log.setLevel((process.env.DEBUG_LEVEL || 'warn'));
const path = require("path");
// const from2 = require('from2')
const url_1 = require("url");
// import * as fs from 'fs';
const Minio = require("minio");
const client_s3_1 = require("@aws-sdk/client-s3");
const lead_1 = require("lead");
/* This is a gulp plugin. It is compliant with best practices for Gulp plugins (see
https://github.com/gulpjs/gulp/blob/master/docs/writing-a-plugin/guidelines.md#what-does-a-good-plugin-look-like ) */
function src(url, configObj) {
    let result;
    if (!configObj)
        configObj = {};
    let minioClient = new Minio.Client(configObj);
    try {
        let fileName = (0, url_1.parse)(url).pathname || "apiResult.dat";
        fileName = path.basename(fileName);
        url = url.split(/[\/\\]+/).join("/"); // ensure posix-style separators 
        // from2 returns a writable stream; we put the vinyl file into the stream. This is the core of gulp: Vinyl files
        // inside streams
        // result = from2.obj([vinylFile])
        // result = from2.obj()
        result = through2.obj(); // passthrough stream 
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
        if (!configObj.buffer) {
            // vinylFile.contents = request(optionsCopy).pipe(through2.obj());      
            // throw new PluginError(PLUGIN_NAME, "Streaming not available")
            console.log("url:", url);
            let pathSections = (url || "").split(/[\/\\]+/); // split directory into sections by slashes/backslashes
            let bucket = pathSections.shift() || ""; // remove first path section as bucket
            // let subfolders = pathSections.join("/"); // reassemble remaining path sections
            // minioClient.putObject(bucket, path.posix.join(subfolders, (file.relative.split(/[\/\\]+/).join("/"))), file.contents as Readable, undefined,  (err:any, stats:any) => {
            // TODO: add glob support
            let vinylFile = new Vinyl({
                path: url, // for now: url contains a full file name
                base: path.posix.dirname(url) // use entire dir structure up to the filename as the "base", meaning it will only use subfolders BELOW that level inside the eventual target folder
            });
            minioClient.getObject(bucket, pathSections.join("/"))
                .then(readable => {
                console.log("got it!");
                vinylFile.contents = readable;
                result.push(vinylFile);
            })
                .catch((err) => {
                console.error("promise error: ", JSON.stringify(err));
                // cb(err)
                // throw(err)
                // node.error(err, msg);
                // result.emit(new PluginError(PLUGIN_NAME, err))
            });
        }
        else {
            throw new PluginError(PLUGIN_NAME, "Buffer mode not available");
            /*
                  let minioClient  = new Minio.Client(configObj);
            
                  // console.log("uploading...")
                  // TODO: don't ignore subfolders
                  dbx.filesDownload({ path: url})
                  // .filesUpload({ path: path.posix.join(directory,file.basename), contents: file.contents as Buffer, mode:mode as any })
                  .then((response:any) => {
                    // console.log(response.result);
                    let vinylFile = new Vinyl({
                      // base: response.name,
                      cwd:'/', // just guessing here; not sure if this is the right approach. But it seams to work as intended...
                      path:response.result.path_lower,
                      contents:response.result.fileBinary
                    });
                  
                    
            
                      result.push(vinylFile)
                      // cb(null, file)
                      // console.log("worked!")
                  })
                  .catch ((err) => {
                      console.error("promise error: ", JSON.stringify(err));
                      // cb(err)
                      // throw(err)
                      // node.error(err, msg);
                      // result.emit(new PluginError(PLUGIN_NAME, err))
                  })
                      */
        }
    }
    catch (err) {
        // emitting here causes some other error: TypeError: Cannot read property 'pipe' of undefined
        // result.emit(new PluginError(PLUGIN_NAME, err))
        // For now, bubble error up to calling function
        throw new PluginError(PLUGIN_NAME, err);
    }
    return result;
}
// export function dest(this: any, url:string, options: any) {
function dest(directory, configObj) {
    if (!configObj)
        configObj = {};
    // override configObj defaults here, if needed
    // if (configObj.header === undefined) configObj.header = true
    let client = new client_s3_1.S3Client(configObj);
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
            // returnErr = new PluginError(PLUGIN_NAME, "Buffer mode not available");
            // return cb(returnErr, file)
            try {
                let pathSections = (directory || "").split(/[\/\\]+/); // split directory into sections by slashes/backslashes
                let bucket = pathSections.shift() || ""; // remove first path section as bucket
                let subfolders = pathSections.join("/"); // reassemble remaining path sections
                let testo = {
                    "Body": file.contents,
                    "Bucket": bucket,
                    "Key": path.posix.join(subfolders, (file.relative.split(/[\/\\]+/).join("/")))
                };
                const command = new client_s3_1.PutObjectCommand(testo);
                client.send(command)
                    .then((data) => {
                    // process data.
                    console.log('Success');
                    return cb(returnErr, file);
                })
                    .catch((err) => {
                    returnErr = err;
                    if (err) {
                        console.log(err); // err should be null
                        return cb(err, file);
                    }
                });
            }
            catch (err) {
                console.log("caught err", err);
                return cb(err);
            }
        }
        else if (file.isStream()) {
            returnErr = new PluginError(PLUGIN_NAME, "Streaming not available");
            // result.emit(returnErr)
            return cb(returnErr, file);
        }
    });
    return (0, lead_1.default)(strm);
    // return strm;
}
//# sourceMappingURL=plugin.js.map