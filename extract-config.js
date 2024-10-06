const merge = require('merge');

//
// Note: ./extract-config.d.ts must be updated manually upon any changes to exported function signatures below
//

/**
 * Merges config information for this plugin from all potential sources
 * @param specificConfigObj A configObj set specifically for this plugin. May be an object or a JSON string.
 * @param pipelineConfigObj A "super" configObj (e.g. msg.config or file.data) for the whole pipeline which may/may not apply to this plugin; 
 * only used in absence of specificConfigObj. May be an object or a JSON string.
 * @param pluginName Name to search in pipelineConfigObj for settings, i.e. pipelineConfigObj[pluginName]
 * @param overridableConfigObj like specificConfigObj, but overriden by pipelineConfigObj on a per-property basis.
 * @param defaultConfigObj A default configObj whose properties are overridden by the others
 */
module.exports.extractConfig = function (specificConfigObj, pipelineConfigObj = undefined, pluginName = undefined, overridableConfigObj = undefined, defaultConfigObj = undefined) {
  let configObj;
  try {
    let dataObj;
    if (specificConfigObj) {
      if (typeof specificConfigObj === 'string')
        dataObj = JSON.parse(specificConfigObj)
      else
        dataObj = specificConfigObj;
    }
    else if (pipelineConfigObj) {
      // console.log("typeof pipelineConfigObj: ", typeof pipelineConfigObj)
      if (typeof pipelineConfigObj === 'string')
        dataObj = JSON.parse(pipelineConfigObj)
      else
        dataObj = pipelineConfigObj;

      // look for a property based on our plugin's name; assumes a complex object meant for multiple plugins
      if (dataObj[pluginName])
        dataObj = dataObj[pluginName];
    }

    // merge our chosen dataObj into defaultConfigObj, overriding any conflicting properties in defaultConfigObj
    // merge.recursive(defaultConfigObj, dataObj); // <-- huge bug: can't change parameter objects: changing them affects subsequent plugins in the pipeline
    configObj = merge.recursive(true, defaultConfigObj, overridableConfigObj, dataObj);
  }
  catch (err) {
    console.error(err)
  }

  // console.log("returning configObj: ", configObj)
  return configObj;
}