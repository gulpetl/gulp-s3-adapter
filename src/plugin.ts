const through2 = require('through2')
import Vinyl = require('vinyl')
import PluginError = require('plugin-error');
const pkginfo = require('pkginfo')(module); // project package.json info into module.exports
const PLUGIN_NAME = module.exports.name;
import * as loglevel from 'loglevel'
const log = loglevel.getLogger(PLUGIN_NAME) // get a logger instance based on the project name
log.setLevel((process.env.DEBUG_LEVEL || 'warn') as loglevel.LogLevelDesc)
import * as request from 'request'
import * as rename from 'gulp-rename'

import * as from2 from 'from2';

/* This is a gulp plugin. It is compliant with best practices for Gulp plugins (see
https://github.com/gulpjs/gulp/blob/master/docs/writing-a-plugin/guidelines.md#what-does-a-good-plugin-look-like ) */
export function transform(configObj: any) {
  if (!configObj) configObj = {}
  // override configObj defaults here, if needed
  // if (configObj.header === undefined) configObj.header = true

  // creating a stream through which each file will pass - a new instance will be created and invoked for each file 
  // see https://stackoverflow.com/a/52432089/5578474 for a note on the "this" param
  const strm = through2.obj(function (this: any, file: Vinyl, encoding: string, cb: Function) {
    const self = this
    let returnErr: any = null

    if (file.isNull() || returnErr) {
      // return empty file
      return cb(returnErr, file)
    }
    else if (file.isBuffer()) {      
      returnErr = new PluginError(PLUGIN_NAME, 'Buffer mode is not yet supported. Use gulp.src({buffer:false})...');

      // return unchanged file
      return cb(returnErr, file)      
    }
    else if (file.isStream()) {

      // pipe file.contents through request
//      file.contents
        //.pipe(request(configObj))      
        // .pipe(request.post("https://postman-echo.com/post"))      

        // .pipe(source(file.name))

        // request.post({
        //   url:"https://postman-echo.com/post",
        //   // body:file.contents
        //   body:fs.createReadStream('../testdata/testbody.json')
        // })

      // file.contents
      //   .pipe(request.post("https://ptsv2.com/t/i5xod-1570310396/post"))    // works
      
      // fs.createReadStream('../testdata/testbody.json')
      //   .pipe(request.post("https://ptsv2.com/t/i5xod-1570310396/post")) // works

      let newFile = new Vinyl()

      file.contents
        .pipe(request(configObj))        
        .on('response', function(response) {
          // testing
          log.debug(response.statusCode) // 200
          log.debug(response.headers['content-type']) // 'image/png'
          // log.debug(JSON.stringify(response.toJSON()))
        })
        .on('end', function () {

          // DON'T CALL THIS HERE. It MAY work, if the job is small enough. But it needs to be called after the stream is SET UP, not when the streaming is DONE.
          // Calling the callback here instead of below may result in data hanging in the stream--not sure of the technical term, but dest() creates no file, or the file is blank
          // cb(returnErr, file);
          // log.debug('calling callback')    

          log.debug(PLUGIN_NAME + ' is done')
        })
        // .on('data', function (data:any, err: any) {
        //   log.debug(data)
        // })
        .on('error', function (err: any) {
          log.error(err)
          self.emit('error', new PluginError(PLUGIN_NAME, err));
        })

      // after our stream is set up (not necesarily finished) we call the callback
      log.debug('calling callback')    
      cb(returnErr, file);
    }

  })

  return strm        
    // .pipe(rename({
    //   suffix: ".response"
    // }))
}
