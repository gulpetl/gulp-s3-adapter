let gulp = require('gulp')
import * as s3Adapter from '../src/plugin'

import * as loglevel from 'loglevel'
const log = loglevel.getLogger('gulpfile')
log.setLevel((process.env.DEBUG_LEVEL || 'warn') as loglevel.LogLevelDesc)
// if needed, you can control the plugin's logging level separately from 'gulpfile' logging above
// const pluginLog = loglevel.getLogger(PLUGIN_NAME)
// pluginLog.setLevel('debug')

const errorHandler = require('gulp-error-handle'); // handle all errors in one handler, but still stop the stream if there are errors

const pkginfo = require('pkginfo')(module); // project package.json info into module.exports
const PLUGIN_NAME = module.exports.name;

import * as Vinyl from 'vinyl';

let gulpBufferMode = false;

function switchToBuffer(callback: any) {
  gulpBufferMode = true;

  callback();
}

export function runDest(callback: any) {
  log.info('gulp task starting for ' + PLUGIN_NAME);

  let localSettings:any;
  try {
    localSettings = require("./secret.testsettings.json");
  }
  catch {}

  // see https://northflank.com/guides/connect-nodejs-to-minio-with-tls-using-aws-s3
  let thirdPartyS3Config = {
    "region": "asdf", // required to be non-empty
    "credentials": {
      "accessKeyId": "ACCESS KEY GOES HERE",
      "secretAccessKey": "SECRET KEY GOES HERE",
    },
    "endpoint": "https://minio.storage.whatever.net",
    "forcePathStyle": true
  }

  let destConfig = localSettings?.destConfig || thirdPartyS3Config;
  let localGlob =  localSettings?.localGlob || "../README.md";
  let targetBucketWithPath = localSettings?.targetBucketWithPath || "public";

  return gulp.src(localGlob,{buffer:gulpBufferMode})  
  // return gulp.src('../testdata/*.json',{buffer:gulpBufferMode})
    // .pipe(errorHandler(function(err:any) {
    //   log.error('Error: ' + err)
    //   callback(err)
    // }))
    .on('data', function (file:Vinyl) {
      log.info('Starting processing on ' + file.basename)
    })    
    .pipe(s3Adapter.dest(targetBucketWithPath, destConfig))    
    .on('data', function (file:Vinyl) {
      log.info('Finished processing on ' + file.basename)
    })    
    .on('end', function () {
      log.info('gulp task complete')
      callback()
    })

}

function runSrc(callback: any) {
  log.info('gulp task starting for ' + PLUGIN_NAME)

  try {
    return s3Adapter.src("https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png", {buffer:gulpBufferMode})
      // .pipe(errorHandler(function(err:any) {
      //   log.error('Error: ' + err)
      //   callback(err)
      // }))
      .on('data', function (file:Vinyl) {
        log.info('Starting processing on ' + file.basename)
      }) 
      .pipe(gulp.dest('../testdata/processed'))
      .on('data', function (file:Vinyl) {
        log.info('Finished processing on ' + file.basename)
      })    
      .on('end', function () {
        log.info('gulp task complete')
        callback()
      })
    }
    catch (err) {
      log.error(err)
      callback(err);
    }

  }

exports.default = gulp.series(runDest)
exports.runDestBuffer = gulp.series(switchToBuffer, runDest)
// exports.runSrc = runSrc