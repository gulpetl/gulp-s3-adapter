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
import * as lead from 'lead';
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGx1Z2luLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3BsdWdpbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxtRUFBbUU7QUFDbkUsNENBQTRDO0FBQzVDLE9BQU8sS0FBSyxRQUFRLE1BQU0sVUFBVSxDQUFBO0FBQ3BDLE9BQU8sS0FBSyxLQUFLLE1BQU0sT0FBTyxDQUFBO0FBQzlCLE9BQU8sS0FBSyxXQUFXLE1BQU0sY0FBYyxDQUFBO0FBRTNDLE1BQU0sV0FBVyxHQUFHLGlCQUFpQixDQUFDO0FBQ3RDLE9BQU8sUUFBUSxNQUFNLFVBQVUsQ0FBQTtBQUMvQixNQUFNLEdBQUcsR0FBRyxRQUFRLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxDQUFBLENBQUMsa0RBQWtEO0FBQzlGLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsSUFBSSxNQUFNLENBQTBCLENBQUMsQ0FBQTtBQUMxRSxTQUFTLGFBQWEsS0FBSyxPQUFPLEVBQUUsU0FBUyxFQUFFLEdBQUcsQ0FBQyxRQUFRLEVBQUUsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFBLENBQUMsQ0FBQztBQUVyRixPQUFPLEtBQUssSUFBSSxNQUFNLE1BQU0sQ0FBQTtBQUM1QixpQ0FBaUM7QUFDakMsT0FBTyxFQUFFLEtBQUssSUFBSSxRQUFRLEVBQUUsTUFBTSxLQUFLLENBQUE7QUFDdkMsNEJBQTRCO0FBRTVCLE9BQU8sS0FBSyxLQUFLLE1BQU0sT0FBTyxDQUFDO0FBQy9CLE9BQU8sRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLEVBQW9DLE1BQU0sb0JBQW9CLENBQUM7QUFDbEcsT0FBTyxLQUFLLElBQUksTUFBTSxNQUFNLENBQUE7QUFFNUI7cUhBQ3FIO0FBRXJILE1BQU0sVUFBVSxHQUFHLENBQVksR0FBVyxFQUFFLFNBQWM7SUFDeEQsSUFBSSxNQUFXLENBQUM7SUFDaEIsSUFBSSxDQUFDLFNBQVM7UUFB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