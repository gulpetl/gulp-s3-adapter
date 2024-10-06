//
// Note: this file must be updated manually upon any changes to function signatures referred to below
//

/**
 * Merges config information for this plugin from all potential sources
 * @param specificConfigObj A configObj set specifically for this plugin. May be an object or a JSON string.
 * @param pipelineConfigObj A "super" configObj (e.g. file.data or msg.config) for the whole pipeline which may/may not apply to this plugin; 
 * only used in absence of specificConfigObj. May be an object or a JSON string.
 * @param pluginName Name to search in pipelineConfigObj for settings, i.e. pipelineConfigObj[pluginName]
 * @param overridableConfigObj like specificConfigObj, but overriden by pipelineConfigObj on a per-property basis.
 * @param defaultConfigObj A default configObj whose properties are overridden by the others
 */
export declare function extractConfig(specificConfigObj: any, pipelineConfigObj?: any, pluginName?:string, overridableConfigObj?:any, defaultConfigObj?: any): any;