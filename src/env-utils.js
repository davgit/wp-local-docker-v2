/*
 * Trying to keep some variables consistent in name throughout the app, so its clear what each one contains, and
 * we don't run into a case where a variable might actually be the same thing with many different names
 *
 * Variables:
 *  rootPath    Path to the root of WP Local Docker. Every other path is based on this path currently
 *  srcPath     Path to the source code of WP Local Docker generator scripts as well as the config files copied to each project
 *  sitesPath   Path to the folder all environments are ultimately generated inside of
 *  cacheVolume Named volume that we mount to containers for cache (wp-cli and npm cache)
 *  globalPath  Path to the global container installation. Contains the global docker-compose as well as DB Data files
 *
 * Methods & Variables
 *
 * The following have a method in this class (as they vary per environment) and also may be used inline as a variable
 * with the same name
 *
 *  envSlug     Accepts a hostname or envSlug and returns a consistent envSlug
 *  envPath     Path within `sitesPath` for the given environment
 */

const slugify = require( '@sindresorhus/slugify' );
const path = require( 'path' );
const config = require( './configure' );
const rootPath = path.dirname( __dirname );
const srcPath = path.join( rootPath, 'src' );
const cacheVolume = 'wplocaldockerCache';
const globalPath = path.join( rootPath, 'global' );
const async = require( 'asyncro' );
const fs = require( 'fs-extra' );
const inquirer = require( 'inquirer' );
const chalk = require( 'chalk' );
const helper = require( './helpers' );

const CONFIG_FILENAME = '.config.json';

const sitesPath = async function() {
    return await config.get( 'sitesPath' );
};

const envSlug = function( env ) {
    return slugify( env );
};

const envPath = async function( env ) {
    const envPath = path.join( await sitesPath(), envSlug( env ) );

    return envPath;
};

const parseEnvFromCWD = async function() {
    // Compare both of these as all lowercase to account for any misconfigurations
    let cwd = process.cwd().toLowerCase();
    let sitesPathValue = await sitesPath();
    sitesPathValue = sitesPathValue.toLowerCase();

    if ( cwd.indexOf( sitesPathValue ) === -1 ) {
        return false;
    }

    if ( cwd === sitesPathValue ) {
        return false;
    }

    // Strip the base sitepath from the path
    cwd = cwd.replace( sitesPathValue, '' ).replace( /^\//i, '' );

    // First segment is now the envSlug, get rid of the rest
    cwd = cwd.split( '/' )[0];

    // Make sure that a .config.json file exists here
    const configFile = path.isAbsolute( cwd )
        ? path.join( cwd, CONFIG_FILENAME )
        : path.join( sitesPathValue, cwd, CONFIG_FILENAME );

    if ( ! fs.existsSync( configFile ) ) {
        return false;
    }

    return cwd;
};

const getAllEnvironments = async function() {
    const sitePath = await sitesPath();
    let dirContent = await fs.readdir( sitePath );

    // Make into full path
    dirContent = await async.map( dirContent, async item => {
        return path.join( sitePath, item );
    } );

    // Filter any that aren't directories
    dirContent = await async.filter( dirContent, async item => {
        const stat = await fs.stat( item );
        return stat.isDirectory();
    } );

    // Filter any that don't have the .config.json file (which indicates its probably not a WP Local Docker Environment)
    dirContent = await async.filter( dirContent, async item => {
        const configFile = path.join( item, CONFIG_FILENAME );

        return await fs.exists( configFile );
    } );

    // Back to just the basename
    dirContent = await async.map( dirContent, async item => {
        return path.basename( item );
    } );

    return dirContent;
};

const promptEnv = async function() {
    const environments = await getAllEnvironments();

    const questions = [
        {
            name: 'envSlug',
            type: 'list',
            message: 'What environment would you like to use?',
            choices: environments,
        }
    ];

    console.log( chalk.bold.white( 'Unable to determine environment from current directory' ) );
    const answers = await inquirer.prompt( questions );

    return answers.envSlug;
};

const parseOrPromptEnv = async function () {
    let envSlug = await parseEnvFromCWD();

    if ( envSlug === false ) {
        envSlug = await promptEnv();
    }

    return envSlug;
};

const getEnvHosts = async function( envPath ) {
    try {
        const envConfig = await fs.readJson( path.join( envPath, CONFIG_FILENAME ) );

        return ( typeof envConfig === 'object' && undefined !== envConfig.envHosts ) ? envConfig.envHosts : [];
    } catch ( ex ) {
        return [];
    }
};

async function getPathOrError( env, { log, error } = console ) {
    if ( env === false || undefined === env || env.trim().length === 0 ) {
        env = await promptEnv();
    }

    log( `Locating project files for ${ env }` );

    const _envPath = await envPath( env );
    if ( ! await fs.pathExists( _envPath ) ) {
        error( `Cannot find ${ env } environment!` );
        process.exit( 1 );
    }

    return _envPath;
}

/**
 * Format the default Proxy URL based on entered hostname
 *
 * @param  string value 	The user entered hostname
 * @return string       	The formatted default proxy URL
 */
const createDefaultProxy = function( value ) {
    let proxyUrl = `http://${ helper.removeEndSlashes( value ) }`;
    const proxyUrlTLD = proxyUrl.lastIndexOf( '.' );

    if ( proxyUrlTLD === -1 ) {
        proxyUrl = `${ proxyUrl }.com`;
    } else {
        proxyUrl = `${ proxyUrl.substring( 0, proxyUrlTLD + 1 ) }com`;
    }

    return proxyUrl;
};

module.exports = { rootPath, srcPath, sitesPath, cacheVolume, globalPath, envSlug, envPath, parseEnvFromCWD, getAllEnvironments, promptEnv, parseOrPromptEnv, getEnvHosts, getPathOrError, createDefaultProxy };
