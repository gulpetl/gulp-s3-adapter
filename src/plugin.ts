// https://evertpot.com/universal-commonjs-esm-typescript-packages/
// no esModuleInterop, so use 'import * ...'
import * as through2 from 'through2'
import * as Vinyl from 'vinyl'
import * as PluginError from 'plugin-error'

const PLUGIN_NAME = "gulp-s3-adapter";
import loglevel from 'loglevel'
const log = loglevel.getLogger(PLUGIN_NAME) // get a logger instance based on the project name
log.setLevel((process.env.DEBUG_LEVEL || 'warn') as loglevel.LogLevelDesc)
function getErrOptions() { return { showStack: log.getLevel() >= log.levels.DEBUG } }

import * as path from 'path'
// const from2 = require('from2')
import { parse as urlParse } from 'url'
// import * as fs from 'fs';

import * as Minio from 'minio';
import { S3Client, PutObjectCommand, PutObjectRequest, S3ClientConfig } from "@aws-sdk/client-s3";
import lead from 'lead'

/* This is a gulp plugin. It is compliant with best practices for Gulp plugins (see
https://github.com/gulpjs/gulp/blob/master/docs/writing-a-plugin/guidelines.md#what-does-a-good-plugin-look-like ) */

export function src(this: any, url: string, configObj: any) {
  let result: any;
  if (!configObj) configObj = {}

  let minioClient = new Minio.Client(configObj);

  try {
    let fileName: string = urlParse(url).pathname || "apiResult.dat"
    fileName = path.basename(fileName)

    url = url.split(/[\/\\]+/).join("/"); // ensure posix-style separators 

    // from2 returns a writable stream; we put the vinyl file into the stream. This is the core of gulp: Vinyl files
    // inside streams
    // result = from2.obj([vinylFile])
    // result = from2.obj()
    result = through2.obj() // passthrough stream 

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
      log.debug("url:", url)
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
          log.debug("got it!")
          vinylFile.contents = readable;
          result.push(vinylFile)
        })
        .catch((err) => {
          log.error("promise error: ", JSON.stringify(err));
          // cb(err)
          // throw(err)
          // node.error(err, msg);
          // result.emit(new PluginError(PLUGIN_NAME, err))
        })


    }
    else {


      throw new PluginError(PLUGIN_NAME, "Buffer mode not available")
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
  catch (err: any) {
    // emitting here causes some other error: TypeError: Cannot read property 'pipe' of undefined
    // result.emit(new PluginError(PLUGIN_NAME, err))

    // For now, bubble error up to calling function
    throw new PluginError(PLUGIN_NAME, err)
  }

  return result
}

// export function dest(this: any, url:string, options: any) {
export function dest(directory: string, configObj: any) {
  if (!configObj) configObj = {}
  // override configObj defaults here, if needed
  // if (configObj.header === undefined) configObj.header = true

  let client = new S3Client(configObj);

  // creating a stream through which each file will pass - a new instance will be created and invoked for each file 
  // see https://stackoverflow.com/a/52432089/5578474 for a note on the "this" param
  const strm = through2.obj(function (this: any, file: Vinyl, encoding: string, cb: Function) {
    const self = this
    let returnErr: any = null

    if (file.isNull()) {
      // return empty file
      return cb(returnErr, file)
    }
    else if (file.isBuffer()) {
        // returnErr = new PluginError(PLUGIN_NAME, "Buffer mode not available");
        // return cb(returnErr, file)
        
      try {
        let pathSections = (directory || "").split(/[\/\\]+/); // split directory into sections by slashes/backslashes
        let bucket = pathSections.shift() || ""; // remove first path section as bucket
        let subfolders = pathSections.join("/"); // reassemble remaining path sections


        let testo:PutObjectRequest = {
          "Body": file.contents as any,
          "Bucket": bucket,
          "Key": path.posix.join(subfolders, (file.relative.split(/[\/\\]+/).join("/")))
        };
        const command = new PutObjectCommand(testo);
        client.send(command)
        .then((data) => {
            // process data.
            log.debug('Success')
            return cb(returnErr, file)
          }
        )
        .catch((err) => {
          returnErr = err;
          if (err) {
            log.error(err) // err should be null
            return cb(err, file)
          }
        })
      }
      catch (err) {
        log.error("caught err", err);
        return cb(err);
      }

    }
    else if (file.isStream()) {
      returnErr = new PluginError(PLUGIN_NAME, "Streaming not available");
      // result.emit(returnErr)

      return cb(returnErr, file)
    }

  });


  // Sink the output stream to start flowing
  return lead(strm);
}
