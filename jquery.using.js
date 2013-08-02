/**
 * jQuery.using() - Deferred Script Loader
 *
 * @author Samuel Rouse
 * @version 0.1.1
 *
 * v0.1.1 - fixed .resolveWith() parameters
 * v0.1 - implemented loader plugins
 * v0.07 - added optional tests for existing URL
 * v0.06 - added noLoad to test if already loaded
 * v0.05 - added load time tracking, removed doctype checking.
 * v0.04 - major rework: multi-file, multi-type support
 * v0.03 - now in a plugin wrapper, called as $.using()
 * v0.02 - added using() function
 * v0.01 - requirements handling
 */

/* jshint jquery:true */

;(function( $, undefined ){
    "use strict";

    var settings = {
            debug: false,
            linkStyles : false // Use link tags instead of style tags with the data
        },
        fetchModules = {
            // All plugins accept a URL and return a promise.
            // If unable to plugin
            "getScript": function(url) {
                return $.getScript(url);
            },
            "loadScript": function(url) {
				
                return $.ajax({
                    url: url,
                    dataType: "script",
                    cache: true,
                    async: true,
                    crossDomain: true
                });
            },
            "getStyle": function(url) {
                return $.ajax(url).done(function(data){
                    var cssHTML;

                    // Support linked stylesheets or style data on the page.
                    if ($.using().opts().linkStyles) {
                        cssHTML = '<link rel="stylesheet" href="' + url + '" />';
                    } else {
                        cssHTML = '<style type="text/css">\n' + data + "\n</style>";
                    }

                    $('head').append(cssHTML);
                });
            },
            "getJSON": function(url) {
                return $.getJSON(url);
            }
        },
        fetchOrder = {
            // Sequence of different modules to try
            // return a Boolean false if it should try the next module
            "script": ["getScript", "loadScript"],
            "style": ["getStyle"],
            "json": ["getJSON"]
        },
        myRefs = { // Each short name contains scripts, styles, and requirements
            "jquery": {
                styles: [],
                scripts: ["//ajax.googleapis.com/ajax/libs/jquery/1.9.1/jquery.min.js"],
                requirements: []
            },
            "ui": {
                requirements: ["jquery"]
            }
        },
        myPromises = {
            // Promise storage - both for plug-in short names and full URLs.
            "jquery":true  // Always loaded b/c we need it for this plugin
        },
        myLoadTimes = {},	// Get load times for each url called.
        messages = {
            "noval": "No reference name or script URL was passed.",
            "noref": "The requested script is not in the reference table.",
            "noreq": "A required dependency is not in the reference table.",
            "badreq": "A required dependency failed to load.",
            "badres": "The requested script failed to load.",
            "unknown": "An unknown error has occurred.",
            "preload": "URL already on the page."
        },
        methods = {
        	modules: function(modType, modName, modFn) {
	        	if ( modType !== undefined && modName !== undefined && typeof modFn === "function" ) {
		        	fetchModules[modName] = modFn;
		        	if ( fetchOrder.hasOwnProperty(modType) ) {
			        	fetchOrder[modType].push(modName);
		        	} else {
			        	fetchOrder[modType] = [modName];
		        	}
	        	}
	        	return fetchModules;
        	},
            msgs: function(msgID) {
                // Get one or all error messages
                if (typeof msgID !== "undefined") {
                    return messages[msgID];
                } else {
                    return messages;
                }
            },
            opts: function(options) {
                // Extend new options directly into our options object
                if ( typeof options === "object" ) {
                    settings = $.extend(true, {}, settings, options);
                }
                return settings;
            },
            promises: function(newPromises) {
                // Get/Set promises
                // It may seem strange to "set" promises,
                // but you can "complete" manually loaded scripts this way
                if (newPromises !== undefined) {
                    myPromises = $.extend({}, myPromises, newPromises);
                }
                return myPromises;
            },
            refs: function(newRefs) {
                // Get/Set references
                if (newRefs !== undefined && typeof newRefs === "object") {
                    myRefs = $.extend({}, myRefs, newRefs);
                }
                return myRefs;
            },
            times: function(url) {
                // Get one load time by URL or all of them
                if (typeof url !== "undefined") {
                    return myLoadTimes[url];
                } else {
                    return myLoadTimes;
                }
            }
        },
        fetch = function(refName){
        	if (settings.debug) { console.log("$.using() fetch "); console.log(refName); }
        
            // First, check for an existing def so we don't waste time
            if (myPromises.hasOwnProperty(refName)){
                return myPromises[refName];
            }

            var myDefer = $.Deferred(),     // Deferred object to return
                alreadyLoaded = false,		// Used for noLoad test
                curPromises = [],           // Promises for .when()
                curRef = {},                 // Short Reference
                srcArray = [],              // Loop scripts, styles and requirements
                srcLen,                     // Length for looping
                el,                        // Reference elements for looping
                inc;                        // Integer for Looping

            // Save a promise immediately (even if there's no reference)
            myPromises[refName] = myDefer.promise();

            if (refName === undefined || refName === null ) {
        		if (settings.debug) { console.log("$.using() noref " + refName); }
                // No reference? Automatic rejection
                myDefer.rejectWith(this,["noval"]);
            } else if (myRefs.hasOwnProperty(refName)){
            	if (settings.debug) { console.log("$.using() reference " + refName); }
            
                // See if we have this reference.
                curRef = myRefs[refName];

                // Check for noLoad function -- returns true if already loaded/no need to load.
                if ( typeof curRef.noLoad === "function" ) {
                    try { alreadyLoaded = curRef.noLoad(); }
                    catch (e) { /* */ }

                    if ( alreadyLoaded ) {
                        // Test says it's loaded. Resolve & return
                        myDefer.resolveWith(this,["preload"]);
                        return myPromises[refName];
                    }
                }

                // Check for requirements, next
                if ( curRef.hasOwnProperty("requirements") &&
                    curRef.requirements instanceof Array &&
                    curRef.requirements.length ) {
                    srcArray = curRef.requirements;
                    srcLen = srcArray.length;

                    // Loop through requirements and collect promises from them.
                    for (inc = 0; inc < srcLen; ++inc) {
                        curPromises.push( fetch( srcArray[inc] ) );
                    }
                }

                for (el in curRef) {
                    // if we have modules
                    if ( curRef.hasOwnProperty(el) && fetchOrder.hasOwnProperty(el) && curRef[el].length ) {
                        // Cycle through the reference, looking for elements we can support.

                        srcArray = curRef[el];
                        srcLen = srcArray.length;

                        // Loop through styles and collect promises from them.
                        for ( inc = 0; inc < srcLen; ++inc ) {
                            curPromises.push( fetchURL( srcArray[inc], el ) );
                        }

                    }
                }

                // Apply the array of requirements to .when()
                // If it's an empty array, .when() will treat it as a success
                // Then use .fail() for error handling and .done() for Success.
                $.when.apply($,curPromises).fail(function(errType){
                    handleFetchError(refName, myDefer, errType);
                }).done(function(){

                        // Our styles & requirements are complete. Get our script(s)
                        if (curRef.hasOwnProperty("scripts") &&
                            curRef.scripts instanceof Array &&
                            curRef.scripts.length ) {
                            srcArray = curRef.scripts;
                            srcLen = srcArray.length;

                            // Collect promises just like anything else
                            for (inc = 0; inc < srcLen; ++inc) {
                                curPromises.push( fetchURL( srcArray[inc], "script" ) );
                            }
                        }

                        // Finally, apply all the promises for this reference
                        $.when.apply($,curPromises).then(
                            // .then() is shorthand for .done() and .fail()
                            function(){ myDefer.resolveWith( this, arguments ); },
                            function(){ myDefer.rejectWith( this, ["badres"] ); }
                        );
                    });
            } else {
        		if (settings.debug) { console.log("$.using() url " + refName); }
                // Guess at a URL and a script
                // We already have a defer, so pass it to fetchURL.
                fetchURL( refName, "script", myDefer ).then(
                    // .then() is shorthand for .done() and .fail()
                    function(){ myDefer.resolveWith( this, arguments ); },
                    function(){ myDefer.rejectWith( this, ["noref"] ); }
                );
            }

            // Pass back the promise
            return myPromises[refName];
        },
        fetchURL = function(url, type, passedDefer) {
        	if (settings.debug) { console.log("$.using() fetchurl " + url); }

            var startTime, myDefer, fetchRes, inc;

            if ( passedDefer === undefined ) {
                // Check for an existing request for this url and return the promise
                if ( myPromises.hasOwnProperty(url) ) { return myPromises[url]; }

                // Create the Deferred and store the promise.
                myDefer = $.Deferred();
                myPromises[url] = myDefer.promise();
            } else {
                // Defer passed in (from fetch), so use it.
                myDefer = passedDefer;
            }

            fetchRes = false;
            inc = fetchOrder[type].length - 1;

            while ( inc >= 0 && fetchRes === false ) {

                // Get the current time for request time tracking
                startTime = Date.now();

                try {
                    fetchRes = fetchModules[fetchOrder[type][inc]].call(this,url);
                } catch (e) {
                    if ( settings.debug ) { console.log("Exception on " + fetchOrder[type][inc] + "(" + url + ")"); }
                }
                
                if ( fetchRes === null ) { fetchRes = false; }
                
                inc--;
            }

            // Check it
            if ( fetchRes !== false ) {
                fetchRes.then(
                    // .then() is shorthand for .done() and .fail()
                    function(){ 
                    	$('html').trigger("using",[type, url, fetchOrder[type][inc + 1]]);
                    	myDefer.resolveWith( this, arguments ); },
                    function(){ myDefer.rejectWith( this, ["badres"] ); }
                ).always(function(){
                    myLoadTimes[url] = Date.now() - startTime;
                });
            }

            // Hand back the same promise we created before.
            return myPromises[url];
        },
        handleFetchError = function(refName, myDefer, errType) {

            // adjust some error types for requirements, and not the original fetch
            if (errType === "noref" || errType === "noreq") {
                myDefer.rejectWith( this, ["noreq"] );
            } else if (errType === "badres" || errType === "badreq") {
                myDefer.rejectWith( this, ["badreq"] );
            } else {
                myDefer.rejectWith( this, ["unknown"] );
            }
        },
        init = function(){

            var reqArray = arguments,
            	reqPromises = [],                   // Array of promises
                reqLen = reqArray.length,
                inc;

        	if (settings.debug) { console.log("$.using()"); console.log(reqArray); }

            // Collect promises for any requirements
            for (inc = 0; inc < reqLen; ++inc) {
                reqPromises[inc] = fetch(reqArray[inc]);
            }

            // Return a single promise for the requirements
            return $.when.apply($,reqPromises).promise();
        };

    $.using = function( method ) {

        // Empty call gets methods
        if ( method === undefined ) {
            return methods;
        }

        // Everything is a fetch request
        return init.apply( this, arguments );
    };
})( jQuery );
