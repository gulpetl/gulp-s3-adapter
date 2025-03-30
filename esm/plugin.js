// https://evertpot.com/universal-commonjs-esm-typescript-packages/
// no esModuleInterop, so use 'import * ...'
import * as through2 from 'through2';
import * as Vinyl from 'vinyl';
import * as PluginError from 'plugin-error';
const PLUGIN_NAME = "gulp-s3-adapter";
import loglevel from 'loglevel';
const log = loglevel.getLogger(PLUGIN_NAME); // get a logger instance based on the project name
log.setLevel((process.env.DEBUG_LEVEL || 'warn'));
function getErrOptions() { return { showStack: log.getLevel() >= log.levels.DEBUG }; }
import * as path from 'path';
// const from2 = require('from2')
import { parse as urlParse } from 'url';
// import * as fs from 'fs';
import * as Minio from 'minio';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import lead from 'lead';
/* This is a gulp plugin. It is compliant with best practices for Gulp plugins (see
https://github.com/gulpjs/gulp/blob/master/docs/writing-a-plugin/guidelines.md#what-does-a-good-plugin-look-like ) */
export function src(url, configObj) {
    let result;
    if (!configObj)
        configObj = {};
    let minioClient = new Minio.Client(configObj);
    try {
        let fileName = urlParse(url).pathname || "apiResult.dat";
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
            log.debug("url:", url);
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
                log.debug("got it!");
                vinylFile.contents = readable;
                result.push(vinylFile);
            })
                .catch((err) => {
                log.error("promise error: ", JSON.stringify(err));
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
export function dest(directory, configObj) {
    if (!configObj)
        configObj = {};
    // override configObj defaults here, if needed
    // if (configObj.header === undefined) configObj.header = true
    let client = new S3Client(configObj);
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
                const command = new PutObjectCommand(testo);
                client.send(command)
                    .then((data) => {
                    // process data.
                    log.debug('Success');
                    return cb(returnErr, file);
                })
                    .catch((err) => {
                    returnErr = err;
                    if (err) {
                        log.error(err); // err should be null
                        return cb(err, file);
                    }
                });
            }
            catch (err) {
                log.error("caught err", err);
                return cb(err);
            }
        }
        else if (file.isStream()) {
            returnErr = new PluginError(PLUGIN_NAME, "Streaming not available");
            // result.emit(returnErr)
            return cb(returnErr, file);
        }
    });
    // Sink the output stream to start flowing
    return lead(strm);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGx1Z2luLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3BsdWdpbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxtRUFBbUU7QUFDbkUsNENBQTRDO0FBQzVDLE9BQU8sS0FBSyxRQUFRLE1BQU0sVUFBVSxDQUFBO0FBQ3BDLE9BQU8sS0FBSyxLQUFLLE1BQU0sT0FBTyxDQUFBO0FBQzlCLE9BQU8sS0FBSyxXQUFXLE1BQU0sY0FBYyxDQUFBO0FBRTNDLE1BQU0sV0FBVyxHQUFHLGlCQUFpQixDQUFDO0FBQ3RDLE9BQU8sUUFBUSxNQUFNLFVBQVUsQ0FBQTtBQUMvQixNQUFNLEdBQUcsR0FBRyxRQUFRLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxDQUFBLENBQUMsa0RBQWtEO0FBQzlGLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsSUFBSSxNQUFNLENBQTBCLENBQUMsQ0FBQTtBQUMxRSxTQUFTLGFBQWEsS0FBSyxPQUFPLEVBQUUsU0FBUyxFQUFFLEdBQUcsQ0FBQyxRQUFRLEVBQUUsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFBLENBQUMsQ0FBQztBQUVyRixPQUFPLEtBQUssSUFBSSxNQUFNLE1BQU0sQ0FBQTtBQUM1QixpQ0FBaUM7QUFDakMsT0FBTyxFQUFFLEtBQUssSUFBSSxRQUFRLEVBQUUsTUFBTSxLQUFLLENBQUE7QUFDdkMsNEJBQTRCO0FBRTVCLE9BQU8sS0FBSyxLQUFLLE1BQU0sT0FBTyxDQUFDO0FBQy9CLE9BQU8sRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLEVBQW9DLE1BQU0sb0JBQW9CLENBQUM7QUFDbEcsT0FBTyxJQUFJLE1BQU0sTUFBTSxDQUFBO0FBRXZCO3FIQUNxSDtBQUVySCxNQUFNLFVBQVUsR0FBRyxDQUFZLEdBQVcsRUFBRSxTQUFjO0lBQ3hELElBQUksTUFBVyxDQUFDO0lBQ2hCLElBQUksQ0FBQyxTQUFTO1FBQUUsU0FB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