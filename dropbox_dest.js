// const gulp = require('gulp');
const combine = require('stream-combiner')

const localDefaultConfigObj = {}; // no defaults to override
const extractConfig = require('./extract-config.js').extractConfig;
// import {dest} from "./src/plugin.js"
const dbxAdapter = require('gulp-dropbox-adapter');

module.exports = function (RED) {
    function DropBoxDestNode(config) {
        RED.nodes.createNode(this, config);
        this.path = config.path;
        this.config = config.config;

        var node = this;
        node.on('input', function (msg, send, done) {
            let configObj;
            try {
                if (this?.config?.trim())
                    configObj = JSON.parse(this.config);
            }
            catch (err) {
                done("Unable to parse dropbox.dest.config: " + err);
                return;
            }

            configObj = extractConfig(configObj, msg?.config, "dropbox.dest", localDefaultConfigObj);

            if (!msg.topic?.startsWith("gulp")) {
                this.status({ fill: "red", shape: "dot", text: "missing .src node" });
            }
            else if (msg.topic == "gulp-info") {
                // ignore this informational message--but pass it along below
            }
            else if (msg.topic == "gulp-initialize") {
                if (!msg.plugins) {
                    node.warn(`dropbox.dest: cannot initialize; missing gulp.src?`)
                    return;
                }

                console.log(`dropbox.dest: creating gulp stream; combining ${msg.plugins.length} plugin streams`)
                combine(msg.plugins.map((plugin) => plugin.init()))
                    .pipe(dbxAdapter.dest(node.path, configObj)
                        .on("data", (file) => {
                            this.status({ fill: "green", shape: "dot", text: "active" });

                            // send an info message to announce the file we're processing
                            let fileDescription = `${file.history[0].split(/[\\/]/).pop()} -> ${file.basename}`
                            // console.log("gulp.dest:", fileDescription)

                            send({...msg, topic:"gulp-info", parts:{id:msg._msgid}, _msgid:"", payload:`gulpfile: ${fileDescription}`,gulpfile:file});
                        })
                        .on("end", () => {
                            this.status({ fill: "green", shape: "ring", text: "ready" });

                            send({...msg, topic:"gulp-finalize", parts:{id:msg._msgid}, _msgid:""});
                        })
                        .on("error", (err) => {
                            // node.error(err?.message,err);
                            node.error(err?.error,err);
                            // node.error(err,err);
                        })

                    );

                this.status({ fill: "green", shape: "ring", text: "ready" });
            }

            send(msg);
        });
    }
    RED.nodes.registerType("dropbox.dest", DropBoxDestNode);
}